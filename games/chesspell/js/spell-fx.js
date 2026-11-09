// @ts-check
// A visual effect when a spell resolves: frost for Freeze, a whirl for Tornado, a beam
// for Sniper, and so on; runes for the others. Drawn in an overlay above the board
// (#spell-fx, never clickable), then removed. Purely decorative: nothing here touches
// the game. Skipped when the visitor asks for reduced motion.
//
// The engine calls begin(cardId) when a spell is cast, target(r, c) for each square
// picked, and finish() when the spell is done. Online, the opponent only learns that a
// spell was cast, not where it was aimed: their effect covers the whole board.
import { session } from './state.js';

const DURATION_MS = 1400;

/** @type {{ cardId: number, squares: {r: number, c: number}[] } | null} */
let current = null;
/** Size of one square on screen, in px (distances of the sparks). */
let unit = 40;

/** Spell id → effect. Each receives the overlay and the target squares (screen cells). */
const EFFECTS = {
    1: (fx) => flash(fx, 'ember'), // Cannibalism
    2: (fx) => flash(fx, 'gold', 'fx-strobe'), // Double Trouble: lightning
    3: (fx, cells) => cells.forEach((cell) => orbit(fx, cell, 'lilac', 14)), // Domi Reversi
    4: (fx, cells) => cells.forEach((cell) => burst(fx, cell, 'spectral', 10, 0.7)), // Sidestep
    5: (fx) => flash(fx, 'mist', 'fx-fade'), // Ghost
    6: (fx, cells) => cells.forEach((cell) => orbit(fx, cell, 'gold', 10)), // Swap
    7: (fx, cells) => sniper(fx, cells), // Sniper
    8: (fx, cells) => cells.forEach((cell) => { rune(fx, cell, 'gold'); fall(fx, cell); }), // Wall
    9: (fx, cells) => cells.forEach((cell) => rise(fx, cell, 'spectral')), // Revive
    10: (fx, cells) => cells.forEach((cell) => orbit(fx, cell, 'mist', 24, 1.6)), // Tornado
    11: (fx, cells) => cells.forEach((cell) => ward(fx, cell)), // Shield
    12: (fx) => flash(fx, 'spectral'), // Leap Frog
    14: (fx, cells) => cells.forEach((cell) => burst(fx, cell, 'ember', 14, 1)), // Sacrifice
    15: (fx, cells) => cells.forEach((cell) => frost(fx, cell)), // Freeze
    16: (fx, cells) => cells.forEach((cell) => rune(fx, cell, 'lilac')), // Trap
    17: (fx, cells) => cells.forEach((cell) => { rune(fx, cell, 'lilac'); implode(fx, cell); }), // Teleport
    18: (fx, cells) => cells.forEach((cell) => { burst(fx, cell, 'ember', 28, 1.8); burst(fx, cell, 'gold', 14, 1.2); }), // Kamikaze
    19: (fx) => flash(fx, 'ember', 'fx-fade'), // Assassin
    20: (fx) => flash(fx, 'gold'), // Promotion
};

export const spellFx = {
    /** A spell was cast (before its targets, if any). */
    begin(cardId) {
        current = { cardId, squares: [] };
    },

    /** A square was picked for the spell being cast. */
    target(r, c) {
        if (current) current.squares.push({ r, c });
    },

    /** The spell was dropped: no effect. */
    abort() {
        current = null;
    },

    /** The spell is done: play its effect. */
    finish() {
        const cast = current;
        current = null;
        if (!cast || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const fx = overlay();
        if (!fx) return;
        const flipped = session.isOnline && session.myPlayerColor === 'black';
        unit = fx.clientWidth / 8;
        const cells = cast.squares.map(({ r, c }) => (flipped ? { r: 7 - r, c: 7 - c } : { r, c }));
        const effect = EFFECTS[cast.cardId];
        const boardWide = effect && effect.length < 2; // Effects that ignore the squares
        if (effect && (boardWide || cells.length)) {
            effect(fx, cells);
        } else if (cells.length) { // Mirror, or a spell without its own effect: runes
            cells.forEach((cell) => { rune(fx, cell, 'gold'); burst(fx, cell, 'lilac', 10, 0.8); });
        } else { // The opponent's spell online: the page does not get its squares
            flash(fx, 'lilac');
            rune(fx, { r: 3.5, c: 3.5 }, 'gold', 4);
        }
    },
};

/** The overlay, laid exactly over the board, emptied of any earlier effect. */
function overlay() {
    const board = document.getElementById('chessboard');
    if (!board || !board.offsetWidth) return null;
    let fx = document.getElementById('spell-fx');
    if (!fx) {
        fx = document.createElement('div');
        fx.id = 'spell-fx';
        fx.setAttribute('aria-hidden', 'true');
        board.parentElement.appendChild(fx);
    }
    fx.style.left = `${board.offsetLeft + board.clientLeft}px`;
    fx.style.top = `${board.offsetTop + board.clientTop}px`;
    fx.style.width = `${board.clientWidth}px`;
    fx.style.height = `${board.clientHeight}px`;
    return fx;
}

/** An element of the effect, removed when the effect is over. */
function spawn(fx, className, style = {}) {
    const el = document.createElement('div');
    el.className = className;
    for (const [key, value] of Object.entries(style)) el.style.setProperty(key, String(value));
    fx.appendChild(el);
    setTimeout(() => el.remove(), DURATION_MS);
    return el;
}

/** Centre of a cell, in % of the board. */
const at = ({ r, c }) => ({ left: `${(c + 0.5) * 12.5}%`, top: `${(r + 0.5) * 12.5}%` });

function flash(fx, color, kind = 'fx-flash') {
    spawn(fx, `${kind} fx-${color}`);
}

/** A ring of runes turning over the square (`size` in squares). */
function rune(fx, cell, color, size = 1.5) {
    spawn(fx, `fx-rune fx-${color}`, { ...at(cell), '--size': `${size * 12.5}%` });
}

/** Sparks flying out of the square. */
function burst(fx, cell, color, count, reach) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const distance = (0.5 + Math.random() * 0.5) * reach;
        spawn(fx, `fx-mote fx-${color}`, {
            ...at(cell),
            '--dx': `${Math.cos(angle) * distance * unit}px`,
            '--dy': `${Math.sin(angle) * distance * unit}px`,
            '--delay': `${Math.random() * 120}ms`,
        });
    }
}

