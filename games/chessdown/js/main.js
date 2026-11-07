// Entry point.

// Initialization
function init() {
    setupEventListeners();
    setupAccessibility(); // a11y.js
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
        startDemo();
        return;
    }
    
    showScreen(ui.mainMenu);
    ui.statusBar.textContent = "Welcome to Chessdown";
    
    // Fetch AI training data once at startup
    fetch('training_data.json')
        .then(response => response.json())
        .then(data => {
            if (data && data.generations && data.generations.length > 0) {
                botTrainingData = data;
                console.log(`Loaded training data with ${data.generations.length} generations.`);
                if (urlParams.get('demo') !== 'true') {
                    loadBotProfileForDifficulty('master');
                } else {
                    loadBotProfileForDifficulty('novice');
                }
            }
        })
        .catch(err => {
            console.log("No trained AI found, using default bot profile.", err);
        });
}

// Start
init();
