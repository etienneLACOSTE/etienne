# Infinite Chess Runner

An infinite, procedurally generated chess survival game. Move your King forward, capture enemy pieces to gain their movement abilities, and survive as long as you can while the board constantly scrolls upward!

## 🎮 How to Play

- **Goal**: Survive and go as far as possible. The board automatically scrolls up. If you fall behind or get captured, you lose a life.
- **Movement**: You control the White King. Click on valid squares or use your keyboard (Z/Q/S/D, Arrows, or Numpad) to move.
- **Powers**: Capturing an enemy piece grants you its movement ability! For example, capture a Knight to move in an L-shape. Capturing nothing makes you revert to a normal King.
- **Danger Zones**: Squares highlighted in red are attacked by active enemies. Stepping on them will cost you a life.
- **Time Limit**: You have a limited time to make each move. Moving quickly and capturing enemies gives you more time.

## 🧠 Features

- **Procedural Level Generation**: The board is generated infinitely as you progress.
- **Mathematical Solvability**: The game engine uses an advanced Backtracking Pathfinder to generate the board, guaranteeing that there is **always** at least one valid path to survive.
- **Softlock Detection**: If you manage to get yourself stuck with 0 valid moves (e.g., getting a Pawn power while blocked by an enemy), the game immediately detects it.
- **Animated Analysis Mode**: When you lose all your lives, click the **Analyse** button. The game will visually rewind time and animate the exact sequence of moves you should have taken to survive!

## 🚀 Running Locally

To play the game on your own machine:

1. Clone this repository.
2. Open `index.html` in your web browser.
3. Enjoy!

## 🛠️ Built With

- HTML5
- CSS3 (Vanilla)
- JavaScript (Vanilla)
