const fs = require('fs');

// --- GAME CONSTANTS ---
const ROWS = 8;
const COLS = 8;
const MAX_TURNS = 100;

// Genetic Algorithm Params
const POPULATION_SIZE = 2;
const GENERATIONS = 1;
const MATCHES_PER_BOT = 2;
const DEPTH = 2; // Depth 2 is enough for training spells

const PIECE_VALUES = { 'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000, 'W': 0 };
const SUPPORTED_SPELLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

// --- PSTs ---
const pstPawn = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
];
const pstKnight = [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
];
const pstBishop = [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
];

// --- GENETIC FUNCTIONS ---
function generateRandomProfile(id) {
    return {
        id: id,
        fitness: 0, wins: 0, losses: 0, draws: 0,
        genes: {
            sniperMinVal: Math.floor(Math.random() * 1000),
            freezeMinVal: Math.floor(Math.random() * 1000),
            shieldMinVal: Math.floor(Math.random() * 1000),
            sacrificeMinVal: Math.floor(Math.random() * 1000),
            ghostProb: Math.random(),
            leapFrogProb: Math.random(),
            doubleTroubleProbEarly: Math.random(),
            doubleTroubleProbLate: Math.random(),
            tornadoProb: Math.random(),
            swapProb: Math.random(),
            reviveProb: Math.random(),
            cannibalismProb: Math.random(),
            sidestepProb: Math.random(),
            mirrorProb: Math.random(),
            trapProb: Math.random(),
            teleportProb: Math.random(),
            assassinProb: Math.random(),
            promotionProb: Math.random(),
            domiReversiMinVal: Math.floor(Math.random() * 1000),
            domiReversiProb: Math.random(),
            kamikazeProb: Math.random()
        }
    };
}

function mutate(val, isProb = false) {
    if (Math.random() < 0.2) {
        if (isProb) {
            let change = (Math.random() * 0.2 - 0.1);
            return Math.max(0, Math.min(1, val + change));
        } else {
            let change = 1 + (Math.random() * 0.4 - 0.2);
            return Math.floor(val * change);
        }
    }
    return val;
}

function crossover(p1, p2, newId) {
    const child = generateRandomProfile(newId);
    for (let k in child.genes) {
        const isProb = k.includes('Prob');
        child.genes[k] = Math.random() < 0.5 ? p1.genes[k] : p2.genes[k];
        child.genes[k] = mutate(child.genes[k], isProb);
    }
    return child;
}

// --- HEADLESS ENGINE ---
class HeadlessChesspell {
    constructor(p1Profile, p2Profile) {
        this.profiles = { 'white': p1Profile, 'black': p2Profile };
        this.board = [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
        ];

        this.decks = {
            'white': this.getRandomDeck(),
            'black': this.getRandomDeck()
        };

        this.turn = 'white';
        this.turnCount = 0;
        this.frozenPieces = []; // {r, c, duration}
        this.shieldedPieces = []; // {r, c, duration}
        this.traps = []; // {r, c, owner}

        // Active spells
        this.ghostActive = false;
        this.leapFrogActive = false;
        this.assassinActive = false;
        this.promotionActive = false;
        this.doubleTroubleState = { active: false, movesLeft: 0, player: null };
        this.capturedByWhite = [];
        this.capturedByBlack = [];
        this.lastPlayedCardId = null;
    }

    getRandomDeck() {
        let deck = [];
        for (let i = 0; i < 3; i++) {
            deck.push(SUPPORTED_SPELLS[Math.floor(Math.random() * SUPPORTED_SPELLS.length)]);
        }
        return deck;
    }

    getColor(p) {
        if (!p) return null;
        if (p === 'W') return 'none'; // Wall
        return p === p.toUpperCase() ? 'white' : 'black';
    }

