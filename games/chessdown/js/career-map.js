// @ts-check
// The career's map (docs/games/chessdown-career.md): one pixel-art map per tier (town,
// county, region, country, world) drawn by code from a fixed seed, no image to load. The
// coach walks (town, county), takes the bus (region, country) or flies (world) along the
// roads to a place; the page learns when they arrive. Water glints, a few cars drive, trains
// pass and flags wave; with reduced motion nothing moves and the coach is there at once.
// The places are buttons over the canvas (career-view.js labels them).

const W = 320;
const H = 192;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The maps: roads (k: road, street, lane, motorway), rivers, rails, lakes, land blobs, and
 * where each place of career-quests.js stands (x, y: the middle of its building).
 */
const MAPS = {
    school: {
        style: 'town', seed: 7, mover: 'walk',
        roads: [
            { k: 'road', p: [[-6, 120], [40, 116], [80, 106], [120, 96], [160, 90], [200, 94], [240, 100], [280, 104], [326, 110]] },
            { k: 'road', p: [[150, -6], [146, 30], [152, 62], [160, 90]] },
            { k: 'street', p: [[40, 116], [34, 80], [48, 46], [90, 28], [146, 30]] },
            { k: 'street', p: [[120, 96], [112, 124], [86, 148], [40, 158], [-6, 160]] },
            { k: 'street', p: [[112, 124], [140, 144], [162, 168], [172, 198]] },
            { k: 'road', p: [[240, 100], [256, 130], [280, 152], [300, 172], [326, 182]] },
        ],
        rivers: [{ w: 11, p: [[262, -6], [248, 36], [268, 74], [252, 118], [274, 158], [260, 198]] }],
        places: {
            home: [172, 154, 'hq'], stadium: [198, 44, 'stadium'], transport: [296, 152, 'busstation'],
            cafe: [150, 118, 'bar'], school: [62, 138, 'school'], park: [72, 56, 'park'], citystade: [214, 132, 'cage'],
            townhall: [98, 70, 'hall'], market: [224, 72, 'market'], gym: [110, 178, 'gym'],
        },
    },
    county: {
        style: 'county', seed: 21, mover: 'walk',
        roads: [
            { k: 'road', p: [[-6, 152], [50, 150], [96, 132], [138, 104], [196, 94], [250, 74], [286, 54], [326, 46]] },
            { k: 'lane', p: [[138, 104], [128, 70], [118, 44], [112, -6]] },
            { k: 'road', p: [[196, 94], [220, 124], [256, 142], [326, 150]] },
            { k: 'lane', p: [[50, 150], [56, 120], [60, 92], [76, 76]] },
            { k: 'lane', p: [[50, 150], [40, 176], [30, 198]] },
        ],
        rivers: [{ w: 9, p: [[176, -6], [150, 36], [182, 84], [160, 132], [190, 198]] }],
        rails: [{ k: 'rer', p: [[-6, 18], [80, 28], [160, 16], [240, 24], [326, 18]] }],
        forests: [[30, 40, 22], [248, 182, 14], [306, 118, 14], [92, 186, 12]],
        places: {
            home: [50, 138, 'village'], stadium: [212, 68, 'stadium'], transport: [280, 34, 'rerstation'],
            inn: [134, 128, 'inn'], farmschool: [262, 164, 'farmschool'], farm: [88, 70, 'farm'], pond: [26, 100, 'pond'],
            mill: [252, 108, 'mill'], chateau: [122, 172, 'chateau'], church: [214, 176, 'church'], lodge: [298, 96, 'lodge'],
        },
    },
    region: {
        style: 'region', seed: 44, mover: 'bus',
        roads: [
            { k: 'road', p: [[-6, 170], [40, 162], [90, 142], [130, 114], [166, 106], [212, 110], [258, 126], [296, 150], [326, 160]] },
            { k: 'road', p: [[90, 142], [86, 104], [78, 72], [58, 34], [44, -6]] },
            { k: 'lane', p: [[212, 110], [236, 92], [208, 82], [238, 68], [212, 56], [244, 44], [266, 40]] },
            { k: 'lane', p: [[130, 114], [128, 76], [134, 52]] },
        ],
        rails: [{ k: 'tgv', p: [[-6, 186], [120, 186], [240, 178], [326, 170]] }],
        lakes: [[156, 152, 30, 13]], mountains: [190, 0, 320, 84], vines: [[16, 96, 26, 22], [102, 24, 14, 22]],
        forests: [[24, 40, 14]],
        places: {
            home: [38, 150, 'village'], stadium: [172, 86, 'stadium'], transport: [276, 160, 'tgvstation'],
            chalet: [274, 30, 'chalet'], academy: [56, 86, 'academy'], winery: [132, 40, 'winery'], lake: [196, 150, 'pier'],
            refuge: [206, 26, 'refuge'], observatory: [300, 100, 'observatory'], pass: [300, 62, 'pass'], thermal: [102, 172, 'thermal'],
        },
    },
    national: {
        style: 'country', seed: 90, mover: 'bus',
        blobs: [[160, 100, 60], [112, 82, 40], [92, 60, 22], [228, 118, 40], [248, 62, 30], [196, 150, 30], [132, 140, 30], [272, 92, 26], [200, 50, 30], [80, 104, 16]],
        roads: [
            { k: 'motorway', p: [[126, 128], [142, 98], [172, 76], [218, 62], [256, 54]] },
            { k: 'motorway', p: [[172, 76], [130, 66], [94, 60]] },
            { k: 'motorway', p: [[142, 98], [190, 116], [232, 134]] },
        ],
        mountains: [196, 140, 262, 176], forests: [[266, 104, 12]], lakes: [[230, 92, 8, 5]],
        places: {
            home: [124, 140, 'village'], stadium: [176, 62, 'bigstadium'], transport: [260, 44, 'airport'],
            port: [92, 50, 'port'], academy: [236, 130, 'dome'], studio: [204, 94, 'studio'], lighthouse: [76, 100, 'lighthouse'],
            racetrack: [160, 168, 'racetrack'], museum: [108, 114, 'museum'], palace: [228, 84, 'palace'], newspaper: [134, 40, 'newspaper'],
        },
    },
    international: {
        style: 'world', seed: 3, mover: 'plane',
        blobs: [[70, 50, 17], [56, 34, 12], [92, 40, 11], [82, 80, 7], [94, 118, 11], [96, 146, 9], [90, 166, 5], [150, 50, 11], [166, 40, 9], [162, 98, 14], [170, 124, 9], [154, 78, 8], [218, 48, 17], [250, 40, 14], [270, 62, 11], [236, 86, 9], [284, 150, 10], [300, 140, 5], [130, 14, 7], [40, 180, 8], [180, 184, 9]],
        places: {
            home: [152, 58, 'village'], stadium: [90, 140, 'bigstadium'], seoul: [246, 44, 'city'], lagos: [160, 108, 'city'],
            sydney: [284, 150, 'city'], kyoto: [276, 68, 'city'], rio: [102, 116, 'city'], oslo: [152, 36, 'city'],
            prague: [174, 46, 'city'], montreal: [70, 42, 'city'],
        },
    },
};

/** How the coach travels on each tier's map. */
export const moverOf = (tier) => MAPS[tier].mover;

const P = {
    grass: '#3f8f4a', grass2: '#4a9c54', grass3: '#357f40', tuft: '#2c6e36', flowerW: '#f2f2e6', flowerY: '#f1d34a', flowerR: '#e05a4f',
    road: '#55575c', roadEdge: '#8d8f94', line: '#e6e6e6', walk: '#b9b2a2', lane: '#8a7a5a', lane2: '#9c8a64',
    water: '#2f6fb0', water2: '#3d82c4', water3: '#5fa0dc', deep: '#1b4a78', deep2: '#22578a', shallow: '#3a86c4', foam: '#d6ecff',
    sand: '#d8c27a', sand2: '#c8ae62', bank: '#6b5a34', tree: '#1f5e2c', tree2: '#2c7a3a', tree3: '#46a052', trunk: '#5b3a1e', shadow: 'rgba(0,0,0,0.22)',
    wall: '#ece2cc', wallShade: '#cdbd98', roof: '#b5462f', roofDark: '#8a3524', roofLight: '#cf6247', slate: '#4a5568', slateDark: '#363e4c', slateLight: '#5d6a80',
    glass: '#7fb8e6', glassLit: '#ffe9a6', door: '#5b3a1e', field: '#c9b04a', field2: '#a8883a', field3: '#7da13e',
    rock: '#8a8a8a', rock2: '#6a6a6a', rock3: '#4f4f4f', snow: '#f4f6f8', snow2: '#cfd8e0', ink: '#000000',
    stand: '#9a9a9a', stand2: '#b8b8b8', pitch: '#2e9e4f', pitch2: '#35ab58', ballast: '#7d7468', sleeper: '#4a3a2a', rail: '#c8c8c8',
    desert: '#d9b86a', desert2: '#c9a458', ice: '#eef3f7',
};
const ROAD_SPEC = { road: [9, 7], street: [8, 6], lane: [6, 4], motorway: [10, 8] };
const FONT = { B: '110101110101110', U: '101101101101111', S: '111100111001111', R: '110101110101101', E: '111100110100111', T: '111010010010010', G: '111100101101111', V: '101101101101010', A: '010101111101101', C: '111100100100111', F: '111100110100100', O: '111101101101111', L: '100100100100111', N: '110101101101101', W: '101101101111101', I: '111010010010111', P: '110101110100100', M: '101111111101101', Y: '101101010010010' };

