// Scripted tutorial shown with ?demo=true, added to `app`.
Object.assign(app, {
    startDemo() {
        this.p1Profile = { name: 'Demo Player', deck: [2, 12, 1] };
        this.p2Profile = { name: 'Bot', deck: [17, 15, 20] };
        this.p1Deck = this.p1Profile.deck;
        this.p2Deck = this.p2Profile.deck;
        
        this.isBotGame = true;
        isOnline = false;
        
        engine.init();
        this.renderInGameDeck(this.p1Deck, 'player1-cards', 'white');
        this.renderInGameDeck(this.p2Deck, 'player2-cards', 'black');
        this.renderChessboard();
        this.showScreen('game-board');
        
        const overlay = document.createElement('div');
        overlay.id = 'demo-overlay-bubble';
        overlay.innerHTML = `
            <h2 style="margin: 0 0 15px 0; color: #8b5cf6; font-size: 1.2rem;">Interactive Demo</h2>
            <p id="demo-text" style="margin: 0; line-height: 1.5; font-size: 0.95rem;">Welcome to Ches'spell! Click the highlighted <b>Double Trouble</b> card in your hand (bottom).</p>
            <a href="/" style="color: #a78bfa; text-decoration: none; margin-top: 15px; display: inline-block; pointer-events: auto; font-weight: bold; border-top: 1px solid #e2e8f0; padding-top: 10px; width: 100%;">← Return to Hub</a>
        `;
        
        const leftOverlay = document.createElement('div');
        leftOverlay.id = 'demo-overlay-left';
        leftOverlay.innerHTML = `
            <h2 style="margin: 0 0 15px 0; color: #8b5cf6; font-size: 1.2rem;">Rules & Spells</h2>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.5; font-size: 0.9rem;">
                <li><b>Goal:</b> Capture the enemy King to win immediately.</li>
                <li><b>Spells:</b> You have a hand of 3 magic cards (bottom).</li>
                <li><b>Usage:</b> Click a card to activate it. Some replace your turn, others give buffs.</li>
                <li><b>Cost:</b> There's no mana! But each card can only be used once per game.</li>
            </ul>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            #demo-overlay-bubble, #demo-overlay-left {
                position: absolute;
                width: 320px;
                background: white;
                color: #1e293b;
                padding: 20px;
                border-radius: 15px;
                z-index: 99999;
                text-align: left;
                border: 2px solid #e2e8f0;
                font-family: sans-serif;
                pointer-events: none;
                box-shadow: 0 10px 25px rgba(0,0,0,0.4);
            }
            .demo-highlight { animation: demoPulse 1.5s infinite; border: 3px solid #8b5cf6 !important; cursor: pointer !important; z-index: 100; }
            @keyframes demoPulse { 0% { box-shadow: 0 0 0 0 rgba(139,92,246, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(139,92,246, 0); } 100% { box-shadow: 0 0 0 0 rgba(139,92,246, 0); } }
        `;
        document.head.appendChild(style);

        setTimeout(() => {
            document.body.appendChild(overlay);
            document.body.appendChild(leftOverlay);
            const board = document.getElementById('chessboard');
            
            function updatePosition() {
                if (!document.getElementById('demo-overlay-bubble')) return;
                const r = board.getBoundingClientRect();
                
                if (window.innerWidth > r.right + 360) {
                    overlay.style.top = Math.max(20, r.top) + 'px';
                    overlay.style.left = (r.right + 20) + 'px';
                    overlay.style.transform = 'none';
                } else {
                    overlay.style.top = '20px';
                    overlay.style.left = '50%';
                    overlay.style.transform = 'translateX(-50%)';
                }
                
                if (r.left > 360) {
                    leftOverlay.style.display = 'block';
                    leftOverlay.style.top = Math.max(20, r.top) + 'px';
                    leftOverlay.style.left = (r.left - 340) + 'px';
                    leftOverlay.style.transform = 'none';
                } else {
                    leftOverlay.style.display = 'none';
                }
            }
            updatePosition();
            window.addEventListener('resize', updatePosition);

            let demoStep = 0;
            const pText = overlay.querySelector('#demo-text');
            
            function clearHighlights() {
                document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
            }
            
            function addHighlight(r, c, isPiece) {
                if (isPiece) {
                    const board = document.getElementById('chessboard');
                    const p = Array.from(board.querySelectorAll('.chess-piece')).find(el => {
                        return Math.abs(parseFloat(el.style.top) - (r * 12.5)) < 0.1 && 
                               Math.abs(parseFloat(el.style.left) - (c * 12.5)) < 0.1;
                    });
                    if (p) p.classList.add('demo-highlight');
                } else {
                    const sq = document.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
                    if (sq) sq.classList.add('demo-highlight');
                }
            }

            const cardEl = document.querySelector('#player1-cards .in-game-card');
            if(cardEl) cardEl.classList.add('demo-highlight');
            
            const originalActivateSpell = engine.activateSpell.bind(engine);
            engine.activateSpell = (index, el) => {
                if (demoStep === 0) {
                    if (index !== 2) {
                        pText.innerHTML = "<span style='color: #ef4444;'>Click the Double Trouble card!</span>";
                        return;
                    }
                    if(cardEl) cardEl.classList.remove('demo-highlight');
                    originalActivateSpell(index, el);
                    demoStep = 1;
                    pText.innerHTML = "Great! <b>Double Trouble</b> gives you 2 moves this turn! Move the highlighted Pawn to the highlighted square.";
                    addHighlight(6, 4, true); // Pawn
                    addHighlight(4, 4, false); // e4 square
                } else {
                    originalActivateSpell(index, el);
                }
            };
            
            const originalEngineMove = engine.move.bind(engine);
            engine.move = (sr, sc, er, ec) => {
                if (demoStep === 0) {
                    pText.innerHTML = "<span style='color: #ef4444;'>Click the highlighted Double Trouble card first!</span>";
                    app.renderChessboard(); // Snap piece back
                    return false;
                } else if (demoStep === 1) {
                    if (sr !== 6 || sc !== 4 || er !== 4 || ec !== 4) {
                        pText.innerHTML = "<span style='color: #ef4444;'>Please move the highlighted Pawn to the highlighted square!</span>";
                        app.renderChessboard(); // Snap piece back
                        setTimeout(() => {
                            addHighlight(6, 4, true);
                            addHighlight(4, 4, false);
                        }, 50);
                        return false; 
                    }
                    const res = originalEngineMove(sr, sc, er, ec);
                    demoStep = 2;
                    clearHighlights();
                    pText.innerHTML = "Move 1/2 completed! Because of Double Trouble, you get a second move! Move your Knight on g1 to f3.";
                    setTimeout(() => {
                        addHighlight(7, 6, true); // Knight
                        addHighlight(5, 5, false); // f3
                    }, 50); // wait for re-render
                    return res;
                } else if (demoStep === 2) {
                    if (sr !== 7 || sc !== 6 || er !== 5 || ec !== 5) {
                        pText.innerHTML = "<span style='color: #ef4444;'>Please move the highlighted Knight to the highlighted square!</span>";
                        app.renderChessboard(); // Snap piece back
                        setTimeout(() => {
                            addHighlight(7, 6, true);
                            addHighlight(5, 5, false);
                        }, 50);
                        return false;
                    }
                    const res = originalEngineMove(sr, sc, er, ec);
                    demoStep = 3;
                    clearHighlights();
                    pText.innerHTML = "<b>Tutorial completed!</b><br><br>• Goal: Capture the enemy King.<br>• If your King is captured, you lose immediately (no checks/checkmates).<br>• Use your spells wisely to outsmart the opponent!<br><br>Good luck!";
                    return res;
                } else {
                    return originalEngineMove(sr, sc, er, ec);
                }
            };
        }, 500);
    },
});
