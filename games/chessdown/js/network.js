// Online play: Socket.io event handlers, registered by setupEventListeners().
function setupNetwork() {
    // Socket Events
    if (socket) {
        socket.on('roomCreated', (code) => {
        currentRoomCode = code;
        myPlayerNumber = 1;
        document.getElementById('waiting-room-code').textContent = code;
        showScreen(document.getElementById('waiting-screen'));
    });

    socket.on('roomJoined', (data) => {
        currentRoomCode = data.roomCode;
        myPlayerNumber = data.playerNumber;
    });

    socket.on('gameStarted', (data) => {
        startDraftPhase(myPlayerNumber);
    });

    socket.on('draftPhaseEnded', (data) => {
        // Sync the fully merged board and colors from server
        board = data.roomState.board;
        playerColors = data.roomState.playerColors;
        startGameplay(data.roomState.currentPlayer);
    });

    // Brute-force color sync to bypass any UI listener issues
    setInterval(() => {
        if (currentRoomCode && gameState.startsWith('draft')) {
            socket.emit('colorSelected', { 
                roomCode: currentRoomCode, 
                player: myPlayerNumber, 
                color: playerColors[myPlayerNumber] 
            });
        }
    }, 500);

    socket.on('moveMade', (data) => {
        const { from, to, nextPlayer } = data;
        const targetPiece = board[to.r][to.c];
        const piece = board[from.r][from.c];
        
        // Handle King capture
        if (targetPiece && targetPiece.type === 'k') {
            const winner = piece.player;
            const winnerColorHex = COLOR_HEX[playerColors[winner]];
            
            // Move piece to king spot for visual satisfaction
            board[to.r][to.c] = piece;
            board[from.r][from.c] = null;
            if (piece) piece.hasMoved = true;
            renderBoard();

            if (myPlayerNumber === winner) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Victory!', `You captured the King!`, winner);
            } else {
                endGame('Defeat...', `Player ${winner} captured your King.`, winner);
            }
            return;
        }

        // Same resolution as local play: handles en passant and records lastMove.
        if (piece) makeVirtualMove({ fromR: from.r, fromC: from.c, toR: to.r, toC: to.c });

        currentPlayer = nextPlayer;
        selectedBoardPiece = null;
        clearHighlights();
        renderBoard();
        startTurn();
    });

    socket.on('turnSkipped', (data) => {
        currentPlayer = data.nextPlayer;
        selectedBoardPiece = null;
        clearHighlights();
        startTurn();
    });

    socket.on('playAgainStatus', (data) => {
        const btn = document.getElementById('btn-restart');
        if (btn && !btn.disabled) btn.textContent = `Play Again (${data.count}/2)`;
    });

    socket.on('opponentColorChanged', (color) => {
        const opponentPlayer = myPlayerNumber === 1 ? 2 : 1;
        playerColors[opponentPlayer] = color;
        if (gameState.startsWith('draft')) {
            setupColorPicker();
        }
    });

    socket.on('gameRestarted', () => {
        const btn = document.getElementById('btn-restart');
        if (btn) {
            btn.textContent = "Play Again";
            btn.disabled = false;
        }
        ui.victoryScreen.classList.add('hidden');
        
        // Reset local draft state
        draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
        kingsPlaced = { 1: false, 2: false };
        
        startDraftPhase(myPlayerNumber);
    });

    socket.on('opponentLeft', () => {
        alert("Your opponent left the game.");
        resetGame();
        showScreen(ui.mainMenu);
    });

    socket.on('errorMsg', (msg) => {
        alert(msg);
    });
    } // End of if (socket)
}
