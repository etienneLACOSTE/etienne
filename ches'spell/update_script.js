const fs = require('fs');
let code = fs.readFileSync('script.js', 'utf8');

const newBotTryUseSpell = `    botTryUseSpell() {
        const unusedCards = Array.from(document.querySelectorAll('#player2-cards .in-game-card:not(.used)'));
        if (unusedCards.length === 0) return;
        
        // Fiche Technique (Genetic Algorithm DNA - Contextual)
        const genes = {
            meta: { patience: 0.1, aggressiveness: 0.7, desperation: 0.8 },
            sniper: { earlyProb: 0.1, lateProb: 0.3, minVal: 320 },
            freeze: { prob: 0.15, minVal: 300 },
            shield: { prob: 0.2, minVal: 500 },
            sacrifice: { minVal: 300, desperationProb: 0.8 },
            ghost: { offensiveProb: 0.2, defensiveProb: 0.1 },
            leapFrog: { prob: 0.15 },
            doubleTrouble: { earlyProb: 0.1, lateProb: 0.5 },
            tornado: { disruptionProb: 0.15 },
            swap: { savePieceProb: 0.3, attackProb: 0.1 },
            revive: { prob: 0.8 },
            cannibalism: { prob: 0.1 },
            sidestep: { prob: 0.15 },
            mirror: { prob: 0.3 },
            trap: { prob: 0.2 },
            teleport: { defensiveProb: 0.1, offensiveProb: 0.2 },
            assassin: { earlyProb: 0.1, lateProb: 0.4 },
            promotion: { prob: 0.5 },
            domiReversi: { minValEarly: 900, minValLate: 500, urgencyProb: 0.5 },
            kamikaze: { minValDiff: 300, desperationMultiplier: 1.5 }
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
                if (Math.random() < genes.cannibalism.prob) {
                    let target = null, minVal = 99999;
                    for (let r=0; r<8; r++) for(let c=0; c<8; c++) {
                        const p = engine.board[r][c];
                        if (p && engine.getColor(p) === 'black' && p.toLowerCase() !== 'k') {
                            const val = vals[p.toLowerCase()]||0;
                            if (val < minVal) { minVal = val; target = {r, c}; }
                        }
                    }
                    if (target) { cardToPlay = cardEl; cardId = id; targets = [target]; break; }
                }
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
    },`;

const startIdx = code.indexOf('    botTryUseSpell() {');
const endIdx = code.indexOf('    playBotTurn() {') - 5;
const newCode = code.substring(0, startIdx) + newBotTryUseSpell + '\n\n' + code.substring(endIdx);
fs.writeFileSync('script.js', newCode);
