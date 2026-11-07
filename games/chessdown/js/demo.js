// Scripted tutorial shown with ?demo=true.

function startDemo() {
    currentRoomCode = null;
    isBotMatch = true;
    botDifficultyLevel = 'novice';
    if(botTrainingData) loadBotProfileForDifficulty('novice');
    startDraftPhase(1);

    const overlay = document.createElement('div');
    overlay.id = 'demo-overlay-bubble';
    overlay.innerHTML = `
        <h2>Interactive Demo</h2>
        <p id="demo-text">Welcome to Chessdown! First, build your army. Click the highlighted <b>King</b> in the shop.</p>
        <a href="/">Back to the games</a>
    `;
    
    let demoStep = 0;
    const pText = overlay.querySelector('#demo-text');
    
    // Bubble and highlight styles live in styles.css.
    
    // Position the bubble relative to the board dynamically to avoid overflow: hidden clipping
    setTimeout(() => {
        document.body.appendChild(overlay);
        const board = document.getElementById('chessboard');
        
        function updatePosition() {
            if (!document.getElementById('demo-overlay-bubble')) return;
            const r = board.getBoundingClientRect();
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
        
        const shopItems = document.querySelectorAll('.shop-item');
        shopItems.forEach(item => {
            item.addEventListener('pointerdown', (e) => {
                if (demoStep === 0 && item.dataset.type === 'k') {
                    demoStep = 1;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Perfect! The King is your most vital piece. Click on any highlighted square on the <b>bottom row</b> to place it safely.";
                    highlightRow(5);
                } else if (demoStep === 2 && item.dataset.type === 'r') {
                    demoStep = 3;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Good! Place the Rook on your last row to defend the King from side attacks.";
                    highlightRow(5);
                } else if (demoStep === 4 && item.dataset.type === 'r') {
                    demoStep = 5;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Place the second Rook on your last row as well.";
                    highlightRow(5);
                } else if (demoStep === 6 && item.dataset.type === 'p') {
                    demoStep = 7;
                    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
                    pText.innerHTML = "Pawns are great for breaking 'vis-à-vis' (direct line of sight) attacks. Place it in front of your King or Rooks (row 4).";
                    highlightRow(4);
                } else if (demoStep > 7) {
                    item.classList.remove('demo-highlight');
                }
            });
        });
        
        const originalHandleDraftSquareClick = handleDraftSquareClick;
        window.handleDraftSquareClick = function(viewR, viewC) {
            if (demoStep === 1) {
                if (viewR !== 5) {
                    pText.innerHTML = "<span class='demo-error'>Please place the King on the highlighted bottom row!</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 2;
                highlightRow(null);
                pText.innerHTML = "King placed! Now click the <b>Rook</b> in the shop to secure your backline.";
                const rookItem = document.querySelector('.shop-item[data-type="r"]');
                if(rookItem) rookItem.classList.add('demo-highlight');
            } else if (demoStep === 3) {
                if (viewR !== 5) {
                    pText.innerHTML = "<span class='demo-error'>Please place the Rook on the bottom row to defend the King!</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 4;
                highlightRow(null);
                pText.innerHTML = "First Rook placed. Buy a <b>second Rook</b>.";
                const rookItem = document.querySelector('.shop-item[data-type="r"]');
                if(rookItem) rookItem.classList.add('demo-highlight');
            } else if (demoStep === 5) {
                if (viewR !== 5) {
                    pText.innerHTML = "<span class='demo-error'>Place it on the bottom row!</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 6;
                highlightRow(null);
                pText.innerHTML = "Backline secured! Now click the <b>Pawn</b> in the shop.";
                const pawnItem = document.querySelector('.shop-item[data-type="p"]');
                if(pawnItem) pawnItem.classList.add('demo-highlight');
            } else if (demoStep === 7) {
                if (viewR !== 4) {
                    pText.innerHTML = "<span class='demo-error'>Place the Pawn on the highlighted row in front of your pieces.</span>";
                    return;
                }
                originalHandleDraftSquareClick(viewR, viewC);
                demoStep = 8;
                highlightRow(null);
                pText.innerHTML = "Well done! Now you are on your own. <b>Spend ALL your remaining points</b> (try Queens or Knights). When points reach 0, click <b>Validate Draft</b>.";
                
                const checkPoints = setInterval(() => {
                    if (draftPoints[1] <= 1 && demoStep === 8) {
                        demoStep = 9;
                        const validateBtn = document.getElementById('btn-validate-draft');
                        if(validateBtn) validateBtn.classList.add('demo-highlight');
                        pText.innerHTML = "Your army is ready! Click <b>Validate Draft</b> to start the battle. Be fast, you only have 10 seconds per turn!";
                        clearInterval(checkPoints);
                    }
                }, 500);
            } else if (demoStep >= 8) {
                originalHandleDraftSquareClick(viewR, viewC);
            }
        };

        const oldBtn = ui.btnValidateDraft;
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        ui.btnValidateDraft = newBtn;
        
        newBtn.addEventListener('pointerdown', () => {
            newBtn.classList.remove('demo-highlight');
            pText.innerHTML = "<b>Battle started!</b><br><br>• Pieces move exactly like in classical chess.<br>• <b>Win condition 1:</b> Capture the enemy King.<br>• <b>Win condition 2:</b> Reach the enemy's last row (Touchdown).<br><br>Good luck!";
            validateDraft();
        });

    }, 500);
}
