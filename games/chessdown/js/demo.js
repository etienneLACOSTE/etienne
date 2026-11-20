// @ts-check
// Scripted tutorial shown with ?demo=true.
import { state, ui } from './state.js';
import { draftHooks, handleDraftSquareClick, startDraftPhase, validateDraft } from './draft.js';
import { loadBotProfileForDifficulty } from './bot.js';
import { setRichText, t, translatePage } from '../../../assets/js/i18n.js';

/** The bubble's text: **bold** parts, one line per line break. */
function say(/** @type {HTMLElement} */ el, /** @type {string} */ key, error = false) {
    const lines = t(key).split('\n').map((line) => {
        const span = document.createElement('span');
        setRichText(span, line);
        return span;
    });
    const box = error ? Object.assign(document.createElement('span'), { className: 'demo-error' }) : el;
    if (error) el.replaceChildren(box);
    box.replaceChildren(...lines.flatMap((line, i) => (i ? [document.createElement('br'), line] : [line])));
}

export function startDemo() {
    state.currentRoomCode = null;
    state.isBotMatch = true;
    state.botDifficultyLevel = 'novice';
    if(state.botTrainingData) loadBotProfileForDifficulty('novice');
    startDraftPhase(1);

    const overlay = document.createElement('div');
    overlay.id = 'demo-overlay-bubble';
    overlay.innerHTML = `
        <h2 data-i18n="demo.title">Interactive Demo</h2>
        <p id="demo-text"></p>
        <a href="/" data-i18n="demo.back">Back to the games</a>
    `;
    translatePage(overlay);
    say(/** @type {HTMLElement} */ (overlay.querySelector('#demo-text')), 'demo.start');
    
    let demoStep = 0;
    const pText = /** @type {HTMLElement} */ (overlay.querySelector('#demo-text'));
    
    // Bubble and highlight styles live in styles.css.
    
    // Position the bubble relative to the board dynamically to avoid overflow: hidden clipping
    setTimeout(() => {
        document.body.appendChild(overlay);
        const boardEl = document.getElementById('chessboard');
        
        function updatePosition() {
            if (!document.getElementById('demo-overlay-bubble')) return;
            const r = boardEl.getBoundingClientRect();
            // If there's enough space on the right (320px width + 40px margin)
            if (window.innerWidth > r.right + 360) {
                overlay.style.top = Math.max(20, r.top) + 'px';
                overlay.style.left = (r.right + 20) + 'px';
                overlay.style.transform = 'none';
            } else {
                // Otherwise put it on top center
                overlay.style.top = '20px';
                overlay.style.left = '50%';
                overlay.style.transform = 'translateX(-50%)';
            }
        }
        updatePosition();
        window.addEventListener('resize', updatePosition);
    }, 100);
    
    function highlightRow(r) {
        document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
        if (r !== null) {
            document.querySelectorAll(`.square[data-vr="${r}"]`).forEach(el => el.classList.add('demo-highlight'));
        }
    }

    setTimeout(() => {
        const kingItem = document.querySelector('.shop-item[data-type="k"]');
        if(kingItem) kingItem.classList.add('demo-highlight');
        
        const shopItems = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.shop-item'));
        shopItems.forEach(item => {
            item.addEventListener('pointerdown', (e) => {
                if (demoStep === 0 && item.dataset.type === 'k') {
                    demoStep = 1;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    say(pText, 'demo.king');
                    highlightRow(5);
                } else if (demoStep === 2 && item.dataset.type === 'r') {
                    demoStep = 3;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    say(pText, 'demo.rook');
                    highlightRow(5);
                } else if (demoStep === 4 && item.dataset.type === 'r') {
                    demoStep = 5;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    say(pText, 'demo.rook2');
                    highlightRow(5);
                } else if (demoStep === 6 && item.dataset.type === 'p') {
                    demoStep = 7;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    say(pText, 'demo.pawn');
                    highlightRow(4);
                } else if (demoStep > 7) {
                    item.classList.remove('demo-highlight');
                }
            });
        });
        
        const originalHandleDraftSquareClick = handleDraftSquareClick;
        draftHooks.squareClick = function(viewR, viewC) {
            if (demoStep === 1) {
                if (viewR !== 5) {
                    say(pText, 'demo.errKing', true);
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 2;
                highlightRow(null);
                say(pText, 'demo.kingPlaced');
                const rookItem = document.querySelector('.shop-item[data-type="r"]');
                if(rookItem) rookItem.classList.add('demo-highlight');
            } else if (demoStep === 3) {
                if (viewR !== 5) {
                    say(pText, 'demo.errRook', true);
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 4;
                highlightRow(null);
                say(pText, 'demo.rookPlaced');
                const rookItem = document.querySelector('.shop-item[data-type="r"]');
                if(rookItem) rookItem.classList.add('demo-highlight');
            } else if (demoStep === 5) {
                if (viewR !== 5) {
                    say(pText, 'demo.errRook2', true);
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 6;
                highlightRow(null);
                say(pText, 'demo.backline');
                const pawnItem = document.querySelector('.shop-item[data-type="p"]');
                if(pawnItem) pawnItem.classList.add('demo-highlight');
            } else if (demoStep === 7) {
                if (viewR !== 4) {
                    say(pText, 'demo.errPawn', true);
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 8;
                highlightRow(null);
                say(pText, 'demo.onYourOwn');
                
                const checkPoints = setInterval(() => {
                    if (state.draftPoints[1] <= 1 && demoStep === 8) {
                        demoStep = 9;
                        const validateBtn = document.getElementById('btn-validate-draft');
                        if(validateBtn) validateBtn.classList.add('demo-highlight');
                        say(pText, 'demo.ready');
                        clearInterval(checkPoints);
                    }
                }, 500);
            } else if (demoStep >= 8) {
                originalHandleDraftSquareClick(viewR, viewC);
            }
        };

        const oldBtn = ui.btnValidateDraft;
        const newBtn = /** @type {HTMLButtonElement} */ (oldBtn.cloneNode(true));
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        ui.btnValidateDraft = newBtn;
        
        newBtn.addEventListener('pointerdown', () => {
            newBtn.classList.remove('demo-highlight');
            say(pText, 'demo.battle');
            validateDraft();
        });

    }, 500);
}
