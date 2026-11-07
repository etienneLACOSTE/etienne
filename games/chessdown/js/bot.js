// Campaign bot: difficulty profiles, automatic draft and minimax search.

function loadBotProfileForDifficulty(level) {
    botDifficultyLevel = level;
    if (!botTrainingData) return;

    const generations = botTrainingData.generations;
    let targetGenIndex = generations.length - 1; // Default to last
    let depth = 5;

    if (level === 'novice') {
        targetGenIndex = Math.min(39, generations.length - 1); // Gen 40
        depth = 3;
    } else if (level === 'apprentice') {
        targetGenIndex = Math.min(69, generations.length - 1); // Gen 70
        depth = 3;
    } else if (level === 'expert') {
        targetGenIndex = Math.min(89, generations.length - 1); // Gen 90
        depth = 4;
    } else if (level === 'master') {
        targetGenIndex = generations.length - 1; // Last Gen (Gen 100)
        depth = 5;
    }

    const selectedBot = generations[targetGenIndex].bestBot;
    console.log(`Loading AI Profile [${level.toUpperCase()}]: Gen ${targetGenIndex + 1}, Depth ${depth}`);
    botProfile = selectedBot;
    botProfile.depth = depth;
}

function autoDraftBot() {
    currentPlayer = 2;
    draftPoints[2] = MAX_POINTS;
    kingsPlaced[2] = false;

    // Pick a color different from P1
    const availableColors = Object.keys(COLOR_HEX).filter(c => c !== playerColors[1]);
    playerColors[2] = availableColors[Math.floor(Math.random() * availableColors.length)];

    // King Placement Logic
    let kR = 0;
    let kC = 2 + Math.floor(Math.random() * 4); // Safe central columns
    
    if (botDifficultyLevel === 'novice') {
        // Novice puts King anywhere in the top 3 rows
        kR = Math.floor(Math.random() * 3);
        kC = Math.floor(Math.random() * COLS);
    } else if (botDifficultyLevel === 'apprentice') {
        // Apprentice puts King in top 2 rows, mostly safe but sometimes exposed
        kR = Math.floor(Math.random() * 2);
    }
    
    board[kR][kC] = { type: 'k', player: 2, hasMoved: false };
    kingsPlaced[2] = true;

    const piecesPool = ['p', 'n', 'b', 'r', 'q'];
    
    let pieceCounts = { 'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0 };
    let army = [];

    // 0. Archétypes : Forcer l'achat de pièces spécifiques (50% du budget ~ 19 points)
    if (botArchetype !== 'normal') {
        let archPiece = '';
        let targetCount = 0;
        if (botArchetype === 'ecuries') { archPiece = 'n'; targetCount = 6; } // 18 pts
        else if (botArchetype === 'citadelle') { archPiece = 'r'; targetCount = 3; } // 15 pts
        else if (botArchetype === 'chapiteau') { archPiece = 'b'; targetCount = 6; } // 18 pts
        else if (botArchetype === 'chair') { archPiece = 'p'; targetCount = 19; } // 19 pts
        else if (botArchetype === 'sorcieres') { archPiece = 'q'; targetCount = 2; } // 18 pts

        for (let i = 0; i < targetCount; i++) {
            if (draftPoints[2] >= PIECES[archPiece].value) {
                pieceCounts[archPiece]++;
                army.push(archPiece);
                draftPoints[2] -= PIECES[archPiece].value;
            }
        }
    }

    // 1. Déterminer le reste de l'armée en fonction du budget et de l'ADN
    while (draftPoints[2] > 0) {
        let affordable = piecesPool.filter(p => PIECES[p].value <= draftPoints[2]);
        if (affordable.length === 0) break;

        let selectedPiece;

        if (botDifficultyLevel === 'novice') {
            // Pure random
            selectedPiece = affordable[Math.floor(Math.random() * affordable.length)];
        } else {
            // Draft intelligent avec rendements décroissants
            affordable.sort((a, b) => {
                let roiA = (botProfile.pieceWeights[a] / PIECES[a].value) / (pieceCounts[a] + 1);
                let roiB = (botProfile.pieceWeights[b] / PIECES[b].value) / (pieceCounts[b] + 1);
                return roiB - roiA;
            });

            selectedPiece = affordable[0];
            let subOptimalChance = 0.05; // Master
            if (botDifficultyLevel === 'expert') subOptimalChance = 0.15;
            if (botDifficultyLevel === 'apprentice') subOptimalChance = 0.50;

            if (affordable.length > 1 && Math.random() < subOptimalChance) {
                selectedPiece = affordable[1];
            }
        }
        
        pieceCounts[selectedPiece]++;
        army.push(selectedPiece);
        draftPoints[2] -= PIECES[selectedPiece].value;
    }

    // 2. Assigner des cases structurées (Phalange)
    let availableSlots = [];
    for(let r = 2; r >= 0; r--) {
        for(let c = 0; c < 8; c++) {
            if (board[r][c] === null) availableSlots.push({r, c});
        }
    }
    
    // Fonction d'aide pour placer une pièce au meilleur endroit disponible
    function placePiece(pieceType, preferredRows, preferEdges) {
        let bestSlotIdx = -1;
        let bestScore = -9999;
        
        for (let i = 0; i < availableSlots.length; i++) {
            let slot = availableSlots[i];
            let score = 0;
            
            // Priorité de rangée
            if (preferredRows.includes(slot.r)) {
                score += 100; // Forte préférence pour les bonnes lignes
                score -= preferredRows.indexOf(slot.r) * 10; // Préférer la première de la liste
            } else {
                score -= Math.abs(slot.r - preferredRows[0]) * 50;
            }
            
            // Priorité horizontale
            let distToCenter = Math.abs(slot.c - 3.5);
            if (preferEdges) {
                score += distToCenter * 10;
            } else {
                score -= distToCenter * 10;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestSlotIdx = i;
            }
        }
        
        if (bestSlotIdx !== -1) {
            let slot = availableSlots.splice(bestSlotIdx, 1)[0];
            board[slot.r][slot.c] = { type: pieceType, player: 2, hasMoved: false };
        }
    }

    // 3. Placement stratégique selon le type de pièce
    // Tours : sur la ligne de fond (0), sur les bords
    let rooks = army.filter(p => p === 'r');
    rooks.forEach(p => placePiece('r', [0, 1], true));
    
    // Reines : sur la ligne de fond (0), au centre
    let queens = army.filter(p => p === 'q');
    queens.forEach(p => placePiece('q', [0, 1], false));
    
    // Fous : sur les lignes arrière (0, 1), vers le centre
    let bishops = army.filter(p => p === 'b');
    bishops.forEach(p => placePiece('b', [0, 1], false));
    
    // Cavaliers : sur la ligne du milieu (1), répartis
    let knights = army.filter(p => p === 'n');
    knights.forEach(p => placePiece('n', [1, 2], false));
    
    // Pions : en première ligne (2), formant un mur
    let pawns = army.filter(p => p === 'p');
    pawns.forEach(p => placePiece('p', [2, 1, 0], false));
}

function playBotTurn() {
    if (gameState === 'over') return;
    let bestMove = getBestMoveFromAI(botProfile.depth);
    if (bestMove) {
        movePiece(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
    } else {
        skipTurn();
    }
}

function evaluateBoard() {
    let score = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const piece = board[r][c];
            if (piece) {
                let val = piece.type === 'k' ? 10000 : (botProfile.pieceWeights[piece.type] || PIECES[piece.type].value * 100);
                let positionBonus = 0;

                // Contrôle du centre (dynamique basé sur l'entraînement)
                let centerBonus = 0;
                let bonusCols = botProfile.centerBonusCols !== undefined ? botProfile.centerBonusCols : 10;
                let bonusRows = botProfile.centerBonusRows !== undefined ? botProfile.centerBonusRows : 20;
                
                if (c >= 2 && c <= 5) centerBonus += bonusCols;
                if (r >= 4 && r <= 7) centerBonus += bonusRows;
                
                if (piece.type !== 'p' && piece.type !== 'k') {
                    positionBonus += centerBonus;
                }

                // Incitation au Touchdown (dynamique basé sur l'entraînement)
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

function minimax(depth, alpha, beta, isMaximizing) {
    // Check if game over (King captured) BEFORE checking depth === 0
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

    // Touchdown is an instant win if the piece survived until the start of the player's turn.
    // isMaximizing == true means it is P2's turn to play.
    if (isMaximizing && checkTouchdownForPlayer(2)) return 99999 + depth;
    if (!isMaximizing && checkTouchdownForPlayer(1)) return -99999 - depth;

    if (depth === 0) {
        return evaluateBoard();
    }

    const moves = generateAllMoves(isMaximizing ? 2 : 1);
    
    if (moves.length === 0) return isMaximizing ? -99999 : 99999;

    // Trier les coups pour optimiser l'élagage (absolument crucial pour que le Roi soit vu avant d'élaguer)
    moves.sort((a, b) => {
        let targetA = board[a.toR][a.toC];
        let targetB = board[b.toR][b.toC];
        let valA = targetA ? (targetA.type === 'k' ? 10000 : PIECES[targetA.type].value) : 0;
        let valB = targetB ? (targetB.type === 'k' ? 10000 : PIECES[targetB.type].value) : 0;
        return valB - valA;
    });

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
