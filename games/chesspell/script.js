let socket = null;
if (typeof io !== 'undefined') {
    socket = io('/chesspell');
}
let isOnline = false;
let currentRoomCode = null;
let myPlayerColor = null;
let myPlayerNumber = null;

const cardsData = [
    { id: 1, name: "Cannibalism", icon: "💀", effect: "Eat one of your own pieces.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "You must have at least one piece to destroy.", inputs: "Click on one of your own pieces." } },
    { id: 2, name: "Double Trouble", icon: "⚡", effect: "Play 2 moves in a row, but your opponent does the same on their next turn.", unlock: "Play 5 games.", isLocked: true,
      details: { timing: "Play before your normal move.", conditions: "None.", inputs: "None. You simply get two consecutive turns." } },
    { id: 3, name: "Domi Reversi", icon: "🧠", effect: "For the next turn, an opponent's piece of your choice (except King) becomes yours.", unlock: "Win a game with a forced mate.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Target an enemy piece. If the opponent attacks it, it reverts immediately as a free action.", inputs: "Click on an enemy piece." } },
    { id: 4, name: "Sidestep", icon: "👣", effect: "Move a piece exactly one square.", unlock: "Move a king 10 times in one game.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click your piece, then click an adjacent empty square." } },
    { id: 5, name: "Ghost", icon: "👻", effect: "For this turn, your moved piece passes through other pieces (cannot capture King).", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn.", conditions: "None.", inputs: "Activate, then move your piece." } },
    { id: 6, name: "Swap", icon: "🔄", effect: "Swap the positions of two of your own non-king pieces.", unlock: "Capture a queen with a pawn.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "You must have at least two non-king pieces.", inputs: "Click the first piece, then click the second piece." } },
    { id: 7, name: "Sniper", icon: "🎯", effect: "Your Bishop can capture a piece without moving to its square.", unlock: "Win 3 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Your Bishop must have a clear line of sight to an enemy.", inputs: "Click your Bishop, then click the enemy piece to destroy it." } },
    { id: 8, name: "Wall", icon: "🧱", effect: "Place a temporary obstacle on an empty square for 2 turns.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on any empty square to place the Wall." } },
    { id: 9, name: "Revive", icon: "✨", effect: "Bring back your last captured pawn on its starting square.", unlock: "Lose 10 pawns.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "You must have lost a pawn, and its starting square must be empty.", inputs: "None." } },
    { id: 10, name: "Tornado", icon: "🌪️", effect: "Randomize the positions of all pieces in a selected 3x3 area.", unlock: "Play 20 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click the center square of the 3x3 area you want to scramble." } },
    { id: 11, name: "Shield", icon: "🛡️", effect: "Protect a chosen piece from being captured for one turn.", unlock: "Castle 5 times.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on one of your own pieces." } },
    { id: 12, name: "Leap Frog", icon: "🐸", effect: "Any chosen piece can move like a Knight for one turn.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play before your normal move.", conditions: "None.", inputs: "None. The effect modifies your next move." } },
    { id: 13, name: "Mirror", icon: "🪞", effect: "Copy the effect of the last card your opponent played.", unlock: "Win against 3 different decks.", isLocked: true,
      details: { timing: "Depends on the copied card.", conditions: "Opponent must have played a card previously.", inputs: "Depends on the copied card." } },
    { id: 14, name: "Sacrifice", icon: "🩸", effect: "Destroy any of your pieces (except King) to promote a Pawn to that piece.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn", conditions: "Must have a piece to sacrifice and a Pawn.", inputs: "Select the piece to sacrifice, then select the Pawn." } },
    { id: 15, name: "Freeze", icon: "🧊", effect: "Freeze an enemy piece for 1 turn. (Free action: you can move a piece afterwards)", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Anytime on your turn", conditions: "Target an enemy piece.", inputs: "Select the enemy piece." } },
    { id: 16, name: "Trap", icon: "🕸️", effect: "Select an empty square; the first enemy piece to land there is destroyed.", unlock: "Win in under 20 moves.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "None.", inputs: "Click on an empty square to place the hidden trap." } },
    { id: 17, name: "Teleport", icon: "🌀", effect: "Move a piece to any empty square on your starting rank.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play instead of your normal move.", conditions: "You must have an empty square on your back rank.", inputs: "Click your piece, then click the destination square on your back rank." } },
    { id: 18, name: "Kamikaze", icon: "💥", effect: "Destroy one of your pieces and all pieces in the 9 squares around it (except Kings).", unlock: "Play 50 games.", isLocked: true,
      details: { timing: "Play instead of your normal move.", conditions: "Target one of your pieces.", inputs: "Click your piece." } },
    { id: 19, name: "Assassin", icon: "🗡️", effect: "After your next move, destroy an enemy piece on an adjacent square.", unlock: "Capture 20 pieces with Knights.", isLocked: true,
      details: { timing: "Play before your normal move.", conditions: "You must end your move next to an enemy piece (except King).", inputs: "None. You will be prompted after your move." } },
    { id: 20, name: "Promotion", icon: "👑", effect: "Promote a piece to the rank of the piece it just captured.", unlock: "Unlocked by default.", isLocked: false,
      details: { timing: "Play before capturing a piece.", conditions: "Your next move must be a capture of an enemy piece.", inputs: "None." } }
];

const PIECE_MAP = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙',
    'W': '🧱'
};

