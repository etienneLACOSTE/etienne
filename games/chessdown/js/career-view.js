// @ts-check
// The career's screen (docs/games/chessdown-career.md), on one screen without scrolling:
// Gérard's word, the scale of the map (town to world), the map (career-map.js) with a
// button per place, the card of the place where the coach stands (shown only once they get
// there: a surprise), and the journal behind a tab (league table, side quests, trophies).
// The transport takes the coach to the next tier with the ticket won in the league's top 3.
// The stadium's card plays the next matchday, a quest's card its match (events.js).
import { createCareerMap, moverOf } from './career-map.js';
import { drawCoach } from './coach-portrait.js';
import { createCommissioner } from './commissioner.js';
import { esc } from './club-art.js';
import { loadCareer, newCareer, saveCareer } from './career-store.js';
import { t } from '../../../assets/js/i18n.js';

const Career = globalThis.ChessdownCareer;
const Quests = globalThis.ChessdownQuests;
const Coaches = globalThis.ChessdownCoaches;
const W = 320;
const H = 192;
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const ui = {
    tabMap: $('career-tab-map'),
    tabJournal: $('career-tab-journal'),
    stage: $('career-stage'),
    journal: $('career-journal'),
    board: $('career-board'),
    scales: $('career-scales'),
    map: $('career-map'),
    canvas: /** @type {HTMLCanvasElement} */ ($('career-canvas')),
    mapTitle: $('career-map-title'),
    card: $('career-card'),
    back: $('career-back'),
};

/** @type {any} */
let career = null;
/** @type {any} */
let club = null;
/** @type {() => void} */
let toClub = () => {};
/** @type {(spec: { kind: 'league' | 'quest', questId?: string, recruitType?: string }) => void} */
let play = () => {};
/** Quests whose place the coach has visited this session (their title shows in the journal). */
const discovered = new Set();
/** @type {HTMLCanvasElement | null} */
let rivalCanvas = null;
/** @type {any} */
let rivalLook = null;

const gerard = createCommissioner({
    canvas: /** @type {HTMLCanvasElement} */ ($('career-gerard')),
    typed: $('career-gerard-typed'),
    said: $('career-gerard-said'),
    bubble: $('career-gerard-bubble'),
    scarf: () => [club ? club.primary : '#f1c40f', club ? club.secondary : '#111111'],
});
const map = createCareerMap({ canvas: ui.canvas, onArrive: (place) => showCard(place) });

/** The next tier and its transport from this map, if any. */
function nextTier() {
    const i = Career.TIER_IDS.indexOf(career.tier);
    return Career.TIER_IDS[i + 1] || null;
}
const placeName = (place) => t(`place.${career.tier}.${place}`);
/** A quotation, with the language's quotation marks (escaped). */
const quoted = (text) => esc(t('career.quoted', { text }));
const save = () => saveCareer(career);

// ---------- What stands on the map ----------
/** The places with a button: the club, the stadium, the transport, and the places of this season's open quests. */
function markers() {
    const list = [{ place: 'home', kind: 'home', face: '♜' }];
    list.push({ place: 'stadium', kind: Career.nextMatch(career) ? 'main' : 'done', face: Career.nextMatch(career) ? '!' : '✓' });
    const transport = Quests.TRANSPORT[career.tier];
    if (transport) list.push({ place: 'transport', kind: 'transport', face: t(`career.stub.${transport}`) });
    for (const q of Career.availableQuests(career)) {
        if (!list.some((m) => m.place === q.place)) list.push({ place: q.place, kind: 'side', face: '!' });
    }
    return list;
}
/** The open quest given at `place`, if any. */
const questAt = (place) => Career.availableQuests(career).find((q) => q.place === place) || null;

function renderMarkers() {
    ui.map.querySelectorAll('.career-marker').forEach((m) => m.remove());
    for (const m of markers()) {
        const at = map.placeAt(m.place);
        if (!at) continue;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `career-marker ${m.kind}${at.y < 60 ? ' tag-below' : ''}`; // Near the top: its name under it
        b.dataset.place = m.place;
        b.style.left = `${(at.x / W) * 100}%`;
        b.style.top = `${((at.y - 14) / H) * 100}%`;
        const kind = m.kind === 'done' ? 'main' : m.kind;
        b.setAttribute('aria-label', t(`career.marker.${kind}`, { place: placeName(m.place) }));
        b.setAttribute('aria-pressed', String(map.at() === m.place));
        b.innerHTML = `<span class="ex" aria-hidden="true">${esc(m.face)}</span><span class="tag" aria-hidden="true">${esc(placeName(m.place))}</span>`;
        b.addEventListener('click', () => goTo(m.place));
        ui.map.appendChild(b);
    }
}

