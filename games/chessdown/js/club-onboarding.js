// @ts-check
// All Star, first visit: Gérard Mallet, commissioner of the League (commissioner.js),
// asks the coach's name, hands over the coach's licence, then registers the club: its
// name, colours (any shade), jersey pattern and crest. The club is then kept in this
// browser (club-store.js) with its first squad (club-rules.js).
import { state } from './state.js';
import { createCommissioner } from './commissioner.js';
import { EMBLEM_FAMILIES, PRESETS, colorName, crestSVG, distinctColors, emblemIcon, esc, jerseySVG } from './club-art.js';
import { saveClub } from './club-store.js';
import { rosterTable } from './club-view.js';
import { t } from '../../../assets/js/i18n.js';

const Club = globalThis.ChessdownClub;

const panel = /** @type {HTMLElement} */ (document.getElementById('club-panel'));
const rail = [.../** @type {HTMLElement} */ (document.getElementById('club-rail')).children];

/** The club being made: its identity, filled step by step. */
const draft = {
    coach: '', name: '', primary: '#f1c40f', secondary: '#111111', pattern: 'sash', shape: 'shield', emblem: 'wolf',
};

const gerard = createCommissioner({
    canvas: /** @type {HTMLCanvasElement} */ (document.getElementById('commissioner')),
    typed: /** @type {HTMLElement} */ (document.getElementById('commissioner-typed')),
    said: /** @type {HTMLElement} */ (document.getElementById('commissioner-said')),
    bubble: /** @type {HTMLElement} */ (document.getElementById('commissioner-bubble')),
    scarf: () => [draft.primary, draft.secondary],
});

/** @type {(club: any) => void} */
let onFinished = () => {};

/**
 * Open the commissioner's office. `done(club)` runs when the coach leaves it with the new club.
 * @param {(club: any) => void} done
 */
export function startOnboarding(done) {
    onFinished = done;
    draft.coach = state.account ? state.account.username : '';
    draft.name = '';
    gerard.start();
    show(0);
}

/** Leaving the screen: Gérard stops moving. */
export function stopOnboarding() {
    gerard.stop();
}

let step = 0;
function show(i) {
    step = i;
    rail.forEach((li, n) => {
        li.classList.toggle('done', n < i);
        if (n === i) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    STEPS[i]();
}

/** The step's controls, then the focus on the first one. */
function controls(html, wire) {
    panel.innerHTML = html;
    wire();
    const first = /** @type {HTMLElement | null} */ (panel.querySelector('input, button:not([disabled])'));
    first?.focus({ preventScroll: true });
}

const $ = (id) => /** @type {any} */ (document.getElementById(id));
const all = (selector) => /** @type {HTMLElement[]} */ ([...panel.querySelectorAll(selector)]);
const backButton = `<button type="button" class="btn-secondary" id="club-back">${esc(t('onboarding.back'))}</button>`;

function nameField(id, label, value, help, examples = []) {
    return `<div class="club-field">
        <label for="${id}">${esc(label)}</label>
        <input id="${id}" type="text" maxlength="${Club.NAME_MAX}" autocomplete="off" value="${esc(value)}" aria-describedby="${id}-help">
        <small id="${id}-help">${esc(help)}</small>
        <span class="club-error" id="${id}-error" role="alert"></span>
      </div>${examples.length ? `<div class="club-chips">${examples.map((e) => `<button type="button" class="club-chip" data-example="${esc(e)}">${esc(e)}</button>`).join('')}</div>` : ''}`;
}

/** The name typed in `input`, checked (2 to 24 characters), or null with the error shown. */
function checkedName(input, errorId) {
    const value = Club.cleanName(input.value);
    const error = $(errorId);
    if (!value) {
        error.textContent = t('onboarding.nameError', { min: Club.NAME_MIN, max: Club.NAME_MAX });
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return null;
    }
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    return value;
}

/**
 * Enter in a field presses the step's main button. Its default action is stopped: the
 * focus moves to the next step's button, which the same key press would activate too.
 */
const enterPresses = (input, button) => input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    button.click();
});

/** A group of toggle buttons: the pressed one is the chosen value. */
function toggles(selector, current) {
    all(selector).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
}

