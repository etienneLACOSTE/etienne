// @ts-check
// Club art (All Star): the crest (shape, emblem, the club's initials), the home jersey,
// and colour helpers. Everything is SVG built from the club's own fields, which
// club-rules.js has checked (colours are #rrggbb, names are escaped here).
// Emblems are simple drawn shapes, never emoji: the same on every device.
import { t } from '../../../assets/js/i18n.js';

const Club = globalThis.ChessdownClub;

/** Shortcut shades offered next to the free colour picker (the game's jersey colours first). */
export const PRESETS = {
    red: '#e74c3c', blue: '#3498db', green: '#2ecc71', yellow: '#f1c40f', purple: '#9b59b6', orange: '#e67e22',
    white: '#ecf0f1', navy: '#2c3e50', black: '#111111', claret: '#7b1e3a', sky: '#7ec8f2', gold: '#c9a227',
};

/** Emblems by family (ids in club-rules.js EMBLEMS). */
export const EMBLEM_FAMILIES = {
    pieces: ['n', 'r', 'b', 'q', 'k'],
    animals: ['wolf', 'lion', 'eagle', 'bull', 'bear', 'fox'],
    sky: ['planet', 'moon', 'sun', 'star', 'bolt', 'comet'],
    landscapes: ['mountain', 'wave', 'pine', 'volcano', 'tower', 'crown'],
};

const PIECE_GLYPHS = { n: '♞', r: '♜', b: '♝', q: '♛', p: '♟', k: '♚' };