function seeded(seed) {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Catmull-Rom curve through the points, a sample every pixel, with normals and tangents. */
function curve(pts) {
    /** @type {{ x: number, y: number, nx: number, ny: number, tx: number, ty: number }[]} */
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
        for (let k = 0; k < n; k++) {
            const t = k / n, t2 = t * t, t3 = t2 * t;
            const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]), nx: 0, ny: 0, tx: 0, ty: 0 });
        }
    }
    const last = pts[pts.length - 1];
    out.push({ x: last[0], y: last[1], nx: 0, ny: 0, tx: 0, ty: 0 });
    for (let i = 0; i < out.length; i++) {
        const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        Object.assign(out[i], { nx: -dy / d, ny: dx / d, tx: dx / d, ty: dy / d });
    }
    return out;
}

/** The quadratic arc of a flight between two places. */
function flightArc(a, b) {
    const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 26 - Math.abs(a.x - b.x) * 0.12;
    const out = [];
    for (let i = 0; i <= 120; i++) {
        const t = i / 120;
        out.push({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * mx + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * my + t * t * b.y });
    }
    return out;
}

/**
 * Draw one tier's map on a 320 x 192 canvas. Returns the road samples (for the paths and the
 * cars), the water pixels, the waving flags and, per place, its door on the road network.
 * @param {CanvasRenderingContext2D} g
 * @param {string} tier
 * @param {{ primary: string, secondary: string }} colors the club's
 */
