// @ts-check
// A career match (docs/games/chessdown-career.md): a tournament match or a side quest, played
// by the club (All Star, all-star.js) against a rival's bot. This module keeps what the
// match asks (special rules, the army allowed, the bot, the goal), follows the games, and
// once the match is over writes the result into the career and the club: the tournament,
// the quest done (or tried), the reward. Low in the import order: draft.js, bot.js,
// gameplay.js, match.js and events.js ask it; it imports none of them.
import { Engine, state } from './state.js';
import { loadCareer, saveCareer } from './career-store.js';
import { saveClub } from './club-store.js';
import { t } from '../../../assets/js/i18n.js';

const Series = globalThis.ChessdownSeries;

const Career = globalThis.ChessdownCareer;
const Quests = globalThis.ChessdownQuests;
const Club = globalThis.ChessdownClub;

/** The club's first seven players (the original squad) have ids 1 to 7 (club-rules.js newClub). */
const ORIGINAL_IDS = [1, 2, 3, 4, 5, 6, 7];

/**
 * @typedef {{ kind: 'league' | 'quest', questId?: string, coachId?: string, recruitType?: string }} CareerSpec
 */

/**
 * Start a career match. `spec.kind`: 'league' (the next matchday of the season) or 'quest'
 * (`questId`; `recruitType` for a quest whose reward is a recruit of one's choice).
 * Returns the format of its games: 'bo3', or 'single' (a quest of one game or a streak).
 * @param {CareerSpec} spec
 */
export function beginCareerMatch(spec) {
    const career = loadCareer();
    const quest = spec.kind === 'quest' ? Quests.questById(spec.questId) : null;
    const next = career && Career.nextMatch(career);
    const opponent = quest ? Career.questOpponent(career, quest) : Career.rivalOpponent(career, next.opponent);
    const rules = quest ? quest.rules : {}; // A tournament match: no special rule
    state.career = {
        kind: spec.kind,
        questId: quest ? quest.id : null,
        coachId: quest ? null : next.opponent,
        recruitType: spec.recruitType || null,
        format: quest ? quest.format : next.format,
        rules,
        tutorial: quest ? -1 : Career.tutorialStep(career),
        // A puzzle quest: its position (career-quests.js PUZZLES), and the moves played
        puzzle: quest && quest.goal.type === 'puzzle' ? Quests.PUZZLES[quest.goal.id] : null,
        puzzleMoves: 0,
        goal: quest ? quest.goal : { type: 'win' },
        opponent: { ...opponent, banned: rules.banned || [] },
        streak: 0,
        touchdowns: 0,
        captures: 0, // Pieces player 1 took this match
        opponentMoves: 0, // Moves the other side played this match (holding out)
        lostPiece: false, // A piece of player 1 was taken (a clean sheet is gone)
        /** @type {string[]} */
        touchdownTypes: [],
        /** @type {number[]} */
        engaged: [],
        /** @type {{ id: number, r: number, c: number }[] | null} */
        lineup: null,
        finished: false,
    };
    return state.career.format;
}

/** Back to classic play. */
export function endCareerMatch() {
    state.career = null;
}

export const isCareerMatch = () => Boolean(state.career);

// ---------- What the match asks ----------
/** The army player 1 may field (Engine.checkArmy), or null outside the career. */
export function careerArmy() {
    const c = state.career;
    if (!c) return null;
    const r = c.rules;
    return {
        ...(r.squad ? { squad: r.squad } : {}),
        ...(r.banned ? { banned: r.banned } : {}),
        ...(r.maxPieces ? { maxPieces: r.maxPieces } : {}),
        ...(r.invertedRows ? { invertedRows: true } : {}),
        ...(r.originalSquad ? { allowedIds: ORIGINAL_IDS } : {}),
        budget: r.budget || Engine.MAX_POINTS,
    };
}