const ZOBRIST = { pieces: {}, turn: 0n };
function initZobrist() {
    const pieces = ['p','n','b','r','q','k','P','N','B','R','Q','K','W'];
    const randomBigInt = () => BigInt(Math.floor(Math.random() * 0xFFFFFFFF)) << 32n | BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    for (let p of pieces) {
        ZOBRIST.pieces[p] = [];
        for (let i = 0; i < 64; i++) ZOBRIST.pieces[p].push(randomBigInt());
    }
    ZOBRIST.turn = randomBigInt();
}
initZobrist();

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
        let fen = '';
        for (let r = 0; r < 8; r++) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                let piece = this.board[r][c];
                if (piece && piece !== 'W' && piece.toLowerCase() !== 'w') {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += piece;
                } else {
                    empty++;
                }
            }
            if (empty > 0) fen += empty;
            if (r < 7) fen += '/';
        }
        fen += ' ' + (this.turn === 'white' ? 'w' : 'b') + ' - - 0 1';
        return fen;
    },

    init() {
        this.board = [
            ['r','n','b','q','k','b','n','r'],
            ['p','p','p','p','p','p','p','p'],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            [null,null,null,null,null,null,null,null],
            ['P','P','P','P','P','P','P','P'],
            ['R','N','B','Q','K','B','N','R']
        ];
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
        if (!p || p === 'W') return null;
        return p === p.toUpperCase() ? 'white' : 'black';
    },
    
    getValidMoves(r, c) {
        if (this.frozenPieces.some(fp => fp.r === r && fp.c === c)) return [];
        
        const p = this.board[r][c];
        if (!p) return [];
        const color = this.getColor(p);
        const type = p.toLowerCase();
        const moves = [];
        let ghostsPassed = 0;
        
        const addIfValid = (nr, nc, captureOnly = false, moveOnly = false) => {
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
            const target = this.board[nr][nc];
            
            const isRestrictedState = (this.doubleTroubleState && this.doubleTroubleState.active) || 
                                      this.ghostActive || 
                                      this.leapFrogActive || 
                                      this.assassinActive;
            
            if (this.ghostActive) {
                if (target) {
                    if (this.getColor(target) !== color && target !== 'W' && !moveOnly) {
                        if (target.toLowerCase() === 'k' && isRestrictedState) return true;
                        // Check Shield
                        if (type !== 'k' && this.shieldedPieces.some(sp => sp.r === nr && sp.c === nc)) return true;
                        moves.push({r: nr, c: nc, capture: true});
                    }
                    ghostsPassed++;
                    if (ghostsPassed > 1) return false;
                    return true;
                } else {
                    if (!captureOnly) moves.push({r: nr, c: nc, capture: false});
                    return true;
                }
            } else {
                if (target) {
                    if (moveOnly) return false;
                    if ((this.getColor(target) !== color || this.cannibalismActive) && target !== 'W') {
                        if (target.toLowerCase() === 'k' && isRestrictedState) return false;
                        if (target.toLowerCase() === 'k' && this.getColor(target) === color) return false; // Cannot eat own king
                        
                        // Domi Reversi cannot capture King
                        if (target.toLowerCase() === 'k' && this.domiReversiPiece && r === this.domiReversiPiece.r && c === this.domiReversiPiece.c) return false;
                        
                        if (type === 'k' || !this.shieldedPieces.some(sp => sp.r === nr && sp.c === nc)) {
                            moves.push({r: nr, c: nc, capture: true});
                        }
                    }
                    return false;
                } else {
                    if (!captureOnly) moves.push({r: nr, c: nc, capture: false});
                    return true;
                }
            }
        };

        if (this.leapFrogActive && this.getColor(p) === this.turn) {
            const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            jumps.forEach(j => addIfValid(r + j[0], c + j[1]));
        }

        if (type === 'p') {
            const dir = color === 'white' ? -1 : 1;
            const startRow = color === 'white' ? 6 : 1;
            if (addIfValid(r + dir, c, false, true) && r === startRow) {
                addIfValid(r + dir * 2, c, false, true);
            }
            addIfValid(r + dir, c - 1, true, false);
            addIfValid(r + dir, c + 1, true, false);
        } else if (type === 'n') {
            const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
            jumps.forEach(j => addIfValid(r + j[0], c + j[1]));
        } else if (type === 'b' || type === 'r' || type === 'q') {
            const dirs = [];
            if (type === 'b' || type === 'q') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
            if (type === 'r' || type === 'q') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
            dirs.forEach(d => {
                let nr = r + d[0], nc = c + d[1];
                ghostsPassed = 0;
                while(addIfValid(nr, nc)) { nr += d[0]; nc += d[1]; }
            });
        } else if (type === 'k') {
            const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            dirs.forEach(d => addIfValid(r + d[0], c + d[1]));
            
            // Castling
            if (!this.ghostActive && !this.assassinActive) {
                const isWhite = color === 'white';
                const kingKey = isWhite ? 'whiteKing' : 'blackKing';
                const rookAKey = isWhite ? 'whiteRookA' : 'blackRookA';
                const rookHKey = isWhite ? 'whiteRookH' : 'blackRookH';
                
                if (this.hasMoved && !this.hasMoved[kingKey]) {
                    // Kingside
                    const targetRookH = this.board[r][7];
                    if (!this.hasMoved[rookHKey] && !this.board[r][c+1] && !this.board[r][c+2] && 
                        targetRookH && targetRookH.toLowerCase() === 'r' && this.getColor(targetRookH) === color) {
                        moves.push({r: r, c: c+2, capture: false, castle: 'kingside'});
                    }
                    // Queenside
                    const targetRookA = this.board[r][0];
                    if (!this.hasMoved[rookAKey] && !this.board[r][c-1] && !this.board[r][c-2] && !this.board[r][c-3] && 
                        targetRookA && targetRookA.toLowerCase() === 'r' && this.getColor(targetRookA) === color) {
                        moves.push({r: r, c: c-2, capture: false, castle: 'queenside'});
                    }
                }
            }
        }
        return moves;
    },
    checkPawnPromotions() {
        for (let c = 0; c < 8; c++) {
            if (this.board[0][c] === 'P') this.board[0][c] = 'Q';
            if (this.board[7][c] === 'p') this.board[7][c] = 'q';
        }
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

const ProfileManager = {
    profiles: [],
    editingProfileId: null,
    
    loadProfiles() {
        const stored = localStorage.getItem('spellChessProfiles');
        if (stored) {
            this.profiles = JSON.parse(stored);
            // Ensure old profiles have a deck array
            this.profiles.forEach(p => { if (!p.deck) p.deck = []; });
        } else {
            this.profiles = [
                { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [] },
                { id: 'guest2', name: 'Guest 2', avatar: '', stats: { played: 0, wins: 0 }, deck: [] }
            ];
            this.saveProfiles();
        }
    },
    
    saveProfiles() {
        localStorage.setItem('spellChessProfiles', JSON.stringify(this.profiles));
    },
    
    submitProfile() {
        const nameInput = document.getElementById('new-profile-name');
        const fileInput = document.getElementById('new-profile-avatar');
        const name = nameInput.value.trim();
        
        if (!name) return alert("Please enter a username.");
        
        const processAvatar = (callback) => {
            if (fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 150;
                        canvas.height = 150;
                        const ctx = canvas.getContext('2d');
                        
                        const size = Math.min(img.width, img.height);
                        const sx = (img.width - size) / 2;
                        const sy = (img.height - size) / 2;
                        
                        ctx.drawImage(img, sx, sy, size, size, 0, 0, canvas.width, canvas.height);
                        
                        callback(canvas.toDataURL('image/jpeg', 0.8));
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            } else {
                callback(null);
            }
        };

        processAvatar((avatarData) => {
            if (this.editingProfileId) {
                const p = this.profiles.find(p => p.id === this.editingProfileId);
                if (p) {
                    p.name = name;
                    if (avatarData) p.avatar = avatarData;
                }
                this.cancelEdit();
            } else {
                this.addProfile(name, avatarData || '');
                nameInput.value = '';
                fileInput.value = '';
            }
            this.saveProfiles();
            this.renderProfilesList();
            app.updatePlayerSelects();
        });
    },
    
    editProfile(id) {
        const p = this.profiles.find(p => p.id === id);
        if (!p) return;
        this.editingProfileId = id;
        document.getElementById('new-profile-name').value = p.name;
        document.getElementById('profile-form-title').textContent = "Edit Profile";
        document.getElementById('profile-submit-btn').textContent = "Save Changes";
        document.getElementById('profile-cancel-btn').style.display = 'inline-block';
        window.scrollTo({top: 0, behavior: 'smooth'});
    },

    cancelEdit() {
        this.editingProfileId = null;
        document.getElementById('new-profile-name').value = '';
        document.getElementById('new-profile-avatar').value = '';
        document.getElementById('profile-form-title').textContent = "Create New Profile";
        document.getElementById('profile-submit-btn').textContent = "Create";
        document.getElementById('profile-cancel-btn').style.display = 'none';
    },

    deleteProfile(id) {
        if (confirm("Are you sure you want to delete this profile?")) {
            this.profiles = this.profiles.filter(p => p.id !== id);
            this.saveProfiles();
            this.renderProfilesList();
            app.updatePlayerSelects();
        }
    },

    addProfile(name, avatar) {
        this.profiles.push({
            id: 'p_' + Date.now(),
            name: name,
            avatar: avatar,
            stats: { played: 0, wins: 0 },
            deck: []
        });
    },
    
    renderProfilesList() {
        const container = document.getElementById('profiles-list');
        container.innerHTML = '';
        this.profiles.forEach(p => {
            const el = document.createElement('div');
            el.className = 'profile-card';
            const imgHtml = p.avatar ? `<img src="${p.avatar}" class="player-avatar">` : `<div class="player-avatar" style="background:#333"></div>`;
            const isDeckValid = p.deck && p.deck.length === 3;
            el.innerHTML = `
                ${imgHtml}
                <div class="player-info">
                    <span class="player-name">${p.name}</span>
                    <span class="player-stats">Games: ${p.stats.played} | Wins: ${p.stats.wins} | Deck: ${isDeckValid ? 'Ready' : 'Incomplete'}</span>
                </div>
                <div class="profile-actions">
                    <button class="btn btn-secondary" onclick="app.buildDeckForProfile('${p.id}')">Build Deck</button>
                    <button class="btn" onclick="ProfileManager.editProfile('${p.id}')">Edit</button>
                    <button class="btn" style="border-color: #ef4444; color: #ef4444;" onclick="ProfileManager.deleteProfile('${p.id}')">Delete</button>
                </div>
            `;
            container.appendChild(el);
        });
    }
};

const app = {
    selectedCards: new Set(),
    maxCards: 3,
    selectedPiece: null,
    p1Profile: null,
    p2Profile: null,
    editingDeckForProfileId: null,
    
    // Timer state
    timerMode: 'turn',
    timerMinutes: 0,
    timerSeconds: 10,
    timeLeftP1: 10,
    timeLeftP2: 10,
    timerInterval: null,
    
    // Bot state
    isBotGame: false,
    botDifficulty: 'novice',
    botDeckType: 'random',

    init() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('demo') === 'true') {
            this.startDemo();
            return;
        }

        ProfileManager.loadProfiles();
        ProfileManager.renderProfilesList();
        this.updatePlayerSelects();
        
        this.renderCards('index-grid', false);
        this.renderCards('deck-grid', true);
        this.updateSelectionUI();
        this.setupOnlineListeners();
    },
    
    startDemo() {
        this.p1Profile = { name: 'Demo Player', deck: [2, 12, 1] };
        this.p2Profile = { name: 'Bot', deck: [17, 15, 20] };
        this.p1Deck = this.p1Profile.deck;
        this.p2Deck = this.p2Profile.deck;
        
        this.isBotGame = true;
        isOnline = false;
        
        engine.init();
        this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
        this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
        this.renderChessboard();
        this.showScreen('game-board');
        
        const overlay = document.createElement('div');
        overlay.id = 'demo-overlay-bubble';
        overlay.innerHTML = `
            <h2 style="margin: 0 0 15px 0; color: #8b5cf6; font-size: 1.2rem;">Interactive Demo</h2>
            <p id="demo-text" style="margin: 0; line-height: 1.5; font-size: 0.95rem;">Welcome to Ches'spell! Click the highlighted <b>Double Trouble</b> card in your hand (bottom).</p>
            <a href="/" style="color: #a78bfa; text-decoration: none; margin-top: 15px; display: inline-block; pointer-events: auto; font-weight: bold; border-top: 1px solid #e2e8f0; padding-top: 10px; width: 100%;">← Return to Hub</a>
        `;
        
        const leftOverlay = document.createElement('div');
        leftOverlay.id = 'demo-overlay-left';
        leftOverlay.innerHTML = `
            <h2 style="margin: 0 0 15px 0; color: #8b5cf6; font-size: 1.2rem;">Rules & Spells</h2>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.5; font-size: 0.9rem;">
                <li><b>Goal:</b> Capture the enemy King to win immediately.</li>
                <li><b>Spells:</b> You have a hand of 3 magic cards (bottom).</li>
                <li><b>Usage:</b> Click a card to activate it. Some replace your turn, others give buffs.</li>
                <li><b>Cost:</b> There's no mana! But each card can only be used once per game.</li>
            </ul>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #demo-overlay-bubble, #demo-overlay-left {
                position: absolute;
                width: 320px;
                background: white;
                color: #1e293b;
                padding: 20px;
                border-radius: 15px;
                z-index: 99999;
                text-align: left;
                border: 2px solid #e2e8f0;
                font-family: sans-serif;
                pointer-events: none;
                box-shadow: 0 10px 25px rgba(0,0,0,0.4);
            }
            .demo-highlight { animation: demoPulse 1.5s infinite; border: 3px solid #8b5cf6 !important; cursor: pointer !important; z-index: 100; }
            @keyframes demoPulse { 0% { box-shadow: 0 0 0 0 rgba(139,92,246, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(139,92,246, 0); } 100% { box-shadow: 0 0 0 0 rgba(139,92,246, 0); } }
        `;
        document.head.appendChild(style);

        setTimeout(() => {
            document.body.appendChild(overlay);
            document.body.appendChild(leftOverlay);
            const board = document.getElementById('chessboard');
            
            function updatePosition() {
                if (!document.getElementById('demo-overlay-bubble')) return;
                const r = board.getBoundingClientRect();
                
                if (window.innerWidth > r.right + 360) {
                    overlay.style.top = Math.max(20, r.top) + 'px';
                    overlay.style.left = (r.right + 20) + 'px';
                    overlay.style.transform = 'none';
                } else {
                    overlay.style.top = '20px';
                    overlay.style.left = '50%';
                    overlay.style.transform = 'translateX(-50%)';
                }
                
                if (r.left > 360) {
                    leftOverlay.style.display = 'block';
                    leftOverlay.style.top = Math.max(20, r.top) + 'px';
                    leftOverlay.style.left = (r.left - 340) + 'px';
                    leftOverlay.style.transform = 'none';
                } else {
                    leftOverlay.style.display = 'none';
                }
            }
            updatePosition();
            window.addEventListener('resize', updatePosition);

            let demoStep = 0;
            const pText = overlay.querySelector('#demo-text');
            
            function clearHighlights() {
                document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
            }
            
            function addHighlight(r, c, isPiece) {
                if (isPiece) {
                    const board = document.getElementById('chessboard');
                    const p = Array.from(board.querySelectorAll('.chess-piece')).find(el => {
                        return Math.abs(parseFloat(el.style.top) - (r * 12.5)) < 0.1 && 
                               Math.abs(parseFloat(el.style.left) - (c * 12.5)) < 0.1;
                    });
                    if (p) p.classList.add('demo-highlight');
                } else {
                    const sq = document.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
                    if (sq) sq.classList.add('demo-highlight');
                }
            }

            const cardEl = document.querySelector('#player1-cards .in-game-card');
            if(cardEl) cardEl.classList.add('demo-highlight');
            
            const originalActivateSpell = engine.activateSpell.bind(engine);
            engine.activateSpell = (index, el) => {
                if (demoStep === 0) {
                    if (index !== 2) {
                        pText.innerHTML = "<span style='color: #ef4444;'>Click the Double Trouble card!</span>";
                        return;
                    }
                    if(cardEl) cardEl.classList.remove('demo-highlight');
                    originalActivateSpell(index, el);
                    demoStep = 1;
                    pText.innerHTML = "Great! <b>Double Trouble</b> gives you 2 moves this turn! Move the highlighted Pawn to the highlighted square.";
                    addHighlight(6, 4, true); // Pawn
                    addHighlight(4, 4, false); // e4 square
                } else {
                    originalActivateSpell(index, el);
                }
            };
            
            const originalEngineMove = engine.move.bind(engine);
            engine.move = (sr, sc, er, ec) => {
                if (demoStep === 0) {
                    pText.innerHTML = "<span style='color: #ef4444;'>Click the highlighted Double Trouble card first!</span>";
                    app.renderChessboard(); // Snap piece back
                    return false;
                } else if (demoStep === 1) {
                    if (sr !== 6 || sc !== 4 || er !== 4 || ec !== 4) {
                        pText.innerHTML = "<span style='color: #ef4444;'>Please move the highlighted Pawn to the highlighted square!</span>";
                        app.renderChessboard(); // Snap piece back
                        setTimeout(() => {
                            addHighlight(6, 4, true);
                            addHighlight(4, 4, false);
                        }, 50);
                        return false; 
                    }
                    const res = originalEngineMove(sr, sc, er, ec);
                    demoStep = 2;
                    clearHighlights();
                    pText.innerHTML = "Move 1/2 completed! Because of Double Trouble, you get a second move! Move your Knight on g1 to f3.";
                    setTimeout(() => {
                        addHighlight(7, 6, true); // Knight
                        addHighlight(5, 5, false); // f3
                    }, 50); // wait for re-render
                    return res;
                } else if (demoStep === 2) {
                    if (sr !== 7 || sc !== 6 || er !== 5 || ec !== 5) {
                        pText.innerHTML = "<span style='color: #ef4444;'>Please move the highlighted Knight to the highlighted square!</span>";
                        app.renderChessboard(); // Snap piece back
                        setTimeout(() => {
                            addHighlight(7, 6, true);
                            addHighlight(5, 5, false);
                        }, 50);
                        return false;
                    }
                    const res = originalEngineMove(sr, sc, er, ec);
                    demoStep = 3;
                    clearHighlights();
                    pText.innerHTML = "<b>Tutorial completed!</b><br><br>• Goal: Capture the enemy King.<br>• If your King is captured, you lose immediately (no checks/checkmates).<br>• Use your spells wisely to outsmart the opponent!<br><br>Good luck!";
                    return res;
                } else {
                    return originalEngineMove(sr, sc, er, ec);
                }
            };
        }, 500);
    },
    
    setupOnlineListeners() {
        if (!socket) return;
        
        document.getElementById('btn-create-room')?.addEventListener('click', () => {
            const p1Id = document.getElementById('online-p1-select').value;
            const profile = ProfileManager.profiles.find(p => p.id === p1Id);
            if (!profile || !profile.deck || profile.deck.length !== 3) {
                return alert("You must select a profile with a valid 3-card deck.");
            }
            this.p1Profile = profile;
            this.p1Deck = [...profile.deck];
            socket.emit('createRoom', { deck: this.p1Deck, profile: this.p1Profile });
        });
        
        document.getElementById('btn-join-room')?.addEventListener('click', () => {
            const p1Id = document.getElementById('online-p1-select').value;
            const profile = ProfileManager.profiles.find(p => p.id === p1Id);
            if (!profile || !profile.deck || profile.deck.length !== 3) {
                return alert("You must select a profile with a valid 3-card deck.");
            }
            const code = document.getElementById('room-code-input').value.trim().toUpperCase();
            if (code.length === 4) {
                this.p2Profile = profile; // Locally, we are p2 joining
                this.p2Deck = [...profile.deck];
                socket.emit('joinRoom', { roomCode: code, deck: this.p2Deck, profile: this.p2Profile });
            } else {
                alert("Please enter a valid 4-letter code.");
            }
        });
        
        document.getElementById('btn-leave-room')?.addEventListener('click', () => {
            if (currentRoomCode) {
                socket.emit('leaveRoom', { roomCode: currentRoomCode });
                currentRoomCode = null;
            }
            this.showScreen('main-menu');
        });

        socket.on('roomCreated', (code) => {
            currentRoomCode = code;
            myPlayerNumber = 1;
            myPlayerColor = 'white';
            isOnline = true;
            document.getElementById('waiting-room-code').textContent = code;
            this.showScreen('waiting-screen');
        });

        socket.on('roomJoined', (data) => {
            currentRoomCode = data.roomCode;
            myPlayerNumber = data.playerNumber;
            myPlayerColor = 'black';
            isOnline = true;
        });

        socket.on('gameStarted', (data) => {
            const state = data.roomState;
            // When game starts, we need to map profiles and decks correctly
            if (myPlayerNumber === 1) {
                this.p2Profile = state.profiles[2];
                this.p2Deck = state.decks[2];
            } else {
                this.p1Profile = state.profiles[1];
                this.p1Deck = state.decks[1];
            }
            
            this.setupPlayerBanner('player1-banner', this.p1Profile);
            this.setupPlayerBanner('player2-banner', this.p2Profile);
            
            engine.init();
            this.showScreen('game-board');
            
            this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
            this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
            
            this.renderChessboard();
        });

        socket.on('moveMade', (data) => {
            const { from, to } = data;
            engine.move(from.r, from.c, to.r, to.c, true);
        });

        socket.on('spellActivated', (data) => {
            // Find the card element to animate it or mark it
            const containerId = engine.turn === 'white' ? 'player1-cards' : 'player2-cards';
            const cardEl = document.querySelector(`#${containerId} .in-game-card[data-card-id="${data.cardId}"]`);
            if (cardEl) {
                engine.activateSpell(data.cardId, cardEl, true);
            }
        });

        socket.on('spellSquareClicked', (data) => {
            engine.handleSquareClick(data.r, data.c, true);
        });

        socket.on('opponentLeft', () => {
            alert("Your opponent left the game.");
            currentRoomCode = null;
            isOnline = false;
            this.showScreen('main-menu');
        });

        socket.on('errorMsg', (msg) => {
            alert(msg);
        });
    },

    updatePlayerSelects() {
        const p1Select = document.getElementById('p1-select');
        const p2Select = document.getElementById('p2-select');
        p1Select.innerHTML = '';
        p2Select.innerHTML = '';
        
        ProfileManager.profiles.forEach(p => {
            const opt1 = document.createElement('option');
            opt1.value = p.id; opt1.textContent = p.name;
            const opt2 = document.createElement('option');
            opt2.value = p.id; opt2.textContent = p.name;
            p1Select.appendChild(opt1);
            p2Select.appendChild(opt2);
        });
        
        if (ProfileManager.profiles.length > 1) {
            p2Select.value = ProfileManager.profiles[1].id;
        }
        
        const onlineP1Select = document.getElementById('online-p1-select');
        if (onlineP1Select) {
            onlineP1Select.innerHTML = '';
            ProfileManager.profiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id; opt.textContent = p.name;
                onlineP1Select.appendChild(opt);
            });
        }
    },

    buildDeckForProfile(profileId) {
        this.editingDeckForProfileId = profileId;
        const profile = ProfileManager.profiles.find(p => p.id === profileId);
        this.selectedCards = new Set(profile.deck || []);
        this.showScreen('deck-builder');
        this.renderCards('deck-grid', true);
        this.updateSelectionUI();
    },

    saveDeckForProfile() {
        if (!this.editingDeckForProfileId) return;
        const profile = ProfileManager.profiles.find(p => p.id === this.editingDeckForProfileId);
        if (profile) {
            profile.deck = Array.from(this.selectedCards);
            ProfileManager.saveProfiles();
            ProfileManager.renderProfilesList();
            alert(`Deck saved for ${profile.name}!`);
            this.showScreen('profiles-screen');
        }
    },

    toggleTabletopMode() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => {
                document.body.classList.add('tabletop-mode');
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(e => console.warn('Orientation lock failed:', e));
                }
            }).catch(err => {
                alert(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        if (screenId === 'player-select-screen') {
            this.updatePlayerSelects();
        }
        if (screenId !== 'deck-builder') {
            this.editingDeckForProfileId = null; // Clear context if leaving deck builder
        }
    },

    startGame(skipDraft) {
        const p1Id = document.getElementById('p1-select').value;
        const p2Id = document.getElementById('p2-select').value;
        
        if (p1Id === p2Id) {
            return alert("Please select different profiles for Player 1 and Player 2.");
        }
        
        this.p1Profile = ProfileManager.profiles.find(p => p.id === p1Id);
        this.p2Profile = ProfileManager.profiles.find(p => p.id === p2Id);
        
        this.timerMinutes = parseInt(document.getElementById('timer-min').value) || 0;
        this.timerSeconds = parseInt(document.getElementById('timer-sec').value) || 0;
        
        if (this.timerMode === 'overall') {
            this.timeLeftP1 = this.timerMinutes * 60 + this.timerSeconds;
            this.timeLeftP2 = this.timeLeftP1;
        }
        
        // Setup Banners for the game board
        this.setupPlayerBanner('player1-banner', this.p1Profile);
        this.setupPlayerBanner('player2-banner', this.p2Profile);
        
        if (skipDraft) {
            const p1HasDeck = this.p1Profile.deck && this.p1Profile.deck.length === 3;
            const p2HasDeck = this.p2Profile.deck && this.p2Profile.deck.length === 3;
            if (!p1HasDeck || (!this.isBotGame && !p2HasDeck)) {
                return alert("Both players must have a saved deck (3 cards) to play Campaign Mode. Go to 'Manage Profiles' to build decks.");
            }
            this.p1Deck = [...this.p1Profile.deck];
            this.p2Deck = this.isBotGame ? this.generateBotDeck() : [...this.p2Profile.deck];
            this.initGame();
        } else {
            this.isBotGame = false;
            this.p1Deck = [];
            this.p2Deck = [];
            this.draftSequence = [1, 2, 2, 1, 1, 2];
            this.currentDraftIndex = 0;
            
            this.showScreen('draft-phase');
            this.renderDraftCards();
            this.updateDraftUI();
        }
    },
    
    // Timer Functions
    setTimerMode(mode) {
        this.timerMode = mode;
        document.querySelectorAll('.timer-toggle-btn').forEach(btn => btn.classList.remove('selected', 'btn-primary'));
        const btn = document.getElementById(mode === 'turn' ? 'btn-timer-turn' : 'btn-timer-overall');
        btn.classList.add('selected');
        btn.style.backgroundColor = 'var(--accent-color)';
        
        document.getElementById('timer-desc-turn').classList.toggle('hidden', mode !== 'turn');
        document.getElementById('timer-desc-overall').classList.toggle('hidden', mode !== 'overall');
    },
    
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.timerMode === 'turn') {
            this.timeLeftP1 = this.timerMinutes * 60 + this.timerSeconds;
            this.timeLeftP2 = this.timeLeftP1;
        }
        document.getElementById('side-status').classList.remove('hidden');
        
        this.timerInterval = setInterval(() => {
            if (engine.turn === 'white') {
                this.timeLeftP1--;
                if (this.timeLeftP1 <= 0) this.handleTimeout('white');
            } else {
                if (this.isBotGame) return; // Bot doesn't have a timer or it plays instantly
                this.timeLeftP2--;
                if (this.timeLeftP2 <= 0) this.handleTimeout('black');
            }
            this.updateTimerVisuals();
        }, 1000);
        this.updateTimerVisuals();
    },
    
    updateTimerVisuals() {
        const time = engine.turn === 'white' ? this.timeLeftP1 : this.timeLeftP2;
        const total = this.timerMinutes * 60 + this.timerSeconds;
        
        let pct = 100;
        if (total > 0) {
            pct = Math.max(0, (time / total) * 100);
        }
        
        const bar = document.getElementById('timer-bar');
        bar.style.height = `${pct}%`;
        
        if (pct < 20) bar.style.backgroundColor = '#e74c3c';
        else if (pct < 50) bar.style.backgroundColor = '#f1c40f';
        else bar.style.backgroundColor = '#2ecc71';
        
        const m = Math.floor(time / 60);
        const s = time % 60;
        document.getElementById('timer-text-overlay').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    },
    
    handleTimeout(player) {
        clearInterval(this.timerInterval);
        if (this.timerMode === 'overall') {
            alert(`Game Over! ${player === 'white' ? 'Black' : 'White'} wins on time!`);
            this.showScreen('main-menu');
        } else {
            // Skip turn
            engine.endTurn();
            this.renderChessboard();
        }
    },
    
    // Bot Functions
    selectBotDeck(deckType) {
        this.botDeckType = deckType;
        document.querySelectorAll('.btn-archetype').forEach(btn => btn.classList.remove('selected'));
        document.querySelector(`.btn-archetype[data-deck="${deckType}"]`).classList.add('selected');
    },
    
    generateBotDeck() {
        const deck = [];
        let pool = [...cardsData];
        // For random, just pick 3 random cards
        for (let i = 0; i < 3; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            deck.push(pool[idx].id);
            pool.splice(idx, 1);
        }
        return deck;
    },
    
    startCampaign() {
        this.isBotGame = true;
        this.botElo = parseInt(document.getElementById('bot-elo-slider').value) || 1500;
        this.p1Profile = ProfileManager.profiles.find(p => p.id === document.getElementById('p1-select').value);
        this.p2Profile = { name: `Bot (${this.botElo} ELO)`, avatar: '', stats: { played: 0, wins: 0 } };
        
        this.startGame(true);
    },
    
    // --- Minimax AI ---
    evaluateBoard() {
        let score = 0;
        const pieceValues = {'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000, 'w': 0};
        
        // Piece-Square Tables (oriented for Black, row 0 is top)
        const pstPawn = [
            [0,  0,  0,  0,  0,  0,  0,  0], // 0 (Black back rank, unused)
            [0,  0,  0,  0,  0,  0,  0,  0], // 1 (starting rank for Black pawns)
            [0,  0,  0,  5,  5,  0,  0,  0], // 2 (rank 3)
            [0,  0,  5, 10, 10,  5,  0,  0], // 3 (rank 4)
            [5,  5, 10, 15, 15, 10,  5,  5], // 4 (rank 5)
            [10, 10, 20, 30, 30, 20, 10, 10], // 5 (rank 6)
            [30, 30, 30, 30, 30, 30, 30, 30], // 6 (rank 7)
            [0,  0,  0,  0,  0,  0,  0,  0]  // 7 (promotion rank for Black)
        ];

        const pstKnight = [
            [-50,-40,-30,-30,-30,-30,-40,-50],
            [-40,-20,  0,  5,  5,  0,-20,-40],
            [-30,  5, 10, 15, 15, 10,  5,-30],
            [-30,  0, 15, 20, 20, 15,  0,-30],
            [-30,  5, 15, 20, 20, 15,  5,-30],
            [-30,  0, 10, 15, 15, 10,  0,-30],
            [-40,-20,  0,  0,  0,  0,-20,-40],
            [-50,-40,-30,-30,-30,-30,-40,-50]
        ];

        const pstBishop = [
            [-20,-10,-10,-10,-10,-10,-10,-20],
            [-10,  5,  0,  0,  0,  0,  5,-10],
            [-10, 10, 10, 10, 10, 10, 10,-10],
            [-10,  0, 10, 10, 10, 10,  0,-10],
            [-10,  5,  5, 10, 10,  5,  5,-10],
            [-10,  0,  5, 10, 10,  5,  0,-10],
            [-10,  0,  0,  0,  0,  0,  0,-10],
            [-20,-10,-10,-10,-10,-10,-10,-20]
        ];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                if (p && p !== 'W') {
                    const color = engine.getColor(p);
                    const type = p.toLowerCase();
                    let val = pieceValues[type] || 0;
                    
                    // PST Bonus
                    let pstBonus = 0;
                    // For black, r goes 0 to 7. For white, we read 7-r.
                    const pstRow = color === 'black' ? r : 7 - r;
                    
                    if (type === 'p') pstBonus = pstPawn[pstRow][c];
                    else if (type === 'n') pstBonus = pstKnight[pstRow][c];
                    else if (type === 'b') pstBonus = pstBishop[pstRow][c];
                    // General center bonus for other pieces
                    else if (type !== 'k') {
                        if (c >= 3 && c <= 4 && r >= 3 && r <= 4) pstBonus = 10;
                    }
                    
                    val += pstBonus;
                    
                    if (color === 'black') {
                        score += val;
                    } else {
                        score -= val;
                    }
                }
            }
        }
        const oppColor = 'white'; // In script.js, bot is always evaluating as if it's the bot?
        // Wait, evaluateBoard doesn't take forPlayer in script.js, it assumes we want score from black's perspective.
        // Actually it returns score where positive means black is winning, negative means white is winning.
        
        // Let's get both players' decks
        let p1Deck = [], p2Deck = [];
        if (typeof app !== 'undefined') {
            p1Deck = app.p1Deck || []; // white
            p2Deck = app.p2Deck || []; // black
        }

        const applyThreats = (playerColor, oppColor, oppDeck) => {
            const oppHasAssassin = oppDeck.includes(19);
            const oppHasKamikaze = oppDeck.includes(18);
            const oppHasDomi = oppDeck.includes(3);

            if (oppHasAssassin || oppHasKamikaze || oppHasDomi) {
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = engine.board[r][c];
                        if (p && p !== 'W' && engine.getColor(p) === playerColor && p.toLowerCase() !== 'k') {
                            let val = pieceValues[p.toLowerCase()] || 0;
                            
                            if (oppHasAssassin || oppHasKamikaze) {
                                let adjEnemy = false;
                                const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
                                for (let d of dirs) {
                                    let nr = r + d[0], nc = c + d[1];
                                    if (nr>=0 && nr<=7 && nc>=0 && nc<=7) {
                                        const tgt = engine.board[nr][nc];
                                        if (tgt && engine.getColor(tgt) === oppColor && tgt.toLowerCase() !== 'k') {
                                            adjEnemy = true; break;
                                        }
                                    }
                                }
                                if (adjEnemy) {
                                    if (playerColor === 'black') score -= (val * 0.8);
                                    else score += (val * 0.8);
                                }
                            }
                            
                            if (oppHasDomi) {
                                if (val >= 500) {
                                    if (playerColor === 'black') score -= (val * 0.3);
                                    else score += (val * 0.3);
                                }
                            }
                        }
                    }
                }
            }
        };

        applyThreats('black', 'white', p1Deck);
        applyThreats('white', 'black', p2Deck);
        
        // King safety & Pawn Structure
        let wPawnCols = new Array(8).fill(0);
        let bPawnCols = new Array(8).fill(0);
        let wKing = null, bKing = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                if (p === 'P') { wPawnCols[c]++; }
                if (p === 'p') { bPawnCols[c]++; }
                if (p === 'K') { wKing = {r,c}; }
                if (p === 'k') { bKing = {r,c}; }
            }
        }
        
        // Penalize doubled and isolated pawns
        for (let c=0; c<8; c++) {
            if (wPawnCols[c] > 1) score += 15; // white penalty (score goes positive for black)
            if (bPawnCols[c] > 1) score -= 15; // black penalty
            
            if (wPawnCols[c] > 0) {
                if ((c===0 || wPawnCols[c-1]===0) && (c===7 || wPawnCols[c+1]===0)) score += 10;
            }
            if (bPawnCols[c] > 0) {
                if ((c===0 || bPawnCols[c-1]===0) && (c===7 || bPawnCols[c+1]===0)) score -= 10;
            }
        }
        
        // King safety
        // King safety
        if (wKing && wKing.r > 5) {
            let shield = 0;
            for(let c=Math.max(0, wKing.c-1); c<=Math.min(7, wKing.c+1); c++) {
                if (engine.board[wKing.r-1] && engine.board[wKing.r-1][c] === 'P') shield++;
                else if (engine.board[wKing.r-2] && engine.board[wKing.r-2][c] === 'P') shield++;
            }
            if (shield < 2) score += 20;
        }
        if (bKing && bKing.r < 2) {
            let shield = 0;
            for(let c=Math.max(0, bKing.c-1); c<=Math.min(7, bKing.c+1); c++) {
                if (engine.board[bKing.r+1] && engine.board[bKing.r+1][c] === 'p') shield++;
                else if (engine.board[bKing.r+2] && engine.board[bKing.r+2][c] === 'p') shield++;
            }
            if (shield < 2) score -= 20;
        }
        
        // Castling Bonus
        if (wKing && wKing.r === 7 && (wKing.c === 2 || wKing.c === 6)) score -= 40;
        if (bKing && bKing.r === 0 && (bKing.c === 2 || bKing.c === 6)) score += 40;

        // Development heuristics (encourage knights/bishops out, queen stays)
        let devScore = 0;
        // Black development
        if (engine.board[0][1] === 'n') devScore -= 40; // Penalty if knight is still at starting position
        if (engine.board[0][6] === 'n') devScore -= 40;
        if (engine.board[0][2] === 'b') devScore -= 40;
        if (engine.board[0][5] === 'b') devScore -= 40;
        if (engine.board[1][3] === 'q' || engine.board[2][3] === 'q' || engine.board[3][3] === 'q') devScore -= 30; // Don't rush queen
        
        // White development
        if (engine.board[7][1] === 'N') devScore += 40; // Penalty if knight is still at starting position
        if (engine.board[7][6] === 'N') devScore += 40;
        if (engine.board[7][2] === 'B') devScore += 40;
        if (engine.board[7][5] === 'B') devScore += 40;
        if (engine.board[6][3] === 'Q' || engine.board[5][3] === 'Q' || engine.board[4][3] === 'Q') devScore += 30;
        
        score += devScore;

        return score;
    },

    transpositionTable: new Map(),
    historyTable: {}, // 'r,c-r,c' -> score
    
    computeBoardHash(isMaximizing) {
        let h = 0n;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                if (p && ZOBRIST.pieces[p]) h ^= ZOBRIST.pieces[p][r * 8 + c];
            }
        }
        if (!isMaximizing) h ^= ZOBRIST.turn;
        return h;
    },

    makeVirtualMove(move) {
        const targetPiece = engine.board[move.to.r][move.to.c];
        const movingPiece = engine.board[move.from.r][move.from.c];
        if (move.isSniper) {
            engine.board[move.to.r][move.to.c] = null;
        } else {
            engine.board[move.to.r][move.to.c] = movingPiece;
            engine.board[move.from.r][move.from.c] = null;
        }
        
        if (move.castle) {
            if (move.castle === 'kingside') {
                engine.board[move.to.r][move.to.c - 1] = engine.board[move.to.r][7];
                engine.board[move.to.r][7] = null;
            } else if (move.castle === 'queenside') {
                engine.board[move.to.r][move.to.c + 1] = engine.board[move.to.r][0];
                engine.board[move.to.r][0] = null;
            }
        }
        
        // Handle pawn promotion for evaluation
        move.promotedFrom = null;
        const currentPiece = engine.board[move.to.r][move.to.c];
        if (currentPiece && currentPiece.toLowerCase() === 'p') {
            if (currentPiece === 'P' && move.to.r === 0) {
                engine.board[move.to.r][move.to.c] = 'Q';
                move.promotedFrom = 'P';
            } else if (currentPiece === 'p' && move.to.r === 7) {
                engine.board[move.to.r][move.to.c] = 'q';
                move.promotedFrom = 'p';
            }
        }
        
        return targetPiece;
    },

    undoVirtualMove(move, targetPiece) {
        if (move.isSniper) {
            engine.board[move.to.r][move.to.c] = targetPiece;
        } else {
            engine.board[move.from.r][move.from.c] = engine.board[move.to.r][move.to.c];
            engine.board[move.to.r][move.to.c] = targetPiece;
        }
        
        if (move.castle) {
            if (move.castle === 'kingside') {
                engine.board[move.to.r][7] = engine.board[move.to.r][move.to.c - 1];
                engine.board[move.to.r][move.to.c - 1] = null;
            } else if (move.castle === 'queenside') {
                engine.board[move.to.r][0] = engine.board[move.to.r][move.to.c + 1];
                engine.board[move.to.r][move.to.c + 1] = null;
            }
        }
        
        // Restore promoted pawn
        if (move.promotedFrom) {
            engine.board[move.from.r][move.from.c] = move.promotedFrom;
        }
    },
    quiescence(alpha, beta, isMaximizing) {
        let standPat = this.evaluateBoard();
        
        if (isMaximizing) {
            if (standPat >= beta) return beta;
            if (alpha < standPat) alpha = standPat;
        } else {
            if (standPat <= alpha) return alpha;
            if (beta > standPat) beta = standPat;
        }

        const color = isMaximizing ? 'black' : 'white';
        let allMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === color) {
                    const oldTurn = engine.turn;
                    engine.turn = color;
                    let moves = engine.getValidMoves(r, c);
                    engine.turn = oldTurn;
                    moves.forEach(m => {
                        if (m.capture) {
                            allMoves.push({from: {r, c}, to: m});
                        }
                    });
                }
            }
        }

        const pieceValues = {'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000, 'w': 0};
        allMoves.sort((a, b) => {
            const victimA = engine.board[a.to.r][a.to.c];
            const victimB = engine.board[b.to.r][b.to.c];
            const attackerA = engine.board[a.from.r][a.from.c];
            const attackerB = engine.board[b.from.r][b.from.c];
            const valVA = victimA ? (pieceValues[victimA.toLowerCase()] || 0) : 0;
            const valVB = victimB ? (pieceValues[victimB.toLowerCase()] || 0) : 0;
            const valAA = attackerA ? (pieceValues[attackerA.toLowerCase()] || 0) : 0;
            const valAB = attackerB ? (pieceValues[attackerB.toLowerCase()] || 0) : 0;
            
            const scoreA = 10 * valVA - valAA;
            const scoreB = 10 * valVB - valAB;
            return scoreB - scoreA;
        });

        if (isMaximizing) {
            let maxEval = standPat;
            for (let move of allMoves) {
                let target = this.makeVirtualMove(move);
                let ev = this.quiescence(alpha, beta, false);
                this.undoVirtualMove(move, target);
                maxEval = Math.max(maxEval, ev);
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = standPat;
            for (let move of allMoves) {
                let target = this.makeVirtualMove(move);
                let ev = this.quiescence(alpha, beta, true);
                this.undoVirtualMove(move, target);
                minEval = Math.min(minEval, ev);
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    },

    minimax(depth, alpha, beta, isMaximizing, currentHash = null) {
        if (currentHash === null) currentHash = this.computeBoardHash(isMaximizing);
        
        const alphaOrig = alpha;
        const betaOrig = beta;
        const ttEntry = this.transpositionTable.get(currentHash);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === 'EXACT') return ttEntry.value;
            if (ttEntry.flag === 'LOWERBOUND') alpha = Math.max(alpha, ttEntry.value);
            if (ttEntry.flag === 'UPPERBOUND') beta = Math.min(beta, ttEntry.value);
            if (alpha >= beta) return ttEntry.value;
        }

        // Check for missing kings
        let whiteKing = false, blackKing = false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (engine.board[r][c] === 'k') blackKing = true;
                if (engine.board[r][c] === 'K') whiteKing = true;
            }
        }
        if (!blackKing) return -99999 - depth;
        if (!whiteKing) return 99999 + depth;
        
        if (depth === 0) return this.quiescence(alphaOrig, beta, isMaximizing);
        
        const color = isMaximizing ? 'black' : 'white';
        let allMoves = [];
        
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === color) {
                    const oldTurn = engine.turn;
                    engine.turn = color;
                    const moves = engine.getValidMoves(r, c);
                    engine.turn = oldTurn;
                    moves.forEach(m => allMoves.push({from: {r, c}, to: m, isSniper: m.isSniper}));
                }
            }
        }
        
        if (allMoves.length === 0) return isMaximizing ? -99999 : 99999;
        
        // Sort moves to improve alpha-beta pruning (captures first, then TT, then history)
        const pieceValues = {'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000, 'w': 0};
        allMoves.sort((a, b) => {
            if (ttEntry && ttEntry.bestMove) {
                const isATt = a.from.r === ttEntry.bestMove.from.r && a.from.c === ttEntry.bestMove.from.c && a.to.r === ttEntry.bestMove.to.r && a.to.c === ttEntry.bestMove.to.c;
                const isBTt = b.from.r === ttEntry.bestMove.from.r && b.from.c === ttEntry.bestMove.from.c && b.to.r === ttEntry.bestMove.to.r && b.to.c === ttEntry.bestMove.to.c;
                if (isATt) return -1;
                if (isBTt) return 1;
            }
            const tA = engine.board[a.to.r][a.to.c];
            const tB = engine.board[b.to.r][b.to.c];
            const valA = tA ? (pieceValues[tA.toLowerCase()] || 0) : 0;
            const valB = tB ? (pieceValues[tB.toLowerCase()] || 0) : 0;
            if (valA !== valB) return valB - valA;
            
            const histA = this.historyTable[`${a.from.r},${a.from.c}-${a.to.r},${a.to.c}`] || 0;
            const histB = this.historyTable[`${b.from.r},${b.from.c}-${b.to.r},${b.to.c}`] || 0;
            return histB - histA;
        });

        let bestMoveForTT = null;
        let bestValue = isMaximizing ? -Infinity : Infinity;

        if (isMaximizing) {
            for (let move of allMoves) {
                let target = this.makeVirtualMove(move);
                let ev = this.minimax(depth - 1, alpha, beta, false);
                this.undoVirtualMove(move, target);
                
                if (ev > bestValue) { bestValue = ev; bestMoveForTT = move; }
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) {
                    if (!target) {
                        const key = `${move.from.r},${move.from.c}-${move.to.r},${move.to.c}`;
                        this.historyTable[key] = (this.historyTable[key] || 0) + depth * depth;
                    }
                    break;
                }
            }
        } else {
            for (let move of allMoves) {
                let target = this.makeVirtualMove(move);
                let ev = this.minimax(depth - 1, alpha, beta, true);
                this.undoVirtualMove(move, target);
                
                if (ev < bestValue) { bestValue = ev; bestMoveForTT = move; }
                beta = Math.min(beta, ev);
                if (beta <= alpha) {
                    if (!target) {
                        const key = `${move.from.r},${move.from.c}-${move.to.r},${move.to.c}`;
                        this.historyTable[key] = (this.historyTable[key] || 0) + depth * depth;
                    }
                    break;
                }
            }
        }

        let flag = 'EXACT';
        if (bestValue <= alphaOrig) flag = 'UPPERBOUND';
        else if (bestValue >= betaOrig) flag = 'LOWERBOUND';
        
        this.transpositionTable.set(currentHash, {
            depth, value: bestValue, flag, bestMove: bestMoveForTT
        });
        
        return bestValue;
    },

    getBestMoveFromAI(depth) {
        this.transpositionTable.clear();
        for (let key in this.historyTable) {
            this.historyTable[key] = Math.floor(this.historyTable[key] / 2);
        }
        let bestMove = null;
        let maxEval = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;
        
        let allMoves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === 'black') {
                    const oldTurn = engine.turn;
                    engine.turn = 'black';
                    const moves = engine.getValidMoves(r, c);
                    engine.turn = oldTurn;
                    moves.forEach(m => allMoves.push({from: {r, c}, to: m}));
                }
            }
        }
        
        const pieceValues = {'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000, 'w': 0};
        allMoves.sort((a, b) => {
            const tA = engine.board[a.to.r][a.to.c];
            const tB = engine.board[b.to.r][b.to.c];
            const valA = tA ? (pieceValues[tA.toLowerCase()] || 0) : 0;
            const valB = tB ? (pieceValues[tB.toLowerCase()] || 0) : 0;
            if (valA !== valB) return valB - valA;
            
            const histA = this.historyTable[`${a.from.r},${a.from.c}-${a.to.r},${a.to.c}`] || 0;
            const histB = this.historyTable[`${b.from.r},${b.from.c}-${b.to.r},${b.to.c}`] || 0;
            return histB - histA;
        });

        for (let move of allMoves) {
            let target = this.makeVirtualMove(move);
            let ev = this.minimax(depth - 1, alpha, beta, false);
            this.undoVirtualMove(move, target);
            
            ev += Math.random() * 0.1; // Random noise

            
            if (ev > maxEval) {
                maxEval = ev;
                bestMove = move;
            }
            alpha = Math.max(alpha, ev);
        }
        return bestMove;
    },

    botTryUseSpell() {
        const unusedCards = Array.from(document.querySelectorAll('#player2-cards .in-game-card:not(.used)'));
        if (unusedCards.length === 0) return;
        
        // Fiche Technique (Genetic Algorithm DNA - Contextual - Gen 100)
        const genes = {
          "meta": { "patience": 0.12, "aggressiveness": 0.19, "desperation": 0.23 },
          "sniper": { "earlyProb": 0.70, "lateProb": 0.38, "minVal": 997 },
          "freeze": { "prob": 0.16, "minVal": 166 },
          "shield": { "prob": 0.84, "minVal": 289 },
          "sacrifice": { "minVal": 665, "desperationProb": 0.88 },
          "ghost": { "offensiveProb": 0.17, "defensiveProb": 0.95 },
          "leapFrog": { "prob": 0.03 },
          "doubleTrouble": { "earlyProb": 0, "lateProb": 0.92 },
          "tornado": { "disruptionProb": 0.21 },
          "swap": { "savePieceProb": 0.19, "attackProb": 0.87 },
          "revive": { "prob": 0.36 },
          "cannibalism": { "prob": 0.68 },
          "sidestep": { "prob": 0.78 },
          "mirror": { "prob": 0.87 },
          "trap": { "prob": 0.35 },
          "teleport": { "defensiveProb": 0.05, "offensiveProb": 0.10 },
          "assassin": { "earlyProb": 0.65, "lateProb": 0.68 },
          "promotion": { "prob": 1.0 },
          "domiReversi": { "minValEarly": 689, "minValLate": 233, "urgencyProb": 0.64 },
          "kamikaze": { "minValDiff": 929, "desperationMultiplier": 1.08 }
        };
        
        let emptySquares = 0;
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!engine.board[r][c]) emptySquares++;
        const isLateGame = emptySquares > 40;
        
        // Very basic score eval
        let myScore = 0;
        const vals = {'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000};
        for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
            const p = engine.board[r][c];
            if(p && p !== 'W') {
                if(engine.getColor(p) === 'black') myScore += (vals[p.toLowerCase()]||0);
                else myScore -= (vals[p.toLowerCase()]||0);
            }
        }
        const isDesperate = myScore < -300;
        const isAggressive = Math.random() < genes.meta.aggressiveness;
        
        if (Math.random() < genes.meta.patience && !isDesperate && !isLateGame) return;

        const supported = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
        let playable = unusedCards.filter(c => supported.includes(parseInt(c.dataset.cardId)));
        if (playable.length === 0) return;
        
        playable.sort(() => Math.random() - 0.5);
        let cardToPlay = null;
        let targets = [];
        let cardId = null;

        for (let cardEl of playable) {
            let id = parseInt(cardEl.dataset.cardId);
            
            if (id === 13) {
                if (engine.lastPlayedCardId && Math.random() < genes.mirror.prob) {
                    id = engine.lastPlayedCardId;
                } else continue;
            }

            if (id === 7 || id === 15) {
                const g = id === 7 ? genes.sniper : genes.freeze;
                const prob = id === 7 ? (isLateGame ? g.lateProb : g.earlyProb) : g.prob;
                if (Math.random() < prob) {
                    let target = null, maxVal = -1;
                    for (let r=0; r<8; r++) for(let c=0; c<8; c++) {
                        const p = engine.board[r][c];
                        if (p && engine.getColor(p) === 'white' && p.toLowerCase() !== 'k') {
                            let v = vals[p.toLowerCase()] || 0;
                            if (v > maxVal) { maxVal = v; target = {r, c}; }
                        }
                    }
                    if (target && maxVal >= g.minVal) {
                        if (id === 15) { cardToPlay = cardEl; cardId = id; targets = [target]; break; }
                        else if (id === 7) {
                            let bishop = null;
                            for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
                                const p = engine.board[r][c];
                                if(p && p.toLowerCase() === 'b' && engine.getColor(p) === 'black') bishop = {r,c};
                            }
                            if (bishop) {
                                let realTarget = null;
                                const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
                                for (let d of dirs) {
                                    let cr = bishop.r + d[0], cc = bishop.c + d[1];
                                    while(cr >= 0 && cr < 8 && cc >= 0 && cc < 8) {
                                        const p = engine.board[cr][cc];
                                        if (p) {
                                            if (engine.getColor(p) === 'white' && p.toLowerCase() !== 'k' && p !== 'W') {
                                                let v = vals[p.toLowerCase()] || 0;
                                                if (v >= g.minVal) { realTarget = {r:cr, c:cc}; }
                                            }
                                            break;
                                        }
                                        cr += d[0]; cc += d[1];
                                    }
                                }
                                if (realTarget) { cardToPlay = cardEl; cardId = id; targets = [bishop, realTarget]; break; }
                            }
                        }
                    }
                }
            } else if (id === 5) {
                if (Math.random() < (isAggressive ? genes.ghost.offensiveProb : genes.ghost.defensiveProb)) { cardToPlay = cardEl; cardId = id; break; }
            } else if (id === 12) {
                if (Math.random() < genes.leapFrog.prob) { cardToPlay = cardEl; cardId = id; break; }
            } else if (id === 2) {
                if (Math.random() < (isLateGame ? genes.doubleTrouble.lateProb : genes.doubleTrouble.earlyProb)) { cardToPlay = cardEl; cardId = id; break; }
            } else if (id === 19) {
                if (Math.random() < (isLateGame ? genes.assassin.lateProb : genes.assassin.earlyProb)) { cardToPlay = cardEl; cardId = id; break; }
            } else if (id === 20) {
                if (Math.random() < genes.promotion.prob) { cardToPlay = cardEl; cardId = id; break; }
            } else if (id === 8) {
                const empties = [];
                for(let r=3; r<=5; r++) for(let c=0; c<8; c++) if (!engine.board[r][c]) empties.push({r, c});
                if (empties.length > 0) { cardToPlay = cardEl; cardId = id; targets = [empties[Math.floor(Math.random()*empties.length)]]; break; }
            } else if (id === 16) {
                if (Math.random() < genes.trap.prob) {
                    const empties = [];
                    for(let r=2; r<=6; r++) for(let c=0; c<8; c++) if (!engine.board[r][c]) empties.push({r, c});
                    if (empties.length > 0) { cardToPlay = cardEl; cardId = id; targets = [empties[Math.floor(Math.random()*empties.length)]]; break; }
                }
            } else if (id === 11) {
                let target = null, maxVal = -1;
                for (let r=0; r<8; r++) for(let c=0; c<8; c++) {
                    const p = engine.board[r][c];
                    if (p && engine.getColor(p) === 'black') {
                        const val = vals[p.toLowerCase()]||0;
                        if (val > maxVal) { maxVal = val; target = {r, c}; }
                    }
                }
                if (target && maxVal >= genes.shield.minVal) { cardToPlay = cardEl; cardId = id; targets = [target]; break; }
            } else if (id === 1) {
                // Cannibalism targetless (buff)
                cardToPlay = cardEl; cardId = id; break;
            } else if (id === 14) {
                let target = null, minVal = 99999;
                for (let r=0; r<8; r++) for(let c=0; c<8; c++) {
                    const p = engine.board[r][c];
                    if (p && engine.getColor(p) === 'black' && p.toLowerCase() !== 'k' && p.toLowerCase() !== 'p') {
                        const val = vals[p.toLowerCase()]||0;
                        if (val < minVal) { minVal = val; target = {r, c}; }
                    }
                }
                let pawnTgt = null;
                for (let r=0; r<8; r++) for(let c=0; c<8; c++) if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === 'black' && engine.board[r][c].toLowerCase() === 'p') { pawnTgt = {r, c}; break; }
                const threshold = isDesperate ? (genes.sacrifice.minVal * genes.sacrifice.desperationProb) : genes.sacrifice.minVal;
                if (target && pawnTgt && minVal >= threshold) { cardToPlay = cardEl; cardId = id; targets = [target, pawnTgt]; break; }
            } else if (id === 4) {
                if (Math.random() < genes.sidestep.prob) {
                    let pce = null, sq = null;
                    for (let r=0; r<8; r++) for(let c=0; c<8; c++) {
                        if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === 'black') {
                            const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
                            for(let d of dirs) {
                                if (r+d[0]>=0 && r+d[0]<8 && c+d[1]>=0 && c+d[1]<8 && !engine.board[r+d[0]][c+d[1]]) {
                                    pce = {r,c}; sq = {r:r+d[0], c:c+d[1]}; break;
                                }
                            }
                            if(pce) break;
                        }
                    }
                    if (pce && sq) { cardToPlay = cardEl; cardId = id; targets = [pce, sq]; break; }
                }
            } else if (id === 6) {
                if (Math.random() < (isAggressive ? genes.swap.attackProb : genes.swap.savePieceProb)) {
                    let pcs = [];
                    for (let r=0; r<8; r++) for(let c=0; c<8; c++) {
                        const p = engine.board[r][c];
                        if (p && engine.getColor(p) === 'black' && p.toLowerCase() !== 'k') pcs.push({r,c});
                    }
                    if (pcs.length >= 2) { pcs.sort(()=>Math.random()-0.5); cardToPlay = cardEl; cardId = id; targets = [pcs[0], pcs[1]]; break; }
                }
            } else if (id === 9) {
                if (Math.random() < genes.revive.prob) {
                    const row = 1; let sq = null;
                    for (let c=0; c<8; c++) { if (!engine.board[row][c]) { sq = {r:row, c}; break; } }
                    const capturedList = engine.capturedByWhite;
                    const pawnIdx = capturedList.findIndex(p => p.toLowerCase() === 'p');
                    if (sq && pawnIdx !== -1) { cardToPlay = cardEl; cardId = id; targets = [sq]; break; }
                }
            } else if (id === 10) {
                if (Math.random() < genes.tornado.disruptionProb) { cardToPlay = cardEl; cardId = id; targets = [{r: Math.floor(Math.random()*4)+2, c: Math.floor(Math.random()*4)+2}]; break; }
            } else if (id === 3) {
                const prob = isDesperate ? (genes.domiReversi.urgencyProb * 2) : genes.domiReversi.urgencyProb;
                if (Math.random() < prob) {
                    let target = null, maxVal = -1;
                    for (let r = 0; r < 8; r++) {
                        for (let c = 0; c < 8; c++) {
                            const p = engine.board[r][c];
                            if (p && engine.getColor(p) === 'white' && p.toLowerCase() !== 'k') {
                                const original = engine.board[r][c];
                                engine.board[r][c] = original.toLowerCase();
                                let isCapturable = false;
                                for (let ir = 0; ir < 8; ir++) {
                                    for (let ic = 0; ic < 8; ic++) {
                                        const op = engine.board[ir][ic];
                                        if (op && engine.getColor(op) === 'white') {
                                            const oppMoves = engine.getValidMoves(ir, ic);
                                            if (oppMoves.some(m => m.r === r && m.c === c && m.capture)) { isCapturable = true; break; }
                                        }
                                    }
                                    if (isCapturable) break;
                                }
                                engine.board[r][c] = original;
                                if (!isCapturable) {
                                    let v = vals[p.toLowerCase()] || 0;
                                    if (v > maxVal) { maxVal = v; target = {r, c}; }
                                }
                            }
                        }
                    }
                    const threshold = isLateGame ? genes.domiReversi.minValLate : genes.domiReversi.minValEarly;
                    if (target && maxVal >= threshold) { cardToPlay = cardEl; cardId = id; targets = [target]; break; }
                }
            } else if (id === 18) {
                const threshold = isDesperate ? (genes.kamikaze.minValDiff / genes.kamikaze.desperationMultiplier) : genes.kamikaze.minValDiff;
                let bestTarget = null, bestScore = -9999;
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = engine.board[r][c];
                        if (p && engine.getColor(p) === 'black' && p.toLowerCase() !== 'k') {
                            let myVal = vals[p.toLowerCase()] || 0;
                            let enemyValSum = 0;
                            let friendlyValSum = myVal;
                            for (let i = r - 1; i <= r + 1; i++) {
                                for (let j = c - 1; j <= c + 1; j++) {
                                    if (i >= 0 && i <= 7 && j >= 0 && j <= 7 && (i!==r || j!==c)) {
                                        const tgt = engine.board[i][j];
                                        if (tgt && tgt !== 'W' && tgt.toLowerCase() !== 'k') {
                                            const v = vals[tgt.toLowerCase()] || 0;
                                            if (engine.getColor(tgt) === 'white') enemyValSum += v;
                                            else friendlyValSum += v;
                                        }
                                    }
                                }
                            }
                            const score = enemyValSum - friendlyValSum;
                            if (score > threshold && score > bestScore) {
                                bestScore = score;
                                bestTarget = {r, c};
                            }
                        }
                    }
                }
                if (bestTarget) { cardToPlay = cardEl; cardId = id; targets = [bestTarget]; break; }
            } else if (id === 17) {
                if (Math.random() < (isAggressive ? genes.teleport.offensiveProb : genes.teleport.defensiveProb)) {
                    let pce = null, sq = null;
                    for (let r=0; r<8; r++) for(let c=0; c<8; c++) if (engine.board[r][c] && engine.getColor(engine.board[r][c]) === 'black') pce = {r,c};
                    for (let c=0; c<8; c++) if (!engine.board[0][c]) { sq = {r:0, c}; break; }
                    if (pce && sq) { cardToPlay = cardEl; cardId = id; targets = [pce, sq]; break; }
                }
            }
        }

        if (cardToPlay) {
            engine.activateSpell(cardId, cardToPlay, true);
            for (let tgt of targets) engine.handleSquareClick(tgt.r, tgt.c, true);
        }
    },

    async playBotTurn() {
        console.log("playBotTurn called!");
        if (engine.isGameOver || this.winner) return;
        if (engine.turn !== 'black' || this.isOnlineMultiplayer) return;
        
        console.log("playBotTurn executing...");
        const delay = 300;
        
        setTimeout(async () => {
            if (engine.turn !== 'black') return;
            
            try {
                console.log("Generating FEN...");
                const fen = engine.generateFEN();
                console.log("FEN generated:", fen);
                
                let white_spells = {};
                Array.from(document.querySelectorAll('#player1-cards .in-game-card:not(.used)')).forEach(el => {
                    const id = el.dataset.cardId;
                    white_spells[id] = (white_spells[id] || 0) + 1;
                });
                
                let black_spells = {};
                Array.from(document.querySelectorAll('#player2-cards .in-game-card:not(.used)')).forEach(el => {
                    const id = el.dataset.cardId;
                    black_spells[id] = (black_spells[id] || 0) + 1;
                });
                
                let walls = [];
                for (let r=0; r<8; r++) {
                    for (let c=0; c<8; c++) {
                        if (engine.board[r][c] === 'W') walls.push({r, c});
                    }
                }
                let traps = engine.traps || [];
                let frozen = engine.frozenPieces || [];
                let shielded = engine.shieldedPieces || [];
                
                console.log("Fetching from API...");
                const response = await fetch('http://127.0.0.1:5000/get_move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        fen: fen,
                        elo: app.botElo,
                        white_spells: white_spells,
                        black_spells: black_spells,
                        walls: walls,
                        traps: traps,
                        frozen: frozen,
                        shielded: shielded,
                        last_played_spell: engine.lastPlayedCardId,
                        ghost_active: engine.ghostActive,
                        leap_frog_active: engine.leapFrogActive,
                        cannibalism_active: engine.cannibalismActive,
                        assassin_active: engine.assassinActive,
                        promotion_active: engine.promotionActive
                    })
                });
                
                if (!response.ok) throw new Error('API Error');
                
                const data = await response.json();
                
                if (data.type === 'move') {
                    const fromC = data.from.charCodeAt(0) - 97;
                    const fromR = 8 - parseInt(data.from[1]);
                    const toC = data.to.charCodeAt(0) - 97;
                    const toR = 8 - parseInt(data.to[1]);
                    
                    const res = engine.move(fromR, fromC, toR, toC, data.promotion);
                    if (res === 'reverted') {
                        setTimeout(() => this.playBotTurn(), 500);
                    }
                } else if (data.type === 'spell') {
                    console.log("AlphaZero played spell:", data);
                    this.handleBotSpell(data.spell_id, data.target1, data.target2);
                }
            } catch (err) {
                console.error("AlphaZero API error, falling back to old Minimax bot...", err);
                this.botTryUseSpell();
                if (engine.turn !== 'black') return;
                
                let bestMove = app.getBestMoveFromAI(3);
                if (bestMove) {
                    engine.move(bestMove.from.r, bestMove.from.c, bestMove.to.r, bestMove.to.c);
                } else {
                    engine.endTurn();
                    this.renderChessboard();
                }
            }
        }, delay);
    },
    
    handleBotSpell(spellId, target1Str, target2Str) {
        // Find the card element in the DOM to mark it as used visually
        let cardEl = Array.from(document.getElementById('player2-cards').children)
            .find(el => parseInt(el.dataset.cardId) === spellId && !el.classList.contains('used'));
            
        // If the card doesn't exist in the deck, it must be because the API swapped Mirror (13) for this spellId
        if (!cardEl && engine.lastPlayedCardId === spellId) {
            cardEl = Array.from(document.getElementById('player2-cards').children)
                .find(el => parseInt(el.dataset.cardId) === 13 && !el.classList.contains('used'));
        }
        
        if (cardEl) {
            cardEl.classList.add('used');
        }

        engine.activeSpellId = spellId;
        engine.lastPlayedCardId = spellId; // Save for future mirrors
        
        // Map spell ID to initial targeting state
        const spellInitialStates = {
            1: null,
            2: 'select_double_trouble',
            3: 'select_domi_reversi',
            4: 'select_sidestep_from',
            5: 'select_ghost_piece',
            6: 'select_swap_1',
            7: 'select_sniper_bishop',
            8: 'select_empty_square',
            9: 'select_revive_square',
            10: 'select_tornado_center',
            11: 'select_shield_piece',
            12: 'select_leapfrog_piece',
            13: 'select_mirror_piece',
            14: 'select_own_piece_sac',
            15: 'select_enemy_freeze',
            16: 'select_trap_square',
            17: 'select_own_piece_tp',
            18: 'select_kamikaze_piece',
            19: 'select_assassin_piece',
            20: 'select_own_pawn_promo'
        };
        
        engine.targetingState = spellInitialStates[spellId];

        const parseSquare = (sq) => {
            if (!sq) return null;
            const c = sq.charCodeAt(0) - 97;
            const r = 7 - (sq.charCodeAt(1) - 49); // '1' is 49 in ASCII, rank 1 is row 7
            return {r, c};
        };

        let t1 = parseSquare(target1Str);
        let t2 = parseSquare(target2Str);
        
        // Cannibalism (1) is a global buff now, ignore any dummy targets the AI sends
        if (spellId === 1) { t1 = null; t2 = null; }
        
        // Simulate clicks for spells that require targeting
        if (t1) engine.handleSquareClick(t1.r, t1.c, true);
        if (t2) engine.handleSquareClick(t2.r, t2.c, true);
        
        // Targeted spells that KEEP the turn need to trigger the next bot action manually
        if (t1 || t2) {
            if (spellId === 11 || spellId === 15) {
                setTimeout(() => this.playBotTurn(), 500);
            }
        }

        // For spells that do not require any targets (e.g. Double Trouble, Ghost)
        if (!t1 && !t2) {
            let keepTurn = false;
            
            if (spellId === 1) { engine.cannibalismActive = true; keepTurn = true; }
            if (spellId === 2) {
                engine.doubleTroubleState = { active: true, player: engine.turn, movesLeft: 2 };
                keepTurn = true;
            }
            if (spellId === 5) { engine.ghostActive = true; keepTurn = true; }
            if (spellId === 9) { 
                const captured = engine.turn === 'white' ? engine.capturedByBlack : engine.capturedByWhite;
                if (captured && captured.length > 0) {
                    const emptySquares = [];
                    for (let r=0; r<8; r++) {
                        for (let c=0; c<8; c++) {
                            if (!engine.board[r][c]) emptySquares.push({r, c});
                        }
                    }
                    if (emptySquares.length > 0) {
                        const sq = emptySquares[Math.floor(Math.random() * emptySquares.length)];
                        engine.targetingState = 'select_revive_square';
                        engine.handleSquareClick(sq.r, sq.c, true);
                    } else {
                        engine.completeSpell();
                    }
                } else {
                    engine.completeSpell();
                }
                setTimeout(() => this.playBotTurn(), 500);
                keepTurn = false;
            }
            if (spellId === 12) { engine.leapFrogActive = true; keepTurn = true; }
            // Mirror is handled at the top
            if (spellId === 19) { engine.assassinActive = true; keepTurn = true; }
            if (spellId === 20) { engine.promotionActive = true; keepTurn = true; }
            
            if (keepTurn) {
                engine.completeSpell();
                setTimeout(() => this.playBotTurn(), 500);
            } else if (spellId !== 9) { // 9 is handled entirely above
                engine.endTurn();
                engine.completeSpell();
            }
        }
        
        this.renderChessboard();
    },
    
    setupPlayerBanner(containerId, profile) {
        const container = document.getElementById(containerId);
        const imgHtml = profile.avatar ? `<img src="${profile.avatar}" class="player-avatar">` : `<div class="player-avatar" style="background:#333"></div>`;
        container.innerHTML = `
            ${imgHtml}
            <div class="player-info">
                <span class="player-name">${profile.name}</span>
                <span class="player-stats">Games: ${profile.stats.played} | Wins: ${profile.stats.wins}</span>
            </div>
        `;
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
        indicator.innerHTML += `<div style="margin-left: auto; color: var(--accent-color); font-weight: bold;">Your Turn to Pick!</div>`;
        
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
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('tabletop-mode');
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
});