function drawMap(g, tier, colors) {
    const map = MAPS[tier];
    const rnd = seeded(map.seed);
    const water = new Uint8Array(W * H);
    const busy = new Uint8Array(W * H);
    /** @type {Uint8Array | null} */
    let landMask = null;
    /** @type {{ x: number, y: number, c1: string, c2: string }[]} */
    const flags = [];
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const idx = (x, y) => (y | 0) * W + (x | 0);
    const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const markBox = (m, x, y, w, h) => { for (let j = Math.max(0, y | 0); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x | 0); i < Math.min(W, x + w); i++) m[j * W + i] = 1; };
    const markCurve = (m, s, w) => { for (const p of s) markBox(m, p.x - w / 2, p.y - w / 2, w, w); };
    const freeBox = (x, y, w, h) => {
        if (x < 0 || y < 0 || x + w > W || y + h > H) return false;
        for (let j = y | 0; j < y + h; j++) for (let i = x | 0; i < x + w; i++) if (busy[j * W + i] || (landMask && !landMask[j * W + i])) return false;
        return true;
    };
    const stamp = (s, w, c) => { for (const p of s) R(p.x - w / 2, p.y - w / 2, w, w, c); };
    const flag = (x, y, c1, c2) => { R(x, y, 1, 9, P.ink); flags.push({ x: x + 1, y, c1, c2 }); };
    const text = (x, y, str, c) => { let cx = x; for (const ch of str) { const f = FONT[ch]; if (f) for (let k = 0; k < 15; k++) if (f[k] === '1') R(cx + (k % 3), y + Math.floor(k / 3), 1, 1, c); cx += 4; } };

    // ---- Terrain
    function grass(c1 = P.grass, c2 = P.grass2, c3 = P.grass3) {
        R(0, 0, W, H, c1);
        for (let i = 0; i < 1400; i++) R(rnd() * W, rnd() * H, rnd() < 0.5 ? 2 : 1, 1, rnd() < 0.55 ? c2 : c3);
        for (let i = 0; i < 260; i++) { const x = rnd() * W, y = rnd() * H; R(x, y, 1, 2, P.tuft); R(x + 1, y + 1, 1, 1, P.tuft); }
        for (let i = 0; i < 90; i++) R(rnd() * W, rnd() * H, 1, 1, [P.flowerW, P.flowerY, P.flowerR][Math.floor(rnd() * 3)]);
    }
    function river(rv) {
        const s = curve(rv.p);
        s.forEach((p, i) => { const w = rv.w + Math.round(Math.sin(i / 23) * 1.5); R(p.x - w / 2 - 2, p.y - w / 2 - 2, w + 4, w + 4, P.bank); });
        s.forEach((p, i) => { const w = rv.w + Math.round(Math.sin(i / 23) * 1.5); R(p.x - w / 2, p.y - w / 2, w, w, P.water); });
        s.forEach((p, i) => { if (i % 9 === 0) R(p.x - 2 + p.nx * 2, p.y + p.ny * 2, 3, 1, P.water2); });
        markCurve(busy, s, rv.w + 8);
        for (const p of s) markBox(water, p.x - rv.w / 2, p.y - rv.w / 2, rv.w, rv.w);
    }
    function lake(cx, cy, rx, ry) {
        for (let y = cy - ry - 3; y <= cy + ry + 3; y++) for (let x = cx - rx - 3; x <= cx + rx + 3; x++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (rnd() - 0.5) * 0.08;
            if (d < 1) { R(x, y, 1, 1, d > 0.72 ? P.water2 : P.water); if (inMap(x, y)) water[idx(x, y)] = 1; }
            else if (d < 1.25) R(x, y, 1, 1, rnd() < 0.6 ? P.sand2 : P.tuft);
        }
        for (let k = 0; k < 10; k++) R(cx - rx * 0.6 + rnd() * rx * 1.2, cy - ry * 0.4 + rnd() * ry * 0.8, 3, 1, P.water3);
        markBox(busy, cx - rx - 4, cy - ry - 4, rx * 2 + 8, ry * 2 + 8);
    }
    /** Roads in layers (pavements, edges, surfaces, then markings away from junctions) so junctions merge cleanly. */
    function drawRoads(list) {
        const all = list.map((rd) => ({ rd, s: curve(rd.p), spec: ROAD_SPEC[rd.k] }));
        for (const { rd, s, spec } of all) if (rd.k === 'street') stamp(s, spec[0] + 2, P.walk);
        for (const { rd, s, spec } of all) stamp(s, spec[0], rd.k === 'lane' ? P.bank : P.roadEdge);
        for (const { rd, s, spec } of all) stamp(s, spec[1], rd.k === 'lane' ? P.lane : P.road);
        const nearOther = (p, self) => all.some((o) => o !== self && o.s.some((q) => Math.abs(q.x - p.x) < 9 && Math.abs(q.y - p.y) < 9));
        for (const a of all) {
            const { rd, s, spec } = a;
            const outer = spec[0];
            s.forEach((p, k) => {
                if (!inMap(p.x, p.y)) return;
                if (water[idx(p.x, p.y)]) {
                    for (const sd of [1, -1]) {
                        R(p.x + sd * p.nx * (outer / 2 + 1), p.y + sd * p.ny * (outer / 2 + 1), 1, 1, '#d8d0c0');
                        R(p.x + sd * p.nx * (outer / 2 + 2), p.y + sd * p.ny * (outer / 2 + 2), 1, 1, P.ink);
                    }
                }
                if (nearOther(p, a)) return;
                if (rd.k === 'lane') { if (k % 5 === 0) R(p.x + p.nx - 0.5, p.y + p.ny, 1, 1, P.lane2); }
                else if (k % 8 < 4) R(p.x - 0.5, p.y - 0.5, 1, 1, rd.k === 'motorway' ? '#e8c84a' : P.line);
            });
            markCurve(busy, s, outer + 4);
        }
        return all.map((a) => a.s);
    }
    function rail(rl) {
        const s = curve(rl.p);
        stamp(s, 7, P.ballast);
        s.forEach((p, i) => { if (i % 3 === 0) for (let k = -3; k <= 3; k++) R(p.x + p.nx * k, p.y + p.ny * k, 1, 1, P.sleeper); });
        for (const p of s) { R(p.x + p.nx * 2, p.y + p.ny * 2, 1, 1, P.rail); R(p.x - p.nx * 2, p.y - p.ny * 2, 1, 1, P.rail); }
        if (rl.k === 'tgv') for (let k = 0; k < s.length; k += 14) { const p = s[k]; R(p.x + p.nx * 5, p.y + p.ny * 5 - 4, 1, 5, '#6a6a6a'); R(p.x + p.nx * 5 - 1, p.y + p.ny * 5 - 4, 3, 1, '#6a6a6a'); }
        markCurve(busy, s, 12);
        return s;
    }
    function fields() {
        const tones = [[P.field, P.field2], [P.field3, '#6a8a34'], ['#b89a52', '#9c7e40'], [P.grass2, P.grass3], ['#d4c070', '#bba650']];
        for (let n = 0, tries = 0; n < 34 && tries < 400; tries++) {
            const w = 18 + Math.floor(rnd() * 22), h = 12 + Math.floor(rnd() * 14);
            const x = Math.floor(rnd() * (W - w)), y = Math.floor(rnd() * (H - h));
            if (!freeBox(x, y, w, h)) continue;
            const [a, b] = tones[Math.floor(rnd() * tones.length)];
            const dir = rnd() < 0.5;
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) R(x + i, y + j, 1, 1, ((dir ? i : j) % 3 === 0) ? b : a);
            for (let i = 0; i < w; i += 2) { R(x + i, y - 1, 1, 1, P.tree); R(x + i, y + h, 1, 1, P.tree); }
            for (let j = 0; j < h; j += 2) { R(x - 1, y + j, 1, 1, P.tree); R(x + w, y + j, 1, 1, P.tree); }
            markBox(busy, x - 1, y - 1, w + 2, h + 2);
            n++;
        }
    }
    function vines(x, y, w, h) {
        R(x, y, w, h, '#7a6a3a');
        for (let j = 1; j < h; j += 3) for (let i = 0; i < w; i++) R(x + i, y + j, 1, 1, (i % 3 === 0) ? '#2c6a2a' : '#3f8a36');
        for (let j = 1; j < h; j += 3) for (let i = 1; i < w; i += 4) R(x + i, y + j, 1, 1, '#6a2a5a');
        markBox(busy, x, y, w, h);
    }
    function land(blobs, biome = null) {
        landMask = new Uint8Array(W * H);
        R(0, 0, W, H, P.deep);
        for (let i = 0; i < 400; i++) R(rnd() * W, rnd() * H, 2 + Math.floor(rnd() * 3), 1, P.deep2);
        const cols = W / 2, rows = H / 2;
        const field = new Float32Array(cols * rows);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const x = i * 2 + 1, y = j * 2 + 1;
            let v = 0;
            for (const [bx, by, r] of blobs) v += (r * r) / ((x - bx) ** 2 + (y - by) ** 2 + 1);
            field[j * cols + i] = v + Math.sin(x / 7 + y / 11) * 0.08 + Math.sin(y / 5 - x / 13) * 0.06 + (rnd() - 0.5) * 0.06;
        }
        const at = (i, j) => (i < 0 || j < 0 || i >= cols || j >= rows ? 0 : field[j * cols + i]);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const v = at(i, j), x = i * 2, y = j * 2;
            if (v > 1) {
                let c = rnd() < 0.18 ? P.grass2 : (rnd() < 0.1 ? P.grass3 : P.grass);
                if (biome) c = biome(x, y, c);
                const coast = at(i + 1, j) <= 1 || at(i - 1, j) <= 1 || at(i, j + 1) <= 1 || at(i, j - 1) <= 1;
                R(x, y, 2, 2, coast ? (rnd() < 0.5 ? P.sand : P.sand2) : c);
                for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) landMask[(y + b) * W + x + a] = coast ? 0 : 1;
            } else if (v > 0.78) R(x, y, 2, 2, (v > 0.9 && rnd() < 0.3) ? P.foam : P.shallow);
        }
        for (let k = 0; k < 120; k++) { const x = rnd() * W, y = rnd() * H; if (!landMask[idx(x, y)]) R(x, y, 3, 1, P.water2); }
        for (let k = 0; k < W * H; k++) water[k] = landMask[k] ? 0 : 1;
    }

    // ---- Sprites
    function tree(x, y, pine = false) {
        R(x - 1, y + 5, 7, 2, P.shadow);
        R(x + 1, y + 4, 2, 3, P.trunk);
        if (pine) {
            R(x + 1, y - 4, 2, 2, P.tree2); R(x, y - 2, 4, 2, P.tree2); R(x - 1, y, 6, 2, P.tree); R(x - 2, y + 2, 8, 2, P.tree);
            R(x + 1, y - 2, 1, 2, P.tree3); R(x, y, 1, 1, P.tree3);
        } else {
            R(x - 2, y - 1, 8, 5, P.tree); R(x - 1, y - 3, 6, 2, P.tree2); R(x - 1, y - 1, 5, 3, P.tree2);
            R(x, y - 2, 2, 1, P.tree3); R(x - 1, y, 1, 1, P.tree3); R(x + 3, y + 2, 2, 1, '#174a22');
        }
    }
    function forest(cx, cy, r, pineRate) {
        const list = [];
        for (let k = 0; k < r * 3; k++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r; list.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7]); }
        list.sort((a, b) => a[1] - b[1]);
        for (const [x, y] of list) if (freeBox(x - 2, y - 4, 8, 10)) tree(Math.round(x), Math.round(y), rnd() < pineRate);
        for (const [x, y] of list) markBox(busy, x - 2, y - 4, 7, 8);
    }
    function house(x, y, roof = 'red') {
        const [rc, rd, rl] = roof === 'red' ? [P.roof, P.roofDark, P.roofLight] : [P.slate, P.slateDark, P.slateLight];
        const w = 11;
        R(x + 2, y + 10, w, 2, P.shadow); R(x + w, y + 4, 2, 7, P.shadow);
        R(x, y + 4, w, 7, P.wall); R(x + w - 3, y + 4, 3, 7, P.wallShade);
        R(x - 1, y, w + 2, 5, rc);
        for (let i = 0; i < w + 2; i += 2) R(x - 1 + i, y + 2, 1, 1, rd);
        R(x - 1, y, w + 2, 1, rl); R(x - 1, y + 4, w + 2, 1, rd);
        R(x + w - 4, y - 2, 2, 3, '#7a6a5a'); R(x + w - 4, y - 2, 2, 1, '#5a4a3a');
        R(x + 2, y + 6, 2, 2, rnd() < 0.3 ? P.glassLit : P.glass); R(x + 2, y + 6, 1, 1, '#d8ecff');
        R(x + w - 6, y + 7, 2, 4, P.door);
    }
    function block(x, y) {
        R(x + 2, y + 14, 12, 2, P.shadow); R(x + 12, y + 2, 2, 13, P.shadow);
        R(x, y, 12, 14, '#d8d0c0'); R(x + 9, y, 3, 14, '#b8b0a0'); R(x, y, 12, 1, '#6a6a6a');
        for (let j = 2; j < 12; j += 3) for (let i = 1; i < 9; i += 3) R(x + i, y + j, 2, 2, rnd() < 0.25 ? P.glassLit : P.glass);
        R(x + 4, y + 11, 3, 3, P.door);
    }
    function mountain(x, y, s) {
        const half = s * 0.8;
        for (let j = 0; j < s; j++) {
            const w = (j / s) * half;
            for (let i = -w; i <= w; i++) {
                const snow = j < s * 0.32, left = i < 0;
                R(x + i, y + j, 1, 1, snow ? (left ? P.snow : P.snow2) : (left ? P.rock : (i > w - 2 ? P.rock3 : P.rock2)));
            }
        }
        R(x - half, y + s, half * 2, 1, P.rock3);
    }
    function peaks(area, count, min, spread) {
        const [x0, y0, x1, y1] = area;
        const list = [];
        for (let k = 0, tries = 0; k < count && tries < 500; tries++) {
            const s = min + Math.floor(rnd() * spread), x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0 - s);
            if (!freeBox(x - s * 0.8, y, s * 1.6, s)) continue;
            list.push([x, y, s]); markBox(busy, x - s * 0.8, y + s * 0.4, s * 1.6, s * 0.6); k++;
        }
        list.sort((a, b) => a[1] + a[2] - b[1] - b[2]).forEach(([x, y, s]) => mountain(Math.round(x), Math.round(y), s));
    }
    const box = (x, y, w, h, fill) => { R(x, y, w, h, P.ink); R(x + 1, y + 1, w - 2, h - 2, fill); };
    const shadowUnder = (x, y, w) => R(x + 2, y, w, 2, P.shadow);

    /** Each building, drawn around (x, y). */
    const ICONS = {
        stadium(x, y, big = false) {
            const w = big ? 40 : 34, h = big ? 28 : 24, x0 = x - w / 2, y0 = y - h / 2;
            R(x0 + 3, y0 + h, w, 3, P.shadow);
            box(x0, y0, w, h, P.stand);
            for (let j = 2; j < h - 2; j += 2) R(x0 + 1, y0 + j, w - 2, 1, P.stand2);
            for (let i = 3; i < w - 3; i += 3) { R(x0 + i, y0 + 2, 1, 1, colors.primary); R(x0 + i + 1, y0 + h - 3, 1, 1, '#c0392b'); }
            const px0 = x0 + 6, py0 = y0 + 6, pw = w - 12, ph = h - 12;
            R(px0 - 1, py0 - 1, pw + 2, ph + 2, '#6a6a6a');
            for (let i = 0; i < pw; i++) R(px0 + i, py0, 1, ph, Math.floor(i / 3) % 2 ? P.pitch : P.pitch2);
            R(px0, py0, 3, ph, colors.primary); R(px0 + pw - 3, py0, 3, ph, '#c0392b');
            R(px0 + Math.floor(pw / 2), py0, 1, ph, P.line);
            for (const [fx, fy] of [[x0 - 1, y0 - 4], [x0 + w - 1, y0 - 4], [x0 - 1, y0 + h - 3], [x0 + w - 1, y0 + h - 3]]) { R(fx, fy, 1, 4, '#3a3a3a'); R(fx - 1, fy - 1, 3, 2, '#fff3b0'); }
            flag(x - 1, y0 - 10, colors.primary, '#c0392b');
        },
        bigstadium(x, y) { ICONS.stadium(x, y, true); },
        school(x, y) {
            shadowUnder(x - 13, y + 7, 24);
            box(x - 12, y - 6, 24, 13, '#e9d8b8'); R(x + 6, y - 5, 5, 11, '#cfbf9c');
            R(x - 13, y - 9, 26, 4, P.slateDark); R(x - 13, y - 9, 26, 1, P.slateLight);
            for (const i of [-9, -5, 3, 7]) { R(x + i, y - 3, 2, 3, P.glass); R(x + i, y + 2, 2, 2, P.glass); }
            R(x - 2, y - 13, 5, 5, '#e9d8b8'); R(x - 1, y - 12, 3, 3, '#ffffff'); R(x, y - 12, 1, 2, P.ink);
            R(x - 2, y + 2, 4, 5, P.door);
            R(x - 22, y + 3, 9, 7, '#c86a3a'); R(x - 20, y + 5, 5, 3, '#d88a5a'); R(x - 22, y + 3, 9, 1, P.line);
            flag(x + 12, y - 18, '#2980b9', '#ffffff');
        },
        bar(x, y) {
            shadowUnder(x - 10, y + 6, 18);
            box(x - 9, y - 6, 18, 13, '#9a6a3e'); R(x - 10, y - 9, 20, 4, P.roofDark); R(x - 10, y - 9, 20, 1, P.roofLight);
            box(x - 6, y - 4, 12, 4, '#FFB81C');
            R(x - 6, y + 1, 4, 4, P.glassLit); R(x + 2, y + 1, 4, 6, '#3b2a1c');
            for (const dx of [-16, 12]) { R(x + dx, y + 2, 7, 2, '#e0e0e0'); for (let i = 0; i < 7; i += 2) R(x + dx + i, y + 2, 1, 2, '#c0392b'); R(x + dx + 3, y + 4, 1, 4, '#3a3a3a'); }
        },
        park(x, y) {
            for (let j = -9; j <= 9; j++) for (let i = -16; i <= 16; i++) if ((i / 16) ** 2 + (j / 9) ** 2 < 1) R(x + i, y + j, 1, 1, P.grass2);
            for (let i = -14; i <= 14; i++) R(x + i, y + Math.round(Math.sin(i / 5) * 2) + 4, 1, 2, P.walk);
            for (let j = -5; j <= 3; j++) for (let i = -6; i <= 6; i++) if ((i / 6) ** 2 + (j / 4) ** 2 < 1) { R(x + i - 4, y + j - 2, 1, 1, P.water); water[idx(x + i - 4, y + j - 2)] = 1; }
            R(x - 5, y - 3, 2, 1, '#ffffff'); R(x - 3, y - 3, 1, 1, '#f1c40f');
            tree(x + 7, y - 9); tree(x + 12, y - 3, true); tree(x - 15, y - 6); tree(x + 3, y + 5); R(x + 8, y + 3, 4, 1, '#7a5a3a');
        },
        cage(x, y) {
            shadowUnder(x - 14, y + 8, 28);
            box(x - 14, y - 8, 28, 16, '#c86a3a');
            R(x - 13, y - 7, 26, 1, P.line); R(x - 13, y + 6, 26, 1, P.line); R(x, y - 7, 1, 14, P.line);
            R(x - 13, y - 3, 3, 6, P.line); R(x + 10, y - 3, 3, 6, P.line);
            for (let i = -14; i <= 14; i += 2) { R(x + i, y - 9, 1, 1, '#8a8a8a'); R(x + i, y + 8, 1, 1, '#8a8a8a'); }
        },
        hall(x, y) {
            shadowUnder(x - 13, y + 7, 26);
            box(x - 13, y - 6, 26, 13, P.wall); R(x - 14, y - 9, 28, 4, P.slate); R(x - 14, y - 9, 28, 1, P.slateLight);
            for (const i of [-9, -5, -1, 3, 7]) { R(x + i, y - 4, 2, 10, '#f4efe2'); R(x + i + 1, y - 4, 1, 10, P.wallShade); }
            R(x - 3, y - 14, 6, 5, P.wall); R(x - 2, y - 13, 4, 3, '#ffffff'); R(x, y - 13, 1, 2, P.ink);
            flag(x + 13, y - 16, '#2a4a9a', '#c0392b');
        },
        market(x, y) {
            shadowUnder(x - 14, y + 7, 28);
            box(x - 14, y - 4, 28, 11, '#d8d0c0');
            for (let i = -15; i < 15; i += 2) { R(x + i, y - 8, 1, 4, '#c0392b'); R(x + i + 1, y - 8, 1, 4, '#f4f4f4'); }
            for (let i = -11; i < 12; i += 5) { R(x + i, y - 1, 3, 2, ['#e74c3c', '#f1c40f', '#2ecc71', '#e67e22', '#9b59b6'][((i + 11) / 5) % 5]); }
            R(x - 2, y + 2, 4, 5, P.door);
        },
        gym(x, y) {
            shadowUnder(x - 14, y + 7, 28);
            box(x - 14, y - 6, 28, 13, '#c8ccd0');
            for (let j = -9; j <= -6; j++) R(x - 14 + (j + 9), y + j, 28 - 2 * (j + 9), 1, P.slate);
            for (let i = -11; i < 11; i += 4) R(x + i, y - 3, 3, 2, P.glass);
            R(x - 3, y + 1, 6, 6, '#3b2a1c'); text(x - 5, y - 12, 'GYM', '#ffffff');
        },
        hq(x, y) {
            shadowUnder(x - 11, y + 7, 22);
            box(x - 11, y - 5, 22, 12, P.wall); R(x - 12, y - 8, 24, 4, colors.primary); R(x - 12, y - 5, 24, 1, colors.secondary);
            R(x - 7, y - 2, 3, 3, P.glassLit); R(x + 4, y - 2, 3, 3, P.glass); R(x - 2, y + 1, 4, 5, P.door);
            R(x + 13, y - 2, 8, 9, P.pitch); R(x + 13, y + 2, 8, 1, P.line);
            flag(x - 13, y - 17, colors.primary, colors.secondary);
        },
        busstation(x, y) {
            shadowUnder(x - 16, y + 8, 30);
            R(x - 16, y + 2, 32, 6, '#9a9a9a'); R(x - 16, y + 2, 32, 1, '#c8c8c8');
            R(x - 14, y - 8, 14, 2, '#3a3a3a'); R(x - 13, y - 6, 1, 8, '#3a3a3a'); R(x - 2, y - 6, 1, 8, '#3a3a3a'); R(x - 12, y - 6, 10, 6, '#a8d4f0');
            box(x + 1, y - 7, 15, 9, '#f1c40f'); R(x + 2, y - 2, 13, 2, '#1f6aa8');
            for (const i of [3, 6, 9, 12]) R(x + i, y - 5, 2, 2, '#bfe3ff');
            R(x + 3, y + 2, 3, 2, P.ink); R(x + 11, y + 2, 3, 2, P.ink);
            R(x - 16, y - 16, 13, 7, '#1f6aa8'); text(x - 15, y - 15, 'BUS', '#ffffff');
        },
        rerstation(x, y) {
            shadowUnder(x - 15, y + 8, 30);
            box(x - 15, y - 6, 30, 14, '#d8d0c0'); R(x - 16, y - 9, 32, 4, P.slate);
            for (let i = -12; i < 12; i += 4) R(x + i, y - 3, 2, 6, P.glass);
            R(x - 2, y + 2, 4, 5, P.door);
            box(x - 8, y - 18, 15, 8, '#e0e0e0'); text(x - 6, y - 16, 'RER', '#1f3a8a');
        },
        tgvstation(x, y) {
            shadowUnder(x - 19, y + 8, 38);
            R(x - 19, y - 8, 38, 16, P.ink);
            for (let i = -18; i < 18; i++) for (let j = -7; j < 7; j++) R(x + i, y + j, 1, 1, (i % 4 === 0 || j % 4 === 0) ? '#5a7a9a' : '#9cc8ea');
            R(x - 20, y - 11, 40, 3, '#e0e0e0');
            box(x - 8, y - 21, 17, 8, '#7a1f3a'); text(x - 5, y - 19, 'TGV', '#ffffff');
        },
        airport(x, y) {
            R(x - 30, y + 8, 56, 7, '#4a4a4a'); for (let i = -28; i < 24; i += 6) R(x + i, y + 11, 3, 1, P.line);
            box(x - 14, y - 4, 22, 10, '#c8ccd0'); for (let i = -12; i < 6; i += 3) R(x + i, y - 1, 2, 3, P.glass);
            R(x + 10, y - 14, 3, 18, '#9a9a9a'); box(x + 8, y - 17, 7, 4, P.glass);
            R(x - 26, y - 2, 10, 2, '#f4f4f4'); R(x - 22, y - 6, 2, 10, '#f4f4f4'); R(x - 26, y - 4, 2, 2, colors.primary);
        },
        village(x, y) {
            house(x - 18, y - 4); house(x - 5, y - 8, 'slate'); house(x + 6, y - 2);
            R(x - 9, y - 22, 4, 14, '#d8d0c0'); R(x - 10, y - 25, 6, 3, P.slateDark); R(x - 8, y - 28, 2, 3, P.slateDark); R(x - 8, y - 17, 2, 2, P.ink);
            flag(x + 16, y - 14, colors.primary, colors.secondary);
        },
        inn(x, y) {
            shadowUnder(x - 10, y + 7, 20);
            box(x - 10, y - 5, 20, 12, '#f4efe2');
            for (const i of [-9, -4, 1, 6]) R(x + i, y - 4, 1, 10, '#5b3a1e');
            R(x - 9, y, 18, 1, '#5b3a1e');
            R(x - 11, y - 9, 22, 5, P.roof); R(x - 11, y - 9, 22, 1, P.roofLight);
            R(x - 1, y + 2, 3, 4, P.door); R(x + 11, y - 5, 1, 6, P.ink); R(x + 12, y - 4, 4, 3, '#FFB81C');
        },
        farmschool(x, y) { ICONS.school(x, y); R(x + 16, y - 2, 10, 9, '#a83a2a'); R(x + 15, y - 5, 12, 3, '#6a2a1a'); R(x + 19, y + 2, 3, 5, '#3a1a10'); },
        farm(x, y) {
            R(x - 14, y - 4, 12, 11, '#a83a2a'); R(x - 15, y - 8, 14, 4, '#6a2a1a'); R(x - 10, y + 1, 4, 6, '#3a1a10');
            R(x - 1, y - 12, 6, 19, '#c8c8c8'); R(x - 2, y - 14, 8, 3, '#8a8a8a');
            house(x + 7, y - 4);
            for (let i = 0; i < 4; i++) R(x - 20 + i * 4, y + 9, 3, 2, '#f4f4f4');
        },
        pond(x, y) {
            for (let j = -7; j <= 7; j++) for (let i = -13; i <= 13; i++) {
                const d = (i / 13) ** 2 + (j / 7) ** 2;
                if (d < 1) { R(x + i, y + j, 1, 1, d > 0.7 ? P.water2 : P.water); water[idx(x + i, y + j)] = 1; } else if (d < 1.3) R(x + i, y + j, 1, 1, P.tuft);
            }
            for (const [i, j] of [[-6, 2], [-1, 0], [4, 2]]) R(x + i, y + j, 2, 1, '#9a9a9a');
            R(x + 9, y - 9, 1, 6, '#7a5a3a'); R(x + 10, y - 9, 4, 1, '#7a5a3a');
        },
        mill(x, y) {
            shadowUnder(x - 6, y + 9, 14);
            box(x - 6, y - 6, 12, 15, '#e8dcc4'); R(x - 7, y - 9, 14, 3, P.roofDark);
            R(x - 1, y + 3, 3, 6, P.door);
            for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 2; k < 11; k++) R(x + dx * k, y - 6 + dy * k, 2, 2, k % 3 === 0 ? '#f4f4f4' : '#7a5a3a');
        },
        chateau(x, y) {
            shadowUnder(x - 16, y + 8, 32);
            box(x - 14, y - 4, 28, 12, '#c8c0b0');
            for (const tx of [-17, 11]) { box(x + tx, y - 12, 7, 20, '#b8b0a0'); R(x + tx, y - 15, 7, 3, P.slateDark); R(x + tx + 3, y - 18, 1, 3, P.slateDark); }
            for (let i = -12; i < 12; i += 3) R(x + i, y - 6, 2, 2, '#c8c0b0');
            R(x - 3, y + 1, 6, 7, '#3b2a1c'); R(x - 9, y - 1, 2, 3, P.glass); R(x + 7, y - 1, 2, 3, P.glass);
            flag(x - 14, y - 26, '#2a4a9a', '#f1c40f');
        },
        church(x, y) {
            shadowUnder(x - 10, y + 8, 22);
            box(x - 10, y - 3, 20, 11, '#d8d0c0'); R(x - 11, y - 6, 22, 3, P.slate);
            box(x - 3, y - 14, 7, 12, '#d8d0c0'); R(x - 4, y - 17, 9, 3, P.slateDark); R(x - 1, y - 21, 3, 4, P.slateDark);
            R(x, y - 24, 1, 3, '#f1c40f'); R(x - 1, y - 23, 3, 1, '#f1c40f');
            R(x - 1, y - 11, 3, 3, '#f4f4f4'); R(x - 1, y + 3, 3, 5, P.door); R(x - 8, y, 2, 3, '#9b59b6'); R(x + 6, y, 2, 3, '#3498db');
        },
        lodge(x, y) {
            shadowUnder(x - 9, y + 7, 18);
            box(x - 9, y - 3, 18, 10, '#7a4a24'); for (let j = -2; j < 7; j += 2) R(x - 8, y + j, 16, 1, '#6a3a1a');
            R(x - 11, y - 8, 22, 5, '#3a5a2a'); R(x - 2, y + 1, 4, 6, '#3b2a1c'); R(x - 7, y - 1, 3, 3, P.glassLit);
            R(x + 4, y - 6, 4, 3, '#e8dcc4'); R(x + 4, y - 7, 1, 1, '#e8dcc4'); R(x + 7, y - 7, 1, 1, '#e8dcc4');
        },
        chalet(x, y) {
            shadowUnder(x - 8, y + 6, 18);
            R(x - 8, y - 3, 16, 10, '#7a4a24'); for (let j = -2; j < 7; j += 2) R(x - 8, y + j, 16, 1, '#6a3a1a');
            R(x - 10, y - 7, 20, 4, P.snow); R(x - 10, y - 4, 20, 1, P.snow2);
            R(x - 5, y - 1, 3, 3, P.glassLit); R(x + 2, y + 1, 3, 6, '#3b2a1c');
            for (let i = 0; i < 26; i++) R(x + 10 + i, y - 4 - i * 0.6, 1, 1, '#3a3a3a');
            R(x + 22, y - 12, 3, 3, '#c0392b');
        },
        academy(x, y) {
            R(x - 22, y - 8, 20, 14, P.pitch); R(x - 22, y - 1, 20, 1, P.line); R(x - 12, y - 8, 1, 14, P.line);
            R(x + 1, y - 8, 20, 14, P.pitch2); R(x + 1, y - 1, 20, 1, P.line);
            box(x - 6, y + 7, 12, 7, P.wall); R(x - 6, y + 6, 12, 2, colors.primary);
        },
        winery(x, y) {
            shadowUnder(x - 11, y + 6, 22);
            box(x - 11, y - 5, 22, 11, '#e8d8b0'); R(x - 12, y - 8, 24, 4, P.roof); R(x - 12, y - 8, 24, 1, P.roofLight);
            R(x - 6, y - 2, 2, 3, P.glass); R(x + 4, y - 2, 2, 3, P.glass); R(x - 1, y, 3, 5, P.door);
            for (const i of [-16, 14]) { R(x + i, y + 1, 4, 5, '#7a4a24'); R(x + i, y + 2, 4, 1, '#3a3a3a'); R(x + i, y + 4, 4, 1, '#3a3a3a'); }
        },
        pier(x, y) {
            for (let i = -12; i < 4; i++) R(x + i, y - 1, 1, 3, i % 3 === 0 ? '#5a3a1a' : '#8a6a3a');
            R(x + 4, y - 4, 9, 3, '#f4f4f4'); R(x + 7, y - 11, 1, 7, P.ink); R(x + 8, y - 10, 4, 5, '#ffffff');
            R(x - 14, y - 9, 8, 7, '#7a4a24'); R(x - 15, y - 11, 10, 2, P.roofDark);
        },
        refuge(x, y) {
            shadowUnder(x - 8, y + 6, 16);
            box(x - 8, y - 2, 16, 8, '#8a8a8a'); R(x - 9, y - 6, 18, 4, P.snow); R(x - 2, y + 1, 3, 5, '#3b2a1c'); R(x + 3, y, 2, 2, P.glassLit);
            flag(x + 9, y - 12, '#c0392b', '#ffffff');
        },
        observatory(x, y) {
            shadowUnder(x - 9, y + 7, 18);
            box(x - 9, y - 1, 18, 8, '#d8d0c0');
            for (let j = -8; j <= 0; j++) for (let i = -7; i <= 7; i++) if ((i / 7) ** 2 + ((j + 1) / 8) ** 2 < 1) R(x + i, y + j - 1, 1, 1, i < 1 ? '#e8e8e8' : '#bdbdbd');
            R(x + 1, y - 10, 2, 9, '#3a3a3a'); R(x + 3, y - 12, 4, 2, '#3a3a3a');
        },
        pass(x, y) {
            mountain(x - 6, y - 14, 18); mountain(x + 9, y - 10, 14);
            R(x - 3, y + 4, 8, 3, '#8a7a5a'); R(x - 1, y - 2, 1, 6, '#3a3a3a'); R(x - 4, y - 4, 8, 3, '#f4f4f4'); text(x - 3, y - 4, 'COL', '#1f3a8a');
        },
        thermal(x, y) {
            shadowUnder(x - 12, y + 7, 24);
            box(x - 12, y - 4, 24, 11, '#e8dcc4'); R(x - 13, y - 7, 26, 3, '#3a8080');
            for (let i = -9; i < 9; i += 4) R(x + i, y - 1, 2, 4, P.glass);
            R(x + 14, y + 1, 9, 5, P.water2);
            for (const dx of [16, 19]) { R(x + dx, y - 3, 1, 2, '#e8e8e8'); R(x + dx + 1, y - 5, 1, 2, '#e8e8e8'); }
        },
        port(x, y) {
            R(x - 14, y + 2, 28, 4, '#7a5a3a'); for (let i = -14; i < 14; i += 3) R(x + i, y + 6, 1, 3, '#5a3a1a');
            house(x - 12, y - 10); house(x + 1, y - 9, 'slate');
            R(x - 22, y + 8, 9, 3, '#f4f4f4'); R(x - 18, y + 1, 1, 7, P.ink); R(x - 17, y + 2, 4, 4, '#ffffff');
        },
        lighthouse(x, y) {
            R(x - 8, y + 6, 16, 3, '#7a7a7a');
            R(x - 2, y - 12, 5, 18, '#f4f4f4'); for (let j = -10; j < 6; j += 6) R(x - 2, y + j, 5, 3, '#c0392b');
            R(x - 3, y - 16, 7, 4, P.ink); R(x - 2, y - 15, 5, 2, '#FFB81C'); R(x - 3, y - 18, 7, 2, '#3a3a3a');
        },
        dome(x, y) {
            shadowUnder(x - 15, y + 8, 30);
            box(x - 15, y - 2, 30, 10, P.wall);
            for (let i = -12; i < 12; i += 4) R(x + i, y, 2, 7, '#f4efe2');
            for (let j = -9; j <= 0; j++) for (let i = -8; i <= 8; i++) if ((i / 8) ** 2 + ((j + 1) / 9) ** 2 < 1) R(x + i, y + j - 2, 1, 1, i < 0 ? '#5aa0a0' : '#3a8080');
            flag(x, y - 22, '#2a4a9a', '#ffffff');
        },
        studio(x, y) {
            shadowUnder(x - 12, y + 7, 24);
            box(x - 12, y - 6, 24, 13, '#2c3e50'); R(x - 10, y - 3, 20, 3, '#e74c3c'); text(x - 9, y - 3, 'TV', '#ffffff');
            R(x + 8, y - 16, 1, 10, '#9a9a9a'); R(x + 5, y - 17, 7, 2, '#bdbdbd'); R(x - 2, y + 2, 4, 5, '#bdbdbd');
        },
        racetrack(x, y) {
            for (let j = -9; j <= 9; j++) for (let i = -18; i <= 18; i++) {
                const d = (i / 18) ** 2 + (j / 9) ** 2;
                if (d < 1 && d > 0.55) R(x + i, y + j, 1, 1, '#4a4a4a'); else if (d <= 0.55) R(x + i, y + j, 1, 1, P.grass2);
            }
            for (let j = -9; j < 9; j += 2) R(x + 15, y + j, 2, 1, (j / 2) % 2 ? '#ffffff' : '#111111');
            R(x - 4, y - 2, 6, 3, '#c0392b'); R(x + 6, y + 5, 6, 3, '#1f6aa8');
        },
        museum(x, y) {
            shadowUnder(x - 14, y + 7, 28);
            box(x - 13, y - 4, 26, 11, '#ece2cc');
            for (let j = 0; j < 5; j++) R(x - 14 + j * 3, y - 9 + j, 28 - j * 6, 1, '#cdbd98');
            for (const i of [-10, -5, 0, 5, 10]) R(x + i - 1, y - 2, 2, 9, '#f8f4ea');
        },
        palace(x, y) {
            shadowUnder(x - 18, y + 7, 36);
            box(x - 18, y - 5, 36, 12, '#ece2cc'); R(x - 19, y - 8, 38, 3, P.slateDark);
            for (let i = -15; i < 16; i += 4) R(x + i, y - 2, 2, 3, P.glass);
            box(x - 4, y - 14, 9, 9, '#ece2cc'); R(x - 5, y - 16, 11, 2, P.slateDark);
            R(x - 2, y + 2, 5, 5, '#3b2a1c'); flag(x, y - 26, '#2a4a9a', '#c0392b');
        },
        newspaper(x, y) {
            shadowUnder(x - 9, y + 7, 18);
            box(x - 9, y - 12, 18, 19, '#c8ccd0');
            for (let j = -10; j < 5; j += 3) for (let i = -7; i < 7; i += 3) R(x + i, y + j, 2, 2, P.glass);
            R(x - 11, y - 16, 22, 4, '#111111'); text(x - 10, y - 16, 'NEWS', '#FFB81C');
        },
        city(x, y) {
            /** @type {[number, number, string][]} */
            const towers = [[-10, 9, '#b8c0c8'], [-6, 15, '#9aa4b0'], [-1, 11, '#c8d0d8'], [4, 19, '#8a96a4'], [9, 8, '#b0b8c0'], [13, 12, '#a0aab6']];
            for (const [dx, h, c] of towers) {
                box(x + dx - 2, y - h, 5, h, c);
                for (let j = y - h + 2; j < y - 1; j += 3) R(x + dx, j, 1, 1, P.glassLit);
            }
            R(x - 13, y, 30, 2, P.shadow);
        },
    };

    function scatterHouses(roadSamples, n, opts = {}) {
        let placed = 0;
        for (const s of roadSamples) for (let k = 0; k < s.length && placed < n; k += 7) {
            const p = s[k];
            for (const side of [1, -1]) {
                if (rnd() < (opts.skip || 0.35)) continue;
                const off = 10 + rnd() * 3;
                const hx = Math.round(p.x + p.nx * off * side - 6), hy = Math.round(p.y + p.ny * off * side - 6);
                const centre = opts.centre && Math.abs(hx - opts.centre[0]) < opts.centre[2] && Math.abs(hy - opts.centre[1]) < opts.centre[3];
                if (!freeBox(hx - 1, hy - 2, centre ? 15 : 14, centre ? 17 : 13)) continue;
                if (centre) block(hx, hy); else house(hx, hy, rnd() < 0.3 ? 'slate' : 'red');
                markBox(busy, hx - 2, hy - 3, centre ? 17 : 16, centre ? 19 : 15);
                placed++;
            }
        }
    }
    function scatterTrees(n, pineRate) {
        for (let k = 0, tries = 0; k < n && tries < n * 20; tries++) {
            const x = Math.round(rnd() * W), y = Math.round(rnd() * H);
            if (!freeBox(x - 2, y - 4, 8, 11)) continue;
            tree(x, y, rnd() < pineRate); markBox(busy, x - 2, y - 4, 8, 10); k++;
        }
    }

    // ---- The map
    const places = Object.entries(map.places);
    const reserve = (w, h) => { for (const [, [x, y]] of places) markBox(busy, x - w / 2, y - h + 12, w, h); };
    /** @type {ReturnType<typeof curve>[]} */
    let roads = [];
    if (map.style === 'town') {
        grass();
        map.rivers.forEach(river);
        reserve(44, 36);
        roads = drawRoads(map.roads);
    } else if (map.style === 'county') {
        grass();
        map.rivers.forEach(river);
        reserve(48, 40);
        roads = drawRoads(map.roads);
        map.rails.forEach(rail);
    } else if (map.style === 'region') {
        grass(P.grass, '#5aa35f', P.grass3);
        map.lakes.forEach(([x, y, rx, ry]) => lake(x, y, rx, ry));
        reserve(48, 40);
        map.vines.forEach(([x, y, w, h]) => vines(x, y, w, h));
        roads = drawRoads(map.roads);
        map.rails.forEach(rail);
    } else if (map.style === 'country') {
        land(map.blobs);
        map.lakes.forEach(([x, y, rx, ry]) => lake(x, y, rx, ry));
        reserve(44, 38);
        roads = drawRoads(map.roads);
    } else {
        land(map.blobs, (x, y, c) => (y < 14 || y > 176 ? (rnd() < 0.2 ? '#d8e4ec' : P.ice)
            : ((x > 150 && x < 190 && y > 84 && y < 104) || (x > 200 && x < 240 && y > 58 && y < 76)) ? (rnd() < 0.3 ? P.desert2 : P.desert) : c));
        reserve(32, 30);
        const [hx, hy] = map.places.home;
        for (const [id, [x, y]] of places) {
            if (id === 'home') continue;
            const arc = flightArc({ x: hx, y: hy + 6 }, { x, y: y + 6 });
            for (let k = 0; k < arc.length; k += 6) R(arc[k].x, arc[k].y, 2, 1, 'rgba(255,255,255,0.55)');
        }
    }

    // Each place's door on the road network (a footpath to the nearest road), then the buildings
    /** @type {Record<string, { x: number, y: number }>} */
    const doors = {};
    for (const [id, [x, y]] of places) doors[id] = map.style === 'world' ? { x, y: y + 6 } : { x, y: y + 10 };
    if (map.style !== 'world') {
        for (const [id] of places) {
            const d = doors[id];
            let best = null, bd = Infinity;
            for (const s of roads) for (const p of s) { const dd = Math.hypot(p.x - d.x, p.y - d.y); if (dd < bd) { bd = dd; best = p; } }
            if (!best) continue;
            const n = Math.ceil(bd);
            for (let k = 0; k <= n; k++) { const x = d.x + (best.x - d.x) * k / n, y = d.y + (best.y - d.y) * k / n; if (inMap(x, y) && !water[idx(x, y)]) R(x - 1, y - 1, 3, 3, P.walk); }
        }
    }
    for (const [, [x, y, icon]] of places) ICONS[icon](x, y);
    // Decoration around them
    if (map.style === 'town') { scatterHouses(roads, 90, { centre: [140, 90, 50, 26], skip: 0.25 }); scatterTrees(70, 0.1); }
    if (map.style === 'county') { map.forests.forEach(([x, y, r]) => forest(x, y, r, 0.35)); fields(); scatterHouses(roads, 16, { skip: 0.8 }); scatterTrees(90, 0.3); }
    if (map.style === 'region') { peaks(map.mountains, 22, 10, 14); map.forests.forEach(([x, y, r]) => forest(x, y, r, 0.7)); scatterHouses(roads, 14, { skip: 0.85 }); scatterTrees(80, 0.55); }
    if (map.style === 'country') {
        peaks(map.mountains, 14, 8, 10);
        map.forests.forEach(([x, y, r]) => forest(x, y, r, 0.5));
        for (let k = 0, tries = 0; k < 8 && tries < 300; tries++) { const x = Math.round(rnd() * W), y = Math.round(rnd() * H); if (!freeBox(x - 2, y - 3, 30, 16)) continue; house(x, y); house(x + 12, y + 2, 'slate'); markBox(busy, x - 2, y - 3, 30, 16); k++; }
        scatterTrees(60, 0.4);
    }
    if (map.style === 'world') {
        for (let k = 0, tries = 0; k < 9 && tries < 400; tries++) { const s = 7 + Math.floor(rnd() * 6), x = rnd() * W, y = rnd() * H; if (!freeBox(x - s, y, s * 2, s)) continue; mountain(Math.round(x), Math.round(y), s); markBox(busy, x - s, y, s * 2, s); k++; }
        scatterTrees(110, 0.5);
    }

    const waterPixels = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (water[idx(x, y)] && rnd() < 0.18) waterPixels.push([x, y]);
    const rails = (map.rails || []).map((rl) => ({ s: curve(rl.p), kind: rl.k }));
    return { roads, doors, waterPixels, flags, rails, rnd };
}

