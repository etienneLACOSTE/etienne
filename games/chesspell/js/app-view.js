// @ts-check
// Rendering: banners, draft and deck cards, modals, chessboard, drag and drop, added to `app`.
import { PIECE_MAP, cardsData, session, socket } from './state.js';
import { engine } from './game-engine.js';
import { createAvatarElement, createPlayerInfoElement } from './profiles.js';
import { app } from './app.js';

/** The arcana number of a spell card: I to XX. */
export function roman(n) {
    /** @type {[number, string][]} */
    const parts = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [value, letters] of parts) {
        while (n >= value) { out += letters; n -= value; }
    }
    return out;
}

/** The top of a tarot-like spell card: its number and its picture. */
const cardArt = (card) => `
    <span class="card-numeral" aria-hidden="true">${roman(card.id)}</span>
    <div class="card-art" aria-hidden="true">${card.icon}</div>`;

/** The card's number and picture in the spell dialogs. */
function fillModalArt(numeralId, iconId, card) {
    document.getElementById(numeralId).textContent = roman(card.id);
    if (iconId) document.getElementById(iconId).textContent = card.icon;
}

Object.assign(app, /** @type {ThisType<any>} */ ({
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
            cardEl.dataset.id = String(card.id);

            cardEl.innerHTML = `${cardArt(card)}
                <button type="button" class="card-title card-main">${card.name}</button>
                <div class="card-effect">${card.effect}</div>
                <button class="btn-info" title="More info" aria-label="More about ${card.name}">i</button>
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
        fillModalArt('modal-numeral', 'modal-icon', card);
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
            cardEl.classList.add('picked');
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
        cue.className = 'draft-cue';
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
                <div class="card-icon-large" aria-hidden="true">${card.icon}</div>
                <div class="card-info">
                    <span class="card-numeral" aria-hidden="true">${roman(card.id)}</span>
                    <button type="button" class="card-title card-main">${card.name}</button>
                    <div class="card-effect">${card.effect}</div>
                </div>
                <button class="btn-info" title="More info" aria-label="More about ${card.name}">i</button>
            `;
            
            cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showInfoModal(card);
            });
            
            cardEl.addEventListener('click', () => {
                if (engine.winner) return; // The game is over
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
        fillModalArt('modal-numeral', 'modal-icon', card);
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
            if (session.isOnline) {
                if (engine.turn !== session.myPlayerColor) return;
                socket.emit('spellActivated', { roomCode: session.currentRoomCode, cardId: card.id });
            } else {
                engine.activateSpell(card.id, cardEl);
            }
        });
        
        newCancel.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    },

    /**
     * The end of the game, over the final board: who won and how, then a rematch or the menu.
     * Facing the bot or online, from the player's side (Victory or Defeat).
     * @param {'white' | 'black'} winner
     * @param {'king' | 'time'} reason
     */
    showEndScreen(winner, reason) {
        const loser = winner === 'white' ? 'black' : 'white';
        const names = { white: this.p1Profile?.name || 'White', black: this.p2Profile?.name || 'Black' };
        const me = session.isOnline ? session.myPlayerColor : this.isBotGame ? 'white' : null;
        const title = me ? (me === winner ? 'Victory' : 'Defeat') : `${names[winner]} wins`;
        const how = reason === 'time' ? `${names[loser]} ran out of time.` : `The ${loser} king has fallen.`;
        const icon = document.getElementById('game-over-icon');
        const sign = document.createElement('span');
        sign.className = reason === 'time' ? 'end-sign' : 'end-sign fallen';
        sign.textContent = reason === 'time' ? '⌛' : PIECE_MAP[loser === 'white' ? 'K' : 'k'];
        icon.replaceChildren(sign);
        document.getElementById('game-over-title').textContent = title;
        document.getElementById('game-over-reason').textContent =
            me ? `${how} ${names[winner]} defeats ${names[loser]}.` : how;
        document.getElementById('game-over-rematch').classList.toggle('hidden', session.isOnline);
        const modal = document.getElementById('game-over-modal');
        modal.classList.toggle('end-defeat', Boolean(me) && me !== winner);
        modal.classList.remove('hidden');
    },

    showInfoModal(card) {
        const modal = document.getElementById('info-modal');
        fillModalArt('info-modal-numeral', 'info-modal-icon', card);
        document.getElementById('info-modal-title').textContent = card.name;
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
                if (session.isOnline && session.myPlayerColor === 'black') {
                    renderR = 7 - r;
                    renderC = 7 - c;
                }
                const isLight = (r + c) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;
                // Place the square explicitly: for the online black player the view is
                // rotated, and the square must sit where its piece is drawn.
                square.style.gridRow = String(renderR + 1);
                square.style.gridColumn = String(renderC + 1);
                square.dataset.r = String(r);
                square.dataset.c = String(c);
                
                const trap = engine.traps.find(t => t.r === r && t.c === c);
                if (trap) { // Traps are visible to both players
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
                if (session.isOnline && session.myPlayerColor === 'black') {
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

                    if (engine.getColor(p) === engine.turn && !engine.targetingState && !engine.winner) {
                        if (!session.isOnline || engine.turn === session.myPlayerColor) {
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
            if (session.isOnline && session.myPlayerColor === 'black') {
                renderR = 7 - startR;
                renderC = 7 - startC;
            }
            currentX = renderC * (boardWidth / 8);
            currentY = renderR * (boardWidth / 8);
            
            validMoves = engine.getValidMoves(startR, startC);
            const board = document.getElementById('chessboard');
            app.clearHighlights();
            validMoves.forEach(m => {
                // Squares are created in board order (r, c); the view rotation is CSS placement.
                const sqEl = board.children[m.r * 8 + m.c];
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
                if (session.isOnline && session.myPlayerColor === 'black') {
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
            if (session.isOnline && session.myPlayerColor === 'black') {
                targetC = 7 - renderTargetC;
                targetR = 7 - renderTargetR;
            }
            
            const isValid = validMoves.some(m => m.r === targetR && m.c === targetC);
            
            if (isValid) {
                engine.move(startR, startC, targetR, targetC);
            } else {
                let renderR = startR;
                let renderC = startC;
                if (session.isOnline && session.myPlayerColor === 'black') {
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
            cardEl.dataset.id = String(card.id);

            cardEl.innerHTML = `${cardArt(card)}
                <button type="button" class="card-title card-main"${card.isLocked && isDeckBuilder ? ' aria-disabled="true"' : ''}>${card.name}</button>
                <div class="card-effect">${card.effect}</div>
                <div class="card-unlock">
                    ${card.isLocked && isDeckBuilder ? '🔒 Unlock: ' : '🔓 '}${card.unlock}
                </div>
                <button class="btn-info" title="More info" aria-label="More about ${card.name}">i</button>
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
        if (isLocked) return this.deckMessage('This card is locked: complete its objective to unlock it.');
        if (this.selectedCards.has(cardId)) {
            this.selectedCards.delete(cardId);
        } else if (this.selectedCards.size >= this.maxCards) {
            return this.deckMessage(`Your deck is full: remove a card first (click it, or its slot above).`);
        } else {
            this.selectedCards.add(cardId);
        }
        this.updateSelectionUI();
    },

    /** A short message under the deck (also read out by screen readers). */
    deckMessage(text) {
        document.getElementById('deck-status').textContent = text;
    },

    /** The deck being built: chosen cards glow in the grid and fill the three slots. */
    updateSelectionUI() {
        const count = this.selectedCards.size;
        const countEl = document.getElementById('selection-count');
        countEl.textContent = `${count}/${this.maxCards} cards`;
        countEl.classList.toggle('complete', count === this.maxCards);
        /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#deck-grid .spell-card')).forEach((el) => {
            const chosen = this.selectedCards.has(Number(el.dataset.id));
            el.classList.toggle('selected', chosen);
            el.querySelector('.card-main').setAttribute('aria-pressed', String(chosen));
        });

        const slots = document.getElementById('deck-slots');
        const chosen = [...this.selectedCards].map((id) => cardsData.find((c) => c.id === id)).filter(Boolean);
        slots.replaceChildren(...Array.from({ length: this.maxCards }, (_, i) => {
            const li = document.createElement('li');
            const card = chosen[i];
            if (!card) {
                li.className = 'deck-slot empty';
                li.textContent = 'Empty slot';
                return li;
            }
            li.className = 'deck-slot';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'deck-slot-card';
            btn.setAttribute('aria-label', `Remove ${card.name} from the deck`);
            btn.innerHTML = `<span class="deck-slot-icon" aria-hidden="true">${card.icon}</span>
                <span class="deck-slot-text"><span class="card-numeral" aria-hidden="true">${roman(card.id)}</span>
                <span class="deck-slot-name">${card.name}</span></span>
                <span class="deck-slot-remove" aria-hidden="true">✕</span>`;
            btn.addEventListener('click', () => {
                this.selectedCards.delete(card.id);
                this.updateSelectionUI();
                document.getElementById('deck-slots').querySelector('button')?.focus();
            });
            li.appendChild(btn);
            return li;
        }));

        const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('save-deck-btn'));
        saveBtn.disabled = !this.editingDeckForProfileId || count !== this.maxCards;
    },
}));
