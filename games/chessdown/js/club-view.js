// @ts-check
// All Star: the club's page. Its card (crest, jersey, name), the register of its players
// (level in stars, experience, stats), renaming a player, signing the recruits won in the
// campaign, and starting over with a new club.
import { crestSVG, esc, jerseySVG } from './club-art.js';
import { deleteClub, saveClub } from './club-store.js';
import { deleteCareer, loadCareer } from './career-store.js';
import { ask } from '../../../assets/js/dialog.js';
import { t } from '../../../assets/js/i18n.js';

const Club = globalThis.ChessdownClub;
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

/** Five stars, the level's lit; said as "Level n". */
export function stars(level) {
    return `<span class="club-stars" role="img" aria-label="${esc(t('club.level', { n: level }))}">${'★'.repeat(level)}<span class="off">${'★'.repeat(5 - level)}</span></span>`;
}

/**
 * The register: one row per player. With `rename`, each name is a button to rename them.
 * @param {any} club @param {{ rename?: boolean }} [options]
 */
export function rosterTable(club, { rename = true } = {}) {
    const row = (p) => {
        const next = Club.xpToNext(p);
        const xp = p.type === 'k' ? '–' : next === null ? `${p.xp} · ${esc(t('club.max'))}` : `${p.xp} / ${p.xp + next}`;
        const name = rename
            ? `<button type="button" class="club-rename" data-player="${p.id}" aria-label="${esc(t('club.renameLabel', { name: p.name }))}">${esc(p.name)} <span aria-hidden="true">✎</span></button>`
            : `<b>${esc(p.name)}</b>`;
        return `<tr>
            <td class="club-glyph" aria-hidden="true" style="color:${club.primary}">${GLYPHS[p.type]}</td>
            <th scope="row">${name}<br><small>${esc(t(`piece.${p.type}`))}${p.type === 'k' ? ` · ${esc(t('club.kingNote'))}` : ''}</small></th>
            <td>${stars(p.level)}</td>
            <td class="num">${xp}</td>
            <td class="num">${p.stats.games}</td>
            <td class="num">${p.stats.captures}</td>
            <td class="num">${p.stats.touchdowns}</td>
            <td class="num">${p.stats.captured}</td>
          </tr>`;
    };
    return `<div class="club-table-wrap"><table class="club-roster">
        <caption class="visually-hidden">${esc(t('club.register', { club: club.name }))}</caption>
        <thead><tr>
          <td></td><th scope="col">${esc(t('club.col.player'))}</th><th scope="col">${esc(t('club.col.level'))}</th>
          <th scope="col" class="num">${esc(t('club.col.xp'))}</th><th scope="col" class="num">${esc(t('club.col.games'))}</th>
          <th scope="col" class="num">${esc(t('club.col.captures'))}</th><th scope="col" class="num">${esc(t('club.col.touchdowns'))}</th>
          <th scope="col" class="num">${esc(t('club.col.captured'))}</th>
        </tr></thead>
        <tbody>${club.players.map(row).join('')}</tbody>
      </table></div>`;
}

/**
 * Show the club's page in `box`.
 * @param {HTMLElement} box
 * @param {any} club
 * @param {{ onMenu: () => void, onDeleted: () => void, onPlay: (club: any) => void, onCareer: (club: any, view: string) => void, onSettings?: () => void }} handlers
 *   onSettings: the gear: the Settings screen (language, timer), back to the club after
 *   onPlay: a friendly match with the club against the bot; onCareer: the career, on its map,
 *   journal or pieces' guide ('map', 'journal', 'guide'), or with Gérard's tour ('tour')
 */
/** "Coach · the tournament of the career's tier · season" (the town's, season 1, before the career starts). */
export function clubMeta(club) {
    const career = loadCareer();
    const tier = career ? career.tier : 'school';
    return t('club.meta', { coach: club.coach, tournament: t(`career.tournament.${tier}`), season: career ? career.season : 1 });
}