/** The road network: samples every 3 pixels, joined at junctions, each place's door linked to its nearest node. */
function buildGraph(roads, doors) {
    /** @type {{ x: number, y: number }[]} */
    const nodes = [];
    /** @type {[number, number][][]} */
    const edges = [];
    const add = (x, y) => { nodes.push({ x, y }); edges.push([]); return nodes.length - 1; };
    const link = (a, b) => { const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y); edges[a].push([b, d]); edges[b].push([a, d]); };
    const lines = roads.map((s) => {
        const ids = [];
        for (let k = 0; k < s.length; k += 3) ids.push(add(s[k].x, s[k].y));
        ids.push(add(s[s.length - 1].x, s[s.length - 1].y));
        for (let k = 0; k < ids.length - 1; k++) link(ids[k], ids[k + 1]);
        return ids;
    });
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
        for (const i of lines[a]) for (const j of lines[b]) if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < 4) link(i, j);
    }
    /** @type {Record<string, number>} */
    const doorNode = {};
    const roadCount = nodes.length;
    for (const [id, d] of Object.entries(doors)) {
        const door = add(d.x, d.y);
        let best = -1, bd = Infinity;
        for (let i = 0; i < roadCount; i++) { const dd = Math.hypot(nodes[i].x - d.x, nodes[i].y - d.y); if (dd < bd) { bd = dd; best = i; } }
        if (best >= 0) link(door, best);
        doorNode[id] = door;
    }
    return { nodes, edges, doorNode };
}

