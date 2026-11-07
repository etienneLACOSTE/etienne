# Chessdown 🏈♟️

**Chessdown** is a fast-paced fusion of traditional Chess and American Football: two players on one device (tablet or phone), online, or against the bot (campaign).

## 🎯 Goal of the game
Win the game by achieving one of two conditions:
1. **The Sack**: Capture the opponent's King.
2. **The Touchdown**: Move any of your pieces into the opponent's Endzone. You must survive there for one full turn without being captured to validate the Touchdown!

## 🛠️ Draft Phase
Forget the standard chess setup! Before the match begins, both players enter the **Draft Phase**:
- Each player has a budget of **39 points**.
- You secretly build your custom army by buying pieces (Pawn: 1, Knight: 3, Bishop: 3, Rook: 5, Queen: 9).
- You MUST buy exactly 1 King (cost: 0).
- Place your pieces anywhere in your designated deployment zone.
- Choose your team's jersey color!

## ⏱️ Gameplay & Rules
- **Movements**: All pieces move and capture exactly like in traditional chess.
- **No Check/Checkmate**: There is no "Check". You can legally move your King into danger. The game only ends when the King is physically captured.
- **Speed Chess**: **10 seconds** per turn by default (Timer menu: per-turn or overall time). If a turn timer runs out, the turn is skipped; if an overall timer runs out, that player loses. Online, the room creator's setting applies to both players and the server keeps the clock.
- **Pass & Play**: The UI is designed for face-to-face tabletop play. The board rotates and orientates pieces so both players can read the board from their side of the table.

## 🗺️ Where each rule lives in the code
| Rule | Code |
|---|---|
| Board size, piece values, 39-point budget | `games/chessdown/engine.js` (`ROWS`, `COLS`, `PIECE_VALUES`, `MAX_POINTS`) |
| Draft: shop, deployment zone, one king | `games/chessdown/js/draft.js`; checked online by `isValidDraft()` in `server/chessdown.js` |
| Moves, no check, en passant | `engine.js` (`getValidMoves()`, `applyMove()`), used through `js/rules-bridge.js` |
| The Sack (king capture) | `movePiece()` in `js/gameplay.js`; online, `makeMove` in `server/chessdown.js` |
| Touchdown | `engine.js` (`endzoneRow()`, `hasPieceInEndzone()`), checked at each `startTurn()` (`js/gameplay.js`) |
| Turn timer | `startTimer()` / `skipTurn()` in `js/gameplay.js`; online clock in `server/chessdown.js` (`startClock()`) |
| Pass & Play (board rotation) | `js/board-view.js` (`getViewCoords()`), `rotate-180` class in `js/draft.js` |
| Bot | `bot-search.js` (draft with a guarded formation, minimax with quiescence), used by `js/bot.js` and the trainer `tools/chessdown/train.js` |

## 📱 Tech Stack
- Pure HTML, CSS (Vanilla), and JavaScript.
- Node.js and Socket.io for the Online Multiplayer mode.
- Mobile and tablet responsive, utilizing `dvh` and Fullscreen API for a seamless app-like experience.

## 🚀 How to Run

From the project root:
```bash
npm install
npm start
```
Then open `http://localhost:3000/chessdown/` (local, campaign and online modes).

### Files
- `games/chessdown/`: game client; `training_data.json` holds the bot profiles.
- `tools/chessdown/train.js`: genetic training of the bot, writes `games/chessdown/training_data.json`.
