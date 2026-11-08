// @ts-check
// Campaign bot, added to `app`: the decisions come from bot.js (ChesspellBot, shared with
// the trainer); this file picks the level, casts the spells and plays the moves on the page.
import { cardsData } from './state.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';
import { app } from './app.js';

/** How long the bot may think per decision (the search deepens while time allows). */
const BOT_THINKING_MS = 1500;

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
        this.loadBotProfile();
        this.startGame(true);
    },

    /** The trained profile (training_data.json), once; the standard one until then or without it. */
    loadBotProfile() {
        if (this.botProfileRequested) return;
        this.botProfileRequested = true;
        fetch('training_data.json')
            .then((response) => response.json())
            .then((data) => {
                const generations = data && data.generations;
                if (generations && generations.length) this.botProfile = generations[generations.length - 1].bestBot;
            })
            .catch(() => {}); // The standard profile stays
    },

    /**
     * Strength of the campaign bot, from the ELO slider (400 to 3000): how it picks its
     * spells (the original rules, or by searching them), how many moves ahead it
     * searches, and how often it plays a random move instead.
     */
    botStrength() {
        const elo = this.botElo || 1500;
        return {
            spells: elo < 1000 ? 'heuristic' : 'search',
            depth: elo < 700 ? 1 : elo < 1400 ? 2 : elo < 2000 ? 3 : 4,
            randomMoveRate: elo < 700 ? 0.3 : elo < 1000 ? 0.15 : 0,
        };
    },

    /** A random legal move of the bot (black), as a plan { move, kill }, or null. */
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
        if (moves.length === 0) return null;
        const m = moves[Math.floor(Math.random() * moves.length)];
        return { move: { from: m.from, to: { r: m.to.r, c: m.to.c } }, kill: null };
    },

    /** Cast a card of the bot (black) on the page, as a player would. */
    botCast(cardId, targets) {
        const cardEl = /** @type {HTMLElement | null} */ (document.querySelector(`#player2-cards .in-game-card:not(.used)[data-card-id="${cardId}"]`));
        engine.activateSpell(cardId, cardEl, true);
        for (const t of targets) engine.handleSquareClick(t.r, t.c, true);
    },

    /** The bot's turn: maybe a spell, then a move (bot.js decides, within BOT_THINKING_MS). */
    playBotTurn() {
        if (engine.isGameOver || this.winner) return;
        if (engine.turn !== 'black' || this.isOnlineMultiplayer) return;

        setTimeout(() => {
            if (engine.turn !== 'black' || engine.winner) return;
            const { spells, depth, randomMoveRate } = this.botStrength();
            const base = spells === 'heuristic' ? ChesspellBot.LEGACY_PROFILE : (this.botProfile || ChesspellBot.DEFAULT_PROFILE);
            const profile = { ...base, spells, depth };
            const decks = { white: this.p1Deck || [], black: this.p2Deck || [] };
            const cards = ChesspellBot.hands(engine, decks).black;

            let plan = null;
            if (spells === 'heuristic') {
                const spell = ChesspellBot.heuristicSpell(engine, 'black', cards);
                if (spell) this.botCast(spell.cardId, spell.targets);
            } else {
                plan = ChesspellBot.chooseTurn(engine, 'black', decks, profile, Math.random, BOT_THINKING_MS);
                if (plan.spell) {
                    this.botCast(plan.spell.cardId, plan.spell.targets);
                    plan = null;
                }
            }
            if (engine.turn !== 'black' || engine.winner) return;

            if (Math.random() < randomMoveRate) plan = this.randomBotMove();
            else if (!plan) plan = ChesspellBot.bestMove(engine, 'black', decks, profile, Math.random, BOT_THINKING_MS);
            if (!plan || !plan.move) {
                engine.endTurn();
                this.renderChessboard();
                return;
            }
            const result = engine.move(plan.move.from.r, plan.move.from.c, plan.move.to.r, plan.move.to.c);
            if (result === 'assassin_kill') {
                const kill = plan.kill || engine.assassinTargets[0];
                engine.handleSquareClick(kill.r, kill.c, true);
            } else if (result === 'reverted') {
                this.playBotTurn(); // Capturing its Domi Reversi piece back: the bot moves again
            }
        }, 300);
    },
}));
