// @ts-check
// The tournament's progress (career-rules.js bracket): the winners' bracket, the losers'
// bracket and the grand final as rows of rounds, the club's road in gold (each match played
// with its score, the next one with its opponent), how many clubs are still in, and the whole
// bracket folded away. Shown before a tournament match and on its end screen (events.js,
// gameplay.js).
import { esc } from './club-art.js';
import { t } from '../../../assets/js/i18n.js';

const Career = globalThis.ChessdownCareer;
/** @type {[string, string[]][]} */
const ROWS = [['W', ['W1', 'W2', 'W3', 'W4', 'W5']], ['L', ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']], ['G', ['GF']]];

/** The progress of the career's tournament, as HTML. @param {any} career @param {any} club */
export function bracketProgress(career, club) {
    const b = Career.bracket(career);
    const you = Career.YOU;
    const name = (id) => (id === you ? club.name : Career.coachOf(career, id).club);
    // Each stage: the club's match there (played or next)
    /** @type {Record<string, { state: string, text: string }>} */
    const road = {};
    for (const stage of b.stages) {
        const m = stage.matches.find((x) => x.a === you || x.b === you);
        if (!m) continue;
        const [mine, theirs, other] = m.a === you ? [m.wa, m.wb, m.b] : [m.wb, m.wa, m.a];
        road[stage.id] = { state: mine > theirs ? 'won' : 'lost', text: t('bracket.played', { club: name(other), score: `${mine}–${theirs}` }) };
    }
    if (b.next) road[b.next.stage] = { state: 'next', text: t('bracket.next', { club: name(b.next.opponent) }) };
    // Clubs still in: fewer than two defeats in the matches played so far
    const defeats = {};
    for (const stage of b.stages) for (const m of stage.matches) {
        const loser = m.wa > m.wb ? m.b : m.a;
        defeats[loser] = (defeats[loser] || 0) + 1;
    }
    const alive = b.champion ? 1 : Career.fieldOf(career).filter((id) => (defeats[id] || 0) < 2).length;
    const status = b.next ? t(b.losses ? 'career.journal.inLosers' : 'career.journal.inWinners')
        : b.place === 1 ? t('career.journal.champion') : t('career.journal.finished', { place: b.place });
    const rows = ROWS.map(([key, stages]) => `<div class="bracket-row">
        <h4>${esc(t(`bracket.row.${key}`))}</h4>
        <ol>${stages.map((id) => {
            const step = road[id];
            const label = t(`bracket.short.${id}`);
            return `<li class="${step ? step.state : 'future'}"${step && step.state === 'next' ? ' aria-current="step"' : ''}>
                <span class="bracket-round">${esc(label)}</span>${step ? `<span class="bracket-match">${step.state === 'won' ? '✓ ' : step.state === 'lost' ? '✗ ' : ''}${esc(step.text)}</span>` : ''}</li>`;
        }).join('')}</ol></div>`).join('');
    return `<div class="bracket-progress">
        <h3>${esc(t(`career.tournament.${career.tier}`))}</h3>
        <p class="bracket-status">${esc(status)} ${esc(t('bracket.alive', { n: alive }))}</p>
        ${rows}
        <details class="career-bracket"><summary>${esc(t('career.journal.bracket'))}</summary><ul>${b.stages.filter((st) => st.matches.length).map((st) => `<li><b>${esc(t(`career.stage.${st.id}`))}</b>
          <ul>${st.matches.map((m) => `<li class="${m.a === you || m.b === you ? 'you' : ''}">${esc(name(m.a))} ${m.wa}–${m.wb} ${esc(name(m.b))}</li>`).join('')}</ul></li>`).join('')}</ul></details>
      </div>`;
}