/** May this club player go on the board now (the quest's squad, banned types, size, players)? */
export function benchAllows(player, onBoard) {
    const army = careerArmy();
    if (!army) return true;
    if (army.banned && army.banned.includes(player.type)) return false;
    if (army.allowedIds && !army.allowedIds.includes(player.id)) return false;
    if (army.maxPieces && onBoard.length >= army.maxPieces) return false;
    if (army.squad) {
        const left = army.squad.slice();
        for (const type of onBoard) { const i = left.indexOf(type); if (i >= 0) left.splice(i, 1); }
        if (!left.includes(player.type)) return false;
    }
    return true;
}

/** Player 1 drafts on the rows nearest the middle. */
export const invertedRows = () => Boolean(state.career && state.career.rules.invertedRows);

/** The bot's army and level, or null outside the career. */
export const careerOpponent = () => (state.career ? state.career.opponent : null);

/** Seconds a turn: the quest's, else the 30 s of the career (2 minutes to think on a puzzle); null outside the career. */
export function careerTimer() {
    if (!state.career) return null;
    const r = state.career.rules;
    // A blitz that speeds up: its own turn time for each game of the best of 3
    const step = r.timerSteps ? r.timerSteps[Math.min(state.series ? state.series.games : 0, r.timerSteps.length - 1)] : 0;
    return { mode: 'turn', seconds: state.career.puzzle ? 120 : step || r.timer || 30 };
}

/** Player 1's draft points in a career match (fewer in an underdog match); null outside the career. */
export function careerBudget() {
    return state.career ? state.career.rules.budget || Engine.MAX_POINTS : null;
}

/** Touchdowns do not count in this match (take the king). */
export const careerNoTouchdowns = () => Boolean(state.career && state.career.rules.noTouchdowns);

/**
 * A move was played (by `mover`, taking `captured` pieces): the match's counts. Returns how
 * the quest's goal ends the game now, or null: 'survived' (held out its turns) or 'captures'
 * (the n-th piece taken).
 * @returns {'survived' | 'captures' | null}
 */
export function careerAfterMove(mover, captured) {
    const c = state.career;
    if (!c || c.puzzle) return null;
    if (mover === 1) c.captures += captured;
    else {
        c.opponentMoves++;
        if (captured) c.lostPiece = true;
    }
    if (c.goal.type === 'captures' && mover === 1 && c.captures >= c.goal.n) return 'captures';
    if (c.goal.type === 'survive' && mover === 2 && c.opponentMoves >= c.goal.n) return 'survived';
    return null;
}

// ---------- Puzzles ----------
/** The puzzle being played, or null. */
export const careerPuzzle = () => (state.career ? state.career.puzzle : null);

/**
 * A turn starts during a puzzle: the other side answers (bot.js, bot-search.js
 * puzzleDefense); player 1's moves are counted, and once they are all played without a
 * score the puzzle is lost ('out').
 * @returns {'out' | null}
 */
export function puzzleTurn(player) {
    const c = state.career;
    if (!c || !c.puzzle) return null;
    if (player === 2) return null;
    if (c.puzzleMoves >= c.puzzle.moves) return 'out';
    c.puzzleMoves++;
    return null;
}

/** Player 1's moves still to come in the puzzle (the defence looks that far). */
export function puzzleMovesLeft() {
    const c = state.career;
    return c && c.puzzle ? Math.max(0, c.puzzle.moves - c.puzzleMoves) : 0;
}

/** "Move 2 of 3" during a puzzle: { n, total }, or null. */
export function puzzleCounter() {
    const c = state.career;
    return c && c.puzzle ? { n: Math.max(1, c.puzzleMoves), total: c.puzzle.moves } : null;
}

