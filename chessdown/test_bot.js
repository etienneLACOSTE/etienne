const fs = require('fs');

// Copy pasting minimal logic from game.js
const ROWS = 12;
const COLS = 8;
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

board[1][4] = { type: 'k', player: 2, hasMoved: false };
board[2][4] = { type: 'p', player: 2, hasMoved: false };
board[10][4] = { type: 'k', player: 1, hasMoved: false };
board[9][5] = { type: 'r', player: 1, hasMoved: false }; // Rook attacking column 5
board[3][5] = { type: 'p', player: 2, hasMoved: false }; // P2 pawn in column 5
// Let's see if P2 moves its King to column 5 (suicide)

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
                let positionBonus = 0;
                
                let centerBonus = 0;
                let bonusCols = 10;
                let bonusRows = 20;
                
                if (c >= 2 && c <= 5) centerBonus += bonusCols;
                if (r >= 4 && r <= 7) centerBonus += bonusRows;
                
                if (piece.type !== 'p' && piece.type !== 'k') {
                    positionBonus += centerBonus;
                }

                let pawnForward = 10;
                let tdBonus = 2000;

                if (piece.player === 2) {
                    if (piece.type === 'p') positionBonus += r * pawnForward;
                    if (r === ROWS - 1) positionBonus += tdBonus;
                    score += val + positionBonus;
                } else {
                    if (piece.type === 'p') positionBonus += (ROWS - 1 - r) * pawnForward;
                    if (r === 0) positionBonus += tdBonus;
                    score -= (val + positionBonus);
                }
            }
        }
    }
    return score;
}

function makeVirtualMove(move) {
    const piece = board[move.fromR][move.fromC];
    const targetPiece = board[move.toR][move.toC];
    
    let isEnPassant = piece.type === 'p' && move.fromC !== move.toC && targetPiece === null;
    let isDoubleStep = piece.type === 'p' && Math.abs(move.fromR - move.toR) === 2;

    let enPassantCapturedPiece = null;
    if (isEnPassant) {
        enPassantCapturedPiece = board[move.fromR][move.toC];
        board[move.fromR][move.toC] = null;
    }

    board[move.toR][move.toC] = piece;
    board[move.fromR][move.fromC] = null;
    
    let oldHasMoved = piece.hasMoved;
    piece.hasMoved = true;

    let oldLastMove = lastMove;
    lastMove = { piece, fromR: move.fromR, fromC: move.fromC, toR: move.toR, toC: move.toC, isDoubleStep };

    return { targetPiece, isEnPassant, enPassantCapturedPiece, oldHasMoved, oldLastMove };
}

function undoVirtualMove(move, undoData) {
    const piece = board[move.toR][move.toC];
    board[move.fromR][move.fromC] = piece;
    board[move.toR][move.toC] = undoData.targetPiece;
    piece.hasMoved = undoData.oldHasMoved;

    if (undoData.isEnPassant) {
        board[move.fromR][move.toC] = undoData.enPassantCapturedPiece;
    }
    lastMove = undoData.oldLastMove;
}

function getValidMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    
    const moves = [];
    const dir = piece.player === 1 ? -1 : 1;

    function addIfValid(tr, tc, canCapture = true, mustCapture = false) {
        if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
        const target = board[tr][tc];
        
        if (!target) {
            if (!mustCapture) {
                moves.push({ r: tr, c: tc });
                return true;
            }
            return false;
        } else {
            if (canCapture && target.player !== piece.player) {
                moves.push({ r: tr, c: tc });
            }
            return false;
        }
    }

    function slide(dr, dc) {
        let tr = r + dr;
        let tc = c + dc;
        while (addIfValid(tr, tc)) {
            tr += dr;
            tc += dc;
        }
    }

    switch (piece.type) {
        case 'p':
            if (addIfValid(r + dir, c, false)) {
                if (!piece.hasMoved) {
                    addIfValid(r + dir * 2, c, false);
                }
            }
            addIfValid(r + dir, c - 1, true, true);
            addIfValid(r + dir, c + 1, true, true);
            break;
        case 'n':
            const knightMoves = [ [-2,-1], [-2,1], [2,-1], [2,1], [-1,-2], [-1,2], [1,-2], [1,2] ];
            knightMoves.forEach(m => addIfValid(r + m[0], c + m[1]));
            break;
        case 'b':
            slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
            break;
        case 'r':
            slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
            break;
        case 'q':
            slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
            slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
            break;
        case 'k':
            const kingMoves = [ [-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1] ];
            kingMoves.forEach(m => addIfValid(r + m[0], c + m[1]));
            break;
    }
    return moves;
}

function generateAllMoves(player) {
    let allMoves = [];
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] && board[r][c].player === player) {
                let moves = getValidMoves(r, c);
                for (let m of moves) {
                    allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, isEnPassant: m.isEnPassant });
                }
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

function getBestMoveFromAI(depth) {
    let bestMove = null;
    let maxEval = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;
    const moves = generateAllMoves(2);
    
    for (let move of moves) {
        let undoData = makeVirtualMove(move);
        let ev = minimax(depth - 1, alpha, beta, false);
        undoVirtualMove(move, undoData);
        
        console.log(`Move: ${move.fromR},${move.fromC} -> ${move.toR},${move.toC} : Eval = ${ev}`);

        if (ev > maxEval) {
            maxEval = ev;
            bestMove = move;
        }
        alpha = Math.max(alpha, ev);
    }
    return bestMove;
}

let move = getBestMoveFromAI(4);
console.log("BEST MOVE:", move);

