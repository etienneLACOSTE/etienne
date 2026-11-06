import os
import torch
from flask import Flask, request, jsonify
from flask_cors import CORS
import chess
from chess_env import ChesspellEnv, move_to_int
from model import ChesspellNet
from mcts import MCTS

app = Flask(__name__)
CORS(app) # Allow cross-origin requests from the JS frontend

# Load model globally to avoid reloading on each request
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = ChesspellNet().to(device)
model_path = "chesspell_model.pth"
if os.path.exists(model_path):
    model.load_state_dict(torch.load(model_path, map_location=device))
    print(f"Loaded trained model from {model_path}")
else:
    print("Warning: No trained model found, using random weights!")
model.eval()

# MCTS will be instantiated per-request to allow dynamic difficulty based on ELO.

@app.route('/get_move', methods=['POST'])
def get_move():
    data = request.json
    fen = data.get('fen')
    elo = int(data.get('elo', 1500))
    
    # Dynamic ELO mapping (drastically scaled down for real-time Python inference)
    # ELO 800 -> ~10 sims. ELO 1500 -> ~50 sims. ELO 2500 -> ~150 sims.
    simulations = int(max(10, min(150, 5 * (elo / 500) ** 2.5)))
    temperature = max(0.0, 1.0 - (elo / 1500))
    add_noise = elo < 2500
    
    # Optional: receive spell charges from JS (e.g. {'18': 1} for Kamikaze)
    # If not provided, we default to all spells being available for testing
    white_spells = data.get('white_spells', {})
    black_spells = data.get('black_spells', {})
    
    walls = data.get('walls', [])
    traps = data.get('traps', [])
    frozen = data.get('frozen', [])
    shielded = data.get('shielded', [])
    
    env = ChesspellEnv()
    try:
        env.board.set_fen(fen)
    except ValueError:
        return jsonify({"error": "Invalid FEN"}), 400
        
    # Inject spells into environment
    env.spells[chess.WHITE] = {int(k): v for k, v in white_spells.items()}
    env.spells[chess.BLACK] = {int(k): v for k, v in black_spells.items()}
    
    last_played_spell = data.get('last_played_spell', None)
    if last_played_spell is not None:
        last_played_spell = int(last_played_spell)
        for color in [chess.WHITE, chess.BLACK]:
            if 13 in env.spells[color] and env.spells[color][13] > 0:
                env.spells[color][13] -= 1
                env.spells[color][last_played_spell] = env.spells[color].get(last_played_spell, 0) + 1
    else:
        # If no spell has been played, mirror (13) cannot be used.
        for color in [chess.WHITE, chess.BLACK]:
            if 13 in env.spells[color]:
                env.spells[color][13] = 0
    
    env.wall_squares = {chess.square(w['c'], 7 - w['r']): 4 for w in walls}
    
    env.trap_square = {chess.WHITE: None, chess.BLACK: None}
    for t in traps:
        sq = chess.square(t['c'], 7 - t['r'])
        env.trap_square[chess.WHITE if t['owner'] == 'white' else chess.BLACK] = sq
        
    env.frozen_square = None
    if len(frozen) > 0:
        env.frozen_square = chess.square(frozen[0]['c'], 7 - frozen[0]['r'])
        
    env.shielded_square = None
    if len(shielded) > 0:
        env.shielded_square = chess.square(shielded[0]['c'], 7 - shielded[0]['r'])
        
    env.ghost_active = env.board.turn if data.get('ghost_active') else None
    env.leap_frog_active = env.board.turn if data.get('leap_frog_active') else None
    env.cannibalism_active = env.board.turn if data.get('cannibalism_active') else None
    env.assassin_active = env.board.turn if data.get('assassin_active') else None
    env.promotion_active = env.board.turn if data.get('promotion_active') else None
    
    mcts = MCTS(model, num_simulations=simulations, add_noise=add_noise)
    action_counts = mcts.search(env)
    
    if not action_counts:
        return jsonify({"error": "No legal moves found"}), 400
        
    if temperature <= 0.01:
        best_move = max(action_counts, key=action_counts.get)
    else:
        import numpy as np
        moves = list(action_counts.keys())
        counts = list(action_counts.values())
        probs = np.array(counts) ** (1.0 / temperature)
        probs /= np.sum(probs)
        best_move = np.random.choice(moves, p=probs)
    
    # Format response for JavaScript
    if isinstance(best_move, chess.Move):
        resp = {
            "type": "move",
            "from": chess.square_name(best_move.from_square),
            "to": chess.square_name(best_move.to_square),
            "promotion": best_move.promotion
        }
    else: # SpellAction
        resp = {
            "type": "spell",
            "spell_id": best_move.spell_id,
            "target1": chess.square_name(best_move.target1) if best_move.target1 is not None else None,
            "target2": chess.square_name(best_move.target2) if best_move.target2 is not None else None
        }
        
    return jsonify(resp)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
