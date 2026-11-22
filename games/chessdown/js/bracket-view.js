// @ts-check
// The tournament's bracket (career-rules.js bracket), drawn as a tree: 16 clubs on the left,
// 16 on the right, the rounds closing in on the final in the middle. Each match shows its two
// clubs and their score (the winner bright, the loser dim); the club's road is in gold, its
// next match outlined. Matches not played yet show who is known so far. Shown before a
// tournament match and on its end screen (events.js, gameplay.js); the list of every match
// is folded below for screen readers and small screens.
import { esc } from './club-art.js';
import { t } from '../../../assets/js/i18n.js';

const Career = globalThis.ChessdownCareer;
const ROUNDS = ['R1', 'R2', 'QF', 'SF', 'F'];
const BOX_W = 136;
const BOX_H = 38;
const GAP_X = 18; // Between two columns: the branches
const STEP_Y = 46; // Between two first-round matches
const TOP = 30; // Room for the rounds' names
const MAX_NAME = 17;

const short = (name) => (name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name);

/**
 * Every match of the tree: who plays (when known) and the score (when played), round by
 * round, in bracket order.
 */
function treeOf(career) {
    const b = Career.bracket(career);
    const played = new Map(); // "a|b" -> the match
    for (const stage of b.stages) for (const m of stage.matches) played.set(`${m.a}|${m.b}`, m);
    /** @type {{ a: string | null, b: string | null, wa: number | null, wb: number | null }[][]} */
    const rounds = [];
    /** @type {(string | null)[]} */
    let clubs = Career.fieldOf(career);
    // The club's round is played at the same time as its own match: its results show after it
    const now = b.next ? ROUNDS.indexOf(b.next.stage) : ROUNDS.length;
    for (let k = 0; k < ROUNDS.length; k++) {
        const round = [];
        for (let i = 0; i < clubs.length; i += 2) {
            const a = clubs[i], c = clubs[i + 1];
            const m = a && c && k < now ? played.get(`${a}|${c}`) : null;
            round.push({ a: a || null, b: c || null, wa: m ? m.wa : null, wb: m ? m.wb : null });
        }
        rounds.push(round);
        clubs = round.map((m) => (m.wa === null || m.wb === null ? null : m.wa > m.wb ? m.a : m.b));
    }
    return { rounds, b };
}

/**
 * The bracket and where the club stands, as HTML (`heading`: false leaves out the tournament's
 * name and the status line, when the page around it says them).
 * @param {any} career @param {any} club @param {{ heading?: boolean }} [options]
 */
