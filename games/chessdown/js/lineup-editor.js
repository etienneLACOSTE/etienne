// @ts-check
// The club's line-ups (club-rules.js LINEUP_SLOTS): three named teams built from the club's
// players on the three back rows, within the 39 points, the king in. Opened from the club
// page's "Line-ups" button; a line-up is then loaded in one click during a draft (draft.js).
import { Engine, PIECES } from './state.js';
import { esc, jerseyGlyph } from './club-art.js';
import { saveClub } from './club-store.js';
import { t } from '../../../assets/js/i18n.js';

const Club = globalThis.ChessdownClub;
const FILES = 'abcdefgh';

/** A line-up's name: the one the coach gave, or "Line-up n". */
export function lineupTitle(club, slot) {
    const saved = club.lineups.find((l) => l.name === `slot${slot}`);
    return saved && saved.title ? saved.title : t('lineup.default', { n: slot });
}

/**
 * The editor, drawn in `box` in place of the club's page.
 * @param {HTMLElement} box @param {any} club
 * @param {{ onBack: (club: any) => void }} handlers onBack: back to the club's page (the club as saved)
 */
export function showLineups(box, club, { onBack }) {
    let slot = 1;
    /** @type {{ id: number, r: number, c: number }[]} */
    let pieces = [];
    let title = '';
    let chosen = /** @type {number | null} */ (null); // The player picked on the bench
    let message = '';

    const load = () => {
        const saved = club.lineups.find((l) => l.name === `slot${slot}`);
        pieces = saved ? saved.pieces.filter((p) => club.players.some((m) => m.id === p.id)).map((p) => ({ ...p })) : [];
        title = saved && saved.title ? saved.title : '';
        chosen = null;
    };
    const member = (id) => club.players.find((p) => p.id === id);
    const cost = () => pieces.reduce((sum, p) => { const m = member(p.id); return sum + (m.type === 'k' ? 0 : Engine.pieceCost(m.type, m.level)); }, 0);
    const hasKing = () => pieces.some((p) => member(p.id).type === 'k');

    function render(focus = '') {
        const spent = cost();
        const bench = club.players.filter((p) => !pieces.some((x) => x.id === p.id));
        const square = (r, c) => {
            const here = pieces.find((p) => p.r === r && p.c === c);
            const m = here && member(here.id);
            const name = `${FILES[c]}${12 - r}`;
            const label = m ? t('lineup.squareWith', { square: name, name: m.name, piece: t(`piece.${m.type}`), n: m.level }) : t('lineup.squareEmpty', { square: name });
            return `<button type="button" class="lineup-square ${(r + c) % 2 ? 'dark' : 'light'}" data-r="${r}" data-c="${c}" data-focus="sq${r}-${c}" aria-label="${esc(label)}">
                ${m ? `${jerseyGlyph(PIECES[m.type].icon, club, m.type, 'icon')}<span class="lineup-stars" aria-hidden="true">${m.level}★</span>` : ''}</button>`;
        };
        box.innerHTML = `
          <div class="lineup-head">
            <h2 tabindex="-1">${esc(t('lineup.title'))}</h2>
            <button type="button" class="btn-secondary" data-action="back" data-focus="back">${esc(t('lineup.back'))}</button>
          </div>
          <div class="lineup-slots" role="group" aria-label="${esc(t('lineup.slots'))}">
            ${[1, 2, 3].map((n) => `<button type="button" class="btn-ghost" data-slot="${n}" data-focus="slot${n}" aria-pressed="${n === slot}">${n} · ${esc(lineupTitle(club, n))}</button>`).join('')}
          </div>
          <div class="lineup-name">
            <label for="lineup-title">${esc(t('lineup.name'))}</label>
            <input id="lineup-title" type="text" maxlength="${Club.NAME_MAX}" value="${esc(title)}" placeholder="${esc(t('lineup.default', { n: slot }))}" data-focus="name">
          </div>
          <p class="lineup-points ${spent > Engine.MAX_POINTS ? 'over' : ''}">${esc(t('lineup.points', { n: spent, max: Engine.MAX_POINTS }))}</p>
          <div class="lineup-board" role="group" aria-label="${esc(t('lineup.board'))}">
            ${Club.LINEUP_ROWS.map((r) => Club.LINEUP_ROWS.length && Array.from({ length: Club.LINEUP_COLS }, (_, c) => square(r, c)).join('')).join('')}
          </div>
          <div class="club-bench-players lineup-bench" role="group" aria-label="${esc(t('lineup.bench'))}">
            ${bench.length ? bench.map((p) => {
                const price = p.type === 'k' ? 0 : Engine.pieceCost(p.type, p.level);
                // Its name read first, as shown; then what it is (hidden on screen: the stars say it)
                return `<button type="button" class="club-bench-player" style="--club-colour:${club.primary}" data-id="${p.id}" data-focus="p${p.id}" aria-pressed="${chosen === p.id}">
                    ${jerseyGlyph(PIECES[p.type].icon, club, p.type, 'icon')}
                    <span class="club-bench-name">${esc(p.name)}</span><span class="visually-hidden">, ${esc(t('lineup.playerInfo', { piece: t(`piece.${p.type}`), n: p.level, cost: price }))}</span>
                    <span class="club-bench-meta" aria-hidden="true">${'★'.repeat(p.level)} · ${price}</span></button>`;
            }).join('') : `<span class="muted">${esc(t('allStar.allPlaced'))}</span>`}
          </div>
          <p class="lineup-message" role="status">${esc(message)}</p>
          <div class="club-row">
            <button type="button" class="btn-primary" data-action="save" data-focus="save">${esc(t('lineup.save'))}</button>
            <button type="button" class="btn-ghost" data-action="clear" data-focus="clear">${esc(t('lineup.clear'))}</button>
          </div>`;
        box.querySelector('[data-action="back"]')?.addEventListener('click', () => onBack(club));
        box.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => {
            slot = Number(/** @type {HTMLElement} */ (b).dataset.slot);
            load();
            message = '';
            render(`slot${slot}`);
        }));
        const input = /** @type {HTMLInputElement} */ (box.querySelector('#lineup-title'));
        input.addEventListener('input', () => { title = input.value; });
        box.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
            const id = Number(/** @type {HTMLElement} */ (b).dataset.id);
            chosen = chosen === id ? null : id;
            message = chosen ? t('lineup.pickSquare', { name: member(id).name }) : '';
            render(`p${id}`);
        }));
        box.querySelectorAll('.lineup-square').forEach((b) => b.addEventListener('click', () => {
            const r = Number(/** @type {HTMLElement} */ (b).dataset.r), c = Number(/** @type {HTMLElement} */ (b).dataset.c);
            const here = pieces.find((p) => p.r === r && p.c === c);
            if (chosen !== null) {
                pieces = pieces.filter((p) => p !== here).concat({ id: chosen, r, c }); // A player there goes back to the bench
                chosen = null;
                message = '';
            } else if (here) {
                pieces = pieces.filter((p) => p !== here);
                message = t('lineup.removed', { name: member(here.id).name });
            }
            render(`sq${r}-${c}`);
        }));
        box.querySelector('[data-action="clear"]')?.addEventListener('click', () => { pieces = []; chosen = null; message = ''; render('clear'); });
        box.querySelector('[data-action="save"]')?.addEventListener('click', () => {
            if (!hasKing()) { message = t('lineup.needKing'); return render('save'); }
            if (cost() > Engine.MAX_POINTS) { message = t('lineup.overBudget', { n: cost(), max: Engine.MAX_POINTS }); return render('save'); }
            const name = Club.cleanName(title);
            const entry = { name: `slot${slot}`, ...(name ? { title: name } : {}), pieces: pieces.map((p) => ({ ...p })) };
            club = { ...club, lineups: [...club.lineups.filter((l) => l.name !== `slot${slot}`), entry] };
            saveClub(club);
            message = t('lineup.saved', { name: lineupTitle(club, slot) });
            render('save');
        });
        if (focus) /** @type {HTMLElement | null} */ (box.querySelector(`[data-focus="${focus}"]`))?.focus();
    }

    load();
    render();
    /** @type {HTMLElement | null} */ (box.querySelector('h2'))?.focus();
}
