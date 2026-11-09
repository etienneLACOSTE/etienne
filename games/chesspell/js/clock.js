// @ts-check
// The clock of a local game: per turn (it restarts each turn) or for the whole game.
// Online, the server keeps the time; this clock only shows it.
import { clock, match, session } from './state.js';
import { engine } from './game-engine.js';
import { renderChessboard } from './board-view.js';

/** The clock settings chosen on the Timer screen, in seconds. */
export const clockTotal = () => clock.minutes * 60 + clock.seconds;

/** Both players start with the full time (overall mode). */
export function resetClock() {
    clock.leftP1 = clockTotal();
    clock.leftP2 = clock.leftP1;
}

export function setTimerMode(mode) {
    clock.mode = mode;
    document.querySelectorAll('.timer-toggle-btn').forEach(btn => btn.classList.remove('selected', 'btn-primary'));
    document.getElementById(mode === 'turn' ? 'btn-timer-turn' : 'btn-timer-overall').classList.add('selected');
    document.getElementById('timer-desc-turn').classList.toggle('hidden', mode !== 'turn');
    document.getElementById('timer-desc-overall').classList.toggle('hidden', mode !== 'overall');
}

export function stopTimer() {
    clearInterval(clock.interval);
    clock.interval = null;
}

/** Start counting down for the player whose turn it is. */
export function startTimer() {
    stopTimer();
    if (clock.mode === 'turn') resetClock();
    document.getElementById('side-status').classList.remove('hidden');
    clock.interval = setInterval(() => {
        if (engine.turn === 'white') {
            clock.leftP1--;
            if (clock.leftP1 <= 0) handleTimeout('white');
        } else {
            if (match.isBotGame) return; // The bot has no clock
            clock.leftP2--;
            if (clock.leftP2 <= 0) handleTimeout('black');
        }
        updateTimerVisuals();
    }, 1000);
    updateTimerVisuals();
}

/** The time bar and the mm:ss of the player whose turn it is. */
function updateTimerVisuals() {
    const time = engine.turn === 'white' ? clock.leftP1 : clock.leftP2;
    const total = clockTotal();
    const pct = total > 0 ? Math.max(0, (time / total) * 100) : 100;
    const bar = document.getElementById('timer-bar');
    bar.style.height = `${pct}%`;
    bar.classList.toggle('timer-low', pct < 20);
    const m = Math.floor(time / 60);
    const s = time % 60;
    document.getElementById('timer-text-overlay').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Out of time: the turn is lost (per-turn clock) or the game (overall clock). */
function handleTimeout(player) {
    stopTimer();
    if (session.isOnline) return; // Online, the server keeps the clock and decides
    if (clock.mode === 'overall') {
        engine.winner = player === 'white' ? 'Black' : 'White';
        engine.showGameOver('time');
    } else {
        engine.endTurn();
        renderChessboard();
    }
}
