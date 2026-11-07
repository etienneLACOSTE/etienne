const fs = require('fs');
const path = require('path');

// Output read by the game client at startup.
const OUTPUT_PATH = path.join(__dirname, '..', '..', 'games', 'chessdown', 'training_data.json');

// Same rules as the game: the headless engine below delegates to it.
const engine = require('../../games/chessdown/engine.js');
const { ROWS, COLS, MAX_POINTS } = engine;

const PIECES = {
    'p': { value: 100 },
    'n': { value: 300 },
    'b': { value: 300 },
    'r': { value: 500 },
    'q': { value: 900 },
    'k': { value: 10000 }
};

// --- GENETIC ALGORITHM PARAMS ---
const POPULATION_SIZE = 50;
const GENERATIONS = 100;
const MATCHES_PER_BOT = 4;
const DEPTH = 10; // Keep it low so it runs in reasonable time
const MAX_TURNS = 60; // Max moves per game to avoid infinite loops

function generateRandomProfile(id) {
    return {
        id: id,
        fitness: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        depth: DEPTH,
        pieceWeights: {
            'p': 50 + Math.floor(Math.random() * 100),
            'n': 200 + Math.floor(Math.random() * 200),
            'b': 200 + Math.floor(Math.random() * 200),
            'r': 300 + Math.floor(Math.random() * 400),
            'q': 600 + Math.floor(Math.random() * 600),
            'k': 10000 // Fixed
        },
        centerBonusCols: 5 + Math.floor(Math.random() * 15),
        centerBonusRows: 10 + Math.floor(Math.random() * 30),
        pawnForwardBonus: 5 + Math.floor(Math.random() * 15),
        touchdownBonus: 1000 + Math.floor(Math.random() * 2000)
    };
}

function mutate(val, min, max) {
    if (Math.random() < 0.2) { // 20% mutation chance
        let change = 1 + (Math.random() * 0.4 - 0.2); // +/- 20%
        let newVal = Math.floor(val * change);
        return Math.max(min, Math.min(max, newVal));
    }
    return val;
}

function crossover(p1, p2, newId) {
    const child = generateRandomProfile(newId);

    // Mix piece weights
    for (let k of ['p', 'n', 'b', 'r', 'q']) {
        child.pieceWeights[k] = Math.random() < 0.5 ? p1.pieceWeights[k] : p2.pieceWeights[k];
        child.pieceWeights[k] = mutate(child.pieceWeights[k], 10, 2000);
    }

    child.centerBonusCols = mutate(Math.random() < 0.5 ? p1.centerBonusCols : p2.centerBonusCols, 0, 50);
    child.centerBonusRows = mutate(Math.random() < 0.5 ? p1.centerBonusRows : p2.centerBonusRows, 0, 100);
    child.pawnForwardBonus = mutate(Math.random() < 0.5 ? p1.pawnForwardBonus : p2.pawnForwardBonus, 0, 50);
    child.touchdownBonus = mutate(Math.random() < 0.5 ? p1.touchdownBonus : p2.touchdownBonus, 0, 5000);

    return child;
}

// --- HEADLESS GAME ENGINE ---

class GameEngine {
    constructor(profile1, profile2) {
        this.p1Profile = profile1;
        this.p2Profile = profile2;
        this.board = engine.createBoard();
        this.currentPlayer = 1;
        this.lastMove = null;
        this.turnCount = 0;

        this.autoDraft(1);
        this.autoDraft(2);
    }

    autoDraft(player) {
        let points = MAX_POINTS;
        const startRow = player === 1 ? ROWS - 3 : 0;
        const endRow = player === 1 ? ROWS - 1 : 2;

        let kR = startRow + Math.floor(Math.random() * 3);
        let kC = Math.floor(Math.random() * COLS);
        this.board[kR][kC] = { type: 'k', player: player, hasMoved: false };

        const piecesPool = ['p', 'n', 'b', 'r', 'q'];
        let slots = [];
        for (let r = startRow; r <= endRow; r++) {
            for (let c = 0; c < COLS; c++) {
                if (this.board[r][c] === null) slots.push({ r, c });
            }
        }
        slots.sort(() => Math.random() - 0.5);

        for (let slot of slots) {
            if (points <= 0) break;
            let affordable = piecesPool.filter(p => PIECES[p].value <= points);
            if (affordable.length === 0) break;

            // Random choice for draft, since we only train game logic
            let selectedPiece = affordable[Math.floor(Math.random() * affordable.length)];
            this.board[slot.r][slot.c] = { type: selectedPiece, player: player, hasMoved: false };
            points -= PIECES[selectedPiece].value;
        }
    }