    getValidMoves(r, c) {
        if (this.frozenPieces.some(fp => fp.r === r && fp.c === c)) return [];

        const p = this.board[r][c];
        if (!p || p === 'W') return [];
        const color = this.getColor(p);
        const type = p.toLowerCase();
        const moves = [];

        const addIfValid = (nr, nc, captureOnly = false, moveOnly = false) => {
            if (nr < 0 || nr > 7 || nc < 0 || nc > 7) return false;
            const target = this.board[nr][nc];

            const isRestrictedState = (this.doubleTroubleState.active) || this.ghostActive || this.leapFrogActive || this.assassinActive;

            if (this.ghostActive) {
                if (target) {
                    if (this.getColor(target) !== color && target !== 'W' && !moveOnly) {
                        if (target.toLowerCase() === 'k' && isRestrictedState) return true;
                        if (type !== 'k' && this.shieldedPieces.some(sp => sp.r === nr && sp.c === nc)) return true;
                        moves.push({ r: nr, c: nc, capture: true });
                    }
                    return true;
                } else {
                    if (!captureOnly) moves.push({ r: nr, c: nc, capture: false });
                    return true;
                }
            } else {
                if (target) {
                    if (moveOnly) return false;
                    if (this.getColor(target) !== color && target !== 'W') {
                        if (target.toLowerCase() === 'k' && isRestrictedState) return false;
                        if (type === 'k' || !this.shieldedPieces.some(sp => sp.r === nr && sp.c === nc)) {
                            moves.push({ r: nr, c: nc, capture: true });
                        }
                    }
                    return false;
                } else {
                    if (!captureOnly) moves.push({ r: nr, c: nc, capture: false });
                    return true;
                }
            }
        };

        if (this.leapFrogActive && color === this.turn) {
            const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
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
            const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            jumps.forEach(j => addIfValid(r + j[0], c + j[1]));
        } else if (type === 'b' || type === 'r' || type === 'q') {
            const dirs = [];
            if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
            if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
            dirs.forEach(d => {
                let nr = r + d[0], nc = c + d[1];
                while (addIfValid(nr, nc)) { nr += d[0]; nc += d[1]; }
            });
        } else if (type === 'k') {
            const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            dirs.forEach(d => addIfValid(r + d[0], c + d[1]));
        }
        return moves;
    }

