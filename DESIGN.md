# DESIGN.md

Every interface follows this file. No new colour or font without asking the project owner.

## Concept: a shelf of game boxes

The site is a shelf of board games. The **hub** and **Ches'spell** use the house style,
**Boîte de jeu**: thick black outlines, die-cut tokens, cards with a hard shadow, soft colours.
**Chessdown** comes in its own box, styled **Stade**: turf, stadium signage, scoreboard clock.

On the hub, each game is shown as a box in its own style: the Chessdown box is turf and
stadium type, the Ches'spell box is lilac Boîte de jeu.

Both styles are light, single-theme designs (no dark mode): they are colour on purpose.

Original explorations: `design-explorations/` (references: figma for Boîte de jeu, nike for Stade).

## Fonts

All fonts are self-hosted in `assets/fonts/` (SIL Open Font License), declared in
`assets/fonts/fonts.css`. No request to Google: visitors' IP addresses stay on the site.

| Role | Boîte de jeu (hub, Ches'spell) | Stade (Chessdown) |
|---|---|---|
| Display (titles, big numbers) | Bagel Fat One 400 | Big Shoulders Display 700 / 900, uppercase |
| Text, buttons, forms | Atkinson Hyperlegible 400 / 700 | Archivo 400 / 600 / 800 |
| Chess pieces (both games) | Noto Sans Symbols 2 (chess glyphs only, 7 KB) | same |

Pieces use the **filled** glyphs (♚♛♜♝♞♟) for both sides; CSS gives the colour and an
ink outline. Never the hollow glyphs, never emoji presentation.

Type scale: display sizes use `clamp()`; text starts at 1rem (1.0625rem Stade, 1.125rem hub
body), line-height 1.5. Uppercase only in Stade display type.

## Colours

### Boîte de jeu

| Token | Hex | Use |
|---|---|---|
| `--paper` | #FFFFFF | page, cards |
| `--ink` | #000000 | text, outlines, hard shadows, primary buttons |
| `--lilac` | #C9B6F2 | Ches'spell signature: surfaces, dark squares |
| `--lime` | #D7EE9C | selection, success, "your turn" |
| `--coral` | #F6B9A3 | warnings, locked, delete, timer low |
| `--navy` | #1F1D3D | footer, dark surfaces, timer bar |
| `--muted-on-lilac` | #2F2A3D | secondary text on lilac |

### Stade

| Token | Hex | Use |
|---|---|---|
| `--turf` / `--turf-light` | #0B6E3F / #0E7A47 | field, mown stripes |
| `--black` | #000000 | scoreboard, panels, text on white |
| `--white` | #FFFFFF | text on turf and black, yard lines |
| `--amber` | #FFB81C | scoreboard clock, primary action **on black only**, focus ring |
| `--muted` | #545454 | secondary text on white |
| `--muted-on-dark` | #BDBDBD | secondary text on black |

Chessdown jersey colours (red, blue, green…) are game data chosen by players, not palette
colours: they only colour pieces, end zones and the timer bar, always with an ink outline.

### Checked contrasts (WCAG 2.2 AA: text ≥ 4.5:1, large text and graphics ≥ 3:1)

| Text | Background | Ratio |
|---|---|---|
| ink | paper / lilac / lime / coral | 21 / 11.5 / 16.6 / 12.4 |
| muted-on-lilac | lilac | 7.5 |
| paper / lilac | navy | 16.1 / 8.8 |
| white | turf / turf-light | 6.3 / 5.4 |
| amber / muted-on-dark | black | 12.1 / 11.2 |
| black | amber | 12.1 |
| muted | white | 7.6 |
| black | turf | 3.3 (large display type and graphics only) |

## Components

**Boîte de jeu**
- Buttons: pills (`border-radius: 999px`), 2px ink border, bold text. Primary = ink fill,
  paper text. Secondary = paper fill. Selected toggle = lime fill.
- Cards and panels: paper, 3px ink border, radius 16px, hard shadow `6px 6px 0 var(--ink)`.
  Large sections: radius 40px, no border, colour fill.
- Spell cards: the emoji sits in a lilac "art" box. Selected: lime fill + ✓ badge.
  Locked: coral "Locked" badge, card dimmed. Used (in game): struck through, dimmed.
- Board: paper and lilac squares, 4px ink frame, hard shadow. Moves: ink dots; captures:
  ink ring; selected square: lime.
- Dialogs: paper card, 3px ink border, hard shadow, over a navy veil at 60%.

**Stade**
- Header bar: black, white wordmark in Big Shoulders 900 uppercase.
- Screens: black panels; titles in Big Shoulders; numbers in tabular figures.
- Buttons: pills, 2px border. Primary on black = amber fill, black text. Secondary =
  white outline. On white: primary = black fill.
- Board: a clear checkerboard, every square clearly light or clearly dark: dark = turf,
  light = turf mixed with 45 % white (`--square-light`); white yard lines, end zones in
  jersey colours. Pieces: jersey colour, 1.5px black outline.
- Stands: around the field, a rudimentary pixel crowd (`js/crowd.js`, 6px pixels, at
  45 % opacity so the field stays the focus) on concrete steps (#141414 / #262626).
  Fans wear the jersey colours; their faces use five skin tones (#F1C27D, #E0AC69,
  #C68642, #8D5524, #FFDBAC), added at the owner's request for the crowd only.
  A few fans stand up or sit down every 400 ms; still under reduced motion.
- Timer: scoreboard style, amber digits on black.

## Layout and motion

- Mobile first; tested at 375 px. No horizontal scroll (see `tests/e2e/layout.spec.js`).
- Side gutter: at least 16px (`--app-pad`).
- Motion only to answer an action (selection, move, dialog). No decorative animation.
  `prefers-reduced-motion` turns transitions off.
- Hard shadows only (no blur), no gradients except the turf stripes, no glassmorphism.

## Accessibility (WCAG 2.2 AA)

- Focus ring: 3px ink (Boîte de jeu) or amber (Stade, on dark) outline, offset 3px.
- Every control has a visible label or `aria-label`; colour is never the only signal
  (selected = colour + border or ✓, locked = badge text).
- Keyboard play and dialogs: see `games/<game>/js/a11y.js` and the tests in `tests/e2e/`.