const STEPS = [
    // 1. The coach's name
    () => {
        gerard.say(t('say.hello'));
        controls(`<h2>${esc(t('onboarding.title.name'))}</h2>
            ${nameField('club-coach', t('onboarding.coachLabel'), draft.coach, t('onboarding.coachHelp'))}
            <div class="club-row"><button type="button" class="btn-primary" id="club-go">${esc(t('onboarding.thatsMe'))}</button></div>`, () => {
            const input = $('club-coach');
            $('club-go').addEventListener('click', () => {
                const name = checkedName(input, 'club-coach-error');
                if (name) { draft.coach = name; show(1); }
            });
            enterPresses(input, $('club-go'));
        });
    },
    // 2. The coach's licence
    () => {
        gerard.say(t('say.licence', { name: draft.coach }));
        controls(`<h2>${esc(t('onboarding.title.licence'))}</h2>
            <div class="club-licence" id="club-licence">
                <span class="club-kicker">${esc(t('onboarding.licenceKicker'))}</span>
                <span class="club-who">${esc(draft.coach)}</span>
                <span class="club-meta">${esc(t('onboarding.licenceMeta'))}</span>
                <span class="club-stamp" aria-hidden="true">${esc(t('onboarding.stamp'))}</span>
            </div>
            <div class="club-row"><button type="button" class="btn-primary" id="club-sign">${esc(t('onboarding.sign'))}</button>${backButton}</div>`, () => {
            $('club-back').addEventListener('click', () => show(0));
            $('club-sign').addEventListener('click', (e) => {
                $('club-licence').classList.add('signed');
                /** @type {HTMLButtonElement} */ (e.currentTarget).disabled = true;
                gerard.say(t('say.welcome'), () => setTimeout(() => { if (step === 1) show(2); }, 700));
            });
        });
    },
    // 3. The club's name
    () => {
        gerard.say(t('say.clubName'));
        const examples = t('onboarding.clubExamples').split('|');
        controls(`<h2>${esc(t('onboarding.title.club'))}</h2>
            ${nameField('club-name', t('onboarding.clubLabel'), draft.name, t('onboarding.clubHelp', { min: Club.NAME_MIN, max: Club.NAME_MAX }), examples)}
            <div class="club-row"><button type="button" class="btn-primary" id="club-go">${esc(t('onboarding.register'))}</button>${backButton}</div>`, () => {
            const input = $('club-name');
            all('[data-example]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.example; input.focus(); }));
            $('club-back').addEventListener('click', () => show(1));
            $('club-go').addEventListener('click', () => {
                const name = checkedName(input, 'club-name-error');
                if (name) { draft.name = name; show(3); }
            });
            enterPresses(input, $('club-go'));
        });
    },
    // 4. Colours (any shade, the game's colours as shortcuts) and the jersey pattern
    () => {
        gerard.say(t('say.colours', { club: draft.name }));
        const picker = (key, label) => `<div class="club-group">
            <span class="club-group-label" id="${key}-label">${esc(label)}</span>
            <div class="club-color-row">
              <input type="color" id="club-${key}" value="${draft[key]}" aria-labelledby="${key}-label">
              <output id="club-${key}-name" for="club-${key}"></output>
            </div>
            <div class="club-swatches" role="group" aria-label="${esc(t('onboarding.shortcuts', { label }))}">${Object.entries(PRESETS).map(([n, h]) =>
                `<button type="button" class="club-swatch" data-key="${key}" data-value="${h}" style="background:${h}" aria-label="${esc(t(`shade.${n}`))}"></button>`).join('')}</div>
          </div>`;
        controls(`<h2>${esc(t('onboarding.title.colours'))}</h2>
            <div class="club-designer">
              <div class="club-group">
                ${picker('primary', t('onboarding.colour1'))}
                ${picker('secondary', t('onboarding.colour2'))}
                <span class="club-group-label" id="pattern-label">${esc(t('onboarding.pattern'))}</span>
                <div class="club-chips" role="group" aria-labelledby="pattern-label">${Club.PATTERNS.map((k) =>
                    `<button type="button" class="club-chip" data-pattern data-value="${k}">${esc(t(`pattern.${k}`))}</button>`).join('')}</div>
                <span class="club-error" id="club-colour-error" role="alert"></span>
              </div>
              <figure class="club-preview" id="club-jersey"></figure>
            </div>
            <div class="club-row"><button type="button" class="btn-primary" id="club-go">${esc(t('onboarding.confirmColours'))}</button>${backButton}</div>`, () => {
            const check = () => {
                const ok = distinctColors(draft.primary, draft.secondary);
                $('club-colour-error').textContent = ok ? '' : t('onboarding.coloursTooClose');
                return ok;
            };
            const draw = () => {
                $('club-jersey').innerHTML = `${jerseySVG(draft)}<figcaption>${esc(t('onboarding.homeJersey'))}</figcaption>`;
                for (const key of ['primary', 'secondary']) {
                    $(`club-${key}`).value = draft[key];
                    $(`club-${key}-name`).textContent = colorName(draft[key]);
                    toggles(`.club-swatch[data-key="${key}"]`, draft[key]);
                }
                toggles('[data-pattern]', draft.pattern);
                gerard.redraw(); // His scarf follows
            };
            draw();
            for (const key of ['primary', 'secondary']) {
                $(`club-${key}`).addEventListener('input', (e) => { draft[key] = e.target.value.toLowerCase(); draw(); check(); });
            }
            all('.club-swatch').forEach((b) => b.addEventListener('click', () => { draft[b.dataset.key] = b.dataset.value; draw(); check(); }));
            all('[data-pattern]').forEach((b) => b.addEventListener('click', () => { draft.pattern = b.dataset.value; draw(); }));
            $('club-back').addEventListener('click', () => show(2));
            $('club-go').addEventListener('click', () => { if (check()) show(4); });
        });
    },
    // 5. The crest: shape, emblem (pieces, animals, sky, landscapes), the club's initials
    () => {
        gerard.say(t('say.crest'));
        controls(`<h2>${esc(t('onboarding.title.crest'))}</h2>
            <div class="club-designer">
              <div class="club-group">
                <span class="club-group-label" id="shape-label">${esc(t('onboarding.shape'))}</span>
                <div class="club-chips" role="group" aria-labelledby="shape-label">${Club.SHAPES.map((k) =>
                    `<button type="button" class="club-chip" data-shape data-value="${k}">${esc(t(`shape.${k}`))}</button>`).join('')}</div>
                <span class="club-group-label">${esc(t('onboarding.emblem'))}</span>
                ${Object.entries(EMBLEM_FAMILIES).map(([family, ids]) => `<div class="club-family">
                    <span class="club-family-label" id="family-${family}">${esc(t(`family.${family}`))}</span>
                    <div class="club-emblems" role="group" aria-labelledby="family-${family}">${ids.map((id) =>
                        `<button type="button" class="club-emblem" data-emblem data-value="${id}" aria-label="${esc(t(`emblem.${id}`))}" title="${esc(t(`emblem.${id}`))}">${emblemIcon(id)}</button>`).join('')}</div>
                  </div>`).join('')}
                <small class="muted">${esc(t('onboarding.initialsNote', { code: Club.initials(draft.name) }))}</small>
              </div>
              <figure class="club-preview" id="club-crest"></figure>
            </div>
            <div class="club-row"><button type="button" class="btn-primary" id="club-go">${esc(t('onboarding.stitch'))}</button>${backButton}</div>`, () => {
            const draw = () => {
                $('club-crest').innerHTML = `${crestSVG(draft)}<figcaption>${esc(draft.name)}</figcaption>`;
                toggles('[data-shape]', draft.shape);
                toggles('[data-emblem]', draft.emblem);
            };
            draw();
            all('[data-shape]').forEach((b) => b.addEventListener('click', () => { draft.shape = b.dataset.value; draw(); }));
            all('[data-emblem]').forEach((b) => b.addEventListener('click', () => { draft.emblem = b.dataset.value; draw(); }));
            $('club-back').addEventListener('click', () => show(3));
            $('club-go').addEventListener('click', () => show(5));
        });
    },
    // 6. Registered: the club and its first squad
    () => {
        const club = Club.newClub({ ...draft }, t('club.captain'));
        const kept = saveClub(club);
        gerard.say(t('say.squad', { club: club.name }));
        controls(`<h2>${esc(t('onboarding.title.squad'))}</h2>
            <div class="club-card">${crestSVG(club)}<div><div class="club-card-name">${esc(club.name)}</div>
              <div class="club-meta">${esc(t('club.meta', { coach: club.coach, season: club.season }))}</div></div></div>
            ${kept ? '' : `<p class="club-error" role="alert">${esc(t('club.notKept'))}</p>`}
            ${rosterTable(club, { rename: false })}
            <div class="club-row"><button type="button" class="btn-primary" id="club-go">${esc(t('onboarding.toMyClub'))}</button></div>`, () => {
            $('club-go').addEventListener('click', () => { gerard.stop(); onFinished(club); });
        });
    },
];