function goTo(place) {
    ui.map.querySelectorAll('.career-marker').forEach((m) => m.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (m).dataset.place === place)));
    showTravel(place);
    map.go(place); // showCard on arrival
}

// ---------- The card ----------
const chips = (list, cls) => `<div class="career-chips">${list.map((x) => `<span class="career-chip ${cls}">${x}</span>`).join('')}</div>`;
const pieces = (types) => `<span class="career-glyphs">${types.map((p) => GLYPHS[p]).join('')}</span> ${esc(types.map((p) => t(`piece.${p}`)).join(', '))}`;

function setCard(kind, html) {
    ui.card.className = `career-card ${kind}`;
    ui.card.innerHTML = html;
    rivalCanvas = ui.card.querySelector('.career-rival canvas');
}

function showTravel(place) {
    setCard('travel', `<span class="career-kind">${esc(t('career.kind.travel'))}</span>
        <h3>${esc(placeName(place))}</h3>
        <p class="career-quote">${esc(t('career.travelText', { how: t(`career.how.${moverOf(career.tier)}`) }))}</p>`);
}

function rivalBlock(coachId) {
    const c = Coaches.coachById(coachId);
    rivalLook = c.look;
    return `<div class="career-rival">
        <canvas width="32" height="32" role="img" aria-label="${esc(c.name)}"></canvas>
        <div><div class="career-rival-name">${esc(c.name)} <span class="career-rival-nick">${quoted(t(`coach.${c.id}.nick`))}</span></div>
          <small>${esc(c.club)} · ${esc(t(`archetype.${c.archetype}`))}</small>
          <small><i>${quoted(t(`coach.${c.id}.line`))}</i></small></div>
      </div>`;
}

function opponentLine(o) {
    return esc(t('career.opponent', { level: t(`level.${o.difficulty}`), budget: o.budget, stars: o.level }));
}

function showCard(place) {
    const kind = (k) => `<span class="career-kind"><span class="career-dot ${k}" aria-hidden="true"></span>${esc(t(`career.kind.${k}`))}</span>`;
    if (place === 'home') {
        setCard('home', `${kind('home')}<h3>${esc(club.name)}</h3><p class="career-place">${esc(placeName('home'))}</p>
            <p class="career-quote">${esc(t('career.homeText'))}</p>
            <div class="career-row"><button type="button" class="btn-primary" data-action="club">${esc(t('career.openClub'))}</button></div>`);
        ui.card.querySelector('[data-action="club"]')?.addEventListener('click', toClub);
        return;
    }
    if (place === 'stadium') return showMatchCard();
    if (place === 'transport') return showTransportCard();
    const q = questAt(place);
    if (!q) {
        setCard('home', `<h3>${esc(placeName(place))}</h3>`);
        return;
    }
    discovered.add(q.id);
    renderJournal();
    const goals = [goalText(q)];
    const Club = globalThis.ChessdownClub;
    const choice = q.reward.recruitChoice ? `<div class="career-choice" role="radiogroup" aria-label="${esc(t('career.chooseRecruit'))}">
        <h4>${esc(t('career.chooseRecruit'))}</h4><div class="career-chips">${Club.RECRUIT_TYPES.map((type, i) =>
            `<button type="button" class="career-pick" role="radio" data-type="${type}" aria-checked="${i === 0}"><span class="career-glyphs" aria-hidden="true">${GLYPHS[type]}</span> ${esc(t(`piece.${type}`))}</button>`).join('')}</div></div>` : '';
    const conditions = q.goal.type === 'puzzle'
        ? [esc(t('career.puzzle.still')), esc(t('career.once'))] // A puzzle: a set position, the other side never moves
        : [esc(t(`rule.${q.format}`)), ...ruleTexts(q.rules), opponentLine(Career.questOpponent(career, q)), esc(t('career.once'))];
    setCard('side', `${kind('side')}
        <h3>${esc(t(`quest.${q.id}.title`))}</h3>
        <p class="career-place">${esc(placeName(place))} · ${esc(t(`quest.${q.id}.giver`))}</p>
        <p class="career-quote">${quoted(t(`quest.${q.id}.quote`))}</p>
        <h4>${esc(t('career.goals'))}</h4><ul>${goals.map((g) => `<li>${g}</li>`).join('')}</ul>
        <h4>${esc(t('career.conditions'))}</h4>${chips(conditions, 'limit')}
        <h4>${esc(t('career.rewards'))}</h4>${chips([rewardText(q.reward)], 'reward')}${choice}
        <div class="career-row"><button type="button" class="btn-primary" data-action="play">${esc(t('career.accept'))}</button></div>`);
    let recruitType = Club.RECRUIT_TYPES[0];
    ui.card.querySelectorAll('.career-pick').forEach((b) => b.addEventListener('click', () => {
        recruitType = /** @type {HTMLElement} */ (b).dataset.type;
        ui.card.querySelectorAll('.career-pick').forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    }));
    ui.card.querySelector('[data-action="play"]')?.addEventListener('click', () => play({ kind: 'quest', questId: q.id, ...(q.reward.recruitChoice ? { recruitType } : {}) }));
}

