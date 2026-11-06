const fs = require('fs');
const ROWS = 12;
const COLS = 8;
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

board[3][4] = { type: 'k', player: 2, hasMoved: false };
board[10][4] = { type: 'k', player: 1, hasMoved: false };
board[5][5] = { type: 'r', player: 1, hasMoved: false }; // Rook attacking column 5 and row 5

let lastMove = null;
const botProfile = {
    depth: 4,
    pieceWeights: { 'p': 100, 'n': 300, 'b': 300, 'r': 500, 'q': 900, 'k': 10000 }
};
const PIECES = {
    'p': { value: 1 },
    'n': { value: 3 },
    'b': { value: 3 },
    'r': { value: 5 },
    'q': { value: 9 },
    'k': { value: 0 }
};

function evaluateBoard() {
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece) {
                let val = piece.type === 'k' ? 10000 : (botProfile.pieceWeights[piece.type] || PIECES[piece.type].value * 100);
                if (piece.player === 2) score += val;
                else score -= val;
            }
        }
    }
    return score;
}

function makeVirtualMove(move) {
    const piece = board[move.fromR][move.fromC];
    const targetPiece = board[move.toR][move.toC];
    board[move.toR][move.toC] = piece;
    board[move.fromR][move.fromC] = null;
    return { targetPiece };
}

function undoVirtualMove(move, undoData) {
    const piece = board[move.toR][move.toC];
    board[move.fromR][move.fromC] = piece;
    board[move.toR][move.toC] = undoData.targetPiece;
}

function getValidMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    
    function addIfValid(tr, tc) {
        if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
        const target = board[tr][tc];
        if (!target) { moves.push({ r: tr, c: tc }); return true; }
        else { if (target.player !== piece.player) moves.push({ r: tr, c: tc }); return false; }
    }
    
    function slide(dr, dc) {
        let tr = r + dr; let tc = c + dc;
        while (addIfValid(tr, tc)) { tr += dr; tc += dc; }
    }

    if (piece.type === 'r') { slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1); }
    if (piece.type === 'k') {
        const kingMoves = [ [-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1] ];
        kingMoves.forEach(m => addIfValid(r + m[0], c + m[1]));
    }
    return moves;
}

function generateAllMoves(player) {
    let allMoves = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].player === player) {
                let moves = getValidMoves(r, c);
                for (let m of moves) allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c });
            }
        }
    }
    return allMoves;
}

function minimax(depth, alpha, beta, isMaximizing) {
    let p1King = false, p2King = false;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].type === 'k') {
                if (board[r][c].player === 1) p1King = true;
                if (board[r][c].player === 2) p2King = true;
            }
        }
    }
    if (!p1King) return 99999 + depth;
    if (!p2King) return -99999 - depth;
    if (depth === 0) return evaluateBoard();

    const moves = generateAllMoves(isMaximizing ? 2 : 1);
    if (moves.length === 0) return isMaximizing ? -99999 : 99999;

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let move of moves) {
            let undoData = makeVirtualMove(move);
            let ev = minimax(depth - 1, alpha, beta, false);
            undoVirtualMove(move, undoData);
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let move of moves) {
            let undoData = makeVirtualMove(move);
            let ev = minimax(depth - 1, alpha, beta, true);
            undoVirtualMove(move, undoData);
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

let alpha = -Infinity;
let beta = Infinity;
const moves = generateAllMoves(2);
let maxEval = -Infinity;
let bestMove = null;

for (let move of moves) {
    let undoData = makeVirtualMove(move);
    let ev = minimax(3, alpha, beta, false);
    undoVirtualMove(move, undoData);
    console.log(`Move: ${move.fromR},${move.fromC} -> ${move.toR},${move.toC} : Eval = ${ev}`);
    if (ev > maxEval) { maxEval = ev; bestMove = move; }
    alpha = Math.max(alpha, ev);
}
console.log("BEST MOVE:", bestMove);

