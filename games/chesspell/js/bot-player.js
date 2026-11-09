// @ts-check
// Campaign bot: the decisions come from bot.js (ChesspellBot, shared with the trainer);
// this file picks the level, casts the spells and plays the moves on the page.
import { botSettings, cardsData, match, session } from './state.js';
import { engine } from './game-engine.js';
import { renderChessboard } from './board-view.js';

/** How long the bot may think per decision (the search deepens while time allows). */
const BOT_THINKING_MS = 1500;

export function selectBotDeck(deckType) {
    botSettings.deckType = deckType;
    document.querySelectorAll('.btn-archetype').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`.btn-archetype[data-deck="${deckType}"]`).classList.add('selected');
}

export function generateBotDeck() {
    const deck = [];
    let pool = [...cardsData];
    // For random, just pick 3 random cards
    for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        deck.push(pool[idx].id);
        pool.splice(idx, 1);
    }
    return deck;
}

/** The trained profile (training_data.json), once; the standard one until then or without it. */
export function loadBotProfile() {
    if (botSettings.profileRequested) return;
    botSettings.profileRequested = true;
    fetch('training_data.json')
        .then((response) => response.json())
        .then((data) => {
            const generations = data && data.generations;
            if (generations && generations.length) botSettings.profile = generations[generations.length - 1].bestBot;
        })
        .catch(() => {}); // The standard profile stays
}

/**
 * Strength of the campaign bot, from the ELO slider (400 to 3000): how it picks its
 * spells (the original rules, or by searching them), how many moves ahead it
 * searches, and how often it plays a random move instead.
 */
export function botStrength() {
    const elo = botSettings.elo || 1500;
    return {
        spells: elo < 1000 ? 'heuristic' : 'search',
        depth: elo < 700 ? 1 : elo < 1400 ? 2 : elo < 2000 ? 3 : 4,
        randomMoveRate: elo < 700 ? 0.3 : elo < 1000 ? 0.15 : 0,
    };
}

/** A random legal move of the bot (black), as a plan { move, kill }, or null. */
function randomBotMove() {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = engine.board[r][c];
            if (p && p !== 'W' && engine.getColor(p) === 'black') {
                engine.getValidMoves(r, c).forEach(m => moves.push({ from: { r, c }, to: m }));
            }
        }
    }
    if (moves.length === 0) return null;
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { move: { from: m.from, to: { r: m.to.r, c: m.to.c } }, kill: null };
}

/** Cast a card of the bot (black) on the page, as a player would. */
function botCast(cardId, targets) {
    const cardEl = /** @type {HTMLElement | null} */ (document.querySelector(`#player2-cards .in-game-card:not(.used)[data-card-id="${cardId}"]`));
    engine.activateSpell(cardId, cardEl, true);
    for (const t of targets) engine.handleSquareClick(t.r, t.c, true);
}

/** The bot's turn: maybe a spell, then a move (bot.js decides, within BOT_THINKING_MS). */
export function playBotTurn() {
    if (engine.winner) return;
    if (engine.turn !== 'black' || session.isOnline) return;

    setTimeout(() => {
        if (engine.turn !== 'black' || engine.winner) return;
        const { spells, depth, randomMoveRate } = botStrength();
        const base = spells === 'heuristic' ? ChesspellBot.LEGACY_PROFILE : (botSettings.profile || ChesspellBot.DEFAULT_PROFILE);
        const profile = { ...base, spells, depth };
        const decks = { white: match.p1Deck || [], black: match.p2Deck || [] };
        const cards = ChesspellBot.hands(engine, decks).black;

        let plan = null;
        if (spells === 'heuristic') {
            const spell = ChesspellBot.heuristicSpell(engine, 'black', cards);
            if (spell) botCast(spell.cardId, spell.targets);
        } else {
            plan = ChesspellBot.chooseTurn(engine, 'black', decks, profile, Math.random, BOT_THINKING_MS);
            if (plan.spell) {
                botCast(plan.spell.cardId, plan.spell.targets);
                plan = null;
            }
        }
        if (engine.turn !== 'black' || engine.winner) return;

        if (Math.random() < randomMoveRate) plan = randomBotMove();
        else if (!plan) plan = ChesspellBot.bestMove(engine, 'black', decks, profile, Math.random, BOT_THINKING_MS);
        if (!plan || !plan.move) {
            engine.endTurn();
            renderChessboard();
            return;
        }
        const result = engine.move(plan.move.from.r, plan.move.from.c, plan.move.to.r, plan.move.to.c);
        if (result === 'assassin_kill') {
            const kill = plan.kill || engine.assassinTargets[0];
            engine.handleSquareClick(kill.r, kill.c, true);
        } else if (result === 'reverted') {
            playBotTurn(); // Capturing its Domi Reversi piece back: the bot moves again
        }
    }, 300);
}