    getAllMoves(playerColor) {
        let allMoves = [];
        const deck = this.decks[playerColor] || [];
        const hasLeapFrog = deck.includes(12);
        const hasSniper = deck.includes(7);
        const hasTeleport = deck.includes(17);

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (this.getColor(this.board[r][c]) === playerColor) {
                    let moves = this.getValidMoves(r, c);
                    
                    if (hasLeapFrog) {
                        const jumps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
                        jumps.forEach(j => {
                            let nr = r + j[0], nc = c + j[1];
                            if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
                                const tgt = this.board[nr][nc];
                                if (!tgt || (this.getColor(tgt) !== playerColor && tgt !== 'W')) {
                                    if (!moves.some(m => m.r === nr && m.c === nc)) {
                                        moves.push({ r: nr, c: nc, capture: !!tgt });
                                    }
                                }
                            }
                        });
                    }
                    if (hasTeleport) {
                        const backRank = playerColor === 'white' ? 7 : 0;
                        for(let tc=0; tc<8; tc++) {
                            if (!this.board[backRank][tc]) {
                                if (!moves.some(m => m.r === backRank && m.c === tc)) {
                                    moves.push({ r: backRank, c: tc, capture: false });
                                }
                            }
                        }
                    }
                    if (hasSniper && this.board[r][c].toLowerCase() === 'b') {
                        const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
                        dirs.forEach(d => {
                            let nr = r + d[0], nc = c + d[1];
                            while (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
                                const tgt = this.board[nr][nc];
                                if (tgt && tgt !== 'W') {
                                    if (this.getColor(tgt) !== playerColor && tgt.toLowerCase() !== 'k') {
                                        moves.push({ r: nr, c: nc, capture: true, isSniper: true });
                                    }
                                    break;
                                }
                                nr += d[0]; nc += d[1];
                            }
                        });
                    }

                    moves.forEach(m => allMoves.push({ from: { r, c }, to: m, isSniper: m.isSniper }));
                }
            }
        }
        return allMoves;
    }

    evaluateBoard(forPlayer) {
        let score = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p && p !== 'W') {
                    const color = this.getColor(p);
                    const type = p.toLowerCase();
                    let val = PIECE_VALUES[type] || 0;

                    let pstBonus = 0;
                    const pstRow = color === 'black' ? r : 7 - r;
                    if (type === 'p') pstBonus = pstPawn[pstRow][c];
                    else if (type === 'n') pstBonus = pstKnight[pstRow][c];
                    else if (type === 'b') pstBonus = pstBishop[pstRow][c];
                    else if (type !== 'k') {
                        if (c >= 3 && c <= 4 && r >= 3 && r <= 4) pstBonus = 10;
                    }
                    val += pstBonus;

                    if (color === forPlayer) {
                        score += val;
                    } else {
                        score -= val;
                    }
                }
            }
        }
        
        const oppColor = forPlayer === 'white' ? 'black' : 'white';
        const oppDeck = this.decks[oppColor] || [];
        const oppHasAssassin = oppDeck.includes(19);
        const oppHasKamikaze = oppDeck.includes(18);
        const oppHasDomi = oppDeck.includes(3);

        if (oppHasAssassin || oppHasKamikaze || oppHasDomi) {
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const p = this.board[r][c];
                    if (p && p !== 'W' && this.getColor(p) === forPlayer && p.toLowerCase() !== 'k') {
                        let val = PIECE_VALUES[p.toLowerCase()] || 0;
                        
                        if (oppHasAssassin || oppHasKamikaze) {
                            let adjEnemy = false;
                            const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
                            for (let d of dirs) {
                                let nr = r + d[0], nc = c + d[1];
                                if (nr>=0 && nr<=7 && nc>=0 && nc<=7) {
                                    const tgt = this.board[nr][nc];
                                    if (tgt && this.getColor(tgt) === oppColor && tgt.toLowerCase() !== 'k') {
                                        adjEnemy = true; break;
                                    }
                                }
                            }
                            if (adjEnemy) {
                                score -= (val * 0.8);
                            }
                        }
                        
                        if (oppHasDomi) {
                            if (val >= 500) {
                                score -= (val * 0.3);
                            }
                        }
                    }
                }
            }
        }

        return score;
    }

    makeVirtualMove(move) {
        const targetPiece = this.board[move.to.r][move.to.c];
        const movingPiece = this.board[move.from.r][move.from.c];
        let pieceToPlace = movingPiece;

        // Auto Queen promotion (or Spell promotion)
        if (this.promotionActive && targetPiece) {
            pieceToPlace = this.getColor(movingPiece) === 'white' ? targetPiece.toUpperCase() : targetPiece.toLowerCase();
        } else if (movingPiece.toLowerCase() === 'p' && (move.to.r === 0 || move.to.r === 7)) {
            pieceToPlace = this.getColor(movingPiece) === 'white' ? 'Q' : 'q';
        }

        if (move.isSniper) {
            this.board[move.to.r][move.to.c] = null;
        } else {
            this.board[move.to.r][move.to.c] = pieceToPlace;
            this.board[move.from.r][move.from.c] = null;
        }

        // Trap logic
        const trapIndex = this.traps.findIndex(t => t.r === move.to.r && t.c === move.to.c && t.owner !== this.getColor(this.board[move.to.r][move.to.c]));
        if (trapIndex !== -1) {
            if (this.board[move.to.r][move.to.c].toLowerCase() !== 'k') {
                this.board[move.to.r][move.to.c] = null;
            }
            this.traps.splice(trapIndex, 1);
        }

        return { targetPiece, origPiece: movingPiece };
    }

    undoVirtualMove(move, targetInfo) {
        if (move.isSniper) {
            this.board[move.to.r][move.to.c] = targetInfo.targetPiece;
        } else {
            this.board[move.from.r][move.from.c] = targetInfo.origPiece;
            this.board[move.to.r][move.to.c] = targetInfo.targetPiece;
        }
    }

    minimax(depth, alpha, beta, isMaximizing, rootPlayer) {
        let rootKing = false, oppKing = false;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p && p.toLowerCase() === 'k') {
                    if (this.getColor(p) === rootPlayer) rootKing = true;
                    else oppKing = true;
                }
            }
        }
        if (!rootKing) return -99999 - depth;
        if (!oppKing) return 99999 + depth;

        if (depth === 0) return this.evaluateBoard(rootPlayer);

        const currentPlayer = isMaximizing ? rootPlayer : (rootPlayer === 'white' ? 'black' : 'white');
        const moves = this.getAllMoves(currentPlayer);

        if (moves.length === 0) return isMaximizing ? -99999 : 99999;

        moves.sort((a, b) => {
            const tA = this.board[a.to.r][a.to.c];
            const tB = this.board[b.to.r][b.to.c];
            const vA = tA ? (PIECE_VALUES[tA.toLowerCase()] || 0) : 0;
            const vB = tB ? (PIECE_VALUES[tB.toLowerCase()] || 0) : 0;
            return vB - vA;
        });

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let move of moves) {
                const info = this.makeVirtualMove(move);
                let ev = this.minimax(depth - 1, alpha, beta, false, rootPlayer);
                this.undoVirtualMove(move, info);
                maxEval = Math.max(maxEval, ev);
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let move of moves) {
                const info = this.makeVirtualMove(move);
                let ev = this.minimax(depth - 1, alpha, beta, true, rootPlayer);
                this.undoVirtualMove(move, info);
                minEval = Math.min(minEval, ev);
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    tryUseSpell(playerColor) {
        const deck = this.decks[playerColor];
        if (deck.length === 0) return;

        const genes = this.profiles[playerColor].genes;
        deck.sort(() => Math.random() - 0.5);
        let usedCardIdx = -1;
        let endedTurn = false;

        for (let i = 0; i < deck.length; i++) {
            let cardId = deck[i];

            // Mirror logic
            if (cardId === 13) {
                if (this.lastPlayedCardId && Math.random() < genes.mirrorProb) {
                    cardId = this.lastPlayedCardId;
                } else {
                    continue; // Skip if no card to mirror or random says no
                }
            }

            if (cardId === 7 || cardId === 15) { // Sniper(7) or Freeze(15)
                const minVal = cardId === 7 ? genes.sniperMinVal : genes.freezeMinVal;
                let bestTarget = null;
                let maxVal = -1;
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = this.board[r][c];
                        if (p && this.getColor(p) !== playerColor && p !== 'W') {
                            const val = PIECE_VALUES[p.toLowerCase()];
                            if (val > maxVal) { maxVal = val; bestTarget = { r, c }; }
                        }
                    }
                }
                if (bestTarget && maxVal >= minVal) {
                    if (cardId === 7) {
                        // Find if we have a bishop
                        let bishop = null;
                        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (this.board[r][c] && this.board[r][c].toLowerCase() === 'b' && this.getColor(this.board[r][c]) === playerColor) bishop = { r, c };
                        if (bishop) {
                            this.board[bestTarget.r][bestTarget.c] = null;
                            endedTurn = true;
                            usedCardIdx = i; break;
                        }
                    } else {
                        this.frozenPieces.push({ r: bestTarget.r, c: bestTarget.c, duration: 2 });
                        usedCardIdx = i; break; // free action
                    }
                }
            }
            else if (cardId === 5) { // Ghost
                if (Math.random() < genes.ghostProb) {
                    this.ghostActive = true;
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 12) { // Leap Frog
                if (Math.random() < genes.leapFrogProb) {
                    this.leapFrogActive = true;
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 2) { // Double Trouble
                let emptySquares = 0;
                for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (!this.board[r][c]) emptySquares++;
                const isLateGame = emptySquares > 45;
                const prob = isLateGame ? genes.doubleTroubleProbLate : genes.doubleTroubleProbEarly;
                if (Math.random() < prob) {
                    this.doubleTroubleState = { active: true, player: playerColor, movesLeft: 2 };
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 19) { // Assassin
                if (Math.random() < genes.assassinProb) {
                    this.assassinActive = true;
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 20) { // Promotion
                if (Math.random() < genes.promotionProb) {
                    this.promotionActive = true;
                    usedCardIdx = i; break; // Applies to next capture
                }
            }
            else if (cardId === 8) { // Wall
                const empties = [];
                for (let r = 3; r <= 5; r++) for (let c = 0; c < 8; c++) if (!this.board[r][c]) empties.push({ r, c });
                if (empties.length > 0) {
                    let tgt = empties[Math.floor(Math.random() * empties.length)];
                    this.board[tgt.r][tgt.c] = 'W';
                    endedTurn = true;
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 16) { // Trap
                if (Math.random() < genes.trapProb) {
                    const empties = [];
                    for (let r = 2; r <= 6; r++) for (let c = 0; c < 8; c++) if (!this.board[r][c]) empties.push({ r, c });
                    if (empties.length > 0) {
                        let tgt = empties[Math.floor(Math.random() * empties.length)];
                        this.traps.push({ r: tgt.r, c: tgt.c, owner: playerColor });
                        endedTurn = true;
                        usedCardIdx = i; break;
                    }
                }
            }
            else if (cardId === 11) { // Shield
                let bestTarget = null, maxVal = -1;
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = this.board[r][c];
                        if (p && this.getColor(p) === playerColor) {
                            const val = PIECE_VALUES[p.toLowerCase()];
                            if (val > maxVal) { maxVal = val; bestTarget = { r, c }; }
                        }
                    }
                }
                if (bestTarget && maxVal >= genes.shieldMinVal) {
                    this.shieldedPieces.push({ r: bestTarget.r, c: bestTarget.c, duration: 2 });
                    endedTurn = true;
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 1) { // Cannibalism
                if (Math.random() < genes.cannibalismProb) {
                    let worstTarget = null, minVal = 99999;
                    for (let r = 0; r < 8; r++) {
                        for (let c = 0; c < 8; c++) {
                            const p = this.board[r][c];
                            if (p && this.getColor(p) === playerColor && p.toLowerCase() !== 'k') {
                                const val = PIECE_VALUES[p.toLowerCase()];
                                if (val < minVal) { minVal = val; worstTarget = { r, c }; }
                            }
                        }
                    }
                    if (worstTarget) {
                        this.board[worstTarget.r][worstTarget.c] = null;
                        endedTurn = true;
                        usedCardIdx = i; break;
                    }
                }
            }
            else if (cardId === 14) { // Sacrifice
                let worstTarget = null, minVal = 99999;
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = this.board[r][c];
                        if (p && this.getColor(p) === playerColor && p.toLowerCase() !== 'k' && p.toLowerCase() !== 'p') {
                            const val = PIECE_VALUES[p.toLowerCase()];
                            if (val < minVal) { minVal = val; worstTarget = { r, c }; }
                        }
                    }
                }
                let pawnTarget = null;
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 8; c++) {
                        const p = this.board[r][c];
                        if (p && this.getColor(p) === playerColor && p.toLowerCase() === 'p') {
                            pawnTarget = { r, c }; break;
                        }
                    }
                }
                if (worstTarget && pawnTarget && minVal >= genes.sacrificeMinVal) {
                    this.board[pawnTarget.r][pawnTarget.c] = this.board[worstTarget.r][worstTarget.c];
                    this.board[worstTarget.r][worstTarget.c] = null;
                    // free action
                    usedCardIdx = i; break;
                }
            }
            else if (cardId === 4) { // Sidestep
                if (Math.random() < genes.sidestepProb) {
                    // Just play it on a random piece for training
                    endedTurn = true; usedCardIdx = i; break;
                }
            }
            else if (cardId === 6) { // Swap
                if (Math.random() < genes.swapProb) {
                    endedTurn = true; usedCardIdx = i; break;
                }
            }
            else if (cardId === 9) { // Revive
                if (Math.random() < genes.reviveProb) {
                    const row = playerColor === 'white' ? 6 : 1;
                    let placed = false;
                    for (let c = 0; c < 8; c++) {
                        if (!this.board[row][c]) {
                            this.board[row][c] = playerColor === 'white' ? 'P' : 'p';
                            placed = true; break;
                        }
                    }
                    if (placed) { endedTurn = true; usedCardIdx = i; break; }
                }
            }
            else if (cardId === 10) { // Tornado
                if (Math.random() < genes.tornadoProb) {
                    endedTurn = true; usedCardIdx = i; break;
                }
            }
            else if (cardId === 3) { // Domi Reversi
                if (Math.random() < genes.domiReversiProb) {
                    let bestTarget = null, maxVal = -1;
                    for (let r = 0; r < 8; r++) {
                        for (let c = 0; c < 8; c++) {
                            const p = this.board[r][c];
                            if (p && this.getColor(p) !== playerColor && p.toLowerCase() !== 'k') {
                                const original = this.board[r][c];
                                this.board[r][c] = playerColor === 'white' ? original.toUpperCase() : original.toLowerCase();
                                
                                const oppColor = playerColor === 'white' ? 'black' : 'white';
                                const oppMoves = this.getAllMoves(oppColor);
                                const isCapturable = oppMoves.some(m => m.to.r === r && m.to.c === c);
                                
                                this.board[r][c] = original;

                                if (!isCapturable) {
                                    const val = PIECE_VALUES[p.toLowerCase()];
                                    if (val > maxVal) { maxVal = val; bestTarget = { r, c }; }
                                }
                            }
                        }
                    }
                    if (bestTarget && maxVal >= genes.domiReversiMinVal) {
                        this.board[bestTarget.r][bestTarget.c] = playerColor === 'white' ? this.board[bestTarget.r][bestTarget.c].toUpperCase() : this.board[bestTarget.r][bestTarget.c].toLowerCase();
                        endedTurn = true;
                        usedCardIdx = i; break;
                    }
                }
            }
            else if (cardId === 18) { // Kamikaze
                if (Math.random() < genes.kamikazeProb) {
                    let bestTarget = null, bestScore = -9999;
                    for (let r = 0; r < 8; r++) {
                        for (let c = 0; c < 8; c++) {
                            const p = this.board[r][c];
                            if (p && this.getColor(p) === playerColor && p.toLowerCase() !== 'k') {
                                let myVal = PIECE_VALUES[p.toLowerCase()] || 0;
                                let enemyValSum = 0;
                                let friendlyValSum = myVal;
                                for (let ii = r - 1; ii <= r + 1; ii++) {
                                    for (let jj = c - 1; jj <= c + 1; jj++) {
                                        if (ii >= 0 && ii <= 7 && jj >= 0 && jj <= 7 && (ii !== r || jj !== c)) {
                                            const tgt = this.board[ii][jj];
                                            if (tgt && tgt !== 'W' && tgt.toLowerCase() !== 'k') {
                                                const v = PIECE_VALUES[tgt.toLowerCase()] || 0;
                                                if (this.getColor(tgt) !== playerColor) enemyValSum += v;
                                                else friendlyValSum += v;
                                            }
                                        }
                                    }
                                }
                                const score = enemyValSum - friendlyValSum;
                                if (score > 300 && score > bestScore) {
                                    bestScore = score;
                                    bestTarget = { r, c };
                                }
                            }
                        }
                    }
                    if (bestTarget) {
                        for (let ii = bestTarget.r - 1; ii <= bestTarget.r + 1; ii++) {
                            for (let jj = bestTarget.c - 1; jj <= bestTarget.c + 1; jj++) {
                                if (ii >= 0 && ii <= 7 && jj >= 0 && jj <= 7) {
                                    const tgt = this.board[ii][jj];
                                    if (tgt && tgt !== 'W' && tgt.toLowerCase() !== 'k') {
                                        this.board[ii][jj] = null;
                                    }
                                }
                            }
                        }
                        endedTurn = true;
                        usedCardIdx = i; break;
                    }
                }
            }
            else if (cardId === 17) { // Teleport
                if (Math.random() < genes.teleportProb) {
                    endedTurn = true; usedCardIdx = i; break;
                }
            }
        }

        if (usedCardIdx !== -1) {
            this.lastPlayedCardId = deck[usedCardIdx] === 13 ? this.lastPlayedCardId : deck[usedCardIdx];
            deck.splice(usedCardIdx, 1);
        }
        return endedTurn;
    }

    getBestMove(playerColor) {
        const endedTurn = this.tryUseSpell(playerColor);
        if (endedTurn) return 'spell';

        let bestMove = null;
        let maxEval = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;

        const moves = this.getAllMoves(playerColor);
        if (moves.length === 0) return null;

        moves.sort(() => Math.random() - 0.5);
        moves.sort((a, b) => {
            const tA = this.board[a.to.r][a.to.c];
            const tB = this.board[b.to.r][b.to.c];
            const vA = tA ? (PIECE_VALUES[tA.toLowerCase()] || 0) : 0;
            const vB = tB ? (PIECE_VALUES[tB.toLowerCase()] || 0) : 0;
            return vB - vA;
        });

        for (let move of moves) {
            const info = this.makeVirtualMove(move);
            let ev = this.minimax(DEPTH - 1, alpha, beta, false, playerColor);
            this.undoVirtualMove(move, info);

            ev += Math.random() * 0.1;
            if (ev > maxEval) {
                maxEval = ev;
                bestMove = move;
            }
            alpha = Math.max(alpha, ev);
        }
        return bestMove;
    }

    playGame() {
        while (this.turnCount < MAX_TURNS) {
            let wk = false, bk = false;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (this.board[r][c] === 'K') wk = true;
                    if (this.board[r][c] === 'k') bk = true;
                }
            }
            if (!wk) return 'black';
            if (!bk) return 'white';

            let move = this.getBestMove(this.turn);
            if (!move) return this.turn === 'white' ? 'black' : 'white';

            if (move !== 'spell') {
                this.makeVirtualMove(move);

                if (this.assassinActive) {
                    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                    let bestTgt = null, maxV = -1;
                    dirs.forEach(d => {
                        let nr = move.to.r + d[0], nc = move.to.c + d[1];
                        if (nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
                            const tgt = this.board[nr][nc];
                            if (tgt && tgt !== 'W' && tgt.toLowerCase() !== 'k' && this.getColor(tgt) !== this.turn) {
                                const v = PIECE_VALUES[tgt.toLowerCase()] || 0;
                                if (v > maxV) { maxV = v; bestTgt = { r: nr, c: nc }; }
                            }
                        }
                    });
                    if (bestTgt) {
                        this.board[bestTgt.r][bestTgt.c] = null;
                    }
                    this.assassinActive = false;
                }
            }

            // End turn resolution
            this.ghostActive = false;
            this.leapFrogActive = false;
            this.promotionActive = false;
            this.assassinActive = false;

            if (this.doubleTroubleState.active) {
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
            this.shieldedPieces.forEach(fp => fp.duration--);
            this.shieldedPieces = this.shieldedPieces.filter(fp => fp.duration > 0);

            this.turnCount++;
        }
        return 'draw';
    }
}

