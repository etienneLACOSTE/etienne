// The server keeps the clock of online games, so a player cannot keep the turn by
// never giving it up. Clients show the countdown; the server only steps in once the
// time is over plus a grace period (network delay, animations).

const DEFAULT_TIMER = { mode: 'turn', ms: 10_000 };
const MAX_TIMER_MS = 99 * 60_000;
const GRACE_MS = 1_500;

/** Timer settings chosen by the room creator: "turn" or "overall", 1 s to 99 min. */
function sanitizeTimer(data) {
    const seconds = data && Number(data.timerSeconds);
    const mode = data && data.timerMode;
    if (!['turn', 'overall'].includes(mode) || !Number.isInteger(seconds) || seconds < 1 || seconds * 1000 > MAX_TIMER_MS) {
        return { ...DEFAULT_TIMER };
    }
    return { mode, ms: seconds * 1000 };
}

/**
 * One clock per room. `onTimeUp(side)` runs when `side` (the player to move) is out of
 * time: per turn ("turn" mode) or for the whole game ("overall" mode).
 */
class TurnClock {
    constructor(timer, onTimeUp) {
        this.timer = timer;
        this.onTimeUp = onTimeUp;
        this.remaining = new Map();
        this.side = null;
        this.startedAt = null;
        this.handle = null;
    }

    /** Start the clock of `side`; `delay` covers what clients show before the turn starts. */
    start(side, delay = 0) {
        this.stop();
        if (!this.remaining.has(side)) this.remaining.set(side, this.timer.ms);
        const budget = this.timer.mode === 'turn' ? this.timer.ms : this.remaining.get(side);
        this.side = side;
        this.startedAt = Date.now() + delay;
        this.handle = setTimeout(() => {
            this.handle = null;
            this.startedAt = null;
            this.onTimeUp(side);
        }, delay + Math.max(0, budget) + GRACE_MS);
    }

    /** Stop the running clock; in overall mode the time spent comes off the player's total. */
    stop() {
        clearTimeout(this.handle);
        this.handle = null;
        if (this.startedAt && this.timer.mode === 'overall') {
            this.remaining.set(this.side, this.remaining.get(this.side) - Math.max(0, Date.now() - this.startedAt));
        }
        this.startedAt = null;
    }

    /** A new game: full time again for everyone. */
    reset() {
        this.stop();
        this.remaining.clear();
    }

    /** For the clients: { mode, seconds }. */
    get settings() {
        return { mode: this.timer.mode, seconds: this.timer.ms / 1000 };
    }
}

module.exports = { TurnClock, sanitizeTimer, DEFAULT_TIMER, GRACE_MS };
