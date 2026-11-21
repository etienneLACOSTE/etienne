// Chessdown career (games/chessdown/career-*.js): rival coaches, the quest catalogue, the
// tournaments (32 clubs, double elimination), tickets, travel, side quests, the calendar and
// the checks on a stored career.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Coaches = require('../../games/chessdown/career-coaches.js');
const Quests = require('../../games/chessdown/career-quests.js');
const Career = require('../../games/chessdown/career-rules.js');
const Club = require('../../games/chessdown/club-rules.js');

const HEX = /^#[0-9a-f]{6}$/;

/** Play the season to its end, every match won (or lost: `win` false). */
function playSeason(career, win = true) {
    let c = career;
    for (let m = Career.nextMatch(c); m; m = Career.nextMatch(c)) {
        const bo3 = m.format === 'bo3';
        c = Career.recordSeries(c, win ? { won: bo3 ? 2 : 1, lost: 0 } : { won: 0, lost: bo3 ? 2 : 1 });
    }
    return c;
}
const ONE = { won: 1, lost: 0 };
const LOSS = { won: 0, lost: 1 };
/** Win seasons until the ticket to `tier`, then travel there. */
function reach(tier, seed = 7) {
    let c = Career.newCareer(seed);
    while (c.tier !== tier) {
        const next = Career.TIER_IDS[Career.TIER_IDS.indexOf(c.tier) + 1];
        c = Career.finishSeason(playSeason(c)).career;
        c = Career.travel(c, next);
    }
    return c;
}

test('rival coaches: enough per tier, each one complete and recognisable', () => {
    assert.equal(new Set(Coaches.COACHES.map((c) => c.id)).size, Coaches.COACHES.length);
    for (const tier of Career.TIER_IDS) {
        const t = Career.TIERS[tier];
        assert.ok(Coaches.coachesOf(tier).length >= 4, tier);
        assert.equal(Career.rivalsOf(Career.newCareer(1), tier).length, Career.FIELD - 1, '31 rivals');
    }
    for (const c of Coaches.COACHES) {
        assert.ok(Coaches.ARCHETYPES.includes(c.archetype), c.id);
        assert.ok(c.strength >= 0 && c.strength <= 1, c.id);
        assert.ok(c.name && c.club, c.id);
        assert.match(c.colors.primary, HEX); assert.match(c.colors.secondary, HEX);
        assert.ok(Club.PATTERNS.includes(c.colors.pattern) && Club.SHAPES.includes(c.colors.shape) && Club.EMBLEMS.includes(c.colors.emblem), c.id);
        for (const [key, values] of Object.entries(Coaches.LOOK)) assert.ok(values.includes(c.look[key]), `${c.id} ${key}`);
        assert.match(c.look.skin, HEX); assert.match(c.look.hair, HEX); assert.match(c.look.top, HEX);
    }
});

test('the quest catalogue: every quest is well formed, 11 per tier, enough for a first season', () => {
    assert.equal(new Set(Quests.QUESTS.map((q) => q.id)).size, Quests.QUESTS.length);
    for (const q of Quests.QUESTS) assert.deepEqual(Quests.checkQuest(q), [], q.id);
    for (const tier of Career.TIER_IDS) {
        const quests = Quests.QUESTS.filter((q) => q.tier === tier);
        assert.equal(quests.length, 11, tier);
        assert.ok(quests.filter((q) => q.minSeason === 1 && Career.PLAYABLE_GOALS.includes(q.goal.type)).length >= Career.TIERS[tier].quests, tier);
    }
    // The checks catch mistakes
    const bad = { ...Quests.QUESTS[0], place: 'stadium', rules: { squad: ['p', 'p'], fly: true }, reward: { xp: { to: 'all', amount: 10 }, cosmetic: 'old-jersey' } };
    assert.deepEqual(Quests.checkQuest(bad), ['place', 'rule fly', 'squad', 'one reward']);
    const odd = { ...Quests.QUESTS[0], format: 'bo3', rules: { noTouchdowns: true, noKingCapture: true, timerSteps: [20, 15] }, goal: { type: 'survive', n: 2 } };
    assert.deepEqual(Quests.checkQuest(odd), ['timerSteps', 'a way to win', 'goal n', 'one game']);
    assert.deepEqual(Quests.checkQuest({ ...Quests.QUESTS[0], kind: 'boss' }), ['boss']);
});

