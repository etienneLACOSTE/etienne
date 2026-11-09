# DESIGN.md

Every interface follows this file. No new colour or font without asking the project owner.

## Concept: a shelf of game boxes

The site, **Pawnet** (pawn + planet: "one chess board, a galaxy of games"), is a shelf of board games. The **hub** uses the house style,
**Boîte de jeu**: thick black outlines, die-cut tokens, cards with a hard shadow, soft colours.
Each game comes in its own box:
- **Chessdown**, styled **Stade**: turf, stadium signage, scoreboard clock.
- **Ches'spell**, styled **Grimoire** (owner's choice, 2026-11-09): a book of spells opened
  at night. The spell cards are numbered arcana (I to XX, like a tarot's major arcana) on
  vellum in gold frames, the board is an engraved plate, a starry sky drifts behind.

On the hub, each game is shown as a box in its own style: the Chessdown box is turf and
stadium type, the Ches'spell box is a grimoire cover (night, gold, three arcana).

Each style is a single-theme design (no light/dark switch): Boîte de jeu and Stade are
light, Grimoire is dark on purpose.

Original explorations: `design-explorations/` (references: figma for Boîte de jeu, nike for Stade).

Logo (owner's, 2026-11-09): a black pawn-planet with rings, pieces in orbit and stars.
Source in `design-explorations/logo/logo-source.png`; served files in `assets/brand/`:
`logo.webp` (transparent, 44px next to the wordmark on the hub pages) and the tab icons
(`favicon-32.png`, `icon-192.png`, `apple-touch-icon.png`), where the logo sits on a white
die-cut token with an ink ring so that it reads on dark tabs. Every page links the icons.

## Fonts

All fonts are self-hosted in `assets/fonts/` (SIL Open Font License), declared in
`assets/fonts/fonts.css`. No request to Google: visitors' IP addresses stay on the site.

| Role | Boîte de jeu (hub) | Grimoire (Ches'spell) | Stade (Chessdown) |
|---|---|---|---|
| Display (titles, card names, big numbers) | Bagel Fat One 400 | IM Fell English 400, roman and italic | Big Shoulders Display 700 / 900, uppercase |
| Text, buttons, forms | Atkinson Hyperlegible 400 / 700 | Atkinson Hyperlegible 400 / 700 | Archivo 400 / 600 / 800 |
| Chess pieces (all) | Noto Sans Symbols 2 (chess glyphs only, 7 KB) | same | same |

IM Fell English is a 17th-century English printing type: it gives the old-book voice.
Running text stays in Atkinson Hyperlegible for legibility.

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

### Grimoire (Ches'spell)

| Token | Hex | Use |
|---|---|---|
| `--night` / `--night-deep` | #1B1530 / #110D20 | page (radial glow towards the edges), input fields |
| `--plum` | #2C2250 | panels, secondary buttons, card medallions |
| `--vellum` | #EDE4CF | spell cards, dialogs, spell instruction |
| `--gold` | #D4AF62 | frames, titles, primary buttons, focus ring |
| `--bronze` | #7A5A1E | arcana numbers and inner frame on vellum |
| `--mist` | #ECE6F7 | text on night |
| `--muted` | #A99CC9 | secondary text on night |
| `--ink` | #120E20 | text on vellum, gold, spectral and ember |
| `--ink-soft` | #5B4E72 | secondary text on vellum |
| `--lilac` | #C9B6F2 | glows, timer flame |
| `--square-light` / `--square-dark` | #D9CDEB / #5A4889 | board |
| `--spectral` | #9FE3B5 | selection, success, "your turn" |
| `--ember` | #F2876A | warnings, locked, delete, timer low |

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
| mist / muted / gold | night | 14.4 / 6.9 / 8.4 |
| mist / gold | plum | 11.9 / 7.0 |
| ink / ink-soft / bronze | vellum | 15.0 / 6.0 / 5.0 |
| ink | gold / spectral / ember | 9.1 / 12.7 / 7.6 |
| ink | square-light | 12.5 |
| gold (black pieces' outline) | square-dark | 3.7 (graphics) |

## Components

**Boîte de jeu**
- Buttons: pills (`border-radius: 999px`), 2px ink border, bold text. Primary = ink fill,
  paper text. Secondary = paper fill. Selected toggle = lime fill.
- Cards and panels: paper, 3px ink border, radius 16px, hard shadow `6px 6px 0 var(--ink)`.
  Large sections: radius 40px, no border, colour fill.
- Dialogs: paper card, 3px ink border, hard shadow, over a navy veil at 60%.
- Inner pages (account, privacy): Bagel title, then paper cards (panels) side by side, one
  column on phones. Each card opens with a die-cut chip (lilac, lime or coral pill in Bagel).
  Forms: bold label above the field; fields with a 2px ink border, radius 12px; hint lines
  in 1rem ink; errors in a coral box with an ink border (role="alert"). Dangerous action
  (account deletion): folded in a `<details>`, coral button.
- Account picture: a 4.5rem circle with a 3px ink border (the first letter of the
  username on lilac when there is none), "Change picture" pill and "Remove picture" link.
- Top bar: game pills, then the account pill (ink): "Sign in", or the player's name.
  The pills wrap on narrow screens.

**Grimoire**
- Buttons: plates with 6px corners, 1.5px gold edge. Primary = gold fill, ink text.
  Secondary = plum fill, mist text. Selected toggle = spectral fill + ✓. Hover: gold glow.
- Titles in IM Fell English, gold; chapter headers over a 1px gold rule. The main title
  has an engraved rule (line, star, line) and an italic subtitle.
- Spell cards (arcana): vellum, 2px gold border and a 1px bronze inner frame, radius 12px,
  soft deep shadow. Top to bottom: roman number between two small stars (bronze), the
  emoji in a round night medallion with a gold ring, the name in IM Fell English, the
  effect, the unlock condition under a bronze rule. Hover: lifted, gold glow. Selected
  (deck builder): spectral glow + gold seal with ✓. Locked: dashed, faded, ember badge.
  In hand: a small horizontal arcana; a card being cast flares up; used: faded, struck.
- Board: light and dark squares (lilac tones) in a frame of gold, a band of plum and a
  gold hairline, with the glow of the book around it. White pieces vellum outlined in
  ink, black pieces ink outlined in gold. Moves: ink dot ringed in gold; captures: gold
  ring outlined in ink (both read on either square).
- Dialogs: a vellum card held up to the light (gold frame, bronze inner frame) over a
  night veil at 78%.
- End screen: the same dialog, headed "✦ Finis ✦": the fallen king (it topples) or an
  hourglass (time) in the medallion, then Victory / Defeat (facing the bot or online) or
  "<name> wins" (two players), the reason, Rematch and Main menu. Defeat: lilac glow,
  ink-soft title.
- Account line (main menu): muted text, the name in mist, the link in gold ("Sign in to
  keep your deck and stats on every device", or "Signed in as <name>"). Stade: muted on
  black, name in white, link in amber. The deck builder repeats the invitation.
- Deck builder: a panel above the cards: "Deck of [profile]", count and Save (disabled
  until three cards), then three slots (a small vellum arcana with ✕, or a dashed
  "Empty slot") and a hint line that also carries the messages.
- Sky (`js/sky.js`): a canvas behind the app; stars twinkle slowly (a few bright ones
  with a cross of light) and gold and lilac motes drift upwards. Still under reduced
  motion and while the tab is hidden.
- Spell effects (`js/spell-fx.js`): when a spell resolves, an overlay over the board
  plays its effect: frost (Freeze), whirl (Tornado, Domi Reversi, Swap), beam (Sniper),
  burst (Kamikaze, Sacrifice), lightning (Double Trouble), ward (Shield), rising light
  (Revive), runes for the others. Online, the opponent only sees a board-wide flash (their
  page does not get the squares). None under reduced motion.

**Stade**
- Header bar: black, white wordmark in Big Shoulders 900 uppercase.
- Screens: black panels; titles in Big Shoulders; numbers in tabular figures.
- Buttons: pills, 2px border. Primary on black = amber fill, black text. Secondary =
  white outline. On white: primary = black fill.
- Board: a clear checkerboard, every square clearly light or clearly dark: dark = turf,
  light = turf mixed with 45 % white (`--square-light`); white yard lines, end zones in
  jersey colours. Pieces: jersey colour, 1.5px black outline.
- Stadium (`js/crowd.js`, a canvas behind the game, 5px pixels): the pitch runs the full
  height in turf; along both touchlines a grass apron and a barrier (#D9DEE6), then blue
  stands, rows of seats parallel to the touchline (#2B5FB4 / #3A70C9, risers #1C4180,
  stairs #7A8494 every 12 seats), and beyond them the concourse (#0E1A2E). The crowd sits
  in the seats (30 % empty): jersey-coloured shirts, faces in five skin tones (#F1C27D,
  #E0AC69, #C68642, #8D5524, #FFDBAC). The blues and skin tones were added at the owner's
  request, for the stadium only. A few fans stand up or sit down every 400 ms; still
  under reduced motion. The stands follow the board (draft or match).
- Timer: scoreboard style, amber digits on black.

## Layout and motion

- Mobile first; tested at 375 px. No horizontal scroll (see `tests/e2e/layout.spec.js`).
- Side gutter: at least 16px (`--app-pad`).
- Boîte de jeu and Stade: motion only to answer an action (selection, move, dialog), no
  decorative animation; hard shadows only (no blur), no gradients except the turf
  stripes, no glassmorphism.
- Grimoire: ambient motion is part of the style (sky, spell effects, card glow), soft
  shadows and glows, gradients for the night and the medallions; still no glassmorphism.
- Everywhere, `prefers-reduced-motion` turns transitions and animations off.

## Accessibility (WCAG 2.2 AA)

- Focus ring: 3px ink (Boîte de jeu), amber (Stade, on dark) or gold (Grimoire; ink inside
  vellum cards and dialogs) outline, offset 3px.
- Every control has a visible label or `aria-label`; colour is never the only signal
  (selected = colour + border or ✓, locked = badge text).
- Keyboard play and dialogs: see `games/<game>/js/a11y.js` and the tests in `tests/e2e/`.
