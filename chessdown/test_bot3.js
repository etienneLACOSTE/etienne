const fs = require('fs');
const ROWS = 12;
const COLS = 8;
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

board[3][4] = { type: 'k', player: 2, hasMoved: false };
board[10][4] = { type: 'k', player: 1, hasMoved: false };
board[5][5] = { type: 'r', player: 1, hasMoved: false };

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
    if (depth === 0) return -500; // Mock evaluate

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

// Just test the move 3,4 -> 2,5
let move = { fromR: 3, fromC: 4, toR: 2, toC: 5 };
let undoData = makeVirtualMove(move);
let ev = minimax(3, -Infinity, Infinity, false);
undoVirtualMove(move, undoData);
console.log(`Eval of moving to 2,5: ${ev}`);