function goalText(q) {
    const g = q.goal;
    if (g.type === 'win') return esc(t(q.format === 'bo3' ? 'goal.winSeries' : 'goal.winSingle'));
    if (g.type === 'touchdownWith') return esc(t('goal.touchdownWith', { piece: t(`piece.${g.piece}`) }));
    if (g.type === 'puzzle') return esc(t('goal.puzzle', { n: g.moves }));
    return esc(t(`goal.${g.type}`, { n: g.n }));
}

function ruleTexts(rules) {
    const out = [];
    if (rules.squad) out.push(esc(t('rule.squad', { pieces: '§' })).replace('§', pieces(rules.squad)));
    if (rules.banned) out.push(esc(t('rule.banned', { pieces: '§' })).replace('§', pieces(rules.banned)));
    for (const key of ['maxPieces', 'noCaptureMoves', 'timer']) if (rules[key] !== undefined) out.push(esc(t(`rule.${key}`, { n: rules[key] })));
    for (const key of ['originalSquad', 'noRetreat', 'invertedRows', 'lockedLineup']) if (rules[key]) out.push(esc(t(`rule.${key}`)));
    return out;
}

function rewardText(r) {
    if (r.xp) {
        if (r.xp.to === 'all') return esc(t('reward.xpAll', { n: r.xp.amount }));
        if (r.xp.to === 'engaged') return esc(t('reward.xpEngaged', { n: r.xp.amount }));
        return esc(t('reward.xpType', { n: r.xp.amount, piece: t(`piece.${r.xp.to}`) }));
    }
    if (r.recruit) {
        const values = { piece: t(`piece.${r.recruit.type}`), level: r.recruit.level };
        return esc(r.recruit.name ? t('reward.recruitNamed', { ...values, name: r.recruit.name }) : t('reward.recruit', values));
    }
    if (r.recruitChoice) return esc(t('reward.recruitChoice', { level: r.recruitChoice.level }));
    return esc(t(`reward.cosmetic.${r.cosmetic}`));
}

function showMatchCard() {
    const m = Career.nextMatch(career);
    const head = `<span class="career-kind"><span class="career-dot main" aria-hidden="true"></span>${esc(t('career.kind.main'))}</span>`;
    if (!m) {
        setCard('main', `${head}<h3>${esc(placeName('stadium'))}</h3><p class="career-quote">${esc(t('career.seasonDone'))}</p>`);
        return;
    }
    const rival = Coaches.coachById(m.opponent);
    const rules = Career.matchdayRules(career);
    const step = Career.tutorialStep(career);
    const lesson = step >= 0 ? t(`career.lesson.${step}`) : '';
    if (lesson) gerard.say(lesson); // The school tutorial: Gérard explains the matchday
    const title = m.phase === 'knockout' ? t(`career.knockout.${m.round}`)
        : Career.TIERS[career.tier].knockout ? t('career.group', { n: m.round + 1 }) : t('career.matchday', { n: m.round + 1 });
    setCard('main', `${head}
        <h3>${esc(title)}</h3>
        <p class="career-place">${esc(placeName('stadium'))} · ${esc(t('career.versus', { club: rival.club }))}</p>
        <p class="career-quote">${esc(t('career.matchQuote', { club: rival.club }))}</p>
        ${lesson ? `<div class="career-lesson"><h4>${esc(t('career.lessonTitle'))}</h4><p>${esc(lesson)}</p></div>` : ''}
        ${rivalBlock(rival.id)}
        <h4>${esc(t('career.goals'))}</h4><ul><li>${esc(t('goal.winSeries'))}</li></ul>
        <h4>${esc(t('career.conditions'))}</h4>${chips([esc(t('rule.bo3')), ...ruleTexts({ timer: 30, ...rules }), opponentLine(Career.rivalOpponent(career, rival.id))], 'limit')}
        <h4>${esc(t('career.rewards'))}</h4>${chips([esc(t('career.leaguePoints')), esc(t('career.matchXp'))], 'reward')}
        <div class="career-row"><button type="button" class="btn-primary" data-action="play">${esc(t('career.play'))}</button></div>`);
    if (rivalCanvas) drawCoach(rivalCanvas, rivalLook, performance.now());
    ui.card.querySelector('[data-action="play"]')?.addEventListener('click', () => play({ kind: 'league' }));
}

