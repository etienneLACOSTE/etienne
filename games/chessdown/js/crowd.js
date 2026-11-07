// @ts-check
// The stadium around the field, seen from above, in big pixels: on each side of the
// pitch a grass apron, a barrier, then blue stands (rows of seats parallel to the
// touchline, stairs every few seats) with the crowd sitting in them; beyond, the
// concourse. A few fans stand up or sit down now and then. Purely decorative, drawn
// on a tiny canvas scaled up without smoothing (#crowd in styles.css); still when the
// visitor asks for reduced motion.
import { COLOR_HEX } from './state.js';

const PIXEL = 5; // Screen pixels per stadium pixel
const COLORS = {
    concourse: '#0E1A2E',
    apron: '#0B6E3F', // The turf of the field
    barrier: '#D9DEE6',
    seat: ['#2B5FB4', '#3A70C9'], // Alternate rows
    riser: '#1C4180',
    stairs: '#7A8494',
};
const SKINS = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
const SHIRTS = Object.values(COLOR_HEX);
const ROW = 3; // A row of seats: 2 pixels of seat + 1 riser
const SEAT = 3; // A seat every 3 pixels along the row
const STAIRS_EVERY = 12; // Seats between two stairs
const MAX_ROWS = 16;

/** Seeded random numbers, so the crowd looks the same on every visit. */
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => DOMRect | null} field  The pitch on screen (null: not shown)
 */
export function startCrowd(canvas, field) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** @type {Array<{x: number, y: number, shirt: string, skin: string, up: boolean}>} */
    let fans = [];
    /** @type {Array<{x: number, y: number, w: number, h: number}>} */
    let stands = [];
    let key = '';

    /** Where the pitch is, in stadium pixels (a centred default when it is hidden). */
    function pitch() {
        const rect = field();
        const w = canvas.width;
        const h = canvas.height;
        if (!rect || rect.width === 0) return { left: Math.round(w * 0.35), right: Math.round(w * 0.65), top: 0, bottom: h };
        return {
            left: Math.floor(rect.left / PIXEL),
            right: Math.ceil(rect.right / PIXEL),
            top: Math.floor(rect.top / PIXEL),
            bottom: Math.ceil(rect.bottom / PIXEL),
        };
    }

    function layout() {
        canvas.width = Math.ceil(window.innerWidth / PIXEL);
        canvas.height = Math.ceil(window.innerHeight / PIXEL);
        const p = pitch();
        key = `${canvas.width}x${canvas.height}:${p.left},${p.right},${p.top},${p.bottom}`;
        const random = seeded(7);
        fans = [];
        stands = [];
        // Stands on both sides: from the barrier outwards, up to MAX_ROWS rows.
        const sides = [
            { inner: p.left - 3, dir: -1 },
            { inner: p.right + 2, dir: 1 },
        ];
        for (const { inner, dir } of sides) {
            const room = dir < 0 ? inner : canvas.width - inner;
            const rows = Math.max(0, Math.min(MAX_ROWS, Math.floor(room / ROW)));
            if (rows === 0) continue;
            const width = rows * ROW;
            const x0 = dir < 0 ? inner - width : inner + 1;
            stands.push({ x: x0, y: 0, w: width, h: canvas.height });
            for (let row = 0; row < rows; row++) {
                // Row 0 is the closest to the pitch.
                const x = dir < 0 ? inner - (row + 1) * ROW : inner + 1 + row * ROW;
                for (let y = 0, seat = 0; y + 2 <= canvas.height; y += SEAT, seat++) {
                    if (seat % STAIRS_EVERY === STAIRS_EVERY - 1) continue; // Stairs
                    if (random() < 0.3) continue; // An empty seat
                    fans.push({
                        x: x + (dir < 0 ? 1 : 0), y,
                        shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
                        skin: SKINS[Math.floor(random() * SKINS.length)],
                        up: false,
                    });
                }
            }
        }
        draw();
    }

    function draw() {
        const p = pitch();
        ctx.fillStyle = COLORS.concourse;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // The pitch runs the full height (the board covers its middle), with a grass
        // apron and a barrier along both touchlines.
        ctx.fillStyle = COLORS.apron;
        ctx.fillRect(p.left - 2, 0, p.right - p.left + 4, canvas.height);
        ctx.fillStyle = COLORS.barrier;
        ctx.fillRect(p.left - 3, 0, 1, canvas.height);
        ctx.fillRect(p.right + 2, 0, 1, canvas.height);
        // Seats: rows parallel to the touchline, with risers and stairs.
        for (const s of stands) {
            for (let i = 0; i < s.w; i += ROW) {
                const nearRight = s.x > p.right;
                const rowIndex = nearRight ? i / ROW : (s.w - i) / ROW - 1;
                ctx.fillStyle = COLORS.seat[rowIndex % 2];
                ctx.fillRect(s.x + i + (nearRight ? 0 : 1), 0, 2, canvas.height);
                ctx.fillStyle = COLORS.riser;
                ctx.fillRect(s.x + i + (nearRight ? 2 : 0), 0, 1, canvas.height);
            }
            ctx.fillStyle = COLORS.stairs;
            for (let y = (STAIRS_EVERY - 1) * SEAT; y < canvas.height; y += STAIRS_EVERY * SEAT) {
                ctx.fillRect(s.x, y, s.w, 2);
            }
        }
        // The crowd: a head and a shirt in the colours of the teams.
        for (const fan of fans) {
            const y = fan.y - (fan.up ? 1 : 0);
            ctx.fillStyle = fan.shirt;
            ctx.fillRect(fan.x, y + 1, 2, 1);
            ctx.fillStyle = fan.skin;
            ctx.fillRect(fan.x + (fan.x % 2), y, 1, 1);
        }
    }

    layout();
    window.addEventListener('resize', layout);
    setInterval(() => {
        if (document.hidden) return;
        // Follow the pitch when it moves (draft, match, rotated view, resize).
        const p = pitch();
        const now = `${Math.ceil(window.innerWidth / PIXEL)}x${Math.ceil(window.innerHeight / PIXEL)}:${p.left},${p.right},${p.top},${p.bottom}`;
        if (now !== key) { layout(); return; }
        if (still || fans.length === 0) return;
        // A handful of fans stand up or sit down: just enough to feel alive.
        for (let i = 0; i < Math.max(1, fans.length * 0.02); i++) {
            const fan = fans[Math.floor(Math.random() * fans.length)];
            fan.up = !fan.up;
        }
        draw();
    }, 400);
}