    getValidMoves(r, c) {
        return engine.getValidMoves(this, r, c);
    }

    makeVirtualMove(move) {
        return engine.applyMove(this, move);
    }

    undoVirtualMove(move, undoData) {
        engine.undoMove(this, move, undoData);
    }

    generateAllMoves(player) {
        return engine.generateAllMoves(this, player);
    }

    evaluateBoard(rootPlayer) {
        const profile = rootPlayer === 1 ? this.p1Profile : this.p2Profile;
        let score = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const piece = this.board[r][c];
                if (piece) {
                    let val = profile.pieceWeights[piece.type] || PIECES[piece.type].value * 100;
                    let positionBonus = 0;

                    let centerBonus = 0;
                    if (c >= 2 && c <= 5) centerBonus += profile.centerBonusCols;
                    if (r >= 4 && r <= 7) centerBonus += profile.centerBonusRows;

                    if (piece.type !== 'p' && piece.type !== 'k') {
                        positionBonus += centerBonus;
                    }

                    if (piece.player === rootPlayer) {
                        if (piece.type === 'p') {
                            let adv = piece.player === 1 ? (ROWS - 1 - r) : r;
                            positionBonus += adv * profile.pawnForwardBonus;
                        }
                        if ((piece.player === 1 && r === 0) || (piece.player === 2 && r === ROWS - 1)) {
                            positionBonus += profile.touchdownBonus;
                        }
                        score += val + positionBonus;
                    } else {
                        if (piece.type === 'p') {
                            let adv = piece.player === 1 ? (ROWS - 1 - r) : r;
                            positionBonus += adv * profile.pawnForwardBonus;
                        }
                        if ((piece.player === 1 && r === 0) || (piece.player === 2 && r === ROWS - 1)) {
                            positionBonus += profile.touchdownBonus;
                        }
                        score -= (val + positionBonus);
                    }
                }
            }
        }
        return score;
    }

    minimax(depth, alpha, beta, isMaximizing, rootPlayer) {
        let p1King = false, p2King = false;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (this.board[r][c] && this.board[r][c].type === 'k') {
                    if (this.board[r][c].player === 1) p1King = true;
                    if (this.board[r][c].player === 2) p2King = true;
                }
            }
        }

        if (rootPlayer === 1) {
            if (!p1King) return -99999 - depth;
            if (!p2King) return 99999 + depth;
        } else {
            if (!p2King) return -99999 - depth;
            if (!p1King) return 99999 + depth;
        }

        if (depth === 0) return this.evaluateBoard(rootPlayer);

        let currentPlayerTurn = isMaximizing ? rootPlayer : (rootPlayer === 1 ? 2 : 1);
        const moves = this.generateAllMoves(currentPlayerTurn);

        if (moves.length === 0) return isMaximizing ? -99999 : 99999;

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (let move of moves) {
                let undoData = this.makeVirtualMove(move);
                let ev = this.minimax(depth - 1, alpha, beta, false, rootPlayer);
                this.undoVirtualMove(move, undoData);
                maxEval = Math.max(maxEval, ev);
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let move of moves) {
                let undoData = this.makeVirtualMove(move);
                let ev = this.minimax(depth - 1, alpha, beta, true, rootPlayer);
                this.undoVirtualMove(move, undoData);
                minEval = Math.min(minEval, ev);
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    getBestMove(player) {
        let bestMove = null;
        let maxEval = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;

        const moves = this.generateAllMoves(player);

        moves.sort(() => Math.random() - 0.5); // Randomize to avoid repeating games exactly

        for (let move of moves) {
            let undoData = this.makeVirtualMove(move);
            let ev = this.minimax(player === 1 ? this.p1Profile.depth : this.p2Profile.depth - 1, alpha, beta, false, player);
            this.undoVirtualMove(move, undoData);

            if (ev > maxEval) {
                maxEval = ev;
                bestMove = move;
            }
            alpha = Math.max(alpha, ev);
        }
        return bestMove;
    }

    checkTouchdown(player) {
        return engine.hasPieceInEndzone(this.board, player);
    }

    playGame() {
        while (this.turnCount < MAX_TURNS) {
            // Did currentPlayer win by Touchdown last turn?
            if (this.checkTouchdown(this.currentPlayer)) return this.currentPlayer;

            // Check Kings
            let p1k = false, p2k = false;
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (this.board[r][c] && this.board[r][c].type === 'k') {
                        if (this.board[r][c].player === 1) p1k = true;
                        if (this.board[r][c].player === 2) p2k = true;
                    }
                }
            }
            if (!p1k) return 2;
            if (!p2k) return 1;

            let move = this.getBestMove(this.currentPlayer);
            if (!move) return (this.currentPlayer === 1 ? 2 : 1); // No moves = loss

            this.makeVirtualMove(move);

            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
            this.turnCount++;
        }
        return 0; // Draw
    }
}

