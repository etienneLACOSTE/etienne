// @ts-check
// The career's screen (docs/games/chessdown-career.md), on one screen without scrolling:
// Gérard's word, the scale of the map (town to world), the map (career-map.js) with a
// button per place, the card of the place where the coach stands (shown only once they get
// there: a surprise), the date in a corner (it moves on with every walk and match), and the
// journal behind a tab (the tournament, side quests, trophies). The transport takes the coach
// to the next tier with the ticket won with the tournament. The stadium's card plays the next
// tournament match, a quest's card its match (events.js). Knocked out, the screen goes black
// and Gérard says it is over until next season.
import { createCareerMap, moverOf } from './career-map.js';
import { drawCoach } from './coach-portrait.js';
import { createCommissioner } from './commissioner.js';
import { esc } from './club-art.js';
import { loadCareer, newCareer, saveCareer } from './career-store.js';
import { language, t } from '../../../assets/js/i18n.js';
import { renderGuide } from './piece-guide.js';
import { startTour, tourSeen } from './career-tour.js';
import { bracketProgress, scrollBracketToClub } from './bracket-view.js';

const Career = globalThis.ChessdownCareer;
const Quests = globalThis.ChessdownQuests;
const Coaches = globalThis.ChessdownCoaches;
const W = 320;
const H = 192;
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const ui = {
    title: $('career-title'),
    guide: $('career-guide'),
    stage: $('career-stage'),
    journal: $('career-journal'),
    board: $('career-board'),
    scales: $('career-scales'),
    map: $('career-map'),
    canvas: /** @type {HTMLCanvasElement} */ ($('career-canvas')),
    mapTitle: $('career-map-title'),
    card: $('career-card'),
    back: $('career-back'),
    date: $('career-date'),
    tourButton: $('career-tour-btn'),
    out: $('career-out'),
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
/** Pixel icons of the markers, drawn from rows of 'X' (filled) and '.' (empty), in the text colour. */
const PIXEL_ICONS = {
    // The championship (the main quest): a crown
    crown: ['X...X...X', 'XX.XXX.XX', 'XXXXXXXXX', 'X.XX.XX.X', 'XXXXXXXXX'],
    // A boss: a horned skull
    skull: ['X.........X', 'XX..XXX..XX', '.XXXXXXXXX.', '..XXXXXXX..', '..X..X..X..', '..X..X..X..', '..XXX.XXX..', '...XXXXX...', '...X.X.X...'],
};
/** `height`: in CSS pixels (the map's markers 18, the cards 16); whole pixels of the art stay crisp. */
function pixelIcon(name, height = 18) {
    const rows = PIXEL_ICONS[name];
    const w = rows[0].length;
    const scale = Math.max(1, Math.round(height / rows.length));
    const rects = rows.flatMap((row, y) => [...row].map((ch, x) => (ch === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('');
    return `<svg class="pixel-icon ${name}" viewBox="0 0 ${w} ${rows.length}" width="${w * scale}" height="${rows.length * scale}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`;
}

/** The places with a button: the club, the stadium, the transport, and the places of this season's open quests. */
function markers() {
    /** @type {{ place: string, kind: string, face: string, icon?: string }[]} */
    const list = [{ place: 'home', kind: 'home', face: '♜' }];
    list.push({ place: 'stadium', kind: 'main', face: '', icon: 'crown' }); // The tournament (and, once over, the next season)
    const transport = Quests.TRANSPORT[career.tier];
    if (transport) list.push({ place: 'transport', kind: 'transport', face: t(`career.stub.${transport}`) });
    for (const q of Career.availableQuests(career)) {
        if (list.some((m) => m.place === q.place)) continue;
        list.push(q.kind === 'boss' ? { place: q.place, kind: 'boss', face: '', icon: 'skull' } : { place: q.place, kind: 'side', face: '!' });
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
        b.innerHTML = `<span class="ex" aria-hidden="true">${m.icon ? pixelIcon(m.icon) : esc(m.face)}</span><span class="tag" aria-hidden="true">${esc(placeName(m.place))}</span>`;
        b.addEventListener('click', () => goTo(m.place));
        ui.map.appendChild(b);
    }
}

/** Gérard's tour (career-tour.js), when it runs. @type {{ stop: () => void } | null} */
let tour = null;

/** Gérard's tour of the career, on the map; back to the card of where the coach stands at the end. */
function runTour() {
    tour?.stop();
    showView('map');
    tour = startTour({
        screen: $('career-screen'),
        portrait: /** @type {HTMLCanvasElement} */ ($('career-gerard')),
        done: () => { tour = null; ui.tourButton.focus(); },
    });
}

function goTo(place) {
    ui.map.querySelectorAll('.career-marker').forEach((m) => m.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (m).dataset.place === place)));
    showTravel(place);
    const pixels = map.go(place); // showCard on arrival
    if (pixels) { // The walk takes time
        career = Career.advance(career, Career.walkMinutes(career, pixels));
        save();
        renderDate();
    }
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
    const c = Career.coachOf(career, coachId);
    rivalLook = c.look;
    // A generated club's coach has no nickname or catchphrase
    return `<div class="career-rival">
        <canvas width="32" height="32" role="img" aria-label="${esc(c.name)}"></canvas>
        <div><div class="career-rival-name">${esc(c.name)}${c.generated ? '' : ` <span class="career-rival-nick">${quoted(t(`coach.${c.id}.nick`))}</span>`}</div>
          <small>${esc(c.club)} · ${esc(t(`archetype.${c.archetype}`))}</small>
          ${c.generated ? '' : `<small><i>${quoted(t(`coach.${c.id}.line`))}</i></small>`}</div>
      </div>`;
}

/** A club's name: the player's, or a rival's. */
const clubName = (id) => (id === Career.YOU ? club.name : Career.coachOf(career, id).club);

function opponentLine(o) {
    if (o.army) { // A boss: its fixed army
        const army = o.army.map(([type, level]) => `${GLYPHS[type]} ${t(`piece.${type}`)} ${level}★`).join(', ');
        return esc(t('career.bossArmy', { level: t(`level.${o.difficulty}`), army }));
    }
    // Levels around an average: 1.3 is levels 1 and 2
    const low = Math.floor(o.level), high = Math.ceil(o.level);
    return esc(low === high ? t('career.opponent', { level: t(`level.${o.difficulty}`), budget: o.budget, stars: low })
        : t('career.opponentMix', { level: t(`level.${o.difficulty}`), budget: o.budget, low, high }));
}

function showCard(place) {
    const kind = (k) => `<span class="career-kind">${k === 'boss' ? `<span class="career-dot icon boss" aria-hidden="true">${pixelIcon('skull', 16)}</span>` : `<span class="career-dot ${k}" aria-hidden="true"></span>`}${esc(t(`career.kind.${k}`))}</span>`;
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
    setCard('side', `${kind(q.kind === 'boss' ? 'boss' : 'side')}
        <h3>${esc(t(`quest.${q.id}.title`))}</h3>
        <p class="career-place">${esc(placeName(place))} · ${esc(t(`quest.${q.id}.giver`))}</p>
        <h4>${esc(t('career.rewards'))}</h4>${chips([rewardText(q.reward)], 'reward')}
        <p class="career-quote">${quoted(t(`quest.${q.id}.quote`))}</p>
        ${q.opponent && q.opponent.boss ? rivalBlock(q.opponent.boss) : ''}
        <h4>${esc(t('career.goals'))}</h4><ul>${goals.map((g) => `<li>${g}</li>`).join('')}</ul>
        <h4>${esc(t('career.conditions'))}</h4>${chips(conditions, 'limit')}${choice}
        <div class="career-row"><button type="button" class="btn-primary" data-action="play">${esc(t('career.accept'))}</button></div>`);
    if (q.opponent && q.opponent.boss && rivalCanvas) drawCoach(rivalCanvas, rivalLook, performance.now());
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
    for (const key of ['maxPieces', 'noCaptureMoves', 'timer', 'budget']) if (rules[key] !== undefined) out.push(esc(t(`rule.${key}`, { n: rules[key] })));
    if (rules.timerSteps) out.push(esc(t('rule.timerSteps', { a: rules.timerSteps[0], b: rules.timerSteps[1], c: rules.timerSteps[2] })));
    for (const key of ['originalSquad', 'noRetreat', 'invertedRows', 'lockedLineup', 'noTouchdowns', 'noKingCapture']) if (rules[key]) out.push(esc(t(`rule.${key}`)));
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
    const head = `<span class="career-kind"><span class="career-dot icon main" aria-hidden="true">${pixelIcon('crown', 16)}</span>${esc(t('career.kind.main'))}</span>`;
    const tournament = t(`career.tournament.${career.tier}`);
    if (!m) return showSeasonOver(head, tournament);
    const rival = Career.coachOf(career, m.opponent);
    const step = Career.tutorialStep(career);
    const lesson = step >= 0 ? t(`career.lesson.${step}`) : '';
    if (lesson) gerard.say(lesson); // The first season in town: Gérard explains the game
    setCard('main', `${head}
        <h3>${esc(tournament)} · ${esc(t(`career.stage.${m.stage}`))}</h3>
        <p class="career-place">${esc(placeName('stadium'))} · ${esc(t('career.versus', { club: rival.club }))}</p>
        <h4>${esc(t('career.rewards'))}</h4>${chips([esc(t(m.stage === 'GF' ? 'career.reward.title' : 'career.reward.through')), esc(t('career.matchXp'))], 'reward')}
        <p class="career-quote">${esc(t('career.matchQuote', { club: rival.club }))}</p>
        ${lesson ? `<div class="career-lesson"><h4>${esc(t('career.lessonTitle'))}</h4><p>${esc(lesson)}</p></div>` : ''}
        ${rivalBlock(m.opponent)}
        <h4>${esc(t('career.goals'))}</h4><ul><li>${esc(t(m.format === 'bo3' ? 'goal.winSeries' : 'goal.winSingle'))}</li></ul>
        <h4>${esc(t('career.conditions'))}</h4>${chips([esc(t(`rule.${m.format}`)), ...ruleTexts({ timer: 30 }), esc(t('career.lastChance')), opponentLine(Career.rivalOpponent(career, m.opponent))], 'limit')}
        <div class="career-row"><button type="button" class="btn-primary" data-action="play">${esc(t('career.play'))}</button></div>`);
    if (rivalCanvas) drawCoach(rivalCanvas, rivalLook, performance.now());
    ui.card.querySelector('[data-action="play"]')?.addEventListener('click', () => play({ kind: 'league' }));
}

/** The tournament is over for the club: where it finished, and the next season to start. */
function showSeasonOver(head, tournament) {
    const place = Career.placing(career);
    setCard('main', `${head}
        <h3>${esc(tournament)}</h3>
        <p class="career-place">${esc(placeName('stadium'))}</p>
        <p class="career-quote">${esc(place === 1 ? t('career.seasonWon') : t('career.seasonDone', { place }))}</p>
        <div class="career-row"><button type="button" class="btn-primary" data-action="next-season">${esc(t('career.nextSeason'))}</button></div>`);
    ui.card.querySelector('[data-action="next-season"]')?.addEventListener('click', () => {
        const end = Career.finishSeason(career);
        if (!end) return;
        career = end.career;
        save();
        showTier('stadium');
        gerard.say(end.ticket ? t('career.newSeasonTicket', { transport: t(`career.transport.${Quests.TRANSPORT[end.career.tier]}`) }) : t('career.newSeason', { n: career.season }));
    });
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
    const m = Career.nextMatch(career);
    const where = m ? t(`career.stage.${m.stage}`) : t('career.placeChip', { place: Career.placing(career) });
    ui.board.innerHTML = [esc(club.name), esc(t('career.season', { n: career.season })),
        esc(t('career.tierChip', { tier: t(`career.tier.${career.tier}`) })), esc(where)].map((x) => `<span>${x}</span>`).join('');
    ui.scales.innerHTML = Career.TIER_IDS.map((tier) => {
        const state = tier === career.tier ? 'current' : (tier === 'school' || career.tickets.includes(tier)) ? 'open' : 'locked';
        return `<li class="${state}"${state === 'current' ? ' aria-current="step"' : ''}>${esc(t(`career.tier.${tier}`))}${state === 'locked' ? ` <span class="career-lock">${esc(t('career.ticketTag'))}</span>` : ''}</li>`;
    }).join('');
    renderDate();
}

/** The date, in a corner of the map (in the page's language). */
function renderDate() {
    const date = Career.dateOf(career);
    ui.date.textContent = new Intl.DateTimeFormat(language(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date);
    ui.date.setAttribute('datetime', date.toISOString());
}

function renderJournal() {
    const b = Career.bracket(career);
    // The tournament: where the club stands, its next match, the bracket folded below
    const status = b.next ? t('career.journal.inRunning')
        : b.place === 1 ? t('career.journal.champion') : t('career.journal.finished', { place: b.place });
    const next = b.next ? `<p class="career-next">${esc(t('career.journal.next', { stage: t(`career.stage.${b.next.stage}`), club: clubName(b.next.opponent) }))}</p>` : '';
    // The quests of the season: done, failed, or still to try
    const drawn = career.quests.drawn.map((id) => Quests.questById(id));
    const quests = drawn.map((q) => {
        const tried = career.quests.attempted.includes(q.id);
        const done = career.questsDone.includes(q.id);
        const title = discovered.has(q.id) || tried ? t(`quest.${q.id}.title`) : t('career.journal.unknown');
        const outcome = tried ? ` · ${esc(t(done ? 'career.journal.questOk' : 'career.journal.questFailed'))}` : '';
        return `<li><button type="button" data-place="${q.place}" ${tried ? 'disabled' : ''} class="${tried ? (done ? 'ok' : 'failed') : ''}">
            <span>${esc(title)}<br><small>${esc(placeName(q.place))}${outcome}</small></span>
            <span class="career-dot side" aria-hidden="true"></span></button></li>`;
    }).join('');
    const titles = career.titles.length
        ? `<ul class="career-titles">${career.titles.map((x) => `<li>★ ${esc(t('career.journal.title', { tier: t(`career.tier.${x.tier}`), season: x.season }))}</li>`).join('')}</ul>`
        : `<p class="muted">${esc(t('career.journal.noTitles'))}</p>`;
    ui.journal.innerHTML = `
        <section class="career-tournament" aria-labelledby="career-league-title">
          <h3 id="career-league-title"><span class="career-dot icon main" aria-hidden="true">${pixelIcon('crown', 16)}</span>${esc(t(`career.tournament.${career.tier}`))}</h3>
          <p>${esc(status)}</p>${next}
          <details class="career-bracket-tree"><summary>${esc(t('career.journal.showBracket'))}</summary>${bracketProgress(career, club, { heading: false })}</details>
        </section>
        <section class="career-news-box" aria-labelledby="career-news-title">
          <h3 id="career-news-title">${esc(t('career.journal.news'))}</h3>
          ${newsList()}
        </section>
        <section aria-labelledby="career-quests-title">
          <h3 id="career-quests-title"><span class="career-dot side" aria-hidden="true"></span>${esc(t('career.journal.quests'))}</h3>
          <p class="muted">${esc(t('career.journal.questsNote', { n: drawn.length, tier: t(`career.tier.${career.tier}`) }))}</p>
          <ul class="career-quests">${quests}</ul>
        </section>
        <section aria-labelledby="career-titles-title">
          <h3 id="career-titles-title">${esc(t('career.journal.titles'))}</h3>${titles}
        </section>`;
    const tree = /** @type {HTMLDetailsElement} */ (ui.journal.querySelector('.career-bracket-tree'));
    tree.addEventListener('toggle', () => { if (tree.open) scrollBracketToClub(tree); });
    ui.journal.querySelectorAll('[data-place]').forEach((el) => el.addEventListener('click', () => {
        showView('map');
        goTo(/** @type {HTMLElement} */ (el).dataset.place);
    }));
}

/** The club's news (career-rules.js addNews), the latest first, each dated by the calendar. */
function newsList() {
    if (!career.news.length) return `<p class="muted">${esc(t('career.journal.noNews'))}</p>`;
    const day = new Intl.DateTimeFormat(language(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const items = career.news.slice().reverse().map((n) => {
        const date = Career.dateOf({ season: n.season, minutes: n.at });
        const [mark, text] = newsText(n);
        return `<li class="news-${n.kind}${n.kind === 'match' ? (n.won > n.lost ? ' won' : ' lost') : ''}${n.kind === 'quest' ? (n.ok ? ' won' : ' lost') : ''}">
            <span class="news-mark" aria-hidden="true">${mark}</span>
            <span><time datetime="${date.toISOString()}">${esc(day.format(date))}</time> ${esc(text)}</span></li>`;
    }).join('');
    return `<ol class="career-news" tabindex="0" aria-labelledby="career-news-title">${items}</ol>`;
}

/** A piece of news: its mark (a glyph, not read) and its sentence. @returns {[string, string]} */
function newsText(n) {
    const stage = (id) => t(`career.stage.${id}`);
    const tournament = (tier) => t(`career.tournament.${tier}`);
    switch (n.kind) {
        case 'season': return ['▶', t('career.news.season', { n: n.season, tournament: tournament(n.tier) })];
        case 'match': return [n.won > n.lost ? '✓' : '✗', t(n.won > n.lost ? 'career.news.won' : 'career.news.lost', { stage: stage(n.stage), club: clubName(n.opp), won: n.won, lost: n.lost })];
        case 'upset': return ['⚡', t('career.news.upset', { stage: stage(n.stage), winner: clubName(n.w), loser: clubName(n.l) })];
        case 'promoted': return ['▲', n.club === Career.YOU ? t('career.news.youPromoted', { tournament: tournament(n.tier) }) : t('career.news.promoted', { club: clubName(n.club), tournament: tournament(n.tier) })];
        case 'arrived': return ['▲', t('career.news.arrived', { tournament: tournament(n.tier) })];
        case 'streak': return ['✓', t('career.news.streak', { club: club.name, n: n.n })];
        case 'champion': return ['★', n.club === Career.YOU ? t('career.news.youChampion', { tournament: tournament(n.tier) }) : t('career.news.champion', { club: clubName(n.club), tournament: tournament(n.tier) })];
        case 'quest': return [n.ok ? '✓' : '✗', t(n.ok ? 'career.news.questOk' : 'career.news.questFailed', { title: t(`quest.${n.id}.title`) })];
        case 'recruit': return [GLYPHS[n.type], t('career.news.recruit', { name: n.name, piece: t(`piece.${n.type}`), level: n.level })];
        default: return [GLYPHS[n.type], t('career.news.level', { name: n.name, piece: t(`piece.${n.type}`), level: n.level })];
    }
}

/** The map, the journal or the pieces' guide (piece-guide.js), one at a time (chosen on the club's page). */
function showView(view) {
    if (view === 'guide') renderGuide(ui.guide, club);
    ui.title.textContent = t({ map: 'career.tabMap', journal: 'career.tabJournal', guide: 'guide.tab' }[view]);
    ui.stage.hidden = view !== 'map';
    ui.journal.hidden = view !== 'journal';
    ui.guide.hidden = view !== 'guide';
}

/** The tier whose quests `discovered` holds (it starts again on another tier). */
let discoveredTier = '';

function showTier(place) {
    if (discoveredTier !== career.tier) { discovered.clear(); discoveredTier = career.tier; }
    map.show(career.tier, place, club);
    ui.canvas.setAttribute('aria-label', t('career.mapLabel', { map: t(`career.map.${career.tier}`) }));
    ui.mapTitle.textContent = t(`career.map.${career.tier}`);
    renderHeader();
    renderMarkers();
    renderJournal();
    showCard(place);
}

ui.back.addEventListener('click', () => toClub());
ui.tourButton.addEventListener('click', runTour);

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
 * @param {{ onClub: () => void, onPlay: (spec: { kind: 'league' | 'quest', questId?: string, recruitType?: string }) => void, word?: string, knockedOut?: boolean, view?: string }} handlers
 *   onClub: back to the club's page; onPlay: play a tournament match or a quest; word: what
 *   Gérard says first (his comment on the match just played; his welcome to the map
 *   otherwise); knockedOut: the match just played knocked the club out (the black screen);
 *   view: the tab shown first ('map', 'journal' or 'guide'; the club page's buttons), or
 *   'tour': Gérard's tour (it also opens by itself the first time)
 */
export function openCareer(theClub, { onClub, onPlay, word = '', knockedOut = false, view = 'map' }) {
    club = theClub;
    toClub = () => { closeCareer(); onClub(); };
    play = onPlay;
    career = loadCareer();
    if (!career) { career = newCareer(); save(); }
    showTier('home');
    showView(['map', 'journal', 'guide'].includes(view) ? view : 'map');
    map.start();
    gerard.start();
    gerard.say(word || t(`career.intro.${career.tier}`));
    blinking = true;
    requestAnimationFrame(blinkLoop);
    if (knockedOut && Career.knockedOut(career)) showKnockedOut();
    else if (view === 'tour' || !tourSeen()) runTour();
}

/** Knocked out: the screen goes black, Gérard says it is over until next season (over the map or the club). */
export function showKnockedOut() {
    const current = loadCareer() || career; // As saved just now (the match may have ended the tournament)
    if (!current) return;
    const place = Career.placing(current);
    ui.out.innerHTML = `<div class="career-out-box">
        <canvas width="56" height="56" id="career-out-gerard" role="img" aria-label="${esc(t('commissioner.portrait'))}"></canvas>
        <h2 id="career-out-title">${esc(t('career.out.title'))}</h2>
        <p>${esc(t(place === 2 ? 'career.out.final' : 'career.out.text', { place, tournament: t(`career.tournament.${current.tier}`) }))}</p>
        <p class="muted">${esc(t('career.out.after'))}</p>
        <button type="button" class="btn-primary" data-action="out-close">${esc(t('career.out.close'))}</button>
      </div>`;
    ui.out.hidden = false;
    const portrait = /** @type {HTMLCanvasElement} */ (ui.out.querySelector('canvas'));
    const g = portrait.getContext('2d'); // Gérard's portrait, as drawn beside his bubble
    if (g) { g.imageSmoothingEnabled = false; g.drawImage(/** @type {HTMLCanvasElement} */ ($('career-gerard')), 0, 0); }
    const close = /** @type {HTMLButtonElement} */ (ui.out.querySelector('[data-action="out-close"]'));
    close.addEventListener('click', () => {
        ui.out.hidden = true;
        ui.out.innerHTML = '';
        /** @type {HTMLElement | null} */ (ui.map.querySelector('.career-marker'))?.focus();
    });
    close.focus();
}

/** The career's screen is left: stop the animations. */
export function closeCareer() {
    tour?.stop();
    tour = null;
    map.stop();
    gerard.stop();
    blinking = false;
}

/** The career shown (for the tests). */
export const currentCareer = () => career;
