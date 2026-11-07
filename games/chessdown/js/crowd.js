// @ts-check
// Stands around the field: a rudimentary pixel crowd that moves very slightly.
// Drawn on a tiny canvas scaled up without smoothing (see #crowd in styles.css).
// Purely decorative; still when the visitor asks for reduced motion.
import { COLOR_HEX } from './state.js';

const PIXEL = 6; // Screen pixels per crowd pixel
const SEAT_ROW = 5; // Crowd pixels per tier: head, 2 shirt rows, seat, step
const FAN_STEP = 3; // Crowd pixels between two fans
const SKINS = ['#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
const SHIRTS = Object.values(COLOR_HEX);
const STAND = '#141414';
const STEP = '#262626';

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

/** @param {HTMLCanvasElement} canvas */
export function startCrowd(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** @type {Array<{x: number, y: number, shirt: string, skin: string, up: boolean}>} */
    let fans = [];

    function layout() {
        canvas.width = Math.ceil(window.innerWidth / PIXEL);
        canvas.height = Math.ceil(window.innerHeight / PIXEL);
        const random = seeded(7);
        fans = [];
        for (let y = 1; y + SEAT_ROW <= canvas.height; y += SEAT_ROW) {
            const shift = (y / SEAT_ROW) % 2 ? 1 : 0; // Staggered seats
            for (let x = shift; x + 2 <= canvas.width; x += FAN_STEP) {
                if (random() < 0.12) continue; // A few empty seats
                fans.push({
                    x, y,
                    shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
                    skin: SKINS[Math.floor(random() * SKINS.length)],
                    up: false,
                });
            }
        }
        draw();
    }

    function draw() {
        ctx.fillStyle = STAND;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = STEP;
        for (let y = 1 + SEAT_ROW - 1; y < canvas.height; y += SEAT_ROW) ctx.fillRect(0, y, canvas.width, 1);
        for (const fan of fans) {
            const y = fan.y - (fan.up ? 1 : 0);
            ctx.fillStyle = fan.skin;
            ctx.fillRect(fan.x, y, 2, 1);
            ctx.fillStyle = fan.shirt;
            ctx.fillRect(fan.x, y + 1, 2, 2);
        }
    }

    layout();
    window.addEventListener('resize', layout);
    if (still) return;
    const random = Math.random;
    setInterval(() => {
        if (document.hidden || fans.length === 0) return;
        // A handful of fans stand up or sit down: just enough to feel alive.
        for (let i = 0; i < Math.max(1, fans.length * 0.03); i++) {
            const fan = fans[Math.floor(random() * fans.length)];
            fan.up = !fan.up;
        }
        draw();
    }, 400);
}
