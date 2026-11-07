// Rendering: banners, draft and deck cards, modals, chessboard, drag and drop, added to `app`.
Object.assign(app, {
    setupPlayerBanner(containerId, profile) {
        const container = document.getElementById(containerId);
        container.replaceChildren(
            createAvatarElement(profile.avatar),
            createPlayerInfoElement(profile.name, `Games: ${profile.stats.played} | Wins: ${profile.stats.wins}`),
        );
    },

    renderDraftCards() {
        const container = document.getElementById('draft-grid');
        container.innerHTML = '';
        cardsData.forEach(card => {
            const cardEl = document.createElement('div');
            // FIX: All cards are unlocked in 2-player local mode
            cardEl.className = 'spell-card';
            cardEl.dataset.id = card.id;

            cardEl.innerHTML = `
                <div class="card-header">
                    <span class="card-title">${card.icon} ${card.name}</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn-info" title="More Info">ℹ️</button>
                        <span class="card-id">#${card.id}</span>
                    </div>
                </div>
                <div class="card-effect">${card.effect}</div>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });

            cardEl.addEventListener('click', () => this.showDraftModal(card));
            container.appendChild(cardEl);
        });
    },

    showDraftModal(card) {
        const modal = document.getElementById('card-modal');
        document.getElementById('modal-icon').textContent = card.icon;
        document.getElementById('modal-title').textContent = card.name;
        document.getElementById('modal-effect').textContent = card.effect;
        
        const playerTurn = this.draftSequence[this.currentDraftIndex];
        const content = modal.querySelector('.modal-content');
        
        if (playerTurn === 2 && document.body.classList.contains('tabletop-mode')) {
            content.classList.add('rotated-180');
        } else {
            content.classList.remove('rotated-180');
        }
        
        modal.classList.remove('hidden');
        
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');
        
        const newConfirm = confirmBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirm);
        cancelBtn.replaceWith(newCancel);
        
        newConfirm.textContent = 'Confirm Pick';
        newCancel.textContent = 'Back';
        
        newConfirm.addEventListener('click', () => {
            modal.classList.add('hidden');
            this.confirmDraftCard(card.id);
        });
        
        newCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    confirmDraftCard(cardId) {
        const playerTurn = this.draftSequence[this.currentDraftIndex];
        if (playerTurn === 1) {
            this.p1Deck.push(cardId);
        } else {
            this.p2Deck.push(cardId);
        }
        
        // Mark card as picked
        const cardEl = document.querySelector(`#draft-grid .spell-card[data-id="${cardId}"]`);
        if (cardEl) {
            cardEl.style.opacity = '0.3';
            cardEl.style.pointerEvents = 'none';
        }
        
        this.currentDraftIndex++;
        if (this.currentDraftIndex >= this.draftSequence.length) {
            this.initGame();
        } else {
            this.updateDraftUI();
        }
    },

    updateDraftUI() {
        const playerTurn = this.draftSequence[this.currentDraftIndex];
        const indicator = document.getElementById('draft-turn-indicator');
        const draftPhase = document.getElementById('draft-phase');
        
        const profile = playerTurn === 1 ? this.p1Profile : this.p2Profile;
        this.setupPlayerBanner('draft-turn-indicator', profile);
        
        // Add a visual cue about drafting
        const cue = document.createElement('div');
        cue.style.cssText = 'margin-left: auto; color: var(--accent-color); font-weight: bold;';
        cue.textContent = 'Your Turn to Pick!';
        indicator.appendChild(cue);
        
        if (playerTurn === 2 && document.body.classList.contains('tabletop-mode')) {
            draftPhase.classList.add('rotated-180');
        } else {
            draftPhase.classList.remove('rotated-180');
        }
    },

    initGame() {
        engine.init();
        this.showScreen('game-board');
        this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
        this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
        this.renderChessboard();
        this.startTimer();
    },

    renderInGameDeck(deckIds, containerId, playerColor) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        deckIds.forEach((cardId) => {
            const card = cardsData.find(c => c.id === cardId);
            const cardEl = document.createElement('div');
            cardEl.className = 'in-game-card';
            cardEl.dataset.cardId = cardId;
            cardEl.innerHTML = `
                <div class="card-icon-large">${card.icon}</div>
                <div class="card-info">
                    <div class="card-title">${card.name}</div>
                    <div class="card-effect">${card.effect}</div>
                </div>
                <button class="btn-info" title="More Info">ℹ️</button>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });
            
            cardEl.addEventListener('click', () => {
                if (this.isBotGame && playerColor === 'black') return alert("You cannot use the bot's spells!");
                if (!cardEl.classList.contains('used') && engine.turn === playerColor && !engine.targetingState) {
                    this.showCardModal(card, cardEl);
                } else if (engine.turn !== playerColor) {
                    alert("Not your turn!");
                }
            });
            container.appendChild(cardEl);
        });
    },

    showCardModal(card, cardEl, playerColor) {
        const modal = document.getElementById('card-modal');
        document.getElementById('modal-icon').textContent = card.icon;
        document.getElementById('modal-title').textContent = card.name;
        document.getElementById('modal-effect').textContent = card.effect;
        
        const content = modal.querySelector('.modal-content');
        if (playerColor === 'black' && document.body.classList.contains('tabletop-mode')) {
            content.classList.add('rotated-180');
        } else {
            content.classList.remove('rotated-180');
        }
        
        modal.classList.remove('hidden');
        
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');
        
        // Remove old listeners
        const newConfirm = confirmBtn.cloneNode(true);
        const newCancel = cancelBtn.cloneNode(true);
        confirmBtn.replaceWith(newConfirm);
        cancelBtn.replaceWith(newCancel);
        
        newConfirm.textContent = 'Play Card';
        newCancel.textContent = 'Cancel';
        
        newConfirm.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (isOnline) {
                if (engine.turn !== myPlayerColor) return;
                socket.emit('spellActivated', { roomCode: currentRoomCode, cardId: card.id });
            } else {
                engine.activateSpell(card.id, cardEl);
            }
        });
        
        newCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    showInfoModal(card) {
        const modal = document.getElementById('info-modal');
        document.getElementById('info-modal-title').textContent = `${card.icon} ${card.name}`;
        document.getElementById('info-modal-effect').textContent = card.effect;
        document.getElementById('info-modal-timing').textContent = card.details.timing;
        document.getElementById('info-modal-conditions').textContent = card.details.conditions;
        document.getElementById('info-modal-inputs').textContent = card.details.inputs;
        
        modal.classList.remove('hidden');
        
        const closeBtn = document.getElementById('info-modal-close');
        const newClose = closeBtn.cloneNode(true);
        closeBtn.replaceWith(newClose);
        
        newClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    renderChessboard() {
        const board = document.getElementById('chessboard');
        board.innerHTML = '';
        
        // Render squares
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const square = document.createElement('div');
                let renderR = r;
                let renderC = c;
                if (isOnline && myPlayerColor === 'black') {
                    renderR = 7 - r;
                    renderC = 7 - c;
                }
                const isLight = (r + c) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;
                square.dataset.r = r;
                square.dataset.c = c;
                
                const trap = engine.traps.find(t => t.r === r && t.c === c);
                if (trap && (typeof isOnline === 'undefined' || !isOnline || trap.owner === myPlayerColor)) {
                    const trapEl = document.createElement('div');
                    trapEl.innerHTML = '🕸️';
                    trapEl.style.position = 'absolute';
                    trapEl.style.width = '100%';
                    trapEl.style.height = '100%';
                    trapEl.style.display = 'flex';
                    trapEl.style.justifyContent = 'center';
                    trapEl.style.alignItems = 'center';
                    trapEl.style.fontSize = '3vh';
                    trapEl.style.opacity = '0.7';
                    trapEl.style.pointerEvents = 'none';
                    trapEl.style.zIndex = '5';
                    square.appendChild(trapEl);
                }
                
                square.addEventListener('pointerdown', () => {
                    if (engine.targetingState) {
                        engine.handleSquareClick(r, c);
                    } else if (app.selectedPiece) {
                        const isValid = app.selectedPiece.validMoves.some(m => m.r === r && m.c === c);
                        if (isValid) {
                            engine.move(app.selectedPiece.r, app.selectedPiece.c, r, c);
                        }
                        app.selectedPiece = null;
                        app.clearHighlights();
                    }
                });
                
                board.appendChild(square);
            }
        }

        // Render pieces
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                
                // Adjust rendering position based on online mode
                let renderR = r;
                let renderC = c;
                if (isOnline && myPlayerColor === 'black') {
                    renderR = 7 - r;
                    renderC = 7 - c;
                }
                if (p) {
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `chess-piece ${engine.getColor(p)}`;
                    pieceEl.textContent = PIECE_MAP[p];
                    pieceEl.style.top = `${renderR * 12.5}%`;
                    pieceEl.style.left = `${renderC * 12.5}%`;
                    
                    if (engine.frozenPieces.some(fp => fp.r === r && fp.c === c)) {
                        pieceEl.classList.add('frozen');
                    }
                    
                    pieceEl.addEventListener('pointerdown', (e) => {
                        if (engine.targetingState) {
                            e.stopPropagation();
                            engine.handleSquareClick(r, c);
                        } else if (app.selectedPiece) {
                            const isValid = app.selectedPiece.validMoves.some(m => m.r === r && m.c === c);
                            if (isValid) {
                                e.stopPropagation();
                                engine.move(app.selectedPiece.r, app.selectedPiece.c, r, c);
                                app.selectedPiece = null;
                                app.clearHighlights();
                            } else {
                                app.selectedPiece = null;
                            }
                        }
                    });

                    if (engine.getColor(p) === engine.turn && !engine.targetingState) {
                        if (!isOnline || engine.turn === myPlayerColor) {
                            this.setupDrag(pieceEl, r, c);
                        }
                    }
                    board.appendChild(pieceEl);
                }
            }
        }
        this.renderGraveyards();
    },

    renderGraveyards() {
        const powerMap = { 'q': 9, 'r': 5, 'b': 3, 'n': 3, 'p': 1, 'W': 0 };
        const sortPieces = (pieces) => [...pieces].sort((a, b) => (powerMap[b.toLowerCase()] || 0) - (powerMap[a.toLowerCase()] || 0));
        
        const renderGY = (containerId, pieces) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            sortPieces(pieces).forEach(p => {
                const el = document.createElement('div');
                el.className = `graveyard-piece ${engine.getColor(p)}`;
                el.textContent = PIECE_MAP[p];
                container.appendChild(el);
            });
        };
        
        renderGY('player1-graveyard', engine.capturedByWhite); // Black pieces captured by white, shown on White's side
        renderGY('player2-graveyard', engine.capturedByBlack); // White pieces captured by black, shown on Black's side
    },

    clearHighlights() {
        const board = document.getElementById('chessboard');
        if (board) {
            Array.from(board.children).forEach(sq => {
                sq.classList.remove('valid-move', 'valid-capture');
            });
        }
    },

    setupDrag(pieceEl, startR, startC) {
        let isDragging = false;
        let hasMoved = false;
        let lastClientX, lastClientY;
        let currentX, currentY;
        let validMoves = [];
        let highlightSquares = [];

        pieceEl.addEventListener('pointerdown', (e) => {
            if (engine.targetingState) return;
            if (this.isBotGame && engine.turn === 'black') return; // Block human from playing bot's turn
            
            isDragging = true;
            hasMoved = false;
            pieceEl.classList.add('dragging');
            try {
                pieceEl.setPointerCapture(e.pointerId);
            } catch (err) {
                console.warn("Could not set pointer capture:", err);
            }
            
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            
            const boardWidth = document.getElementById('chessboard').offsetWidth;
            let renderR = startR;
            let renderC = startC;
            if (isOnline && myPlayerColor === 'black') {
                renderR = 7 - startR;
                renderC = 7 - startC;
            }
            currentX = renderC * (boardWidth / 8);
            currentY = renderR * (boardWidth / 8);
            
            validMoves = engine.getValidMoves(startR, startC);
            const board = document.getElementById('chessboard');
            app.clearHighlights();
            validMoves.forEach(m => {
                let mR = m.r;
                let mC = m.c;
                if (isOnline && myPlayerColor === 'black') {
                    mR = 7 - m.r;
                    mC = 7 - m.c;
                }
                const sqIndex = mR * 8 + mC;
                const sqEl = board.children[sqIndex];
                sqEl.classList.add(m.capture ? 'valid-capture' : 'valid-move');
                highlightSquares.push(sqEl);
            });
        });

        pieceEl.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - lastClientX;
            const deltaY = e.clientY - lastClientY;
            if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) hasMoved = true;
            
            lastClientX = e.clientX;
            lastClientY = e.clientY;
            
            const isRotated = document.body.classList.contains('tabletop-mode');
            if (isRotated) {
                currentX += deltaY;
                currentY -= deltaX;
            } else {
                currentX += deltaX;
                currentY += deltaY;
            }
            
            const boardWidth = document.getElementById('chessboard').offsetWidth;
            pieceEl.style.left = `${(currentX / boardWidth) * 100}%`;
            pieceEl.style.top = `${(currentY / boardWidth) * 100}%`;
        });

        pieceEl.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            pieceEl.classList.remove('dragging');
            try {
                pieceEl.releasePointerCapture(e.pointerId);
            } catch (err) {}
            
            if (!hasMoved) {
                // It was a click!
                // Clear previous selection if any
                if (this.selectedPiece) {
                    this.clearHighlights();
                }
                this.selectedPiece = {r: startR, c: startC, validMoves};
                let renderR = startR;
                let renderC = startC;
                if (isOnline && myPlayerColor === 'black') {
                    renderR = 7 - startR;
                    renderC = 7 - startC;
                }
                pieceEl.style.top = `${renderR * 12.5}%`;
                pieceEl.style.left = `${renderC * 12.5}%`;
                return;
            }
            
            highlightSquares.forEach(sq => {
                sq.classList.remove('valid-move');
                sq.classList.remove('valid-capture');
            });
            
            const boardWidth = document.getElementById('chessboard').offsetWidth;
            const centerX = currentX + (boardWidth / 16);
            const centerY = currentY + (boardWidth / 16);
            
            let renderTargetC = Math.floor(centerX / (boardWidth / 8));
            let renderTargetR = Math.floor(centerY / (boardWidth / 8));
            
            let targetC = renderTargetC;
            let targetR = renderTargetR;
            if (isOnline && myPlayerColor === 'black') {
                targetC = 7 - renderTargetC;
                targetR = 7 - renderTargetR;
            }
            
            const isValid = validMoves.some(m => m.r === targetR && m.c === targetC);
            
            if (isValid) {
                engine.move(startR, startC, targetR, targetC);
            } else {
                let renderR = startR;
                let renderC = startC;
                if (isOnline && myPlayerColor === 'black') {
                    renderR = 7 - startR;
                    renderC = 7 - startC;
                }
                pieceEl.style.top = `${renderR * 12.5}%`;
                pieceEl.style.left = `${renderC * 12.5}%`;
            }
        });
    },

    renderCards(containerId, isDeckBuilder) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        cardsData.forEach(card => {
            const cardEl = document.createElement('div');
            const lockedClass = card.isLocked && isDeckBuilder ? 'locked' : '';
            cardEl.className = `spell-card ${lockedClass}`;
            cardEl.dataset.id = card.id;

            cardEl.innerHTML = `
                <div class="card-header">
                    <span class="card-title">${card.icon} ${card.name}</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <button class="btn-info" title="More Info">ℹ️</button>
                        <span class="card-id">#${card.id}</span>
                    </div>
                </div>
                <div class="card-effect">${card.effect}</div>
                <div class="card-unlock">
                    ${card.isLocked && isDeckBuilder ? '🔒 Unlock: ' : '🔓 '}${card.unlock}
                </div>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });

            if (isDeckBuilder) {
                cardEl.addEventListener('click', () => this.toggleCardSelection(card.id, cardEl, card.isLocked));
            }

            container.appendChild(cardEl);
        });
    },

    toggleCardSelection(cardId, cardElement, isLocked) {
        if (isLocked) {
            alert("This card is locked! Complete the objective to unlock it.");
            return;
        }

        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
            cardElement.classList.remove('selected');
        } else {
            if (this.selectedCards.size >= this.maxCards) {
                alert(`You can only select up to ${this.maxCards} cards.`);
                return;
            }
            this.selectedCards.add(cardId);
            cardElement.classList.add('selected');
        }
        
        this.updateSelectionUI();
    },

    updateSelectionUI() {
        const countEl = document.getElementById('selection-count');
        countEl.textContent = `${this.selectedCards.size}/${this.maxCards} Cards Selected`;
        countEl.style.color = this.selectedCards.size === this.maxCards ? 'var(--accent-color)' : 'white';
        
        const saveBtn = document.getElementById('save-deck-btn');
        if (saveBtn) {
            if (this.editingDeckForProfileId && this.selectedCards.size === this.maxCards) {
                saveBtn.style.display = 'inline-block';
            } else {
                saveBtn.style.display = 'none';
            }
        }
    },
});