function showTransportCard() {
    const transport = Quests.TRANSPORT[career.tier];
    const next = nextTier();
    const can = next && Career.canTravel(career, next);
    const hasTicket = next && career.tickets.includes(next);
    const say = can ? t('career.ticket.ok') : hasTicket ? t('career.ticket.wait') : t('career.ticket.refuse');
    setCard('transport', `<span class="career-kind">${esc(t('career.kind.transport'))}</span>
        <h3>${esc(t(`career.transport.${transport}`))}</h3>
        <p class="career-place">${esc(placeName('transport'))} · ${esc(t(`career.controller.${transport}`))}</p>
        <div class="career-ticket ${hasTicket ? 'ok' : ''}"><span class="career-stub" aria-hidden="true">${esc(t(`career.stub.${transport}`))}</span>
          <span>${esc(t(hasTicket ? 'career.ticket.have' : 'career.ticket.none'))}</span></div>
        <p class="career-quote">${quoted(say)}</p>
        <div class="career-row"><button type="button" class="btn-primary" data-action="board" ${can ? '' : 'disabled'}>${esc(t('career.board'))}</button></div>`);
    ui.card.querySelector('[data-action="board"]')?.addEventListener('click', () => {
        const moved = next && Career.travel(career, next);
        if (!moved) return;
        career = moved;
        save();
        showTier('home');
        gerard.say(t(`career.intro.${career.tier}`));
    });
}

// ---------- Header, scales, journal ----------
function renderHeader() {
    const total = Career.TIERS[career.tier].clubs;
    ui.board.innerHTML = [esc(club.name), esc(t('career.season', { n: career.season })),
        esc(t('career.tierChip', { tier: t(`career.tier.${career.tier}`) })),
        esc(t('career.rankChip', { rank: Career.rank(career), total }))].map((x) => `<span>${x}</span>`).join('');
    ui.scales.innerHTML = Career.TIER_IDS.map((tier) => {
        const state = tier === career.tier ? 'current' : (tier === 'school' || career.tickets.includes(tier)) ? 'open' : 'locked';
        return `<li class="${state}"${state === 'current' ? ' aria-current="step"' : ''}>${esc(t(`career.tier.${tier}`))}${state === 'locked' ? ` <span class="career-lock">${esc(t('career.ticketTag'))}</span>` : ''}</li>`;
    }).join('');
}