/** Sparks drawn into the square (the arrival of a teleport). */
function implode(fx, cell) {
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        spawn(fx, 'fx-mote fx-in fx-lilac', {
            ...at(cell),
            '--dx': `${Math.cos(angle) * 1.2 * unit}px`,
            '--dy': `${Math.sin(angle) * 1.2 * unit}px`,
            '--delay': `${i * 20}ms`,
        });
    }
}

/** Sparks whirling around the square and into it (`reach` in squares). */
function orbit(fx, cell, color, count, reach = 0.9) {
    for (let i = 0; i < count; i++) {
        spawn(fx, `fx-orbit fx-${color}`, {
            ...at(cell),
            '--a0': `${(i / count) * 360}deg`,
            '--radius': `${reach * (0.6 + Math.random() * 0.4) * unit}px`,
            '--delay': `${Math.random() * 150}ms`,
        });
    }
}

/** Frost: a cold flash and ice crystals settling on the piece. */
function frost(fx, cell) {
    spawn(fx, 'fx-rune fx-mist', { ...at(cell), '--size': '18%' });
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const el = spawn(fx, 'fx-glyph fx-mist', {
            ...at(cell),
            '--dx': `${Math.cos(angle) * 0.6 * unit}px`,
            '--dy': `${Math.sin(angle) * 0.6 * unit}px`,
            '--delay': `${i * 30}ms`,
        });
        el.textContent = '❄';
    }
}

/** Revive: light rising from the square. */
function rise(fx, cell, color) {
    for (let i = 0; i < 12; i++) {
        spawn(fx, `fx-mote fx-${color}`, {
            ...at(cell),
            '--dx': `${(Math.random() - 0.5) * 0.6 * unit}px`,
            '--dy': `${-(0.8 + Math.random() * 1.2) * unit}px`,
            '--delay': `${i * 40}ms`,
        });
    }
}

/** Wall: dust falling around the new stones. */
function fall(fx, cell) {
    for (let i = 0; i < 10; i++) {
        spawn(fx, 'fx-mote fx-gold', {
            ...at(cell),
            '--dx': `${(Math.random() - 0.5) * 1.4 * unit}px`,
            '--dy': `${(0.3 + Math.random() * 0.6) * unit}px`,
            '--delay': `${Math.random() * 100}ms`,
        });
    }
}

/** Shield: a golden ward that rings out. */
function ward(fx, cell) {
    spawn(fx, 'fx-ward', at(cell));
    rune(fx, cell, 'gold', 1.2);
}

/** Sniper: a beam from the bishop (first square) to its target (last square). */
function sniper(fx, cells) {
    const from = cells[0];
    const to = cells[cells.length - 1];
    if (!from || !to || cells.length < 2) return;
    const dx = to.c - from.c;
    const dy = to.r - from.r;
    // The board is square, so a length in squares is a length in % of the board.
    spawn(fx, 'fx-beam', {
        ...at(from),
        '--length': `${Math.hypot(dx, dy) * 12.5}%`,
        '--angle': `${Math.atan2(dy, dx)}rad`,
    });
    burst(fx, to, 'ember', 16, 1.1);
}
