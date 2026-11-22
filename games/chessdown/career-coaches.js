// @ts-check
// Chessdown career (docs/games/chessdown-career.md): the rival coaches, by tier. Each one is
// easy to recognise: a look (drawn in pixel art), a nickname, a style of play (one of the
// bot's archetypes, games/chessdown/bot-search.js) and a catchphrase. Names and clubs are
// proper nouns (the same in every language); nickname, style and catchphrase are text keys:
// `coach.<id>.nick`, `coach.<id>.line`, and `archetype.<archetype>` for the style.
// Loaded by the browser (as `window.ChessdownCoaches`) and by Node (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownCoaches = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    /** The bot's archetypes (bot-search.js draftArmy): what each rival's army is built on. */
    const ARCHETYPES = ['normal', 'ecuries', 'citadelle', 'chapiteau', 'chair', 'sorcieres'];
    /** What a look may hold (the portrait in js/coach-portrait.js draws these). */
    const LOOK = {
        cut: ['bald', 'short', 'bun', 'long', 'curly'],
        beard: ['', 'stache', 'stubble', 'goatee', 'full'],
        glasses: ['', 'round', 'square'],
        hat: ['', 'beret', 'cap'],
        extra: ['', 'tie', 'pearls', 'whistle', 'scarf', 'lips'],
    };

    /**
     * @typedef {{ skin: string, hair: string, cut: string, beard: string, glasses: string, hat: string, hatColor: string, top: string, extra: string }} Look
     * @typedef {{ primary: string, secondary: string, pattern: string, shape: string, emblem: string }} Colors
     * @typedef {{ id: string, tier: string, name: string, club: string, archetype: string, strength: number, colors: Colors, look: Look, boss?: boolean, generated?: boolean }} Coach
     */
    const look = (skin, hair, cut, beard, glasses, hat, hatColor, top, extra) => ({ skin, hair, cut, beard, glasses, hat, hatColor, top, extra });
    const colors = (primary, secondary, pattern, shape, emblem) => ({ primary, secondary, pattern, shape, emblem });
    /** strength: 0 (the weakest of its tier) to 1 (the strongest); it sets the army and the simulated results. */
    const coach = (id, tier, name, club, archetype, strength, c, l) => ({ id, tier, name, club, archetype, strength, colors: c, look: l });
    /** A boss (a side quest's, career-quests.js): never a league rival. */
    const boss = (...args) => ({ ...coach(...args), boss: true });

    /** @type {Coach[]} */
    const COACHES = [
        // School (the town): pools of 6, 5 drawn per career
        coach('normand', 'school', 'Gaston Normand', 'École Jules-Ferry', 'normal', 0.5, colors('#7a5230', '#f4efe2', 'plain', 'shield', 'b'), look('#e8b48c', '#8a8a8a', 'bald', 'stache', 'round', 'beret', '#3b2a1c', '#7a5230', 'tie')),
        coach('lefort', 'school', 'Sylvie Lefort', 'École Pasteur', 'citadelle', 0.6, colors('#1f3a8a', '#ffffff', 'stripes', 'round', 'tower'), look('#f0c8a8', '#6a4a2a', 'bun', '', 'square', '', '', '#1f3a8a', 'pearls')),
        coach('benali', 'school', 'Kader Benali', 'Collège Victor-Hugo', 'ecuries', 0.7, colors('#c0392b', '#111111', 'halves', 'badge', 'n'), look('#c98e66', '#1c1410', 'short', 'stubble', '', 'cap', '#111111', '#c0392b', 'whistle')),
        coach('roux', 'school', 'Pauline Roux', 'École du Lac', 'chapiteau', 0.4, colors('#7ec8f2', '#2c3e50', 'hoops', 'round', 'wave'), look('#f2d0b4', '#b5462f', 'long', '', '', '', '', '#7ec8f2', 'scarf')),
        coach('lagarde', 'school', 'Dédé Lagarde', 'École Saint-Exupéry', 'chair', 0.3, colors('#2ecc71', '#111111', 'sash', 'shield', 'star'), look('#e0a882', '#d8d8d8', 'bald', 'full', '', '', '', '#5a6a3a', '')),
        coach('tran', 'school', 'Mei Tran', 'Collège Marie-Curie', 'normal', 0.8, colors('#9b59b6', '#f1c40f', 'chevron', 'diamond', 'comet'), look('#f0cfa8', '#141414', 'long', '', 'square', '', '', '#9b59b6', '')),
        // County
        coach('marchetti', 'county', 'Tony Marchetti', 'US Montbrison', 'chair', 0.6, colors('#c0392b', '#ffffff', 'stripes', 'shield', 'bull'), look('#d9a07a', '#2a1d14', 'short', 'stubble', '', 'cap', '#c0392b', '#c0392b', 'whistle')),
        coach('gauthier', 'county', 'Bernard Gauthier', 'AS Vernay', 'citadelle', 0.5, colors('#2e7d32', '#f1c40f', 'hoops', 'badge', 'pine'), look('#d89a70', '#7a6a5a', 'short', 'stache', '', 'cap', '#2e7d32', '#6a8a34', '')),
        coach('marchal', 'county', 'Zoé Marchal', 'FC Val-de-Loir', 'ecuries', 0.7, colors('#e67e22', '#2c3e50', 'sash', 'round', 'fox'), look('#f2c8a0', '#e0a040', 'short', '', '', '', '', '#e67e22', 'scarf')),
        coach('anselme', 'county', 'Père Anselme', 'Étoile Saint-Pierre', 'chapiteau', 0.4, colors('#4a2a6a', '#ffffff', 'plain', 'diamond', 'star'), look('#e8c0a0', '#f2f2f2', 'bald', '', 'round', '', '', '#2a2a2a', '')),
        coach('ferhat', 'county', 'Nadia Ferhat', 'Union Montbrison-Gare', 'sorcieres', 0.8, colors('#111111', '#c9a227', 'pinstripes', 'shield', 'crown'), look('#c48a62', '#2a1a10', 'bun', '', '', '', '', '#111111', 'lips')),
        coach('bertin', 'county', 'Jojo Bertin', 'Racing des Moulins', 'normal', 0.3, colors('#f1c40f', '#3498db', 'quarters', 'badge', 'sun'), look('#ecbc94', '#c87a3a', 'curly', 'goatee', '', '', '', '#f1c40f', 'tie')),
        // Region
        coach('duroc', 'region', 'Hélène Duroc', 'Castelroc FC', 'citadelle', 0.7, colors('#1f2a4a', '#bdbdbd', 'halves', 'shield', 'tower'), look('#f0c8a8', '#b8b8b8', 'bun', '', 'square', '', '', '#1f2a4a', 'pearls')),
        coach('vidal', 'region', 'Baptiste Vidal', 'US Mont-Pelé', 'chair', 0.5, colors('#ffffff', '#c0392b', 'chevron', 'badge', 'mountain'), look('#d89a70', '#5a3a1a', 'curly', 'full', '', 'beret', '#c0392b', '#7a4a24', 'scarf')),
        coach('joubert', 'region', 'Claire Joubert', 'Coteaux FC', 'chapiteau', 0.6, colors('#7b1e3a', '#f1c40f', 'sash', 'round', 'sun'), look('#f2d0b4', '#6a2a1a', 'long', '', '', '', '', '#7b1e3a', '')),
        coach('ferrand', 'region', 'Lucas Ferrand', 'Olympique des Lacs', 'ecuries', 0.8, colors('#3498db', '#ffffff', 'hoops', 'round', 'wave'), look('#f0c8a0', '#e0c060', 'short', '', '', 'cap', '#3498db', '#3498db', 'whistle')),
        coach('castel', 'region', 'Yvonne Castel', 'Castelroc Vétérans', 'normal', 0.4, colors('#5a5a5a', '#e67e22', 'plain', 'diamond', 'k'), look('#ecc4a4', '#e8e8e8', 'curly', '', 'round', '', '', '#8e44ad', 'pearls')),
        coach('morel', 'region', 'Ivan Morel', 'Hautes-Terres AC', 'sorcieres', 0.9, colors('#ecf0f1', '#2c3e50', 'pinstripes', 'shield', 'volcano'), look('#f4d8c4', '#f4f4f4', 'short', 'goatee', '', '', '', '#ecf0f1', 'tie')),
        // National
        coach('vasseur', 'national', 'Les sœurs Vasseur', 'Racing Capitale', 'sorcieres', 0.8, colors('#8e1b4a', '#111111', 'quarters', 'diamond', 'q'), look('#e6b294', '#141414', 'long', '', '', '', '', '#8e1b4a', 'lips')),
        coach('ndiaye', 'national', 'Moussa Ndiaye', 'Sainte-Marine AC', 'normal', 0.7, colors('#1f6aa8', '#ffffff', 'hoops', 'round', 'wave'), look('#7a4a2e', '#1c1410', 'short', 'full', 'round', '', '', '#1f6aa8', 'scarf')),
        coach('roche', 'national', 'Valérie Roche', 'Granit FC', 'citadelle', 0.6, colors('#6a6a6a', '#f1c40f', 'plain', 'shield', 'mountain'), look('#f0c8a8', '#3a2a1a', 'bun', '', 'square', '', '', '#4a4a4a', 'pearls')),
        coach('garnier', 'national', 'Thibault Garnier', 'Riviera Stars', 'ecuries', 0.5, colors('#f1c40f', '#9b59b6', 'stripes', 'badge', 'star'), look('#e8b48c', '#e0c060', 'curly', '', '', '', '', '#f1c40f', 'tie')),
        coach('agnes', 'national', 'Sœur Agnès', 'Sainte-Croix', 'chapiteau', 0.6, colors('#ffffff', '#1f3a8a', 'sash', 'diamond', 'b'), look('#f4d8c4', '#2a2a2a', 'bun', '', 'round', '', '', '#2a2a2a', '')),
        coach('kessler', 'national', 'Bruno Kessler', 'Forges Union', 'chair', 0.5, colors('#e67e22', '#111111', 'halves', 'badge', 'bear'), look('#e0a882', '#5a3a1a', 'bald', 'full', '', 'cap', '#111111', '#e67e22', 'whistle')),
        coach('dumont', 'national', 'Léa Dumont', 'Étoile du Nord', 'ecuries', 0.9, colors('#2c3e50', '#7ec8f2', 'chevron', 'round', 'comet'), look('#f2d0b4', '#e0a040', 'long', '', '', 'cap', '#2c3e50', '#2c3e50', 'scarf')),
        coach('leclerc', 'national', 'Arnaud Leclerc', 'Capitale Finance', 'normal', 0.4, colors('#111111', '#c9a227', 'pinstripes', 'shield', 'crown'), look('#ecc4a4', '#8a8a8a', 'short', '', 'square', '', '', '#111111', 'tie')),
        // International
        coach('ferran', 'international', 'Diego Ferrán', 'Atlético del Plata', 'ecuries', 0.8, colors('#7ec8f2', '#ffffff', 'stripes', 'shield', 'sun'), look('#b97a55', '#1c1410', 'curly', 'goatee', '', '', '', '#2a7ab8', 'scarf')),
        coach('kim', 'international', 'Kim Ji-ho', 'Han River FC', 'normal', 0.9, colors('#c0392b', '#1f3a8a', 'halves', 'round', 'eagle'), look('#f0cfa8', '#141414', 'short', '', 'square', '', '', '#1f3a8a', 'tie')),
        coach('okafor', 'international', 'Grace Okafor', 'Lagos Lions', 'sorcieres', 0.8, colors('#2ecc71', '#ffffff', 'sash', 'badge', 'lion'), look('#6a3e24', '#141414', 'curly', '', '', '', '', '#2ecc71', 'lips')),
        coach('murphy', 'international', 'Sean Murphy', 'Sydney Harbour', 'chair', 0.6, colors('#f1c40f', '#2c3e50', 'hoops', 'shield', 'wave'), look('#f4c8a8', '#c0602a', 'short', 'full', '', 'cap', '#2c3e50', '#2c3e50', 'whistle')),
        coach('tanaka', 'international', 'Yuki Tanaka', 'Kyoto Cranes', 'chapiteau', 0.7, colors('#ffffff', '#c0392b', 'plain', 'round', 'sun'), look('#f0d0b0', '#141414', 'bun', '', 'round', '', '', '#c0392b', '')),
        coach('silva', 'international', 'João Silva', 'Rio Atlântico', 'ecuries', 0.7, colors('#f1c40f', '#2e7d32', 'chevron', 'diamond', 'star'), look('#a8704e', '#1c1410', 'curly', 'stache', '', '', '', '#f1c40f', 'scarf')),
        coach('novak', 'international', 'Petra Novak', 'Praha Hrad', 'citadelle', 0.8, colors('#1f3a8a', '#ffffff', 'quarters', 'shield', 'tower'), look('#f4d8c4', '#e0c060', 'bun', '', 'square', '', '', '#1f3a8a', 'pearls')),
        coach('hansen', 'international', 'Erik Hansen', 'Oslo Fjord', 'chair', 0.6, colors('#c0392b', '#ffffff', 'stripes', 'badge', 'wolf'), look('#f4d8c4', '#e8d080', 'long', 'full', '', '', '', '#c0392b', '')),
    ];

    // Bosses: one per tier from the county on, met in a side quest with a fixed army
    COACHES.push(
        boss('caid', 'school', 'Kenzo Belkacem', 'Les Caïds du City', 'ecuries', 1, colors('#e67e22', '#111111', 'sleeves', 'round', 'bolt'), look('#8a5a3c', '#1a1a1a', 'short', 'stubble', '', 'cap', '#111111', '#e67e22', 'whistle')),
        boss('taureau', 'county', 'Marcel Taureau', 'Les Cornes du Loir', 'chair', 1, colors('#5a2d0c', '#e8c070', 'halves', 'badge', 'bull'), look('#c88a5c', '#2a1a10', 'short', 'full', '', 'cap', '#5a2d0c', '#5a2d0c', 'whistle')),
        boss('cimes', 'region', 'Hélène des Cimes', 'Pic Blanc', 'sorcieres', 1, colors('#e8eef4', '#2f4a6a', 'chevron', 'diamond', 'mountain'), look('#f4dcc8', '#f0f0f0', 'long', '', 'round', '', '', '#2f4a6a', 'scarf')),
        boss('valmont', 'national', 'Victor Valmont', 'Valmont Royal', 'citadelle', 1, colors('#2a1a4a', '#d4af37', 'sash', 'shield', 'crown'), look('#e8c0a0', '#1a1a1a', 'short', 'goatee', 'square', '', '', '#2a1a4a', 'tie')),
        boss('kingsley', 'international', 'Ada Kingsley', 'London Legends', 'normal', 1, colors('#0a0a0a', '#c0392b', 'pinstripes', 'round', 'lion'), look('#8a5a3c', '#1a1a1a', 'curly', '', '', 'beret', '#c0392b', '#0a0a0a', 'pearls')),
    );

    // ---------- Generated clubs ----------
    // A tournament has 32 clubs: the tier's named coaches, and clubs made up from the career's
    // seed (`g-<tier>-<n>`), each the same every time. Names are proper nouns (no translation);
    // they have no nickname or catchphrase.
    const FIRST = ['Paul', 'Anne', 'Marc', 'Julie', 'Luc', 'Claire', 'Yves', 'Sophie', 'Omar', 'Lea', 'Igor', 'Nadia', 'Hugo', 'Elsa', 'Theo', 'Rita',
        'Karim', 'Ines', 'Bruno', 'Maya', 'Felix', 'Nora', 'Victor', 'Alice', 'Samuel', 'Jade', 'Ruben', 'Lina', 'Oscar', 'Zoe'];
    const LAST = ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Girard', 'Bonnet', 'Mercier', 'Blanc', 'Garnier', 'Faure', 'Rousseau',
        'Fontaine', 'Chevalier', 'Robin', 'Masson', 'Henry', 'Perrin', 'Morel', 'Lemaire', 'Duval', 'Renard', 'Colin', 'Vidal'];
    const TOWNS = {
        school: ['Les Lilas', 'Bellevue', 'Les Tilleuls', 'Le Moulin', 'La Source', 'Les Peupliers', 'Saint-Roch', 'Le Parc', 'La Colline', 'Les Acacias'],
        county: ['Lué', 'Saint-Loup', 'Montreuil', 'Brézé', 'La Ferté', 'Chambray', 'Mazé', 'Durtal', 'Seiches', 'Baugé', 'Noyant', 'Morannes'],
        region: ['Valdor', 'Pic-Haut', 'Belcombe', 'Hautval', 'Les Granges', 'Roche-Noire', 'Champsaur', 'Vallouise', 'Briançon', 'Embrun'],
        national: ['Lutèce', 'Massilia', 'Lugdunum', 'Burdigala', 'Tolosa', 'Nemausus', 'Divodurum', 'Rotomagus', 'Cenabum', 'Andegavum'],
        international: ['Porto', 'Gdańsk', 'Valparaíso', 'Osaka', 'Accra', 'Lyon', 'Bergen', 'Bilbao', 'Krakow', 'Lima', 'Busan', 'Tunis', 'Zagreb'],
    };
    const KINDS = { school: ['École', 'Collège', 'Lycée'], county: ['AS', 'US', 'FC'], region: ['Olympique', 'Racing', 'Stade'], national: ['Athletic', 'Union', 'Sporting'], international: ['FC', 'United', 'Real'] };
    const PALETTE = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#16a085', '#2c3e50', '#d35400', '#7f8c8d', '#ffffff', '#111111'];
    const SKINS = ['#f4d8c4', '#e8b48c', '#c88a5c', '#8a5a3c', '#5c3a24', '#f0c8a8'];
    const HAIRS = ['#1a1a1a', '#6a4a2a', '#e0c060', '#8a8a8a', '#a0522d', '#f0f0f0'];
    function seeded(seed, id) {
        let h = 2166136261;
        for (const ch of `${seed}|${id}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        let s = h | 0;
        return () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    /** The id of the n-th generated club of a tier. */
    const generatedId = (tier, n) => `g-${tier}-${n}`;
    /** A generated club of the career with this seed, or null when `id` is not one. @returns {Coach | null} */
    function generatedCoach(seed, id) {
        const m = /^g-([a-z]+)-(\d{1,2})$/.exec(String(id));
        if (!m || !TOWNS[m[1]]) return null;
        const tier = m[1];
        const n = Number(m[2]);
        const r = seeded(seed, id);
        const pick = (list) => list[Math.floor(r() * list.length)];
        // The club's name: each n its own town and kind (no two clubs of a tier alike), in an
        // order drawn from the seed
        const towns = TOWNS[tier];
        const order = towns.map((_, i) => i);
        const shuffleRandom = seeded(seed, `towns-${tier}`);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(shuffleRandom() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const club = `${KINDS[tier][Math.floor(n / towns.length) % KINDS[tier].length]} ${towns[order[n % towns.length]]}`;
        const primary = pick(PALETTE);
        let secondary = pick(PALETTE);
        if (secondary === primary) secondary = primary === '#ffffff' ? '#111111' : '#ffffff';
        return {
            id, tier, name: `${pick(FIRST)} ${pick(LAST)}`, club,
            archetype: pick(ARCHETYPES), strength: Math.round((0.1 + r() * 0.7) * 100) / 100,
            colors: colors(primary, secondary, pick(['plain', 'stripes', 'hoops', 'halves', 'sash']), pick(['shield', 'round', 'badge', 'diamond']), pick(['star', 'bolt', 'moon', 'sun', 'wave', 'pine', 'tower', 'crown'])),
            look: look(pick(SKINS), pick(HAIRS), pick(LOOK.cut), pick(LOOK.beard), pick(LOOK.glasses), pick(LOOK.hat), pick(PALETTE), primary, pick(LOOK.extra)),
            generated: true,
        };
    }

    /** A coach by id, or null; a generated club needs the career's seed. */
    function coachById(id, seed) {
        return COACHES.find((c) => c.id === id) || (seed === undefined ? null : generatedCoach(seed, id));
    }

    /** The league coaches of a tier (bosses left out). */
    function coachesOf(tier) {
        return COACHES.filter((c) => c.tier === tier && !c.boss);
    }

    return { ARCHETYPES, LOOK, COACHES, coachById, coachesOf, generatedId, generatedCoach };
});
