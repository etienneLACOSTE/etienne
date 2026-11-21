// Chessdown career (games/chessdown/career-*.js): rival coaches, the quest catalogue, leagues,
// tickets, travel, side quests and the checks on a stored career.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Coaches = require('../../games/chessdown/career-coaches.js');
const Quests = require('../../games/chessdown/career-quests.js');
const Career = require('../../games/chessdown/career-rules.js');
const Club = require('../../games/chessdown/club-rules.js');

const HEX = /^#[0-9a-f]{6}$/;

/** Play the season to its end, every series with this score. */
function playSeason(career, score = { won: 2, lost: 0 }) {
    let c = career;
    while (Career.nextMatch(c)) c = Career.recordSeries(c, score);
    return c;
}
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
        assert.ok(Coaches.coachesOf(tier).length >= t.clubs - 1 + t.knockout, tier);
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

test('the quest catalogue: every quest is well formed, 8 per tier, enough for a first season', () => {
    assert.equal(new Set(Quests.QUESTS.map((q) => q.id)).size, Quests.QUESTS.length);
    for (const q of Quests.QUESTS) assert.deepEqual(Quests.checkQuest(q), [], q.id);
    for (const tier of Career.TIER_IDS) {
        const quests = Quests.QUESTS.filter((q) => q.tier === tier);
        assert.equal(quests.length, 8, tier);
        assert.ok(quests.filter((q) => q.minSeason === 1).length >= Career.TIERS[tier].quests, tier);
    }
    // The checks catch mistakes
    const bad = { ...Quests.QUESTS[0], place: 'stadium', rules: { squad: ['p', 'p'], fly: true }, reward: { xp: { to: 'all', amount: 10 }, cosmetic: 'old-jersey' } };
    assert.deepEqual(Quests.checkQuest(bad), ['place', 'rule fly', 'squad', 'one reward']);
});

test('fixtures: every club meets every other once per leg, one match per round', () => {
    for (const [n, legs] of [[4, 1], [6, 1], [6, 2], [8, 2]]) {
        const rounds = Career.fixtures(n, legs);
        assert.equal(rounds.length, (n - 1) * legs);
        for (const round of rounds) assert.equal(new Set(round.flat()).size, n);
        const pairs = rounds.flat().map(([a, b]) => `${a}-${b}`);
        assert.equal(new Set(pairs).size, pairs.length, 'no home game repeated');
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
            const met = pairs.filter((p) => p === `${a}-${b}` || p === `${b}-${a}`).length;
            assert.equal(met, legs, `${a} and ${b}`);
        }
    }
});

test('a new career: the same seed gives the same career; rivals drawn for every tier', () => {
    const a = Career.newCareer(42), b = Career.newCareer(42), c = Career.newCareer(43);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.rivals, c.rivals);
    assert.equal(a.season, 1);
    assert.equal(a.tier, 'school');
    for (const tier of Career.TIER_IDS) {
        const t = Career.TIERS[tier];
        assert.equal(a.rivals[tier].length, t.clubs - 1 + t.knockout);
        assert.ok(a.rivals[tier].every((id) => Coaches.coachById(id).tier === tier));
    }
    assert.equal(a.quests.drawn.length, 4);
    assert.ok(a.quests.drawn.every((id) => Quests.questById(id).tier === 'school' && Quests.questById(id).minSeason === 1));
});

test('a school season: five matches, the table, the ticket and the title for the winner', () => {
    let c = Career.newCareer(1);
    const opponents = [];
    for (let i = 0; i < 5; i++) {
        const m = Career.nextMatch(c);
        assert.equal(m.phase, 'league');
        opponents.push(m.opponent);
        c = Career.recordSeries(c, { won: 2, lost: 1 });
    }
    assert.deepEqual([...opponents].sort(), [...c.rivals.school].sort(), 'every rival met once');
    assert.equal(Career.nextMatch(c), null);
    assert.equal(Career.recordSeries(c, { won: 2, lost: 0 }), null, 'no sixth match');
    const table = Career.standings(c);
    assert.equal(table[0].club, Career.YOU);
    assert.deepEqual(table[0], { club: 'you', order: 0, played: 5, won: 5, drawn: 0, lost: 0, gamesFor: 10, gamesAgainst: 5, points: 15 });
    assert.ok(table.every((r) => r.played === 5));
    const end = Career.finishSeason(c);
    assert.equal(end.rank, 1);
    assert.equal(end.ticket, 'county');
    assert.equal(end.title, true);
    assert.equal(end.career.season, 2);
    assert.equal(end.career.tier, 'school');
    assert.deepEqual(end.career.tickets, ['county']);
    assert.equal(end.career.league.results.length, 0);
    assert.deepEqual(end.career.titles, [{ tier: 'school', season: 1 }]);
});

test('the other matches are simulated from the seed, the same every time', () => {
    const a = playSeason(Career.newCareer(9)), b = playSeason(Career.newCareer(9));
    assert.deepEqual(a.league, b.league);
    const points = Career.standings(a).reduce((sum, r) => sum + r.points, 0);
    const draws = a.league.results.flat().filter((m) => m.wa === m.wb).length;
    assert.equal(points, 3 * (15 - draws) + 2 * draws, '15 series, 3 points each, 2 for a draw');
});