test('bosses: one per tier from the county on, a coach of their tier never met in the league', () => {
    const bosses = Quests.QUESTS.filter((q) => q.kind === 'boss');
    assert.deepEqual(bosses.map((q) => q.tier), ['county', 'region', 'national', 'international']);
    for (const q of bosses) {
        const coach = Coaches.coachById(q.opponent.boss);
        assert.ok(coach && coach.boss && coach.tier === q.tier, q.id);
        assert.ok(!Coaches.coachesOf(q.tier).includes(coach), 'not a league rival');
        assert.ok(q.opponent.army.every(([, level]) => level >= 4), 'high levels');
    }
    for (let seed = 0; seed < 40; seed++) {
        const c = Career.newCareer(seed);
        assert.ok(Career.fieldOf(c).every((id) => id === Career.YOU || !Career.coachOf(c, id).boss));
    }
});

test('a season\'s quests: one a place, so that each one shows on the map', () => {
    for (let seed = 0; seed < 60; seed++) {
        let c = Career.newCareer(seed);
        for (let s = 0; s < 3; s++) {
            const places = c.quests.drawn.map((id) => Quests.questById(id).place);
            assert.equal(new Set(places).size, places.length, `seed ${seed}`);
            c = Career.finishSeason(playSeason(c)).career;
        }
    }
});

test('generated clubs: the same from the same seed, complete, never a boss', () => {
    const a = Coaches.generatedCoach(5, 'g-county-3'), b = Coaches.generatedCoach(5, 'g-county-3'), c = Coaches.generatedCoach(6, 'g-county-3');
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
    assert.equal(Coaches.generatedCoach(5, 'g-moon-3'), null);
    assert.equal(Coaches.coachById('g-county-3'), null, 'needs the seed');
    for (const tier of Career.TIER_IDS) {
        const c = Career.newCareer(11);
        const names = Career.rivalsOf(c, tier).map((id) => Career.coachOf(c, id).club);
        assert.equal(new Set(names).size, names.length, `${tier}: every club its own name`);
    }
    for (let n = 0; n < 30; n++) {
        const g = Coaches.generatedCoach(n, Coaches.generatedId('school', n));
        assert.ok(Coaches.ARCHETYPES.includes(g.archetype) && g.strength > 0 && g.strength < 1 && g.name && g.club && !g.boss);
        assert.ok(Club.PATTERNS.includes(g.colors.pattern) && Club.SHAPES.includes(g.colors.shape) && Club.EMBLEMS.includes(g.colors.emblem));
        for (const [key, values] of Object.entries(Coaches.LOOK)) assert.ok(values.includes(g.look[key]), key);
    }
});

test('a new career: the same seed gives the same career; 32 clubs a season, drawn again each season', () => {
    const a = Career.newCareer(42), b = Career.newCareer(42);
    assert.deepEqual(a, b);
    assert.equal(a.season, 1);
    assert.equal(a.tier, 'school');
    const field = Career.fieldOf(a);
    assert.equal(field.length, 32);
    assert.equal(new Set(field).size, 32);
    assert.ok(field.includes(Career.YOU));
    assert.notDeepEqual(Career.fieldOf({ ...a, season: 2 }), field);
    assert.equal(a.quests.drawn.length, 4);
    assert.ok(a.quests.drawn.every((id) => Quests.questById(id).tier === 'school' && Quests.questById(id).minSeason === 1));
});

test('the tournament: undefeated, six matches to the title; the last ones best of 3', () => {
    let c = Career.newCareer(1);
    const stages = [];
    for (let m = Career.nextMatch(c); m; m = Career.nextMatch(c)) {
        stages.push(`${m.stage}:${m.format}`);
        c = Career.recordSeries(c, m.format === 'bo3' ? { won: 2, lost: 1 } : ONE);
    }
    assert.deepEqual(stages, ['W1:single', 'W2:single', 'W3:single', 'W4:bo3', 'W5:bo3', 'GF:bo3']);
    assert.equal(Career.placing(c), 1);
    assert.equal(Career.knockedOut(c), false);
    assert.equal(Career.recordSeries(c, ONE), null, 'nothing left to play');
    const b = Career.bracket(c);
    assert.equal(b.champion, Career.YOU);
    assert.deepEqual(b.stages.map((s) => s.matches.length), Career.STAGES.map((s) => s.matches), 'every match of the bracket played');
    const end = Career.finishSeason(c);
    assert.deepEqual([end.place, end.title, end.ticket], [1, true, 'county']);
    assert.equal(end.career.season, 2);
    assert.deepEqual(end.career.tournament.results, []);
    assert.deepEqual(end.career.titles, [{ tier: 'school', season: 1 }]);
});

