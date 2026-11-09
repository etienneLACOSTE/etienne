// @ts-check
// Game engine for the page: the rules of play live in game.js (ChesspellGame, shared
// with the server); this object holds the game state and adds what the page needs:
// spell instructions, alerts, card marks, rendering, timer, bot turns and online play.
// It is itself the state that ChesspellGame and ChesspellRules work on.
import { session, socket } from './state.js';
import { app } from './app.js';
import { spellFx } from './spell-fx.js';

export const engine = {
    activeCardEl: null,

    generateFEN() {
        return ChesspellRules.toFEN(this.board, this.turn);
    },

    init() {
        ChesspellGame.newGame(this);
        this.gameOverShown = false;
        this.cancelSpell();
    },

    destroyPiece(p) {
        ChesspellGame.destroyPiece(this, p);
        this.showGameOver();
    },

    /** Once a king is captured: announce the winner and, online, leave the room. */
    showGameOver() {
        if (!this.winner || this.gameOverShown) return;
        this.gameOverShown = true;
        const winner = this.winner;
        setTimeout(() => {
            alert(`Game Over! ${winner} wins!`);
            if (session.isOnline && socket) {
                socket.emit('leaveRoom', { roomCode: session.currentRoomCode });
                session.currentRoomCode = null;
                session.isOnline = false;
                app.showScreen('main-menu');
            }
        }, 500);
    },

    getColor(p) {
        return ChesspellRules.getColor(p);
    },

    getValidMoves(r, c) {
        return ChesspellRules.getValidMoves(this, r, c);
    },

    checkPawnPromotions() {
        ChesspellRules.promotePawns(this.board);
    },

    endTurn() {
        ChesspellGame.endTurn(this);
        app.startTimer();
        if (this.turn === 'black' && app.isBotGame) {
            setTimeout(() => app.playBotTurn(), 500);
        }
    },

    move(r1, c1, r2, c2, isFromNetwork = false) {
        if (session.isOnline && !isFromNetwork) {
            socket.emit('makeMove', { roomCode: session.currentRoomCode, from: { r: r1, c: c1 }, to: { r: r2, c: c2 } });
            app.renderChessboard(); // Snap back visually and clear highlights
            return;
        }
        const result = ChesspellGame.move(this, r1, c1, r2, c2);
        this.showGameOver();
        if (result === 'reverted') {
            app.renderChessboard();
            return 'reverted';
        }
        if (result === 'assassin_kill') {
            app.renderChessboard();
            this.showInstruction(ChesspellGame.INSTRUCTIONS.select_assassin_kill);
            return 'assassin_kill';
        }
        this.endTurn();
        app.renderChessboard();
    },

    showInstruction(text) {
        const instr = document.getElementById('spell-instruction');
        instr.textContent = text;
        instr.classList.remove('hidden');
    },

    /** A message for 2 seconds, after which the spell is dropped. */
    flashInstruction(text) {
        this.showInstruction(text);
        setTimeout(() => this.cancelSpell(), 2000);
    },

    activateSpell(cardId, cardEl, isFromNetwork = false) {
        this.activeCardEl = cardEl;
        spellFx.begin(cardId);
        if (cardEl) { // The card flares up as it is cast
            cardEl.classList.add('casting');
            setTimeout(() => cardEl.classList.remove('casting'), 900);
        }
        const result = ChesspellGame.activateSpell(this, cardId);
        if (result.status === 'instant') {
            this.completeSpell();
        } else if (result.status === 'refused') {
            this.activeCardEl = null;
            this.flashInstruction(result.message);
        } else {
            this.showInstruction(result.instruction);
            app.renderChessboard(); // Re-render to disable drags
        }
    },

    cancelSpell() {
        ChesspellGame.cancelSpell(this);
        this.activeCardEl = null;
        document.getElementById('spell-instruction').classList.add('hidden');
    },

    handleSquareClick(r, c, isFromNetwork = false) {
        if (!this.targetingState) return;

        if (session.isOnline && !isFromNetwork) {
            if (session.myPlayerColor !== engine.turn) return; // Only active player can click targets
            spellFx.target(r, c);
            socket.emit('spellSquareClicked', { roomCode: session.currentRoomCode, r: r, c: c });
            return; // Wait for the server
        }

        const result = ChesspellGame.clickSquare(this, r, c);
        if (result.status === 'invalid') return alert(result.message);
        if (result.status === 'next' || result.status === 'done') spellFx.target(r, c);
        if (result.status === 'next') {
            document.getElementById('spell-instruction').textContent = result.instruction;
            app.renderChessboard();
        } else if (result.status === 'done') {
            this.showGameOver();
            if (result.endTurn) this.endTurn();
            this.completeSpell();
        }
    },

    completeSpell() {
        if (this.activeCardEl) this.activeCardEl.classList.add('used');
        ChesspellGame.completeSpell(this);
        this.cancelSpell();
        app.renderChessboard();
        spellFx.finish();
    },

    /**
     * Online: the server referees the game and sends its state after every action.
     * The page shows it as is; `action` says what happened, for the announcements.
     */
    applyServerState(state, action) {
        const wasTargeting = this.targetingState;
        Object.assign(this, state);
        this.activeCardEl = null;
        const decks = { white: 'player1-cards', black: 'player2-cards' };
        for (const [color, containerId] of Object.entries(decks)) {
            /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(`#${containerId} .in-game-card`)).forEach((el) => {
                el.classList.toggle('used', state.usedCards[color].includes(Number(el.dataset.cardId)));
            });
        }
        // Spell instructions are for the caster only.
        if (state.targetingState && state.turn === session.myPlayerColor) {
            this.showInstruction(ChesspellGame.INSTRUCTIONS[state.targetingState]);
        } else {
            document.getElementById('spell-instruction').classList.add('hidden');
        }
        if (action && action.type === 'spell' && action.status === 'refused'
            && action.by === session.myPlayerColor) {
            this.showInstruction(action.message);
            setTimeout(() => document.getElementById('spell-instruction').classList.add('hidden'), 2000);
        }
        if (action && action.turnEnded) app.startTimer();
        app.renderChessboard();
        // Spell effects: when a spell is cast, and when it resolves.
        if (action && action.type === 'spell' && action.status !== 'refused') {
            spellFx.begin(action.cardId);
            if (action.status === 'instant') spellFx.finish();
        } else if (action && action.type === 'target' && wasTargeting && !state.targetingState) {
            spellFx.finish();
        }
        this.showGameOver();
        return action;
    },
};

// A blank game until a real one starts, so the state always has every field.
ChesspellGame.newGame(engine);