/** A gear (the Settings button of the club's page). */
const GEAR = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2.2 1.6 2 3.4 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>`;

export function showClub(box, club, { onMenu, onDeleted, onPlay, onCareer, onSettings = () => {} }) {
    const render = (focusId = '') => {
        box.innerHTML = `
          <div class="club-card">
            ${crestSVG(club)}
            <div class="club-card-text">
              <h2 class="club-card-name" tabindex="-1">${esc(club.name)}</h2>
              <div class="club-meta">${esc(clubMeta(club))}</div>
            </div>
            <figure class="club-preview club-card-jersey">${jerseySVG(club)}</figure>
            <button type="button" class="club-settings" id="club-settings" aria-label="${esc(t('menu.settings'))}" title="${esc(t('menu.settings'))}">${GEAR}</button>
          </div>
          <div class="club-row club-career-row"><button type="button" class="btn-primary btn-big" data-career="map">${esc(t('career.tabMap'))}</button>
            <button type="button" class="btn-secondary" data-career="journal">${esc(t('career.tabJournal'))}</button>
            <button type="button" class="btn-secondary" data-career="guide">${esc(t('guide.tab'))}</button>
            <button type="button" class="btn-ghost" data-career="tour">${esc(t('tour.button'))}</button></div>
          <div class="club-row"><button type="button" class="btn-secondary" id="club-play">${esc(t('allStar.play'))}</button></div>
          <section class="club-section" aria-labelledby="club-register-title">
            <h3 id="club-register-title">${esc(t('club.registerTitle'))}</h3>
            ${rosterTable(club)}
            <div class="club-rename-form" id="club-rename-form" hidden></div>
          </section>
          ${(club.cosmetics || []).includes('jersey-heritage') ? wardrobe(club) : ''}
          <section class="club-section" aria-labelledby="club-recruit-title">
            <h3 id="club-recruit-title">${esc(t('club.recruitTitle'))}</h3>
            ${club.recruits > 0 ? recruitForm(club) : `<p class="muted">${esc(t('club.recruitNone'))}</p>`}
          </section>
          <div class="club-row">
            <button type="button" class="btn-secondary" id="club-menu">${esc(t('end.mainMenu'))}</button>
            <button type="button" class="btn-ghost" id="club-delete">${esc(t('club.delete'))}</button>
          </div>`;
        wire();
        if (focusId) /** @type {HTMLElement | null} */ (box.querySelector(`#${focusId}`))?.focus();
    };

    /** The wardrobe: the jerseys won in the career, to wear instead of the home one. */
    function wardrobe(c) {
        const option = (wear, label) => `<button type="button" class="club-wear" role="radio" data-wear="${wear}" aria-checked="${(c.wear || '') === wear}">
            <span class="club-wear-shirt" aria-hidden="true">${jerseySVG({ ...c, wear })}</span>${esc(label)}</button>`;
        return `<section class="club-section" aria-labelledby="club-wardrobe-title">
            <h3 id="club-wardrobe-title">${esc(t('club.wardrobe'))}</h3>
            <div class="club-wardrobe" role="radiogroup" aria-labelledby="club-wardrobe-title">
              ${option('', t('club.wearHome'))}${option('jersey-heritage', t('club.wearHeritage'))}
            </div>
          </section>`;
    }

    function recruitForm(c) {
        return `<p>${esc(t('club.recruitText', { n: c.recruits }))}</p>
          <div class="club-chips" role="group" aria-label="${esc(t('club.recruitType'))}">${Club.RECRUIT_TYPES.map((type, i) =>
            `<button type="button" class="club-chip" data-recruit="${type}" aria-pressed="${i === 0}"><span class="club-glyph-sm" aria-hidden="true">${GLYPHS[type]}</span> ${esc(t(`piece.${type}`))}</button>`).join('')}</div>
          <div class="club-field"><label for="club-recruit-name">${esc(t('club.recruitName'))}</label>
            <input id="club-recruit-name" type="text" maxlength="${Club.NAME_MAX}" autocomplete="off" value="${esc(Club.ROOKIE_NAMES[c.nextId % Club.ROOKIE_NAMES.length])}">
            <span class="club-error" id="club-recruit-error" role="alert"></span></div>
          <div class="club-row"><button type="button" class="btn-primary" id="club-sign-recruit">${esc(t('club.recruitSign'))}</button></div>`;
    }

    function wire() {
        box.querySelector('#club-menu')?.addEventListener('click', onMenu);
        box.querySelector('#club-play')?.addEventListener('click', () => onPlay(club));
        box.querySelector('#club-settings')?.addEventListener('click', () => onSettings());
        box.querySelectorAll('[data-career]').forEach((b) => b.addEventListener('click', () => onCareer(club, /** @type {HTMLElement} */ (b).dataset.career)));
        box.querySelector('#club-delete')?.addEventListener('click', async () => {
            if (!await ask(t('club.deleteAsk', { club: club.name }), { confirm: t('club.deleteConfirm'), cancel: t('dialog.cancel') })) return;
            deleteClub();
            deleteCareer(); // A new club starts a new career
            onDeleted();
        });
        box.querySelectorAll('[data-wear]').forEach((b) => b.addEventListener('click', () => {
            const wear = /** @type {HTMLElement} */ (b).dataset.wear;
            club = { ...club };
            if (wear) club.wear = wear; else delete club.wear;
            saveClub(club);
            render();
            /** @type {HTMLElement | null} */ (box.querySelector(`[data-wear="${wear}"]`))?.focus();
        }));
        box.querySelectorAll('.club-rename').forEach((b) => b.addEventListener('click', () => openRename(Number(/** @type {HTMLElement} */ (b).dataset.player))));
        let recruitType = Club.RECRUIT_TYPES[0];
        box.querySelectorAll('[data-recruit]').forEach((b) => b.addEventListener('click', () => {
            recruitType = /** @type {HTMLElement} */ (b).dataset.recruit;
            box.querySelectorAll('[data-recruit]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        }));
        box.querySelector('#club-sign-recruit')?.addEventListener('click', () => {
            const input = /** @type {HTMLInputElement} */ (box.querySelector('#club-recruit-name'));
            const name = Club.cleanName(input.value);
            if (!name) {
                /** @type {HTMLElement} */ (box.querySelector('#club-recruit-error')).textContent = t('onboarding.nameError', { min: Club.NAME_MIN, max: Club.NAME_MAX });
                input.setAttribute('aria-invalid', 'true');
                return input.focus();
            }
            club = Club.recruit(club, recruitType, name);
            saveClub(club);
            render('club-recruit-title');
        });
    }

    function openRename(id) {
        const player = club.players.find((p) => p.id === id);
        if (!player) return;
        const form = /** @type {HTMLElement} */ (box.querySelector('#club-rename-form'));
        form.hidden = false;
        form.innerHTML = `<div class="club-field"><label for="club-rename-input">${esc(t('club.newName', { name: player.name }))}</label>
            <input id="club-rename-input" type="text" maxlength="${Club.NAME_MAX}" autocomplete="off" value="${esc(player.name)}">
            <span class="club-error" id="club-rename-error" role="alert"></span></div>
          <div class="club-row"><button type="button" class="btn-primary" id="club-rename-save">${esc(t('settings.save'))}</button>
            <button type="button" class="btn-secondary" id="club-rename-cancel">${esc(t('dialog.cancel'))}</button></div>`;
        const input = /** @type {HTMLInputElement} */ (form.querySelector('#club-rename-input'));
        const back = () => /** @type {HTMLElement | null} */ (box.querySelector(`[data-player="${id}"]`))?.focus();
        input.focus();
        input.select();
        const save = () => {
            const name = Club.cleanName(input.value);
            if (!name) {
                /** @type {HTMLElement} */ (form.querySelector('#club-rename-error')).textContent = t('onboarding.nameError', { min: Club.NAME_MIN, max: Club.NAME_MAX });
                input.setAttribute('aria-invalid', 'true');
                return;
            }
            club = { ...club, players: club.players.map((p) => (p.id === id ? { ...p, name } : p)) };
            saveClub(club);
            render();
            back();
        };
        form.querySelector('#club-rename-save')?.addEventListener('click', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); } // Not again on the button that gets the focus
            if (e.key === 'Escape') { e.stopPropagation(); form.hidden = true; back(); }
        });
        form.querySelector('#club-rename-cancel')?.addEventListener('click', () => { form.hidden = true; back(); });
    }

    render();
    /** @type {HTMLElement | null} */ (box.querySelector('.club-card-name'))?.focus();
}
