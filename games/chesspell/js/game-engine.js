// Game engine: turns, moves, spells and their targeting. Move rules live in rules.js.

const engine = {
    board: [],
    turn: 'white',
    activeCardEl: null,
    activeSpellId: null,
    targetingState: null,
    tpSource: null,
    sacrificeRook: null,
    frozenPieces: [],
    shieldedPieces: [],
    traps: [],
    leapFrogActive: false,
    promotionActive: false,
    assassinActive: false,
    history: [],
    doubleTroubleState: { active: false, extraTurnPlayer: null },
    lastPlayedCardId: null,
    capturedByWhite: [],
    capturedByBlack: [],
    
    generateFEN() {
        return ChesspellRules.toFEN(this.board, this.turn);
    },

    init() {
        this.board = ChesspellRules.initialBoard();
        this.turn = 'white';
        this.frozenPieces = [];
        this.shieldedPieces = [];
        this.traps = [];
        this.leapFrogActive = false;
        this.promotionActive = false;
        this.assassinActive = false;
        this.history = [];
        this.doubleTroubleState = { active: false, extraTurnPlayer: null };
        this.lastPlayedCardId = null;
        this.capturedByWhite = [];
        this.capturedByBlack = [];
        this.hasMoved = { 'whiteKing': false, 'whiteRookA': false, 'whiteRookH': false, 'blackKing': false, 'blackRookA': false, 'blackRookH': false };
        this.cancelSpell();
    },
    
    destroyPiece(p) {
        if (!p) return;
        if (this.getColor(p) === 'white') {
            this.capturedByBlack.push(p);
        } else {
            this.capturedByWhite.push(p);
        }
        if (p.toLowerCase() === 'k') {
            const winner = this.getColor(p) === 'white' ? 'Black' : 'White';
            setTimeout(() => {
                alert(`Game Over! ${winner} wins!`);
                if (typeof isOnline !== 'undefined' && isOnline && typeof socket !== 'undefined' && socket) {
                    socket.emit('leaveRoom', { roomCode: typeof currentRoomCode !== 'undefined' ? currentRoomCode : null });
                    if (typeof currentRoomCode !== 'undefined') currentRoomCode = null;
                    isOnline = false;
                    if (typeof app !== 'undefined') app.showScreen('main-menu');
                }
            }, 500);
        }
    },
    
    getColor(p) {
        return ChesspellRules.getColor(p);
    },
    
    getValidMoves(r, c) {
        // The engine object itself is the rules state.
        return ChesspellRules.getValidMoves(this, r, c);
    },
    checkPawnPromotions() {
        ChesspellRules.promotePawns(this.board);
    },
    
    endTurn() {
        this.checkPawnPromotions();
        this.ghostActive = false;
        this.leapFrogActive = false;
        this.promotionActive = false;
        this.cannibalismActive = false;
        this.assassinActive = false;
        
        if (this.domiReversiPiece) {
            if (this.turn === this.domiReversiPiece.caster) {
                if (this.domiReversiPiece.activeTurn) {
                    const {r, c, originalColor} = this.domiReversiPiece;
                    if (this.board[r][c]) {
                        this.board[r][c] = originalColor === 'white' ? this.board[r][c].toUpperCase() : this.board[r][c].toLowerCase();
                    }
                    this.domiReversiPiece = null;
                } else {
                    this.domiReversiPiece.activeTurn = true;
                }
            }
        }
        
        if (this.doubleTroubleState && this.doubleTroubleState.active) {
            this.doubleTroubleState.movesLeft--;
            if (this.doubleTroubleState.movesLeft <= 0) {
                if (this.doubleTroubleState.player === this.turn) {
                    this.turn = this.turn === 'white' ? 'black' : 'white';
                    this.doubleTroubleState.movesLeft = 2;
                } else {
                    this.turn = this.turn === 'white' ? 'black' : 'white';
                    this.doubleTroubleState.active = false;
                }
            }
        } else {
            this.turn = this.turn === 'white' ? 'black' : 'white';
        }
        
        this.frozenPieces.forEach(fp => fp.duration--);
        this.frozenPieces = this.frozenPieces.filter(fp => fp.duration > 0);
        
        this.shieldedPieces.forEach(sp => sp.duration--);
        this.shieldedPieces = this.shieldedPieces.filter(sp => sp.duration > 0);
        
        if (typeof app !== 'undefined') {
            app.startTimer();
            if (this.turn === 'black' && app.isBotGame) {
                setTimeout(() => app.playBotTurn(), 500);
            }
        }
    },

    move(r1, c1, r2, c2, isFromNetwork = false) {
        if (isOnline && !isFromNetwork) {
            socket.emit('makeMove', { roomCode: currentRoomCode, from: {r: r1, c: c1}, to: {r: r2, c: c2} });
            app.renderChessboard(); // Snap back visually and clear highlights
            return;
        }

        this.history.push({
            board: this.board.map(row => [...row]),
            turn: this.turn,
            capturedByWhite: [...this.capturedByWhite],
            capturedByBlack: [...this.capturedByBlack],
            shieldedPieces: this.shieldedPieces.map(sp => ({...sp})),
            traps: this.traps.map(t => ({...t})),
            frozenPieces: this.frozenPieces.map(fp => ({...fp})),
            doubleTroubleState: this.doubleTroubleState ? {...this.doubleTroubleState} : null,
            domiReversiPiece: this.domiReversiPiece ? {...this.domiReversiPiece} : null
        });
        if (this.history.length > 5) this.history.shift();

        // Domi Reversi dispel by capture
        if (this.domiReversiPiece && r2 === this.domiReversiPiece.r && c2 === this.domiReversiPiece.c) {
            // Revert it without moving!
            this.board[r2][c2] = this.domiReversiPiece.originalColor === 'white' ? this.board[r2][c2].toUpperCase() : this.board[r2][c2].toLowerCase();
            this.domiReversiPiece = null;
            if (typeof app !== 'undefined') app.renderChessboard();
            return 'reverted';
        }

        const targetPiece = this.board[r2][c2];
        const movingPiece = this.board[r1][c1];
        
        if (targetPiece) this.destroyPiece(targetPiece);
        
        let pieceToPlace = movingPiece;
        
        if (this.promotionActive && targetPiece) {
            const newType = targetPiece.toLowerCase();
            const color = this.getColor(movingPiece);
            pieceToPlace = color === 'white' ? newType.toUpperCase() : newType;
        }
        
        this.board[r2][c2] = pieceToPlace;
        this.board[r1][c1] = null;
        
        if (this.domiReversiPiece && r1 === this.domiReversiPiece.r && c1 === this.domiReversiPiece.c) {
            this.domiReversiPiece.r = r2;
            this.domiReversiPiece.c = c2;
        }
        
        // Track hasMoved for castling
        if (this.hasMoved) {
            if (movingPiece === 'K') this.hasMoved.whiteKing = true;
            if (movingPiece === 'k') this.hasMoved.blackKing = true;
            if (movingPiece === 'R') {
                if (r1 === 7 && c1 === 0) this.hasMoved.whiteRookA = true;
                if (r1 === 7 && c1 === 7) this.hasMoved.whiteRookH = true;
            }
            if (movingPiece === 'r') {
                if (r1 === 0 && c1 === 0) this.hasMoved.blackRookA = true;
                if (r1 === 0 && c1 === 7) this.hasMoved.blackRookH = true;
            }
        }

        // Execute castling
        if (movingPiece.toLowerCase() === 'k' && Math.abs(c2 - c1) === 2) {
            if (c2 > c1) { // Kingside
                this.board[r2][c2 - 1] = this.board[r2][7];
                this.board[r2][7] = null;
            } else { // Queenside
                this.board[r2][c2 + 1] = this.board[r2][0];
                this.board[r2][0] = null;
            }
        }
        
        const trapIndex = this.traps.findIndex(t => t.r === r2 && t.c === c2 && t.owner !== this.getColor(this.board[r2][c2]));
        if (trapIndex !== -1) {
            if (this.board[r2][c2].toLowerCase() !== 'k') {
                this.destroyPiece(this.board[r2][c2]);
                this.board[r2][c2] = null;
            }
            this.traps.splice(trapIndex, 1);
        }
        
        this.frozenPieces = this.frozenPieces.filter(fp => fp.r !== r1 || fp.c !== c1);
        
        if (this.assassinActive) {
            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
            let validTargets = [];
            dirs.forEach(d => {
                let nr = r2 + d[0], nc = c2 + d[1];
                if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
                    const t = this.board[nr][nc];
                    if (t && t !== 'W' && t.toLowerCase() !== 'k' && this.getColor(t) !== this.turn) {
                        validTargets.push({r: nr, c: nc});
                    }
                }
            });
            if (validTargets.length > 0) {
                this.targetingState = 'select_assassin_kill';
                this.assassinTargets = validTargets;
                if (typeof app !== 'undefined') {
                    app.renderChessboard();
                    const instr = document.getElementById('spell-instruction');
                    instr.textContent = "Select an adjacent enemy piece to assassinate.";
                    instr.classList.remove('hidden');
                }
                return 'assassin_kill';
            } else {
                this.assassinActive = false;
            }
        }
        
        this.endTurn();
        
        app.renderChessboard();
    },

    activateSpell(cardId, cardEl, isFromNetwork = false) {
        if (cardId === 1) { // Cannibalism
            this.cannibalismActive = true;
            this.completeSpell();
            return;
        }
        if (cardId === 13) { // Mirror
            if (!this.lastPlayedCardId) {
                document.getElementById('spell-instruction').textContent = "No card has been played yet to mirror.";
                document.getElementById('spell-instruction').classList.remove('hidden');
                setTimeout(() => { document.getElementById('spell-instruction').classList.add('hidden'); }, 2000);
                return;
            }
            cardId = this.lastPlayedCardId; // Overwrite cardId to simulate playing the last card
        } else {
            this.lastPlayedCardId = cardId; // Save for mirror
        }

        this.activeSpellId = cardId;
        this.activeCardEl = cardEl;
        const instr = document.getElementById('spell-instruction');
        
        if (cardId === 1) { // Cannibalism
            this.targetingState = 'select_cannibalism_piece';
            instr.textContent = "Select one of your pieces (except King) to destroy.";
        } else if (cardId === 2) { // Double Trouble
            this.doubleTroubleState = { active: true, player: this.turn, movesLeft: 2 };
            this.completeSpell();
            return;
        } else if (cardId === 3) { // Domi Reversi
            this.targetingState = 'select_domi_reversi';
            instr.textContent = "Select an enemy piece (except King) to control it.";
        } else if (cardId === 18) { // Kamikaze
            this.targetingState = 'select_kamikaze_piece';
            instr.textContent = "Select one of your pieces (except King) to destroy it and everything around it.";
        } else if (cardId === 19) { // Assassin
            this.assassinActive = true;
            this.completeSpell();
            return;
        } else if (cardId === 17) { // Teleport
            this.targetingState = 'select_own_piece_tp';
            instr.textContent = "Select a piece to teleport.";
        } else if (cardId === 8) { // Wall
            this.targetingState = 'select_empty_square';
            instr.textContent = "Select an empty square to place a wall.";
        } else if (cardId === 15) { // Freeze
            this.targetingState = 'select_enemy_freeze';
            instr.textContent = "Select an enemy piece to freeze for 1 turn.";
        } else if (cardId === 14) { // Sacrifice
            this.targetingState = 'select_own_piece_sac';
            instr.textContent = "Select one of your pieces (except King) to sacrifice.";
        } else if (cardId === 5) { // Ghost
            this.ghostActive = true;
            this.completeSpell();
            return;
        } else if (cardId === 10) { // Tornado
            this.targetingState = 'select_tornado_center';
            instr.textContent = "Select the center square of a 3x3 area to shuffle the pieces inside.";
        } else if (cardId === 6) { // Swap
            this.targetingState = 'select_swap_1';
            this.swapPiece1 = null;
            instr.textContent = "Select the FIRST of your own non-king pieces to swap.";
        } else if (cardId === 4) { // Sidestep
            this.targetingState = 'select_sidestep_from';
            this.sidestepFrom = null;
            instr.textContent = "Select one of your pieces to sidestep.";
        } else if (cardId === 7) { // Sniper
            this.targetingState = 'select_sniper_bishop';
            this.sniperBishop = null;
            instr.textContent = "Select your Bishop.";
        } else if (cardId === 11) { // Shield
            this.targetingState = 'select_shield_piece';
            instr.textContent = "Select a piece to protect for 1 turn.";
        } else if (cardId === 16) { // Trap
            this.targetingState = 'select_trap_square';
            instr.textContent = "Select an empty square to place a hidden trap.";
        } else if (cardId === 12) { // Leap Frog
            this.leapFrogActive = true;
            this.completeSpell();
            return;
        } else if (cardId === 20) { // Promotion
            this.promotionActive = true;
            this.completeSpell();
            return;
        } else if (cardId === 9) { // Revive
            const capturedList = this.turn === 'white' ? this.capturedByBlack : this.capturedByWhite;
            const pawnIdx = capturedList.findIndex(p => p.toLowerCase() === 'p');
            if (pawnIdx === -1) {
                instr.textContent = "You have no captured Pawns to revive.";
                setTimeout(() => this.cancelSpell(), 2000);
                return;
            }
            this.targetingState = 'select_revive_square';
            instr.textContent = "Select an empty square on your starting Pawn rank (Row 2 or 7) to revive your Pawn.";
        } else {
            instr.textContent = "Spell not implemented yet.";
            setTimeout(() => this.cancelSpell(), 2000);
            return;
        }
        instr.classList.remove('hidden');
        app.renderChessboard(); // Re-render to disable drags
        

    },

    cancelSpell() {
        this.activeSpellId = null;
        this.activeCardEl = null;
        this.targetingState = null;
        document.getElementById('spell-instruction').classList.add('hidden');
    },

    handleSquareClick(r, c, isFromNetwork = false) {
        if (!this.targetingState) return;
        
        if (isOnline && !isFromNetwork) {
            if (myPlayerColor !== engine.turn) return; // Only active player can click targets
            socket.emit('spellSquareClicked', { roomCode: currentRoomCode, r: r, c: c });
            return; // Wait for server broadcast
        }
        
        const p = this.board[r][c];
        const color = this.getColor(p);
        
        if (this.activeSpellId === 17 && this.targetingState === 'select_own_piece_tp') {
            if (color === this.turn) {
                this.tpSource = {r, c};
                this.targetingState = 'select_tp_target';
                document.getElementById('spell-instruction').textContent = "Select an empty square on your starting rank.";
            }
        } else if (this.activeSpellId === 17 && this.targetingState === 'select_tp_target') {
            const targetRank = this.turn === 'white' ? 7 : 0;
            if (!p && r === targetRank) {
                this.board[r][c] = this.board[this.tpSource.r][this.tpSource.c];
                this.board[this.tpSource.r][this.tpSource.c] = null;
                this.endTurn();
                this.completeSpell();
            }
        } else if (this.activeSpellId === 8 && this.targetingState === 'select_empty_square') {
            if (!p) {
                this.board[r][c] = 'W';
                this.endTurn();
                this.completeSpell();
            }
        } else if (this.activeSpellId === 15 && this.targetingState === 'select_enemy_freeze') {
            if (p && color !== this.turn && p !== 'W') {
                if (p.toLowerCase() === 'k') return alert("Cannot freeze the King.");
                this.frozenPieces.push({r, c, duration: 2}); // 2 half-turns
                this.completeSpell();
            }
        } else if (this.activeSpellId === 14 && this.targetingState === 'select_own_piece_sac') {
            if (p && color === this.turn && p.toLowerCase() !== 'k') {
                this.sacrificePiece = {r, c, type: p};
                this.targetingState = 'select_own_pawn_sac';
                document.getElementById('spell-instruction').textContent = "Now select one of your Pawns to promote to that piece.";
            }
        } else if (this.activeSpellId === 14 && this.targetingState === 'select_own_pawn_sac') {
            if (p && color === this.turn && p.toLowerCase() === 'p') {
                this.destroyPiece(this.board[this.sacrificePiece.r][this.sacrificePiece.c]);
                this.board[this.sacrificePiece.r][this.sacrificePiece.c] = null;
                this.board[r][c] = this.sacrificePiece.type;
                this.endTurn();
                this.completeSpell();
            }
        } else if (this.targetingState === 'select_tornado_center') {
            const pieces = [];
            const squares = [];
            for(let i = r - 1; i <= r + 1; i++) {
                for(let j = c - 1; j <= c + 1; j++) {
                    if(i >= 0 && i < 8 && j >= 0 && j < 8) {
                        if(this.board[i][j]) {
                            pieces.push(this.board[i][j]);
                            squares.push({r: i, c: j});
                        }
                    }
                }
            }
            if(pieces.length > 0) {
                // Shuffle pieces array
                for (let i = pieces.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
                }
                // Reassign to same squares
                for(let i = 0; i < squares.length; i++) {
                    this.board[squares[i].r][squares[i].c] = pieces[i];
                }
            }
            this.endTurn();
            this.completeSpell();
        } else if (this.targetingState === 'select_swap_1') {
            if (!p || color !== this.turn || p.toLowerCase() === 'k') return alert("Select one of your non-king pieces.");
            this.swapPiece1 = {r, c, type: p};
            this.targetingState = 'select_swap_2';
            document.getElementById('spell-instruction').textContent = "Now select the SECOND piece to swap with.";
            app.renderChessboard();
        } else if (this.targetingState === 'select_swap_2') {
            if (!p || color !== this.turn || p.toLowerCase() === 'k') return alert("Select a valid second non-king piece.");
            if (this.swapPiece1.r === r && this.swapPiece1.c === c) return alert("Must be a different piece.");
            
            this.board[this.swapPiece1.r][this.swapPiece1.c] = p;
            this.board[r][c] = this.swapPiece1.type;
            this.endTurn();
            this.completeSpell();
        } else if (this.targetingState === 'select_sidestep_from') {
            if (!p || color !== this.turn) return alert("Select your piece.");
            this.sidestepFrom = {r, c, type: p};
            this.targetingState = 'select_sidestep_to';
            document.getElementById('spell-instruction').textContent = "Now select an adjacent empty square.";
            app.renderChessboard();
        } else if (this.targetingState === 'select_sidestep_to') {
            if (p) return alert("Square must be empty.");
            const dr = Math.abs(r - this.sidestepFrom.r);
            const dc = Math.abs(c - this.sidestepFrom.c);
            if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return alert("Must be an adjacent square.");
            
            this.board[r][c] = this.sidestepFrom.type;
            this.board[this.sidestepFrom.r][this.sidestepFrom.c] = null;
            this.endTurn();
            this.completeSpell();
        } else if (this.targetingState === 'select_sniper_bishop') {
            if (!p || color !== this.turn || p.toLowerCase() !== 'b') return alert("Select your Bishop.");
            this.sniperBishop = {r, c, type: p};
            this.targetingState = 'select_sniper_target';
            document.getElementById('spell-instruction').textContent = "Now select an enemy piece to destroy.";
            app.renderChessboard();
        } else if (this.targetingState === 'select_sniper_target') {
            if (!p || color === this.turn) return alert("Must select an enemy piece.");
            if (p.toLowerCase() === 'k') return alert("Cannot target the King.");
            // Check line of sight
            const dr = r - this.sniperBishop.r;
            const dc = c - this.sniperBishop.c;
            if (Math.abs(dr) !== Math.abs(dc)) return alert("Bishop can only snipe diagonally.");
            
            const stepR = dr > 0 ? 1 : -1;
            const stepC = dc > 0 ? 1 : -1;
            let currentR = this.sniperBishop.r + stepR;
            let currentC = this.sniperBishop.c + stepC;
            let blocked = false;
            while(currentR !== r && currentC !== c) {
                if (this.board[currentR][currentC] !== null && this.board[currentR][currentC] !== 'W') {
                    blocked = true;
                    break;
                }
                currentR += stepR;
                currentC += stepC;
            }
            if (blocked) return alert("Line of sight is blocked by another piece.");
            
            this.destroyPiece(p);
            this.board[r][c] = null; // Destroy target, bishop doesn't move
            this.endTurn();
            this.completeSpell();
        } else if (this.targetingState === 'select_shield_piece') {
            if (!p || color !== this.turn) return alert("Select your piece.");
            // Store shielded coordinate
            this.shieldedPieces.push({r, c, duration: 2}); // 2 half-turns
            this.completeSpell();
        } else if (this.targetingState === 'select_trap_square') {
            if (p) return alert("Square must be empty.");
            this.traps.push({r, c, owner: this.turn});
            this.endTurn();
            this.completeSpell();
        } else if (this.targetingState === 'select_revive_square') {
            const validRank = this.turn === 'white' ? 6 : 1;
            if (r !== validRank) return alert("Must be on your starting Pawn rank.");
            if (p) return alert("Square must be empty.");
            
            const capturedList = this.turn === 'white' ? this.capturedByBlack : this.capturedByWhite;
            const pawnIdx = capturedList.findIndex(x => x.toLowerCase() === 'p');
            const pawnType = capturedList[pawnIdx];
            capturedList.splice(pawnIdx, 1);
            
            this.board[r][c] = pawnType;
            this.completeSpell();
        } else if (this.activeSpellId === 3 && this.targetingState === 'select_domi_reversi') {
            if (!p || color === this.turn || p.toLowerCase() === 'k') return alert("Select an enemy piece (except King).");
            
            this.domiReversiPiece = {
                r, c,
                originalColor: color,
                caster: this.turn,
                activeTurn: false
            };
            this.board[r][c] = this.turn === 'white' ? p.toUpperCase() : p.toLowerCase();
            this.endTurn();
            this.completeSpell();
        } else if (this.activeSpellId === 18 && this.targetingState === 'select_kamikaze_piece') {
            if (!p || color !== this.turn || p.toLowerCase() === 'k') return alert("Select one of your pieces (except King).");
            
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    if (i >= 0 && i <= 7 && j >= 0 && j <= 7) {
                        const tgt = this.board[i][j];
                        if (tgt && tgt !== 'W' && tgt.toLowerCase() !== 'k') {
                            this.destroyPiece(tgt);
                            this.board[i][j] = null;
                        }
                    }
                }
            }
            this.endTurn();
            this.completeSpell();
        } else if (this.targetingState === 'select_assassin_kill') {
            const isValidTarget = this.assassinTargets.some(t => t.r === r && t.c === c);
            if (!isValidTarget) return alert("Select one of the adjacent enemy pieces.");
            
            this.destroyPiece(p);
            this.board[r][c] = null;
            this.assassinActive = false;
            this.assassinTargets = null;
            this.endTurn();
            // We complete spell right away or it was already marked used?
            // Actually, we called completeSpell() when activating the card.
            // But just in case:
            if (this.activeCardEl) {
                this.activeCardEl.classList.add('used');
                this.cancelSpell();
            } else {
                this.targetingState = null;
                document.getElementById('spell-instruction').classList.add('hidden');
            }
            if (typeof app !== 'undefined') app.renderChessboard();
        }
    },

    completeSpell() {
        if (this.activeCardEl) {
            this.activeCardEl.classList.add('used');
        }
        this.cancelSpell();
        if (typeof app !== 'undefined') app.renderChessboard();
    }
};
