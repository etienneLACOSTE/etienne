// @ts-check
// What each piece can do at each level (docs/games/chessdown-levels.md): the career's
// "Pieces" tab, and the small box a click on an opponent's piece opens during a match.
// Nothing is given away: a level shows in the tab once a player of the club has reached it,
// or once the coach has met it in a match (kept in this browser); level 3, the classic piece,
// always shows. The box always tells what the piece in front of you can do.
import { Engine, state } from './state.js';
import { esc } from './club-art.js';
import { t } from '../../../assets/js/i18n.js';

const KEY = 'pawnet.chessdown.seen';
const TYPES = ['p', 'n', 'b', 'r', 'q'];
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

/** The levels met in a match, per type (this browser; a convenience, nothing lost if it is not kept). */
function seen() {
    try {
        const data = JSON.parse(localStorage.getItem(KEY) || '{}');
        const out = {};
        for (const type of TYPES) {
            out[type] = Array.isArray(data[type]) ? data[type].filter((l) => Number.isInteger(l) && l >= 1 && l <= 5) : [];
        }
        return out;
    } catch {
        return Object.fromEntries(TYPES.map((type) => [type, []]));
    }
}

/** A piece of this type and level was met: its level shows in the tab from now on. */
export function markSeen(type, level) {
    if (!TYPES.includes(type) || !Number.isInteger(level)) return;
    const all = seen();
    if (all[type].includes(level)) return;
    all[type] = [...all[type], level].sort();
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* Not kept: it shows again next time it is met */ }
}

/** The opponent's pieces of a match that starts: met. */
export function markBoardSeen(opponent) {
    for (const row of state.board) for (const p of row) if (p && p.player === opponent && p.level !== undefined) markSeen(p.type, Engine.levelOf(p));
}

/**
 * The levels of a type shown in the tab: the classic one (3), every level up to the best
 * the club's players of that type have reached, and those met in a match.
 */
export function unlockedLevels(type, club) {
    const best = club ? Math.max(0, ...club.players.filter((p) => p.type === type).map((p) => p.level)) : 0;
    const levels = new Set([3, ...seen()[type]]);
    for (let l = 1; l <= best; l++) levels.add(l);
    return levels;
}

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** The "Pieces" tab: each piece, its five levels, what each does (or "?" until discovered). */
export function renderGuide(container, club) {
    const pieces = TYPES.map((type) => {
        const levels = unlockedLevels(type, club);
        const rows = [1, 2, 3, 4, 5].map((level) => {
            const open = levels.has(level);
            return `<li class="${open ? '' : 'locked'}">
              <span class="guide-stars" aria-label="${esc(t('guide.level', { n: level }))}">${stars(level)}</span>
              <span class="guide-cost">${esc(t('guide.cost', { n: Engine.pieceCost(type, level) }))}</span>
              <span class="guide-text">${esc(open ? t(`guide.${type}.${level}`) : t('guide.locked'))}</span></li>`;
        }).join('');
        return `<section class="guide-piece" aria-labelledby="guide-${type}">
            <h3 id="guide-${type}"><span class="guide-glyph" aria-hidden="true">${GLYPHS[type]}</span>${esc(t(`piece.${type}`))}</h3>
            <ol>${rows}</ol></section>`;
    }).join('');
    container.innerHTML = `<p class="muted guide-intro">${esc(t('guide.intro'))}</p>
        <div class="guide-pieces">${pieces}
          <section class="guide-piece" aria-labelledby="guide-k">
            <h3 id="guide-k"><span class="guide-glyph" aria-hidden="true">${GLYPHS.k}</span>${esc(t('piece.k'))}</h3>
            <p>${esc(t('guide.k'))}</p></section>
        </div>`;
}

// ---------- The box of a piece, during a match ----------
let box = /** @type {HTMLElement | null} */ (null);
let opener = /** @type {HTMLElement | null} */ (null);

/** Close the box (and give the focus back to the square that opened it). */
export function closePieceInfo({ focus = true } = {}) {
    if (!box) return;
    box.remove();
    box = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escape, true);
    if (focus) opener?.focus();
    opener = null;
}
const outside = (e) => { if (box && !box.contains(/** @type {Node} */ (e.target))) closePieceInfo({ focus: false }); };
const escape = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePieceInfo(); } };

/**
 * Open the box of `piece` beside its square: its name, its level and what it can do at it
 * (the levels below it from level 3 on, since abilities add up). The level counts as met.
 * @param {{ type: string, level?: number, player: number }} piece @param {HTMLElement} square
 */
export function showPieceInfo(piece, square) {
    closePieceInfo({ focus: false });
    const level = Engine.levelOf(piece);
    if (piece.type !== 'k') markSeen(piece.type, level);
    // From level 4 on, the piece also does what level 3 does (the abilities add up)
    const lines = piece.type === 'k' ? [t('guide.k')]
        : level <= 3 ? [t(`guide.${piece.type}.${level}`)]
        : Array.from({ length: level - 2 }, (_, i) => t(`guide.${piece.type}.${i + 3}`));
    opener = square;
    box = document.createElement('div');
    box.className = 'piece-info';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-labelledby', 'piece-info-title');
    box.innerHTML = `<h3 id="piece-info-title"><span aria-hidden="true">${GLYPHS[piece.type]}</span> ${esc(t('guide.info', { piece: t(`piece.${piece.type}`), n: level }))}</h3>
        <ul>${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
        <button type="button" class="btn-ghost">${esc(t('guide.close'))}</button>`;
    document.body.appendChild(box);
    // Beside the square, inside the screen
    const at = square.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    const left = Math.min(innerWidth - w - 8, Math.max(8, at.left + at.width / 2 - w / 2));
    const top = at.bottom + h + 8 < innerHeight ? at.bottom + 6 : Math.max(8, at.top - h - 6);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    const close = /** @type {HTMLButtonElement} */ (box.querySelector('button'));
    close.addEventListener('click', () => closePieceInfo());
    // After the press that opened it (a mouse press would give the focus back to the square)
    setTimeout(() => { if (box && box.contains(close)) close.focus(); }, 0);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
}
