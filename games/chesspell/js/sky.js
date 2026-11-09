// @ts-check
// The night sky behind the grimoire: stars that twinkle slowly and motes of dust
// (gold and lilac) drifting upwards, as if the book gave off magic. Purely decorative,
// drawn on a canvas behind the app (#sky in style.css); one still frame when the
// visitor asks for reduced motion, and nothing is drawn while the tab is hidden.

const COLORS = {
    star: [236, 230, 247], // --mist
    gold: [212, 175, 98], // --gold
    lilac: [201, 182, 242], // --lilac
};
const STARS_PER_PIXEL = 1 / 9000;
const MOTES_PER_PIXEL = 1 / 30000;

/** Seeded random numbers, so the sky looks the same on every visit. */
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
export function startSky(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    /** @type {{x: number, y: number, r: number, phase: number, speed: number}[]} */
    let stars = [];
    /** @type {{x: number, y: number, r: number, vx: number, vy: number, phase: number, color: number[]}[]} */
    let motes = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    function populate() {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const random = seeded(1618);
        const area = width * height;
        stars = Array.from({ length: Math.round(area * STARS_PER_PIXEL) }, () => ({
            x: random() * width,
            y: random() * height,
            r: random() < 0.12 ? 1.4 : 0.5 + random() * 0.6,
            phase: random() * Math.PI * 2,
            speed: 0.4 + random() * 1.2,
        }));
        motes = Array.from({ length: Math.max(8, Math.round(area * MOTES_PER_PIXEL)) }, () => ({
            x: random() * width,
            y: random() * height,
            r: 1 + random() * 1.8,
            vx: (random() - 0.5) * 6,
            vy: -(4 + random() * 10),
            phase: random() * Math.PI * 2,
            color: random() < 0.55 ? COLORS.gold : COLORS.lilac,
        }));
    }

    /** @param {number} time seconds */
    function draw(time, dt) {
        ctx.clearRect(0, 0, width, height);
        const [sr, sg, sb] = COLORS.star;
        for (const s of stars) {
            const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
            ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${glow.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
            if (s.r > 1) { // A few bright stars get a small cross of light
                ctx.fillRect(s.x - s.r * 3, s.y - 0.3, s.r * 6, 0.6);
                ctx.fillRect(s.x - 0.3, s.y - s.r * 3, 0.6, s.r * 6);
            }
        }
        for (const m of motes) {
            m.x += (m.vx + Math.sin(time * 0.6 + m.phase) * 4) * dt;
            m.y += m.vy * dt;
            if (m.y < -10) { m.y = height + 10; m.x = Math.random() * width; }
            if (m.x < -10) m.x = width + 10;
            if (m.x > width + 10) m.x = -10;
            const [r, g, b] = m.color;
            const alpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 1.3 + m.phase));
            const halo = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
            halo.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`);
            halo.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    let last = 0;
    /** @param {number} now */
    function loop(now) {
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
        last = now;
        draw(now / 1000, dt);
        frame = requestAnimationFrame(loop);
    }

    function start() {
        cancelAnimationFrame(frame);
        last = 0;
        if (still.matches || document.hidden) draw(0, 0);
        else frame = requestAnimationFrame(loop);
    }

    populate();
    start();
    window.addEventListener('resize', () => { populate(); start(); });
    document.addEventListener('visibilitychange', start);
    still.addEventListener('change', start);
}