test('double elimination: a first defeat to the losers\' bracket, the second one out', () => {
    let c = Career.newCareer(3);
    c = Career.recordSeries(c, LOSS);
    const m = Career.nextMatch(c);
    assert.deepEqual([m.stage, m.losses], ['L1', 1]);
    c = Career.recordSeries(c, ONE); // Through L1
    assert.equal(Career.nextMatch(c).stage, 'L2');
    c = Career.recordSeries(c, LOSS);
    assert.equal(Career.nextMatch(c), null);
    assert.equal(Career.seasonOver(c), true);
    assert.equal(Career.knockedOut(c), true);
    assert.equal(Career.placing(c), 17);
    const b = Career.bracket(c);
    assert.ok(b.champion && b.champion !== Career.YOU, 'the rest of the tournament is played without us');
    const end = Career.finishSeason(c);
    assert.deepEqual([end.title, end.ticket], [false, null]);
    // From the losers' bracket to the title: up to ten matches
    let long = Career.recordSeries(Career.newCareer(8), LOSS);
    let n = 1;
    for (let next = Career.nextMatch(long); next; next = Career.nextMatch(long)) {
        long = Career.recordSeries(long, next.format === 'bo3' ? { won: 2, lost: 0 } : ONE);
        n++;
    }
    assert.equal(n, 10);
    assert.equal(Career.placing(long), 1);
});

test('the grand final lost: second, no title, no ticket; the bracket from the seed, the same every time', () => {
    let c = Career.newCareer(12);
    for (let m = Career.nextMatch(c); m && m.stage !== 'GF'; m = Career.nextMatch(c)) c = Career.recordSeries(c, m.format === 'bo3' ? { won: 2, lost: 0 } : ONE);
    c = Career.recordSeries(c, { won: 1, lost: 2 });
    assert.equal(Career.placing(c), 2);
    assert.equal(Career.knockedOut(c), true, 'no title: the black screen too');
    assert.equal(Career.finishSeason(c).ticket, null);
    assert.deepEqual(Career.bracket(playSeason(Career.newCareer(9))), Career.bracket(playSeason(Career.newCareer(9))));
});

test('scores that cannot be are refused', () => {
    const c = Career.newCareer(3);
    for (const score of [{ won: 1, lost: 1 }, { won: 2, lost: 0 }, { won: 0, lost: 0 }, { won: -1, lost: 2 }, { won: 1.5, lost: 0 }]) {
        assert.equal(Career.recordSeries(c, score), null, `one game: ${JSON.stringify(score)}`);
    }
    let late = c;
    for (let m = Career.nextMatch(late); m.format !== 'bo3'; m = Career.nextMatch(late)) late = Career.recordSeries(late, ONE);
    for (const score of [{ won: 1, lost: 1 }, { won: 2, lost: 2 }, { won: 3, lost: 0 }, { won: 1, lost: 0 }]) {
        assert.equal(Career.recordSeries(late, score), null, `best of 3: ${JSON.stringify(score)}`);
    }
    assert.ok(Career.recordSeries(late, { won: 2, lost: 1 }));
});

test('opponents grow stronger round after round: small level 1-2 armies first, some level 3 at the end', () => {
    let c = Career.newCareer(2);
    const first = Career.rivalOpponent(c, Career.nextMatch(c).opponent);
    assert.ok(first.budget <= 12 && first.level < 2, JSON.stringify(first));
    assert.equal(first.difficulty, 'novice');
    for (let m = Career.nextMatch(c); m.stage !== 'GF'; m = Career.nextMatch(c)) c = Career.recordSeries(c, m.format === 'bo3' ? { won: 2, lost: 0 } : ONE);
    const final = Career.rivalOpponent(c, Career.nextMatch(c).opponent);
    assert.ok(final.budget >= 28 && final.level > 2, JSON.stringify(final));
    assert.ok(Career.rivalOpponent(reach('county'), Career.nextMatch(reach('county')).opponent).level >= 2, 'the county starts higher');
    const q = Quests.questById('counter-bet');
    assert.deepEqual(Career.questOpponent(Career.newCareer(2), q), { difficulty: 'novice', budget: 20, level: 1.8, archetype: 'normal' });
    assert.equal(Career.questOpponent(Career.newCareer(2), Quests.questById('veteran')).difficulty, 'expert', 'a quest may set its own');
});

test('travel between two seasons, with the ticket only (the tournament won)', () => {
    const lost = Career.finishSeason(playSeason(Career.newCareer(5), false));
    assert.equal(lost.ticket, null);
    assert.equal(Career.canTravel(lost.career, 'county'), false);
    const won = Career.finishSeason(playSeason(Career.newCareer(5))).career;
    assert.equal(Career.canTravel(won, 'county'), true);
    const moved = Career.travel(won, 'county');
    assert.equal(moved.tier, 'county');
    assert.equal(moved.season, won.season, 'the same season, played in the county');
    assert.equal(moved.minutes, won.minutes + Career.TRAVEL_MINUTES, 'a day on the way');
    assert.ok(Career.fieldOf(moved).filter((id) => id !== Career.YOU).every((id) => Career.coachOf(moved, id).tier === 'county'));
    const started = Career.recordSeries(moved, ONE);
    assert.equal(Career.canTravel(started, 'school'), false, 'not in the middle of a season');
    const world = reach('international');
    const end = Career.finishSeason(playSeason(world));
    assert.deepEqual([end.title, end.ticket, end.career.tier], [true, null, 'international'], 'the seasons go on');
});

