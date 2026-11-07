// @ts-check
// Campaign bot: difficulty profiles; the draft and the search live in bot-search.js
// (shared with the trainer, tools/chessdown/train.js).
import { Bot, COLOR_HEX, MAX_POINTS, state } from './state.js';
import { movePiece, skipTurn } from './gameplay.js';

export function loadBotProfileForDifficulty(level) {
    state.botDifficultyLevel = level;
    if (!state.botTrainingData) return;

    const generations = state.botTrainingData.generations;
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
    state.botProfile = selectedBot;
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
