// @ts-check
// Ladders (docs/games/chessdown-ladders.md): the ranked queue (a best of 3 against a player
// of close rating), the rating change at the end of the series, and the leaderboards of
// the month (signed-in players only). The server pairs players and keeps the ratings.
import { socket, state, ui } from './state.js';
import { showScreen } from './board-view.js';
import { esc } from './club-art.js';
import { language, t } from '../../../assets/js/i18n.js';

const screen = () => /** @type {HTMLElement} */ (document.getElementById('queue-screen'));
let waitTimer = 0;
let waitingSince = 0;

/** The month of a season ('2026-11') in the page's language. */
function monthOf(season) {
    const [y, m] = season.split('-').map(Number);
    return new Intl.DateTimeFormat(language(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const modeName = (mode) => t(mode === 'allstar' ? 'ladder.allStar' : 'ladder.classic');

function stopWaiting() {
    clearInterval(waitTimer);
    waitTimer = 0;
}

/** Wait in the queue of a ladder ('classic' or 'allstar'). */
export function joinQueue(mode) {
    if (!socket) return;
    socket.emit('joinQueue', { mode });
}

/** The server put the page in the queue: the waiting screen, with the time spent. */
export function queueJoined({ mode, rating }) {
    const info = /** @type {HTMLElement} */ (document.getElementById('queue-info'));
    const time = /** @type {HTMLElement} */ (document.getElementById('queue-time'));
    info.textContent = t('ladder.queueInfo', { mode: modeName(mode), rating });
    waitingSince = Date.now();
    const tick = () => {
        const s = Math.floor((Date.now() - waitingSince) / 1000);
        time.textContent = t('ladder.waited', { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
    };
    tick();
    stopWaiting();
    waitTimer = window.setInterval(tick, 1000);
    showScreen(screen());
}

/** Out of the queue (cancelled): back to the menu. */
export function leaveQueue() {
    stopWaiting();
    if (socket) socket.emit('leaveQueue');
    showScreen(ui.mainMenu);
    document.getElementById('btn-ranked')?.focus();
}

/** Paired: a ranked best of 3 starts (the draft follows with 'gameStarted'). */
export function rankedMatch({ roomCode, playerNumber, mode }) {
    stopWaiting();
    state.currentRoomCode = roomCode;
    state.myPlayerNumber = playerNumber;
    state.isBotMatch = false;
    state.ranked = mode;
}

/** The end screen's line: the rating before and after the series (or why it did not count). */
export function showLadderResult({ mode, counted, before, after }) {
    const box = /** @type {HTMLElement} */ (document.getElementById('victory-ladder'));
    const diff = after - before;
    box.textContent = counted
        ? t('ladder.result', { mode: modeName(mode), before, after, diff: diff >= 0 ? `+${diff}` : String(diff) })
        : t('ladder.notCounted');
    box.hidden = false;
}

export function hideLadderResult() {
    const box = document.getElementById('victory-ladder');
    if (box) box.hidden = true;
}

/** The board of one ladder, drawn in the panel. */
async function showBoard(mode) {
    const panel = /** @type {HTMLElement} */ (document.getElementById('ladder-panel'));
    document.querySelectorAll('.ladder-tabs [role="tab"]').forEach((tab) => {
        const on = /** @type {HTMLElement} */ (tab).dataset.mode === mode;
        tab.setAttribute('aria-selected', String(on));
        tab.setAttribute('tabindex', on ? '0' : '-1');
        if (on) panel.setAttribute('aria-labelledby', tab.id);
    });
    panel.textContent = t('ladder.loading');
    let board;
    try {
        const res = await fetch(`/api/ladders/${mode}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error();
        board = await res.json();
    } catch {
        panel.textContent = t('ladder.unavailable');
        return;
    }
    const me = board.me;
    const mine = me.series
        ? t('ladder.mine', { rating: me.rating, rank: me.rank, wins: me.wins, losses: me.losses, draws: me.draws })
        : t('ladder.mineNone', { rating: me.rating });
    const rows = board.top.map((r) => `<tr${state.account && r.username === state.account.username ? ' class="ladder-me"' : ''}>
        <td>${r.rank}</td><th scope="row">${esc(r.username)}</th><td>${r.rating}</td><td>${r.wins}–${r.losses}–${r.draws}</td></tr>`).join('');
    panel.innerHTML = `
      <p class="ladder-season">${esc(t('ladder.season', { month: monthOf(board.season), n: board.daysLeft }))}</p>
      <p class="ladder-mine">${esc(mine)}${me.hidden ? ` <span class="muted">${esc(t('ladder.hiddenNote'))}</span>` : ''}</p>
      ${board.top.length ? `<div class="ladder-table-wrap" tabindex="0" role="region" aria-label="${esc(t('ladder.tableLabel', { mode: modeName(mode) }))}">
        <table class="career-table ladder-table">
          <thead><tr><th scope="col">${esc(t('ladder.rank'))}</th><th scope="col">${esc(t('ladder.player'))}</th><th scope="col">${esc(t('ladder.rating'))}</th><th scope="col">${esc(t('ladder.record'))}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : `<p class="muted">${esc(t('ladder.empty'))}</p>`}
      <p class="ladder-podium">${board.podium.length
        ? esc(t('ladder.podium', { month: monthOf(board.previousSeason), names: board.podium.map((p, i) => `${i + 1}. ${p.username} (${p.rating})`).join(', ') }))
        : esc(t('ladder.noPodium', { month: monthOf(board.previousSeason) }))}</p>
      <p class="muted ladder-rules">${esc(t('ladder.rules'))}</p>`;
}

/** The leaderboards screen, on a ladder. */
export function openLadder(mode = 'classic') {
    showScreen(/** @type {HTMLElement} */ (document.getElementById('ladder-screen')));
    showBoard(mode);
}

/** Tabs and buttons of the ladder screens (events.js). */
export function setupLadder({ onRanked }) {
    document.getElementById('btn-ranked')?.addEventListener('click', onRanked);
    document.getElementById('btn-leaderboard')?.addEventListener('click', () => openLadder());
    document.getElementById('btn-leave-queue')?.addEventListener('click', leaveQueue);
    document.getElementById('btn-ladder-back')?.addEventListener('click', () => {
        showScreen(ui.mainMenu);
        document.getElementById('btn-leaderboard')?.focus();
    });
    const tabs = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.ladder-tabs [role="tab"]')]);
    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => showBoard(tab.dataset.mode));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            next.focus();
            showBoard(next.dataset.mode);
        });
    });
}