export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---------- Colours ----------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance(hex) {
    const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two colours. */
export function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
}
/** Black or white, whichever reads best on `hex`. */
export const inkOn = (hex) => (contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff');
/** The two club colours must tell apart (jersey patterns, pieces and end zones use both). */
export const distinctColors = (a, b) => contrast(a, b) >= 1.6;

/** The nearest named shade, so that any colour can be said ("close to blue"). */
export function colorName(hex) {
    const [r, g, b] = rgb(hex);
    let best = 'black';
    let dist = Infinity;
    for (const [name, h] of Object.entries(PRESETS)) {
        const [x, y, z] = rgb(h);
        const d = (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2;
        if (d < dist) { dist = d; best = name; }
    }
    const name = t(`shade.${best}`);
    return dist < 300 ? name : t('shade.close', { name });
}

// ---------- Emblems: drawn in a 120 x 128 box, centred on (60, cy) ----------
/** @returns svg markup of emblem `id` filled with `fill` (an ink outline round it) */
export function emblem(id, fill, cy) {
    if (PIECE_GLYPHS[id]) {
        return `<text x="60" y="${cy + 24}" text-anchor="middle" font-family="Chess Pieces, DejaVu Sans, serif" font-size="72" fill="${fill}" stroke="#000" stroke-width="2.5" paint-order="stroke">${PIECE_GLYPHS[id]}</text>`;
    }
    const st = `fill="${fill}" stroke="#000" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
    const ink = 'fill="#000"';
    const shapes = {
        wolf: `<path ${st} d="M34 44 L40 20 L52 36 H68 L80 20 L86 44 L82 64 L60 86 L38 64 Z"/><path ${st} d="M50 68 L60 78 L70 68 Z"/><circle cx="49" cy="52" r="3.5" ${ink}/><circle cx="71" cy="52" r="3.5" ${ink}/>`,
        fox: `<path ${st} d="M30 40 L38 16 L54 38 H66 L82 16 L90 40 L60 88 Z"/><path fill="#fff" stroke="#000" stroke-width="3" d="M42 56 L60 88 L78 56 L60 64 Z"/><circle cx="50" cy="50" r="3.5" ${ink}/><circle cx="70" cy="50" r="3.5" ${ink}/>`,
        lion: `<path ${st} d="M60 24 L70 30 L82 28 L84 40 L94 48 L88 58 L92 70 L80 74 L76 86 L64 82 L60 92 L56 82 L44 86 L40 74 L28 70 L32 58 L26 48 L36 40 L38 28 L50 30 Z"/><circle cx="60" cy="58" r="18" fill="${fill}" stroke="#000" stroke-width="3"/><circle cx="53" cy="54" r="3" ${ink}/><circle cx="67" cy="54" r="3" ${ink}/><path d="M55 64 H65 L60 70 Z" ${ink}/>`,
        eagle: `<path ${st} d="M60 34 C50 34 46 44 48 52 L20 40 L28 56 L22 60 L44 66 L50 82 L60 76 L70 82 L76 66 L98 60 L92 56 L100 40 L72 52 C74 44 70 34 60 34 Z"/><path d="M60 40 L70 44 L62 48 Z" fill="#f1c40f" stroke="#000" stroke-width="2"/><circle cx="57" cy="42" r="2.5" ${ink}/>`,
        bull: `<path ${st} d="M24 30 Q30 46 44 46 L42 70 Q60 92 78 70 L76 46 Q90 46 96 30 Q84 38 74 36 H46 Q36 38 24 30 Z"/><ellipse cx="60" cy="74" rx="12" ry="7" fill="#fff" stroke="#000" stroke-width="3"/><circle cx="52" cy="54" r="3.5" ${ink}/><circle cx="68" cy="54" r="3.5" ${ink}/>`,
        bear: `<circle cx="40" cy="38" r="10" ${st}/><circle cx="80" cy="38" r="10" ${st}/><circle cx="60" cy="60" r="26" ${st}/><ellipse cx="60" cy="70" rx="11" ry="8" fill="#fff" stroke="#000" stroke-width="3"/><circle cx="51" cy="54" r="3.5" ${ink}/><circle cx="69" cy="54" r="3.5" ${ink}/><circle cx="60" cy="67" r="3.5" ${ink}/>`,
        planet: `<circle cx="60" cy="60" r="22" ${st}/><ellipse cx="60" cy="62" rx="40" ry="11" fill="none" stroke="#000" stroke-width="7" transform="rotate(-18 60 62)"/><ellipse cx="60" cy="62" rx="40" ry="11" fill="none" stroke="${fill}" stroke-width="3" transform="rotate(-18 60 62)"/><path d="M41 52 A22 22 0 0 1 79 52" fill="${fill}" stroke="#000" stroke-width="3.5"/>`,
        moon: `<path ${st} d="M70 28 A32 32 0 1 0 84 80 A26 26 0 1 1 70 28 Z"/>`,
        sun: `${Array.from({ length: 12 }, (_, i) => `<path ${st} d="M60 20 L65 34 H55 Z" transform="rotate(${i * 30} 60 60)"/>`).join('')}<circle cx="60" cy="60" r="20" ${st}/>`,
        star: `<path ${st} d="M60 22 L70 48 L98 48 L75 64 L84 92 L60 75 L36 92 L45 64 L22 48 L50 48 Z"/>`,
        bolt: `<path ${st} d="M68 18 L36 66 H58 L50 100 L86 48 H64 Z"/>`,
        comet: `<path ${st} d="M30 90 Q52 52 86 32 Q70 62 34 94 Z"/><circle cx="78" cy="40" r="15" ${st}/>`,
        mountain: `<path ${st} d="M14 88 L46 40 L60 58 L74 34 L106 88 Z"/><path d="M74 34 L66 48 L72 46 L78 52 L82 46 Z" fill="#fff" stroke="#000" stroke-width="2.5"/>`,
        wave: `<path ${st} d="M16 84 Q22 46 56 40 Q90 36 96 58 Q80 48 70 60 Q86 62 84 74 Q66 64 56 84 Z"/>`,
        pine: `<path ${st} d="M60 18 L84 50 H72 L92 74 H70 V92 H50 V74 H28 L48 50 H36 Z"/>`,
        volcano: `<path ${st} d="M18 92 L48 48 H72 L102 92 Z"/><path d="M48 48 L54 34 L60 44 L66 30 L72 48 Z" fill="#e67e22" stroke="#000" stroke-width="3"/>`,
        tower: `<path ${st} d="M50 36 H70 L76 92 H44 Z"/><rect x="48" y="22" width="24" height="14" ${st}/><path d="M72 28 L100 18 V40 Z" fill="#f1c40f" stroke="#000" stroke-width="2.5"/><path d="M46 60 H74 M45 76 H75" stroke="#000" stroke-width="3"/>`,
        crown: `<path ${st} d="M24 84 L28 40 L46 60 L60 32 L74 60 L92 40 L96 84 Z"/><circle cx="60" cy="72" r="5" fill="#e74c3c" stroke="#000" stroke-width="2.5"/>`,
    };
    return `<g transform="translate(0 ${cy - 60})">${shapes[id] || ''}</g>`;
}

/** The inside of the crest (for the crest itself and the badge on the jersey). */
function crestInner(c) {
    const a = c.primary;
    const b = c.secondary;
    const code = esc(Club.initials(c.name || 'FC'));
    const outline = `fill="${a}" stroke="#000" stroke-width="7" stroke-linejoin="round"`;
    const text = (x, y, size) => `<text x="${x}" y="${y}" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="${size}" letter-spacing="1" fill="${inkOn(b)}">${code}</text>`;
    if (c.shape === 'round') {
        return `<circle cx="60" cy="64" r="54" ${outline}/><circle cx="60" cy="64" r="40" fill="none" stroke="${b}" stroke-width="4"/>${emblem(c.emblem, b, 56)}<rect x="30" y="90" width="60" height="18" rx="3" fill="${b}" stroke="#000" stroke-width="3.5"/>${text(60, 104, 16)}`;
    }
    if (c.shape === 'diamond') {
        // The initials sit in the lower point, on a plate that fits inside the diamond.
        return `<path d="M60 4 L116 64 L60 124 L4 64 Z" ${outline}/><path d="M60 16 L104 64 L60 112 L16 64 Z" fill="none" stroke="${b}" stroke-width="3"/>${emblem(c.emblem, b, 50)}<path d="M38 82 H82 L72 96 H48 Z" fill="${b}" stroke="#000" stroke-width="3"/>${text(60, 93, 12)}`;
    }
    if (c.shape === 'badge') {
        return `<path d="M60 4 L104 20 V70 Q104 106 60 124 Q16 106 16 70 V20 Z" ${outline}/><rect x="16" y="20" width="88" height="20" fill="${b}" stroke="#000" stroke-width="3.5"/>${text(60, 36, 16)}${emblem(c.emblem, b, 78)}`;
    }
    return `<path d="M10 8 H110 V60 Q110 106 60 124 Q10 106 10 60 Z" ${outline}/>${emblem(c.emblem, b, 54)}<rect x="20" y="88" width="80" height="18" fill="${b}" stroke="#000" stroke-width="3.5"/>${text(60, 102, 16)}`;
}

/** The club's crest, with a spoken description. */
export function crestSVG(c) {
    const label = t('club.crestLabel', {
        shape: t(`shape.${c.shape}`), emblem: t(`emblem.${c.emblem}`), code: Club.initials(c.name || 'FC'),
        a: colorName(c.primary), b: colorName(c.secondary),
    });
    return `<svg viewBox="0 0 120 128" role="img" aria-label="${esc(label)}">${crestInner(c)}</svg>`;
}

let jerseyCount = 0;
/** The "Heritage" jersey's cream (career reward): a game colour, like the jerseys'. */
const HERITAGE_CREAM = '#efe6cf';

/**
 * The jersey the club wears: its home jersey (its pattern in the two colours), or, when it
 * wears one won in the career (`c.wear`), that one. The crest is on the chest.
 */
export function jerseySVG(c) {
    if (c.wear === 'jersey-heritage') return heritageSVG(c);
    const a = c.primary;
    const b = c.secondary;
    const fill = shirtFill(c);
    const shirt = SHIRT;
    const clip = `jersey-clip-${++jerseyCount}`; // One id per drawing: several jerseys can be on the page
    const label = t('club.jerseyLabel', { pattern: t(`pattern.${c.pattern}`), a: colorName(a), b: colorName(b) });
    return `<svg viewBox="0 0 120 120" role="img" aria-label="${esc(label)}">
        <defs><clipPath id="${clip}"><path d="${shirt}"/></clipPath></defs>
        <g clip-path="url(#${clip})">${fill}</g>
        <path d="${shirt}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
        <path d="M50 6 Q60 16 70 6" fill="none" stroke="#000" stroke-width="4"/>
        <g transform="translate(64 34) scale(.2)">${crestInner(c)}</g>
    </svg>`;
}

const SHIRT = 'M38 10 L50 6 Q60 16 70 6 L82 10 L110 30 L98 50 L88 44 L88 112 L32 112 L32 44 L22 50 L10 30 Z';

/** A shirt's cloth in a 120 x 120 box: the club's pattern in its two colours (the Heritage jersey: cream, a band of its colour). */
function shirtFill(c) {
    const a = c.primary;
    const b = c.secondary;
    if (c.wear === 'jersey-heritage') return `<rect width="120" height="120" fill="${HERITAGE_CREAM}"/><rect y="49" width="120" height="28" fill="${b}"/><rect y="52" width="120" height="22" fill="${a}"/>`;
    let fill = `<rect width="120" height="120" fill="${a}"/>`;
    switch (c.pattern) {
        case 'stripes': for (let x = 10; x < 120; x += 24) fill += `<rect x="${x}" width="12" height="120" fill="${b}"/>`; break;
        case 'pinstripes': for (let x = 6; x < 120; x += 9) fill += `<rect x="${x}" width="2.5" height="120" fill="${b}"/>`; break;
        case 'halves': fill += `<rect x="60" width="60" height="120" fill="${b}"/>`; break;
        case 'quarters': fill += `<rect x="60" width="60" height="60" fill="${b}"/><rect y="60" width="60" height="60" fill="${b}"/>`; break;
        case 'hoops': for (let y = 30; y < 120; y += 22) fill += `<rect y="${y}" width="120" height="11" fill="${b}"/>`; break;
        case 'sash': fill += `<path d="M28 0 H52 L112 120 H88 Z" fill="${b}"/>`; break;
        case 'chevron': fill += `<path d="M20 24 L60 64 L100 24 V46 L60 86 L20 46 Z" fill="${b}"/>`; break;
        case 'sleeves': fill += `<path d="M0 0 H34 V120 H0 Z M86 0 H120 V120 H86 Z" fill="${b}"/>`; break;
    }
    return fill;
}

/**
 * The small jersey a piece wears on its chest (the board, the benches, the line-ups): the club's
 * shirt, thickly outlined so that a dark one still shows on the piece. Decorative.
 */
export function miniJerseySVG(c) {
    const clip = `jersey-clip-${++jerseyCount}`;
    return `<svg class="piece-shirt" viewBox="6 0 108 118" aria-hidden="true" focusable="false">
        <defs><clipPath id="${clip}"><path d="${SHIRT}"/></clipPath></defs>
        <g clip-path="url(#${clip})">${shirtFill(c)}</g>
        <path d="${SHIRT}" fill="none" stroke="#000" stroke-width="9" stroke-linejoin="round"/></svg>`;
}

/** A piece's glyph wearing a club's small jersey, as HTML (the benches, the squad, the line-ups). */
export function jerseyGlyph(glyph, c, className = '') {
    return `<span class="${className} piece-dressed" aria-hidden="true"><span class="piece-glyph">${glyph}</span>${miniJerseySVG(c)}</span>`;
}

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Two colours too close to tell apart on the turf. */
function clash(x, y) {
    const [r, g, b] = rgbOf(x), [u, v, w] = rgbOf(y);
    return (r - u) ** 2 + (g - v) ** 2 + (b - w) ** 2 < 110 ** 2;
}

/**
 * The jersey a rival wears against the club: its own; its away jersey (its colours swapped)
 * when its main colour is too close to the club's; plain white or black when that is too.
 * @param {{ primary: string, secondary: string, pattern: string }} theirs @param {{ primary: string }} ours
 */
export function awayJersey(theirs, ours) {
    if (!clash(theirs.primary, ours.primary)) return { primary: theirs.primary, secondary: theirs.secondary, pattern: theirs.pattern };
    if (!clash(theirs.secondary, ours.primary)) return { primary: theirs.secondary, secondary: theirs.primary, pattern: theirs.pattern };
    const light = rgbOf(ours.primary).reduce((sum, v) => sum + v, 0) > 382;
    const plain = light ? '#111111' : '#ffffff';
    return { primary: plain, secondary: plain, pattern: 'plain' };
}

/** The "Heritage" jersey: cream, a broad band of the club's colour across the chest, a laced collar. */
function heritageSVG(c) {
    const a = c.primary;
    const b = c.secondary;
    const shirt = SHIRT;
    const clip = `jersey-clip-${++jerseyCount}`;
    const label = t('club.jerseyHeritageLabel', { a: colorName(a), b: colorName(b) });
    return `<svg viewBox="0 0 120 120" role="img" aria-label="${esc(label)}">
        <defs><clipPath id="${clip}"><path d="${shirt}"/></clipPath></defs>
        <g clip-path="url(#${clip})">
          <rect width="120" height="120" fill="${HERITAGE_CREAM}"/>
          <rect y="52" width="120" height="22" fill="${a}"/><rect y="49" width="120" height="3" fill="${b}"/><rect y="74" width="120" height="3" fill="${b}"/>
          <path d="M10 30 L22 50 L32 44 L32 40 L18 26 Z M110 30 L98 50 L88 44 L88 40 L102 26 Z" fill="${a}"/>
        </g>
        <path d="${shirt}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
        <path d="M50 6 Q60 22 70 6" fill="${a}" stroke="#000" stroke-width="3"/>
        <path d="M56 12 L64 12 M56 16 L64 16" stroke="${HERITAGE_CREAM}" stroke-width="2"/>
        <g transform="translate(48 22) scale(.2)">${crestInner(c)}</g>
    </svg>`;
}

/** A small emblem picture for a button (white on the button). */
export const emblemIcon = (id) => `<svg viewBox="0 0 120 120" aria-hidden="true">${emblem(id, '#ffffff', 60)}</svg>`;
