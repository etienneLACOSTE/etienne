// @ts-check
// Campaign bot: difficulty profiles; the draft and the search live in bot-search.js
// (shared with the trainer, tools/chessdown/train.js).
import { Bot, COLOR_HEX, MAX_POINTS, state } from './state.js';
import { movePiece, skipTurn } from './gameplay.js';

/**
 * Difficulty: the profile of an earlier or later generation of training_data.json
 * (40 %, 70 %, 90 % or 100 % of the training) and how many plies the bot searches.
 */
const DIFFICULTIES = {
    novice: { progress: 0.4, depth: 3 },
    apprentice: { progress: 0.7, depth: 3 },
    expert: { progress: 0.9, depth: 4 },
    master: { progress: 1, depth: 5 },
};

export function loadBotProfileForDifficulty(level) {
    state.botDifficultyLevel = level;
    const { progress, depth } = DIFFICULTIES[level] || DIFFICULTIES.master;
    const generations = state.botTrainingData && state.botTrainingData.generations;
    if (generations && generations.length) {
        const index = Math.max(0, Math.ceil(generations.length * progress) - 1);
        console.log(`Loading AI Profile [${level.toUpperCase()}]: Gen ${index + 1}, Depth ${depth}`);
        state.botProfile = { ...generations[index].bestBot };
    }
    state.botProfile.depth = depth;
}

export function autoDraftBot() {
    state.currentPlayer = 2;
    state.draftPoints[2] = MAX_POINTS;
    state.kingsPlaced[2] = false;

    // Pick a color different from P1
    const availableColors = Object.keys(COLOR_HEX).filter(c => c !== state.playerColors[1]);
    state.playerColors[2] = availableColors[Math.floor(Math.random() * availableColors.length)];

    // The army is drafted by the shared bot (bot-search.js), as in training.
    const { pieces, pointsLeft } = Bot.draftArmy(state.botProfile, 2, {
        difficulty: state.botDifficultyLevel,
        archetype: state.botArchetype,
    });
    for (const p of pieces) state.board[p.r][p.c] = { type: p.type, player: 2, hasMoved: false };
    state.kingsPlaced[2] = true;
    state.draftPoints[2] = pointsLeft;
}

export function playBotTurn() {
    if (state.gameState === 'over') return;
    const bestMove = Bot.bestMove(state, 2, state.botProfile.depth, state.botProfile);
    if (bestMove) {
        movePiece(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
    } else {
        skipTurn();
    }
}