// --- MAIN TRAINING LOOP ---
let population = [];
for (let i = 0; i < POPULATION_SIZE; i++) {
    population.push(generateRandomProfile(i));
}

let trainingData = { generations: [] };
console.log(`Starting Spell Training (18 Spells): ${POPULATION_SIZE} Bots, ${GENERATIONS} Generations`);

for (let gen = 1; gen <= GENERATIONS; gen++) {
    process.stdout.write(`Generation ${gen}... `);
    population.forEach(p => { p.fitness = 0; p.wins = 0; p.losses = 0; p.draws = 0; });

    for (let i = 0; i < population.length; i++) {
        for (let j = 0; j < MATCHES_PER_BOT; j++) {
            let oppIdx = Math.floor(Math.random() * population.length);
            if (oppIdx === i) oppIdx = (oppIdx + 1) % population.length;

            let game = new HeadlessChesspell(population[i], population[oppIdx]);
            let winner = game.playGame();

            if (winner === 'white') {
                population[i].fitness += 3;
                population[i].wins++;
                population[oppIdx].losses++;
            } else if (winner === 'black') {
                population[oppIdx].fitness += 3;
                population[oppIdx].wins++;
                population[i].losses++;
            } else {
                population[i].fitness += 1;
                population[oppIdx].fitness += 1;
                population[i].draws++;
                population[oppIdx].draws++;
            }
        }
    }

    population.sort((a, b) => b.fitness - a.fitness);
    let best = population[0];

    console.log(`Best: [ID ${best.id}] ${best.wins}W, Fitness ${best.fitness}`);

    trainingData.generations.push({
        generation: gen,
        bestBot: best,
        avgFitness: population.reduce((sum, p) => sum + p.fitness, 0) / population.length
    });

    fs.writeFileSync('spell_heuristics.json', JSON.stringify(trainingData, null, 2));

    if (gen === GENERATIONS) break;

    let newPopulation = [];
    let survivors = Math.floor(POPULATION_SIZE * 0.25);
    for (let i = 0; i < survivors; i++) {
        newPopulation.push(JSON.parse(JSON.stringify(population[i])));
    }

    let parents = Math.floor(POPULATION_SIZE * 0.5);
    let nextId = POPULATION_SIZE * gen;
    while (newPopulation.length < POPULATION_SIZE) {
        let p1 = population[Math.floor(Math.random() * parents)];
        let p2 = population[Math.floor(Math.random() * parents)];
        newPopulation.push(crossover(p1, p2, nextId++));
    }
    population = newPopulation;
}
console.log("Training complete! Saved to spell_heuristics.json");
