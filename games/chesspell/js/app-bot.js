// @ts-check
// Campaign bot: Python AI client, JS minimax fallback and spell heuristics, added to `app`.
import { ZOBRIST, cardsData } from './state.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';
import { app } from './app.js';

Object.assign(app, /** @type {ThisType<any>} */ ({
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
        this.botElo = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('bot-elo-slider')).value) || 1500;
        this.p1Profile = ProfileManager.profiles.find(p => p.id === /** @type {HTMLSelectElement} */ (document.getElementById('p1-select')).value);
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
        p1Deck = app.p1Deck || []; // white
        p2Deck = app.p2Deck || []; // black

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
        const unusedCards = Array.from(/** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#player2-cards .in-game-card:not(.used)')));
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

    /**
     * Strength of the campaign bot, from the ELO slider (400 to 3000): how many moves
     * ahead it searches, and how often it plays a random move instead.
     */
    botStrength() {
        const elo = this.botElo || 1500;
        return {
            depth: elo < 900 ? 1 : elo < 1400 ? 2 : 3,
            randomMoveRate: elo < 700 ? 0.3 : elo < 1000 ? 0.15 : 0,
        };
    },

    /** Any legal move of the bot (black), or null. */
    randomBotMove() {
        const moves = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = engine.board[r][c];
                if (p && p !== 'W' && engine.getColor(p) === 'black') {
                    engine.getValidMoves(r, c).forEach(m => moves.push({ from: { r, c }, to: m }));
                }
            }
        }
        return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
    },

    /** The bot's turn: maybe a spell, then a move found by minimax (getBestMoveFromAI). */
    playBotTurn() {
        if (engine.isGameOver || this.winner) return;
        if (engine.turn !== 'black' || this.isOnlineMultiplayer) return;

        setTimeout(() => {
            if (engine.turn !== 'black') return;
            this.botTryUseSpell();
            if (engine.turn !== 'black') return;

            const { depth, randomMoveRate } = this.botStrength();
            const bestMove = Math.random() < randomMoveRate ? this.randomBotMove() : this.getBestMoveFromAI(depth);
            if (bestMove) {
                engine.move(bestMove.from.r, bestMove.from.c, bestMove.to.r, bestMove.to.c);
            } else {
                engine.endTurn();
                this.renderChessboard();
            }
        }, 300);
    },
}));
