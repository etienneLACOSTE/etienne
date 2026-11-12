// @ts-check
// Events between modules. The engine and the views say what happened; the modules that
// react subscribe here (main.js wires the game flow, a11y.js the screen reader). So no
// lower module ever calls back into a higher one, and imports go one way only.

/** Every event, with what it carries. */
export const EVENTS = /** @type {const} */ ({
    gameStarted: 'a new game is set up (engine.init)',
    boardChanged: 'the board must be drawn again',
    turnStarted: 'a turn begins: clock, bot, announcement',
    spellCast: '{ cardId, by }: a spell is being cast',
    turnTimedOut: 'online: the server ended a turn on time',
    gameOver: "{ winner, reason }: a king fell, a player ran out of time, or a draw was agreed (winner 'draw')",
    matchStarted: 'the board of a local game is on screen',
    boardRendered: '{ hadFocus }: the board was drawn (the focus was on it before)',
    highlightsCleared: 'the move highlights were removed',
    screenShown: '{ screenId, screen }: a screen is now shown',
    profilesChanged: 'the profiles were saved',
});

/** @typedef {keyof typeof EVENTS} EventName */

/** @type {Map<EventName, Function[]>} */
const listeners = new Map();

/** @param {EventName} name @param {(detail?: any) => void} fn */
export function on(name, fn) {
    if (!(name in EVENTS)) throw new Error(`Unknown event: ${name}`);
    listeners.set(name, [...(listeners.get(name) || []), fn]);
}

/** @param {EventName} name @param {any} [detail] */
export function emit(name, detail) {
    if (!(name in EVENTS)) throw new Error(`Unknown event: ${name}`);
    for (const fn of listeners.get(name) || []) fn(detail);
}
