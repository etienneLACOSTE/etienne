const fs = require('fs');

const ROWS = 12;
const COLS = 8;
let board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));

// Exact definitions from game.js
const PIECES = {
    'p': { value: 1, icon: '♙' },
    'n': { value: 3, icon: '♘' },
    'b': { value: 3, icon: '♗' },
    'r': { value: 5, icon: '♖' },
    'q': { value: 9, icon: '♕' },
    'k': { value: 0, icon: '♔' }
};

let botProfile = {
    depth: 5,
    pieceWeights: { 'p': 73, 'n': 491, 'b': 360, 'r': 252, 'q': 817, 'k': 10000 },
    centerBonusCols: 12,
    centerBonusRows: 48,
    pawnForwardBonus: 0,
    touchdownBonus: 1695
};

let lastMove = null;

// Mock position: Bot King is under attack by User Queen. Bot can easily move away.
// Bot King at 2,4.
// User Queen at 8,4.
// Empty column.
board[2][4] = { type: 'k', player: 2, hasMoved: false };
board[1][4] = { type: 'n', player: 2, hasMoved: false }; // Bot has some knight
board[0][0] = { type: 'r', player: 2, hasMoved: false }; // Bot has some rook

board[10][4] = { type: 'k', player: 1, hasMoved: false };
board[8][4] = { type: 'q', player: 1, hasMoved: true }; // Attacking 2,4

// Copy paste game.js logic exactly
function checkTouchdownForPlayer(player) {
    const targetRow = player === 1 ? 0 : ROWS - 1;
    for (let c = 0; c < COLS; c++) {
        const piece = board[targetRow][c];
        if (piece && piece.player === player) return true;
    }
    return false;
}

function evaluateBoard() {
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece) {
                let val = piece.type === 'k' ? 10000 : (botProfile.pieceWeights[piece.type] || PIECES[piece.type].value * 100);
                let positionBonus = 0;
                
                let centerBonus = 0;
                let bonusCols = botProfile.centerBonusCols !== undefined ? botProfile.centerBonusCols : 10;
                let bonusRows = botProfile.centerBonusRows !== undefined ? botProfile.centerBonusRows : 20;
                
                if (c >= 2 && c <= 5) centerBonus += bonusCols;
                if (r >= 4 && r <= 7) centerBonus += bonusRows;
                
                if (piece.type !== 'p' && piece.type !== 'k') {
                    positionBonus += centerBonus;
                }

                let pawnForward = botProfile.pawnForwardBonus !== undefined ? botProfile.pawnForwardBonus : 10;
                let tdBonus = botProfile.touchdownBonus !== undefined ? botProfile.touchdownBonus : 2000;

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
            if (lastMove && lastMove.piece.type === 'p' && lastMove.isDoubleStep) {
                if (lastMove.toR === r && Math.abs(lastMove.toC - c) === 1) {
                    moves.push({ r: r + dir, c: lastMove.toC, isEnPassant: true });
                }
            }
            break;
        case 'n':
            const knightMoves = [
                [-2,-1], [-2,1], [2,-1], [2,1],
                [-1,-2], [-1,2], [1,-2], [1,2]
            ];
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
            const kingMoves = [
                [-1,-1], [-1,0], [-1,1],
                [0,-1],          [0,1],
                [1,-1],  [1,0],  [1,1]
            ];
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

    return {
        targetPiece,
        isEnPassant,
        enPassantCapturedPiece,
        oldHasMoved,
        oldLastMove
    };
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
    if (!p1King) return 99999 + depth; // P2 wins (Maximizer)
    if (!p2King) return -99999 - depth; // P1 wins (Minimizer)

    if (isMaximizing && checkTouchdownForPlayer(2)) return 99999 + depth;
    if (!isMaximizing && checkTouchdownForPlayer(1)) return -99999 - depth;

    if (depth === 0) {
        return evaluateBoard();
    }

    const moves = generateAllMoves(isMaximizing ? 2 : 1);
    
    if (moves.length === 0) {
        return isMaximizing ? -99999 : 99999;
    }

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
    
    // Sort moves to improve alpha-beta pruning (King must be highest priority)
    moves.sort((a, b) => {
        let targetA = board[a.toR][a.toC];
        let targetB = board[b.toR][b.toC];
        let valA = targetA ? (targetA.type === 'k' ? 10000 : PIECES[targetA.type].value) : 0;
        let valB = targetB ? (targetB.type === 'k' ? 10000 : PIECES[targetB.type].value) : 0;
        return valB - valA;
    });

    for (let move of moves) {
        let undoData = makeVirtualMove(move);
        let ev = minimax(depth - 1, alpha, beta, false);
        undoVirtualMove(move, undoData);
        
        console.log(`Move: ${move.fromR},${move.fromC} -> ${move.toR},${move.toC} : Eval = ${ev}`);

        // Add tiny random noise to avoid playing the exact same game every time
        ev += Math.random() * 0.1;

        if (ev > maxEval) {
            maxEval = ev;
            bestMove = move;
        }
        alpha = Math.max(alpha, ev);
    }
    return bestMove;
}

console.log("BEST MOVE:", getBestMoveFromAI(4));