// --- TRAINING LOOP ---

let population = [];
for (let i = 0; i < POPULATION_SIZE; i++) {
    population.push(generateRandomProfile(i));
}

let trainingData = {
    generations: []
};

console.log(`Starting Training: ${POPULATION_SIZE} Bots, ${GENERATIONS} Generations`);

for (let gen = 1; gen <= GENERATIONS; gen++) {
    console.log(`\n--- Generation ${gen} ---`);

    // Reset fitness
    population.forEach(p => { p.fitness = 0; p.wins = 0; p.losses = 0; p.draws = 0; });

    // Tournament
    for (let i = 0; i < population.length; i++) {
        for (let j = 0; j < MATCHES_PER_BOT; j++) {
            let opponentIdx = Math.floor(Math.random() * population.length);
            if (opponentIdx === i) opponentIdx = (opponentIdx + 1) % population.length;

            let game = new GameEngine(population[i], population[opponentIdx]);
            let winner = game.playGame();

            if (winner === 1) {
                population[i].fitness += 3;
                population[i].wins++;
                population[opponentIdx].losses++;
            } else if (winner === 2) {
                population[opponentIdx].fitness += 3;
                population[opponentIdx].wins++;
                population[i].losses++;
            } else {
                population[i].fitness += 1;
                population[opponentIdx].fitness += 1;
                population[i].draws++;
                population[opponentIdx].draws++;
            }
        }
    }

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);

    let best = population[0];
    let worst = population[population.length - 1];

    console.log(`Best Bot [${best.id}]: ${best.wins}W ${best.draws}D ${best.losses}L (Fitness: ${best.fitness})`);
    console.log(`Worst Bot [${worst.id}]: ${worst.wins}W ${worst.draws}D ${worst.losses}L`);

    // Checkup Data
    trainingData.generations.push({
        generation: gen,
        bestBot: best,
        worstBot: worst,
        avgFitness: population.reduce((sum, p) => sum + p.fitness, 0) / population.length
    });

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(trainingData, null, 2));

    if (gen === GENERATIONS) break; // Don't breed on last generation

    // Selection & Reproduction
    let newPopulation = [];

    // Keep top 25% (Elitism)
    let survivorsCount = Math.floor(POPULATION_SIZE * 0.25);
    for (let i = 0; i < survivorsCount; i++) {
        let survivor = JSON.parse(JSON.stringify(population[i])); // Deep copy
        newPopulation.push(survivor);
    }

    // Breed the rest from top 50%
    let parentsCount = Math.floor(POPULATION_SIZE * 0.5);
    let nextId = POPULATION_SIZE * gen;
    while (newPopulation.length < POPULATION_SIZE) {
        let p1 = population[Math.floor(Math.random() * parentsCount)];
        let p2 = population[Math.floor(Math.random() * parentsCount)];
        newPopulation.push(crossover(p1, p2, nextId++));
    }

    population = newPopulation;
}

console.log(`\nTraining Complete! Data saved to training_data.json`);
console.log(`To run again or longer, you can execute 'node train.js' manually.`);