export function bracketProgress(career, club, { heading = true } = {}) {
    const { rounds, b } = treeOf(career);
    const you = Career.YOU;
    const name = (id) => (id === null ? t('bracket.tbd') : id === you ? club.name : Career.coachOf(career, id).club);
    // Columns: left R1, R2, QF, SF; the final in the middle; right SF, QF, R2, R1
    const cols = ROUNDS.length * 2 - 1;
    const width = cols * BOX_W + (cols - 1) * GAP_X;
    const height = TOP + 8 * STEP_Y;
    const colX = (k, side) => (side === 'L' ? k : cols - 1 - k) * (BOX_W + GAP_X);
    /** The middle height of the j-th match of round k on a side (8 first-round matches a side). */
    const midY = (k, j) => TOP + ((j + 0.5) * 2 ** k) * STEP_Y;
    const parts = [];
    // Rounds' names
    for (let k = 0; k < ROUNDS.length; k++) {
        for (const side of k === ROUNDS.length - 1 ? ['C'] : ['L', 'R']) {
            const x = (side === 'C' ? ((cols - 1) / 2) * (BOX_W + GAP_X) : colX(k, side)) + BOX_W / 2;
            parts.push(`<text class="bt-round" x="${x}" y="16" text-anchor="middle">${esc(t(`career.stage.${ROUNDS[k]}`))}</text>`);
        }
    }
    const box = (m, x, yMid, next) => {
        const mine = m.a === you || m.b === you;
        const decided = m.wa !== null && m.wb !== null;
        const line = (id, score, won, dy) => {
            const cls = [id === you ? 'you' : '', won === false ? 'lost' : '', id === null ? 'tbd' : ''].join(' ');
            return `<text class="bt-name ${cls}" x="${x + 6}" y="${yMid + dy}">${esc(short(name(id)))}</text>`
                + (score === null ? '' : `<text class="bt-score ${cls}" x="${x + BOX_W - 6}" y="${yMid + dy}" text-anchor="end">${score}</text>`);
        };
        return `<rect class="bt-box ${mine ? 'mine' : ''} ${next ? 'next' : ''}" x="${x}" y="${yMid - BOX_H / 2}" width="${BOX_W}" height="${BOX_H}" rx="4"/>
            <line class="bt-split" x1="${x}" x2="${x + BOX_W}" y1="${yMid}" y2="${yMid}"/>
            ${line(m.a, m.wa, decided ? m.wa > m.wb : null, -6)}${line(m.b, m.wb, decided ? m.wb > m.wa : null, 13)}`;
    };
    const isNext = (m) => Boolean(b.next) && (m.a === you || m.b === you) && m.wa === null;
    const wonByYou = (m) => m.wa !== null && ((m.a === you && m.wa > m.wb) || (m.b === you && m.wb > m.wa));
    for (let k = 0; k < ROUNDS.length - 1; k++) {
        const half = rounds[k].length / 2;
        rounds[k].forEach((m, i) => {
            const side = i < half ? 'L' : 'R';
            const j = side === 'L' ? i : i - half;
            const x = colX(k, side);
            const y = midY(k, j);
            parts.push(box(m, x, y, isNext(m)));
            // The branch to the next round (the semi-finals' to the final, in the middle)
            const toY = k === ROUNDS.length - 2 ? TOP + 4 * STEP_Y : midY(k + 1, Math.floor(j / 2));
            const out = side === 'L' ? x + BOX_W : x;
            const mid = side === 'L' ? out + GAP_X / 2 : out - GAP_X / 2;
            const end = side === 'L' ? out + GAP_X : out - GAP_X;
            parts.push(`<path class="bt-branch ${wonByYou(m) ? 'road' : ''}" d="M${out} ${y} H${mid} V${toY} H${end}"/>`);
        });
    }
    // The final, in the middle, and the champion above it
    const final = rounds[ROUNDS.length - 1][0];
    const fx = ((cols - 1) / 2) * (BOX_W + GAP_X);
    const fy = TOP + 4 * STEP_Y;
    parts.push(box(final, fx, fy, isNext(final)));
    if (b.champion) {
        parts.push(`<text class="bt-champion ${b.champion === you ? 'you' : ''}" x="${fx + BOX_W / 2}" y="${fy - BOX_H / 2 - 10}" text-anchor="middle">★ ${esc(t('bracket.champion'))} · ${esc(short(name(b.champion)))}</text>`);
    }
    const out = new Set();
    for (const round of rounds) for (const m of round) if (m.wa !== null && m.wb !== null) out.add(m.wa > m.wb ? m.b : m.a);
    const alive = Career.FIELD - out.size;
    const status = b.next ? t('career.journal.inRunning') : b.place === 1 ? t('career.journal.champion') : t('career.journal.finished', { place: b.place });
    return `<div class="bracket-progress">
        ${heading ? `<h3>${esc(t(`career.tournament.${career.tier}`))}</h3>
        <p class="bracket-status">${esc(status)}${b.next ? ` ${esc(t('bracket.alive', { n: alive }))}` : ''}</p>` : ''}
        <div class="bracket-tree" tabindex="0" role="region" aria-label="${esc(t('bracket.title'))}">
          <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false">${parts.join('')}</svg>
        </div>
        <details class="career-bracket"><summary>${esc(t('career.journal.bracket'))}</summary><ul>${rounds.map((round, k) => `<li><b>${esc(t(`career.stage.${ROUNDS[k]}`))}</b>
          <ul>${round.map((m) => `<li class="${m.a === you || m.b === you ? 'you' : ''}">${esc(name(m.a))} ${m.wa === null ? '–' : `${m.wa}–${m.wb}`} ${esc(name(m.b))}</li>`).join('')}</ul></li>`).join('')}</ul></details>
      </div>`;
}

/** Scroll a bracket shown in `root` to the club's next match (or its last one). @param {HTMLElement} root */
export function scrollBracketToClub(root) {
    const tree = /** @type {HTMLElement | null} */ (root.querySelector('.bracket-tree'));
    const mine = root.querySelector('.bt-box.next') || [...root.querySelectorAll('.bt-box.mine')].pop() || null;
    if (!tree || !mine) return;
    const r = mine.getBoundingClientRect(), box = tree.getBoundingClientRect();
    tree.scrollLeft += r.left - box.left - (box.width - r.width) / 2;
}