/** The puzzle's position on the board (player 1's pieces, the other side's king and stones). */
export function setPuzzleBoard() {
    const p = careerPuzzle();
    if (!p) return;
    state.board = Engine.createBoard();
    for (const [r, c, type, level] of p.mine) {
        // A player of the club takes the puzzle's piece (the one of that type with the most
        // experience): it plays it, and gets the quest's experience.
        const member = state.allStar && type !== 'k'
            ? state.allStar.club.players.filter((m) => m.type === type).sort((a, b) => b.xp - a.xp)[0]
            : null;
        state.board[r][c] = { type, player: 1, hasMoved: true, level, ...(member ? { clubId: member.id } : {}) };
        if (member && state.career && !state.career.engaged.includes(member.id)) state.career.engaged.push(member.id);
    }
    state.board[p.king[0]][p.king[1]] = { type: 'k', player: 2, hasMoved: true };
    for (const [r, c] of p.stones) state.board[r][c] = { type: 'p', player: 2, hasMoved: true }; // Classic pawns: no level badge
    state.kingsPlaced = { 1: true, 2: true };
    state.lastMove = null;
}

/** Fresh special rules for a game (engine.js matchRules), or null. */
export function careerGameRules() {
    const c = state.career;
    if (!c || (!c.rules.noRetreat && !c.rules.noCaptureMoves && !c.rules.noKingCapture)) return null;
    return Engine.matchRules({
        ...(c.rules.noRetreat ? { noRetreat: [1] } : {}),
        ...(c.rules.noCaptureMoves ? { noCaptureMoves: { 1: c.rules.noCaptureMoves } } : {}),
        ...(c.rules.noKingCapture ? { noKingCapture: [1] } : {}),
    });
}

/** The line-up to play again (a quest with a locked line-up, after its first game), or null. */
export const lockedLineup = () => (state.career && state.career.rules.lockedLineup ? state.career.lineup : null);

/** The draft is done: what the army is, and the line-up kept when it is locked. */
export function noteDraft(pieces) {
    const c = state.career;
    if (!c) return;
    for (const p of pieces) if (p.clubId && !c.engaged.includes(p.clubId)) c.engaged.push(p.clubId);
    if (c.rules.lockedLineup && !c.lineup) c.lineup = pieces.filter((p) => p.clubId).map((p) => ({ id: p.clubId, r: p.r, c: p.c }));
}

/** A touchdown: by whom, and with which pieces (those in the end zone). */
export function noteCareerTouchdown(player, types) {
    const c = state.career;
    if (!c || player !== 1) return;
    c.touchdowns++;
    for (const type of types) if (!c.touchdownTypes.includes(type)) c.touchdownTypes.push(type);
}

// ---------- The end ----------
/**
 * A game is over (winner 1, 2, or 0 for a draw; the series already counts it). Returns
 * whether the career match is over now, and the lines for the end screen.
 * @returns {{ finished: boolean, lines: string[], next?: string } | null}
 */
export function careerAfterGame(winner) {
    const c = state.career;
    if (!c) return null;
    if (c.goal.type === 'streak') {
        if (winner === 1) c.streak++;
        const done = winner !== 1 || c.streak >= c.goal.n;
        if (!done) return { finished: false, lines: [], next: t('career.nextGame', { n: c.streak + 1, total: c.goal.n }) };
        return finish(c.streak >= c.goal.n);
    }
    if (!state.series.over) return { finished: false, lines: [] };
    const won = state.series.winner === 1;
    const g = c.goal;
    if (c.kind === 'league') {
        // A tournament's single game must have a winner: a draw is played again.
        if (state.series.format === 'single' && state.series.winner === 0) {
            state.series = Series.newSeries('single');
            return { finished: false, lines: [t('career.result.replay')], next: t('career.replay') };
        }
        return finish(won);
    }
    if (g.type === 'touchdownWith') return finish(c.touchdownTypes.includes(g.piece));
    if (g.type === 'touchdowns') return finish(c.touchdowns >= g.n);
    if (g.type === 'cleanSheet') return finish(won && !c.lostPiece);
    return finish(won); // A win; holding out or the n-th piece taken ends the game as a win
}

