// @ts-check
// Campaign bot: difficulty profiles; the draft and the search live in bot-search.js
// (shared with the trainer, tools/chessdown/train.js).
import { Bot, COLOR_HEX, MAX_POINTS, state } from './state.js';
import { botLevel, isAllStar, nearestJersey, squadBudget } from './all-star.js';
import { careerOpponent, careerPuzzle, puzzleMovesLeft } from './career-match.js';

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

/** How long the bot may think per move (the search deepens while time allows). */
const BOT_THINKING_MS = 2000;

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
    // A tournament rival: the colour of its jersey (its end zone), unless it is the club's
    const jersey = state.career && state.career.jersey ? nearestJersey(state.career.jersey.primary) : null;
    if (jersey && jersey !== state.playerColors[1]) state.playerColors[2] = jersey;

    // The army is drafted by the shared bot (bot-search.js), as in training.
    // All Star: an army worth the player's squad, at its average level (all-star.js).
    // A career match: the rival's army (budget, level, banned types; career-match.js).
    const allStar = isAllStar();
    const career = careerOpponent();
    // A career boss: its fixed army, the king behind, the pieces in front of it, at their levels.
    if (career && career.army) {
        state.board[0][3] = { type: 'k', player: 2, hasMoved: false };
        const files = [3, 4, 2, 5, 1, 6];
        career.army.forEach(([type, level], i) => {
            state.board[1 + Math.floor(i / files.length)][files[i % files.length]] = { type, player: 2, hasMoved: false, level };
        });
        state.kingsPlaced[2] = true;
        state.draftPoints[2] = 0;
        return;
    }
    const { pieces, pointsLeft } = Bot.draftArmy(state.botProfile, 2, {
        difficulty: state.botDifficultyLevel,
        archetype: state.botArchetype,
        ...(career ? { budget: career.budget, banned: career.banned } : allStar ? { budget: squadBudget() } : {}),
    });
    // The level of each piece: the career's is an average (1.3: mostly level 1, some level 2).
    const average = career ? career.level : allStar ? botLevel() : undefined;
    const levelOf = () => {
        if (!average) return undefined;
        const below = Math.floor(average);
        return Math.min(5, Math.max(1, below + (Math.random() < average - below ? 1 : 0)));
    };
    for (const p of pieces) {
        const level = p.type === 'k' ? undefined : levelOf();
        state.board[p.r][p.c] = { type: p.type, player: 2, hasMoved: false, ...(level ? { level } : {}) };
    }
    state.kingsPlaced[2] = true;
    state.draftPoints[2] = pointsLeft;
}

/** The bot's move (gameplay.js plays it), or null when it has none. */
export function chooseBotMove() {
    // A career puzzle: the answer that holds out longest (bot-search.js puzzleDefense).
    if (careerPuzzle()) return Bot.puzzleDefense(state, puzzleMovesLeft()) || null;
    // Deepens up to the level's depth, within the thinking time.
    return Bot.bestMove(state, 2, state.botProfile.depth, state.botProfile, Math.random, BOT_THINKING_MS) || null;
}