test('the calendar: 1 September, walks and matches take time, a new season starts again', () => {
    let c = Career.newCareer(4);
    assert.equal(Career.dateOf(c).toISOString(), '2026-09-01T08:00:00.000Z');
    c = Career.advance(c, Career.walkMinutes(c, 90));
    assert.equal(Career.dateOf(c).toISOString(), '2026-09-01T09:30:00.000Z');
    c = Career.recordSeries(c, ONE);
    assert.equal(Career.dateOf(c).toISOString(), '2026-09-01T21:30:00.000Z', 'a match: half a day');
    c = Career.attemptQuest(c, c.quests.drawn[0], false);
    assert.equal(Career.dateOf(c).getUTCDate(), 2);
    const next = Career.finishSeason(playSeason(c)).career;
    assert.equal(Career.dateOf(next).toISOString(), '2027-09-01T08:00:00.000Z');
    assert.ok(Career.walkMinutes({ tier: 'international' }, 10) > Career.walkMinutes({ tier: 'school' }, 10), 'the world is bigger');
});

test('the first season in town: Gérard\'s five lessons, no special rule', () => {
    let c = Career.newCareer(4);
    const steps = [];
    for (let i = 0; i < 6 && Career.nextMatch(c); i++) {
        steps.push(Career.tutorialStep(c));
        const m = Career.nextMatch(c);
        c = Career.recordSeries(c, m.format === 'bo3' ? { won: 2, lost: 0 } : ONE);
    }
    assert.deepEqual(steps, [0, 1, 2, 3, 4, -1]);
    const second = Career.finishSeason(playSeason(c)).career;
    assert.equal(Career.tutorialStep(second), -1, 'no lessons in the second season');
});

test('a stored career: read back as it was; anything tampered with is refused, older versions too', () => {
    let c = Career.newCareer(77);
    c = Career.recordSeries(c, LOSS);
    c = Career.recordSeries(c, ONE);
    c = Career.attemptQuest(c, c.quests.drawn[0], true);
    const stored = JSON.parse(JSON.stringify(c));
    assert.deepEqual(Career.sanitizeCareer(stored), c);
    const tamper = (change) => { const copy = JSON.parse(JSON.stringify(c)); change(copy); return Career.sanitizeCareer(copy); };
    assert.equal(Career.sanitizeCareer(null), null);
    assert.equal(tamper((x) => { x.version = 1; }), null, 'a league career (version 1)');
    assert.equal(tamper((x) => { x.tier = 'national'; }), null, 'no ticket');
    assert.equal(tamper((x) => { x.tournament.results[0] = { won: 2, lost: 0 }; }), null, 'impossible score');
    assert.equal(tamper((x) => { x.tournament.results.push(LOSS, LOSS); }), null, 'more matches than the bracket allows');
    assert.equal(tamper((x) => { x.minutes = -5; }), null);
    assert.equal(tamper((x) => { x.questsDone.push('no-such-quest'); }), null);
    assert.equal(tamper((x) => { x.quests.attempted.push('veteran'); }), null);
    assert.equal(tamper((x) => { x.titles.push({ tier: 'school', season: 99 }); }), null);
});

test('side quests: tried once a season, gone for good once done, harder seasons open more', () => {
    let c = Career.newCareer(11);
    const [first, second] = c.quests.drawn;
    c = Career.attemptQuest(c, first, true);
    c = Career.attemptQuest(c, second, false);
    assert.equal(Career.attemptQuest(c, second, true), null, 'once a season');
    assert.equal(Career.attemptQuest(c, 'veteran', true), null, 'not drawn');
    assert.deepEqual(Career.availableQuests(c).map((q) => q.id), c.quests.drawn.slice(2));
    assert.deepEqual(c.questsDone, [first]);
    const seen = new Set();
    for (let s = 0; s < 6; s++) {
        c = Career.finishSeason(playSeason(c)).career;
        assert.ok(!c.quests.drawn.includes(first), 'a quest done never comes back');
        c.quests.drawn.forEach((id) => seen.add(id));
    }
    assert.ok([...seen].some((id) => Quests.questById(id).minSeason === 2), 'second-season quests open later');
});