/** The shortest path between two nodes (Dijkstra; the networks have a few thousand nodes). */
function shortest(graph, from, to) {
    const { nodes, edges } = graph;
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    dist[from] = 0;
    for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0 || u === to) break;
        done[u] = 1;
        for (const [v, d] of edges[u]) if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
    }
    const path = [];
    for (let v = to; v >= 0; v = prev[v]) path.unshift({ x: nodes[v].x, y: nodes[v].y });
    return path;
}

/**
 * The live map on `canvas`.
 * @param {{ canvas: HTMLCanvasElement, onArrive: (place: string) => void }} options
 */
export function createCareerMap({ canvas, onArrive }) {
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    let tier = 'school';
    let colors = { primary: '#f1c40f', secondary: '#111111' };
    /** @type {ImageData | null} */
    let image = null;
    /** @type {ReturnType<typeof drawMap> | null} */
    let art = null;
    /** @type {ReturnType<typeof buildGraph> | null} */
    let graph = null;
    let pos = { x: 0, y: 0 };
    /** @type {{ x: number, y: number }[]} */
    let route = [];
    let at = 'home';
    /** @type {string | null} */
    let arriving = null;
    let heading = 1;
    let running = false;
    let last = 0;
    let lastFrame = -1;
    /** @type {{ s: any[], k: number, dir: number, color: string, speed: number }[]} */
    let cars = [];
    /** @type {{ s: any[], k: number, kind: string }[]} */
    let trains = [];
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };

    function drawMover(now) {
        const x = Math.round(pos.x), y = Math.round(pos.y);
        const step = route.length && !reducedMotion() ? Math.floor(now / 130) % 2 : 0;
        const kind = MAPS[tier].mover;
        if (kind === 'walk') {
            R(x - 3, y + 1, 7, 2, P.shadow);
            R(x - 3, y - 12, 6, 14, P.ink);
            R(x - 2, y - 11, 4, 4, '#e8b48c'); R(x - 2, y - 12, 4, 2, '#6d4c2e'); R(x + (heading > 0 ? 1 : -2), y - 10, 1, 1, P.ink);
            R(x - 2, y - 7, 4, 5, colors.primary); R(x - 2, y - 5, 4, 1, colors.secondary);
            R(x - 2, y - 2, 1, 3 - step, '#1f2a3a'); R(x + 1, y - 2, 1, 2 + step, '#1f2a3a');
            R(x + (heading > 0 ? 2 : -4), y - 6, 2, 3, '#ffffff');
        } else if (kind === 'bus') {
            R(x - 9, y + 1, 20, 2, P.shadow);
            R(x - 10, y - 8, 20, 10, P.ink); R(x - 9, y - 7, 18, 7, colors.primary); R(x - 9, y - 2, 18, 2, colors.secondary);
            for (const i of [-7, -3, 1, 5]) R(x + i, y - 6, 3, 2, '#bfe3ff');
            R(x + (heading > 0 ? 7 : -9), y - 6, 2, 3, '#e0f0ff');
            R(x - 7, y + 1, 3, 2, P.ink); R(x + 4, y + 1, 3, 2, P.ink);
        } else {
            R(x - 6, y + 8, 12, 2, P.shadow);
            R(x - 8, y - 2, 17, 4, P.ink); R(x - 7, y - 1, 15, 2, '#f4f4f4');
            R(x - 2, y - 7, 4, 14, P.ink); R(x - 1, y - 6, 2, 12, '#f4f4f4');
            R(x + (heading > 0 ? -8 : 6), y - 4, 3, 4, colors.primary);
        }
    }

    function drawLife(now) {
        if (!art) return;
        const bucket = Math.floor(now / 260);
        art.waterPixels.forEach(([x, y], i) => { if ((i * 7919 + bucket * 31) % 41 === 0) { R(x, y, 2, 1, P.water3); R(x + 1, y, 1, 1, '#ffffff'); } });
        for (const c of cars) {
            const p = c.s[Math.floor(c.k)];
            const ox = p.nx * 1.5 * c.dir, oy = p.ny * 1.5 * c.dir;
            if (Math.abs(p.tx) > Math.abs(p.ty)) { R(p.x - 3 + ox, p.y - 1 + oy, 6, 3, P.ink); R(p.x - 2 + ox, p.y - 1 + oy, 4, 2, c.color); R(p.x - 1 + ox, p.y - 1 + oy, 2, 1, '#bfe3ff'); }
            else { R(p.x - 1 + ox, p.y - 3 + oy, 3, 6, P.ink); R(p.x - 1 + ox, p.y - 2 + oy, 2, 4, c.color); R(p.x - 1 + ox, p.y - 1 + oy, 2, 1, '#bfe3ff'); }
        }
        for (const tr of trains) {
            const colorsOf = tr.kind === 'tgv' ? ['#f4f4f4', '#7a1f3a'] : ['#e8e8e8', '#1f3a8a'];
            for (let w = 0; w < (tr.kind === 'tgv' ? 4 : 3); w++) {
                const k = Math.floor(tr.k) - w * 9;
                if (k < 0 || k >= tr.s.length) continue;
                const p = tr.s[k];
                R(p.x - 4, p.y - 2, 8, 4, P.ink); R(p.x - 3, p.y - 2, 6, 3, colorsOf[0]); R(p.x - 3, p.y, 6, 1, colorsOf[1]);
            }
        }
        const wave = Math.floor(now / 300) % 2;
        for (const f of art.flags) { R(f.x, f.y, 4, 2, f.c1); R(f.x, f.y + 2, 4 - wave, 1, f.c2); R(f.x + 3, f.y + wave, 1, 2, f.c1); }
    }

    function loop(now) {
        if (!running) return;
        const dt = Math.min(50, now - (last || now));
        last = now;
        if (!reducedMotion()) {
            for (const c of cars) { c.k += c.dir * c.speed * dt; if (c.k >= c.s.length - 1) { c.k = c.s.length - 1; c.dir = -1; } if (c.k <= 0) { c.k = 0; c.dir = 1; } }
            for (const tr of trains) { tr.k += 0.05 * dt; if (tr.k > tr.s.length + 400) tr.k = 0; }
        }
        let left = { walk: 0.045, bus: 0.09, plane: 0.11 }[MAPS[tier].mover] * dt;
        while (route.length && left > 0) {
            const target = route[0];
            const dx = target.x - pos.x, dy = target.y - pos.y, d = Math.hypot(dx, dy);
            if (Math.abs(dx) > 0.3) heading = Math.sign(dx);
            if (d <= left) { pos = { x: target.x, y: target.y }; route.shift(); left -= d; }
            else { pos.x += (dx / d) * left; pos.y += (dy / d) * left; left = 0; }
        }
        if (!route.length && arriving) { const place = arriving; arriving = null; onArrive(place); }
        const frame = Math.floor(now / 40);
        if (frame !== lastFrame && image) { lastFrame = frame; g.putImageData(image, 0, 0); drawLife(now); drawMover(now); }
        requestAnimationFrame(loop);
    }

    function nearestNode(q) {
        let best = 0, bd = Infinity;
        graph.nodes.forEach((n, i) => { const d = Math.hypot(n.x - q.x, n.y - q.y); if (d < bd) { bd = d; best = i; } });
        return best;
    }

    return {
        /**
         * Show `tier`'s map, the coach at `place`, in the club's colours.
         * @param {string} newTier @param {string} place @param {{ primary: string, secondary: string }} clubColors
         */
        show(newTier, place, clubColors) {
            tier = newTier;
            colors = clubColors;
            g.imageSmoothingEnabled = false;
            art = drawMap(g, tier, colors);
            image = g.getImageData(0, 0, W, H);
            graph = MAPS[tier].style === 'world' ? null : buildGraph(art.roads, art.doors);
            at = MAPS[tier].places[place] ? place : 'home';
            pos = { ...art.doors[at] };
            route = [];
            arriving = null;
            const rnd = art.rnd;
            cars = [];
            if (MAPS[tier].style !== 'world') {
                art.roads.forEach((s, i) => { if (s.length > 120 && i % 3 === 0) cars.push({ s, k: rnd() * s.length, dir: rnd() < 0.5 ? 1 : -1, color: ['#c0392b', '#2980b9', '#ecf0f1', '#27ae60', '#8e44ad'][Math.floor(rnd() * 5)], speed: 0.018 + rnd() * 0.015 }); });
            }
            trains = art.rails.map((rl) => ({ s: rl.s, k: 0, kind: rl.kind }));
            g.putImageData(image, 0, 0);
            drawMover(0);
        },
        /** Where a place stands, in map pixels (320 x 192), for its button. */
        placeAt: (place) => {
            const p = MAPS[tier].places[place];
            return p ? { x: p[0], y: p[1] } : null;
        },
        /** The places of the shown map. */
        places: () => Object.keys(MAPS[tier].places),
        /** Go to `place`; onArrive(place) when there (at once with reduced motion, or when already there). */
        go(place) {
            if (!art || !MAPS[tier].places[place]) return;
            const goal = art.doors[place];
            if (reducedMotion() || (at === place && !route.length)) {
                pos = { ...goal }; route = []; at = place; arriving = null;
                if (image) { g.putImageData(image, 0, 0); drawMover(0); }
                onArrive(place);
                return;
            }
            route = graph ? shortest(graph, nearestNode(pos), graph.doorNode[place]) : flightArc(pos, goal);
            at = place;
            arriving = place;
        },
        /** Where the coach is (or is going). */
        at: () => at,
        start() { if (!running) { running = true; last = 0; requestAnimationFrame(loop); } },
        stop() { running = false; },
    };
}