test('scores that cannot be are refused', () => {
    const c = Career.newCareer(3);
    for (const score of [{ won: 3, lost: 0 }, { won: -1, lost: 2 }, { won: 2, lost: 1.5 }, { won: 2, lost: 2 }]) {
        assert.equal(Career.recordSeries(c, score), null, JSON.stringify(score));
    }
    assert.ok(Career.recordSeries(c, { won: 1, lost: 1 }), 'a drawn series (draws in between count for nobody)');
});

test('no ticket outside the top 3; one travels between two seasons, with a ticket only', () => {
    const lost = Career.finishSeason(playSeason(Career.newCareer(5), { won: 0, lost: 2 }));
    assert.ok(lost.rank > 3);
    assert.equal(lost.ticket, null);
    assert.equal(Career.canTravel(lost.career, 'county'), false);
    assert.equal(Career.travel(lost.career, 'county'), null);

    const won = Career.finishSeason(playSeason(Career.newCareer(5))).career;
    assert.equal(Career.canTravel(won, 'county'), true);
    const moved = Career.travel(won, 'county');
    assert.equal(moved.tier, 'county');
    assert.equal(moved.season, won.season, 'the same season, played in the county');
    assert.deepEqual(moved.seasonsIn, { school: 1, county: 1 });
    assert.ok(moved.quests.drawn.every((id) => Quests.questById(id).tier === 'county'));
    assert.equal(Career.canTravel(moved, 'region'), false, 'no ticket for the region yet');
    const started = Career.recordSeries(moved, { won: 2, lost: 0 });
    assert.equal(Career.canTravel(started, 'school'), false, 'not in the middle of a season');
    assert.equal(Career.canTravel(moved, 'school'), true, 'back to town between two seasons');
});

test('the international tier: a group of four, then three knockout rounds for the title', () => {
    const c = reach('international');
    assert.equal(Career.leagueClubs(c).length, 4);
    let k = playSeason(c);
    assert.equal(k.league.results.length, 3);
    assert.deepEqual(k.cup, { stage: 3, out: false });
    const end = Career.finishSeason(k);
    assert.equal(end.title, true);
    assert.equal(end.ticket, null, 'no tier after the world');
    assert.equal(end.career.tier, 'international', 'the seasons go on');
    // Knocked out in the quarter-final
    k = c;
    for (let i = 0; i < 3; i++) k = Career.recordSeries(k, { won: 2, lost: 0 });
    assert.equal(Career.nextMatch(k).phase, 'knockout');
    k = Career.recordSeries(k, { won: 1, lost: 2 });
    assert.deepEqual(k.cup, { stage: 0, out: true });
    assert.equal(Career.seasonOver(k), true);
    assert.equal(Career.finishSeason(k).title, false);
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

test('opponents: rivals by their style and strength; quest bots grow stronger season after season', () => {
    const c = Career.newCareer(2);
    const strong = Career.rivalOpponent(c, 'tran'), weak = Career.rivalOpponent(c, 'lagarde');
    assert.equal(strong.archetype, 'normal');
    assert.equal(weak.archetype, 'chair');
    assert.ok(strong.budget > weak.budget);
    const q = Quests.questById('counter-bet');
    const first = Career.questOpponent(c, q);
    assert.deepEqual(first, { difficulty: 'novice', budget: 10, level: 1, archetype: 'normal' });
    const later = Career.questOpponent({ ...c, seasonsIn: { school: 4 } }, q);
    assert.deepEqual(later, { difficulty: 'novice', budget: 16, level: 2, archetype: 'normal' });
    assert.equal(Career.questOpponent(c, Quests.questById('veteran')).difficulty, 'expert', 'a quest may set its own');
});

test('a stored career: read back as it was; anything tampered with is refused', () => {
    let c = Career.newCareer(77);
    c = Career.recordSeries(c, { won: 2, lost: 1 });
    c = Career.attemptQuest(c, c.quests.drawn[0], true);
    const stored = JSON.parse(JSON.stringify(c));
    assert.deepEqual(Career.sanitizeCareer(stored), c);
    const tamper = (change) => { const copy = JSON.parse(JSON.stringify(c)); change(copy); return Career.sanitizeCareer(copy); };
    assert.equal(Career.sanitizeCareer(null), null);
    assert.equal(tamper((x) => { x.version = 2; }), null);
    assert.equal(tamper((x) => { x.tier = 'national'; }), null, 'no ticket');
    assert.equal(tamper((x) => { x.league.results[0][0].wa = 3; }), null, 'impossible score');
    assert.equal(tamper((x) => { x.league.results[0][0].b = 'kim'; }), null, 'not the fixture');
    assert.equal(tamper((x) => { x.questsDone.push('no-such-quest'); }), null);
    assert.equal(tamper((x) => { x.rivals.school[0] = 'ferran'; }), null, 'a rival of another tier');
    assert.equal(tamper((x) => { x.quests.attempted.push('veteran'); }), null);
    assert.equal(tamper((x) => { x.titles.push({ tier: 'school', season: 99 }); }), null);
});