function renderJournal() {
    const name = (id) => (id === Career.YOU ? club.name : Coaches.coachById(id).club);
    const rows = Career.standings(career).map((r, i) => `<tr class="${r.club === Career.YOU ? 'you' : ''}">
        <td class="num">${i + 1}</td><th scope="row">${esc(name(r.club))}</th>
        <td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.drawn}</td><td class="num">${r.lost}</td><td class="num"><b>${r.points}</b></td></tr>`).join('');
    const drawn = career.quests.drawn.map((id) => Quests.questById(id));
    const quests = drawn.map((q) => {
        const tried = career.quests.attempted.includes(q.id);
        const title = discovered.has(q.id) || tried ? t(`quest.${q.id}.title`) : t('career.journal.unknown');
        return `<li><button type="button" data-place="${q.place}" ${tried ? 'disabled' : ''}>
            <span>${esc(title)}<br><small>${esc(placeName(q.place))}${tried ? ` · ${esc(t('career.journal.tried'))}` : ''}</small></span>
            <span class="career-dot side" aria-hidden="true"></span></button></li>`;
    }).join('');
    const titles = career.titles.length
        ? `<ul class="career-titles">${career.titles.map((x) => `<li>★ ${esc(t('career.journal.title', { tier: t(`career.tier.${x.tier}`), season: x.season }))}</li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('career.journal.noTitles'))}</p>`;
    ui.journal.innerHTML = `
        <section aria-labelledby="career-league-title">
          <h3 id="career-league-title"><span class="career-dot main" aria-hidden="true"></span>${esc(t('career.journal.league'))}</h3>
          <div class="career-table-wrap" tabindex="0" role="region" aria-labelledby="career-league-title"><table class="career-table">
            <caption class="visually-hidden">${esc(t('career.journal.table', { tier: t(`career.tier.${career.tier}`) }))}</caption>
            <thead><tr><td></td><th scope="col">${esc(t('career.col.club'))}</th><th scope="col" class="num">${esc(t('career.col.played'))}</th>
              <th scope="col" class="num">${esc(t('career.col.won'))}</th><th scope="col" class="num">${esc(t('career.col.drawn'))}</th>
              <th scope="col" class="num">${esc(t('career.col.lost'))}</th><th scope="col" class="num">${esc(t('career.col.points'))}</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
        </section>
        <section aria-labelledby="career-quests-title">
          <h3 id="career-quests-title"><span class="career-dot side" aria-hidden="true"></span>${esc(t('career.journal.quests'))}</h3>
          <p class="muted">${esc(t('career.journal.questsNote', { n: drawn.length, tier: t(`career.tier.${career.tier}`) }))}</p>
          <ul class="career-quests">${quests}</ul>
          <h3>${esc(t('career.journal.titles'))}</h3>${titles}
        </section>`;
    ui.journal.querySelectorAll('[data-place]').forEach((b) => b.addEventListener('click', () => {
        showView('map');
        goTo(/** @type {HTMLElement} */ (b).dataset.place);
    }));
}

function showView(view) {
    const onMap = view === 'map';
    ui.stage.hidden = !onMap;
    ui.journal.hidden = onMap;
    ui.tabMap.setAttribute('aria-selected', String(onMap));
    ui.tabJournal.setAttribute('aria-selected', String(!onMap));
    ui.tabMap.tabIndex = onMap ? 0 : -1;
    ui.tabJournal.tabIndex = onMap ? -1 : 0;
}

function showTier(place) {
    discovered.clear();
    map.show(career.tier, place, club);
    ui.canvas.setAttribute('aria-label', t('career.mapLabel', { map: t(`career.map.${career.tier}`) }));
    ui.mapTitle.textContent = t(`career.map.${career.tier}`);
    renderHeader();
    renderMarkers();
    renderJournal();
    showCard(place);
}

// Tabs: click, or the arrow keys between them
/** @type {[HTMLElement, string][]} */
const TABS = [[ui.tabMap, 'map'], [ui.tabJournal, 'journal']];
for (const [tab, view] of TABS) {
    tab.addEventListener('click', () => showView(view));
    tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const other = view === 'map' ? ui.tabJournal : ui.tabMap;
        showView(view === 'map' ? 'journal' : 'map');
        other.focus();
    });
}
ui.back.addEventListener('click', () => toClub());

// Portraits blink while the screen shows
let blinking = false;
function blinkLoop(now) {
    if (!blinking) return;
    if (rivalCanvas && rivalCanvas.isConnected && rivalLook) drawCoach(rivalCanvas, rivalLook, now);
    setTimeout(() => requestAnimationFrame(blinkLoop), 120);
}

/**
 * Open the career with `theClub` (its saved career, or a new one).
 * @param {any} theClub
 * @param {{ onClub: () => void, onPlay: (spec: { kind: 'league' | 'quest', questId?: string, recruitType?: string }) => void, word?: string }} handlers
 *   onClub: back to the club's page; onPlay: play a matchday or a quest; word: what Gérard
 *   says first (his comment on the match just played; his welcome to the map otherwise)
 */
export function openCareer(theClub, { onClub, onPlay, word = '' }) {
    club = theClub;
    toClub = () => { closeCareer(); onClub(); };
    play = onPlay;
    career = loadCareer();
    if (!career) { career = newCareer(); save(); }
    showView('map');
    showTier('home');
    map.start();
    gerard.start();
    gerard.say(word || t(`career.intro.${career.tier}`));
    blinking = true;
    requestAnimationFrame(blinkLoop);
}

/** The career's screen is left: stop the animations. */
export function closeCareer() {
    map.stop();
    gerard.stop();
    blinking = false;
}

/** The career shown (for the tests). */
export const currentCareer = () => career;