/** The match just played knocked the club out of the tournament (the black screen follows). */
export const careerKnockedOut = () => Boolean(state.career && state.career.knockedOut);

/**
 * What Gérard says back on the map after a tournament match: the result, and in the first
 * season in town what comes next. '' for a quest or before the match is over.
 */
export function careerWord() {
    const c = state.career;
    if (!c || !c.finished || c.kind !== 'league') return '';
    if (c.knockedOut) return ''; // The black screen says it (career-view.js)
    const s = state.series;
    const result = t(s.winner === 1 ? 'career.debrief.won' : s.winner === 2 ? 'career.debrief.lost' : 'career.debrief.drawn');
    return c.tutorial >= 0 ? `${result} ${t(`career.debrief.tutorial.${c.tutorial}`)}` : result;
}

/** Write the result into the career and the club; the lines say what it brought. */
function finish(success) {
    const c = state.career;
    c.finished = true;
    let career = loadCareer();
    const lines = [];
    if (!career) return { finished: true, lines };
    if (c.kind === 'league') {
        const after = Career.recordSeries(career, { won: state.series.wins[1], lost: state.series.wins[2] });
        if (after) career = after;
        const next = Career.nextMatch(career);
        const stage = (id) => t(`career.stage.${id}`);
        if (next) {
            // Still in the running: through, or down to the losers' bracket
            lines.push(t(success ? 'career.result.through' : 'career.result.toLosers', { stage: stage(next.stage) }));
        } else if (Career.placing(career) === 1) {
            lines.push(t('career.result.title'));
            const transport = Quests.TRANSPORT[career.tier];
            if (transport && !career.tickets.includes(Career.TIER_IDS[Career.TIER_IDS.indexOf(career.tier) + 1])) {
                lines.push(t('career.result.ticket', { transport: t(`career.transport.${transport}`) }));
            }
        } else {
            lines.push(t('career.result.out', { place: Career.placing(career) }));
            c.knockedOut = true; // Back on the map: the black screen
        }
    } else {
        const quest = Quests.questById(c.questId);
        career = Career.attemptQuest(career, quest.id, success) || career;
        const title = t(`quest.${quest.id}.title`);
        if (success) {
            lines.push(t('career.result.questDone', { title }));
            const reward = giveReward(quest.reward, c);
            if (reward) lines.push(reward);
        } else {
            lines.push(t('career.result.questFailed', { title }));
        }
    }
    saveCareer(career);
    return { finished: true, lines };
}

/** The quest's reward, given to the club (kept); returns the line that says it. */
function giveReward(reward, c) {
    if (!state.allStar) return '';
    let club = state.allStar.club;
    let line = '';
    if (reward.xp) {
        const { to, amount } = reward.xp;
        const gets = (p) => to === 'all' || (to === 'engaged' ? c.engaged.includes(p.id) : p.type === to);
        club = { ...club, players: club.players.map((p) => (gets(p) ? Club.gainXp(p, amount) : p)) };
        line = t('career.result.xp', { n: amount });
    } else if (reward.recruit || reward.recruitChoice) {
        const type = reward.recruit ? reward.recruit.type : (c.recruitType || 'p');
        const level = reward.recruit ? reward.recruit.level : reward.recruitChoice.level;
        const before = club.players.length;
        club = Club.recruit(club, type, reward.recruit && reward.recruit.name ? reward.recruit.name : '', { level, fromQuest: true });
        const added = club.players.length > before ? club.players[club.players.length - 1] : null;
        line = added ? t('career.result.recruit', { name: added.name, piece: t(`piece.${type}`), level }) : t('career.result.squadFull');
    } else if (reward.cosmetic) {
        club = { ...club, cosmetics: [...new Set([...(club.cosmetics || []), reward.cosmetic])] };
        line = t('career.result.cosmetic', { item: t(`reward.cosmetic.${reward.cosmetic}`) });
    }
    state.allStar.club = club;
    saveClub(club);
    return line;
}
