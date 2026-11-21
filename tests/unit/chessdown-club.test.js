// Chessdown clubs (games/chessdown/club-rules.js): squad, experience, levels, recruits, storage checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Club = require('../../games/chessdown/club-rules.js');

const identity = { coach: 'Etienne', name: 'Olympique Cavalier', primary: '#f1c40f', secondary: '#111111', pattern: 'sash', shape: 'diamond', emblem: 'wolf' };
const tally = (over = {}) => ({ moves: 0, captures: 0, touchdowns: 0, captured: false, survivedWin: false, ...over });

test('a new club: its king (level 5) and six rookies at level 1, named', () => {
    const club = Club.newClub(identity, 'Le Capitaine');
    assert.deepEqual(club.players.map((p) => [p.type, p.level]), [['k', 5], ['r', 1], ['n', 1], ['b', 1], ['p', 1], ['p', 1], ['p', 1]]);
    assert.equal(club.players[0].name, 'Le Capitaine');
    assert.ok(club.players.every((p) => p.name && p.xp === 0));
    assert.equal(new Set(club.players.map((p) => p.id)).size, 7);
    assert.equal(club.tier, 'school');
});

test('names: 2 to 24 characters, spaces squeezed, control characters dropped', () => {
    assert.equal(Club.cleanName('  Racing   Tour '), 'Racing Tour');
    assert.equal(Club.cleanName('A'), null);
    assert.equal(Club.cleanName('x'.repeat(25)), null);
    assert.equal(Club.cleanName('Lu\u0007cas'), 'Lucas');
    assert.equal(Club.cleanName(42), null);
});

test('experience: moves, captures, touchdowns and a win survived; -3 when taken, never below 0', () => {
    const rookie = Club.newPlayer(2, 'r', 'Bastien');
    const after = Club.applyGame(rookie, tally({ moves: 4, captures: 2, touchdowns: 1, survivedWin: true }));
    assert.equal(after.xp, 4 + 10 + 10 + 3);
    assert.equal(after.level, 2);
    assert.deepEqual(after.stats, { games: 1, moves: 4, captures: 2, captured: 0, touchdowns: 1 });
    const taken = Club.applyGame(rookie, tally({ moves: 1, captured: true }));
    assert.equal(taken.xp, 0);
    assert.equal(taken.stats.captured, 1);
});

test('levels: thresholds 20, 60, 200, 500; a level is never lost', () => {
    assert.deepEqual([0, 19, 20, 59, 60, 199, 200, 499, 500, 9999].map(Club.levelForXp), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    const p = { ...Club.newPlayer(3, 'n', 'Lina'), xp: 21, level: 2 };
    const down = Club.applyGame(p, tally({ captured: true }));
    assert.equal(down.xp, 18);
    assert.equal(down.level, 2, 'stays level 2');
    assert.equal(Club.xpToNext(down), 60 - 18);
    assert.equal(Club.xpToNext({ ...p, level: 5 }), null);
});

test('the king gains no experience, but his stats count', () => {
    const king = Club.newPlayer(1, 'k', 'Capitaine');
    const after = Club.applyGame(king, tally({ moves: 10, captures: 1 }));
    assert.deepEqual([after.xp, after.level, after.stats.moves, after.stats.captures], [0, 5, 10, 1]);
});

test('recruits: one per token, never a king, never more than 24 players', () => {
    let club = { ...Club.newClub(identity, 'Capitaine'), recruits: 2 };
    club = Club.recruit(club, 'q', 'Rosa');
    assert.equal(club.players.at(-1).type, 'q');
    assert.equal(club.players.at(-1).level, 1);
    assert.equal(club.players.at(-1).name, 'Rosa');
    assert.equal(club.recruits, 1);
    assert.equal(Club.recruit(club, 'k', 'Two'), club, 'no second king');
    const full = { ...club, players: Array.from({ length: 24 }, (_, i) => Club.newPlayer(i + 1, i ? 'p' : 'k', `P${i}`)) };
    assert.equal(Club.recruit(full, 'p', 'More'), full);
});

test('a stored club is checked field by field; anything wrong is refused', () => {
    const club = Club.newClub(identity, 'Capitaine');
    const back = Club.sanitizeClub(JSON.parse(JSON.stringify(club)));
    assert.deepEqual(back.players, club.players);
    assert.equal(back.nextId, 8);
    for (const broken of [
        null, {}, { ...club, version: 2 }, { ...club, name: 'x' }, { ...club, primary: 'red' },
        { ...club, pattern: 'polka' }, { ...club, emblem: '<img>' }, { ...club, players: [] },
        { ...club, players: club.players.filter((p) => p.type !== 'k') },
        { ...club, players: [...club.players, { ...club.players[0], id: 99 }] }, // two kings
        { ...club, players: [...club.players, { ...club.players[1] }] }, // same id twice
        { ...club, players: [{ ...club.players[0] }, { ...club.players[1], level: 9 }] },
    ]) {
        assert.equal(Club.sanitizeClub(broken), null, JSON.stringify(broken)?.slice(0, 80));
    }
});

test('initials: up to 3 letters from the club name', () => {
    assert.equal(Club.initials('Olympique Cavalier'), 'OC');
    assert.equal(Club.initials('Les Fous du Roi'), 'LFR');
    assert.equal(Club.initials('!!'), 'FC');
});

test('career rewards: an experience bonus (never for the king), a recruit at its level', () => {
    const club = Club.newClub(identity, 'Le Capitaine');
    const [king, rook] = club.players;
    assert.deepEqual([Club.gainXp(rook, 65).xp, Club.gainXp(rook, 65).level], [65, 3]);
    assert.equal(Club.gainXp(king, 100), king);
    assert.equal(Club.gainXp(rook, -5), rook);
    const signed = Club.recruit(club, 'q', 'Prodige', { level: 3, fromQuest: true });
    const queen = signed.players[signed.players.length - 1];
    assert.deepEqual([queen.type, queen.name, queen.level, queen.xp], ['q', 'Prodige', 3, Club.XP_THRESHOLDS[2]]);
    assert.equal(signed.recruits, club.recruits, 'a quest recruit does not use a pending one');
    // Cosmetics kept when known, dropped otherwise
    const kept = Club.sanitizeClub({ ...JSON.parse(JSON.stringify(club)), cosmetics: ['jersey-heritage', 'gold-boots'] });
    assert.deepEqual(kept.cosmetics, ['jersey-heritage']);
});
