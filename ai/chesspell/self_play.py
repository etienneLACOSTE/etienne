import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import torch
torch.set_num_threads(1)
import numpy as np
import chess
from chess_env import ChesspellEnv, move_to_int, TOTAL_ACTION_SPACE, SpellAction
from model import ChesspellNet
from mcts import MCTS
import os
import json
import uuid
import time

def serialize_action(action):
    if isinstance(action, chess.Move):
        return {"type": "move", "uci": action.uci()}
    elif isinstance(action, SpellAction):
        return {
            "type": "spell", 
            "spell_id": action.spell_id, 
            "target1": action.target1, 
            "target2": action.target2
        }
    return None

def self_play(model_path="chesspell_model.pth", num_games=5, num_mcts_sims=50, temperature=1.0):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Starting self-play on {device}")
    
    # Load Model
    model = ChesspellNet().to(device)
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path))
        print("Loaded trained model weights.")
    else:
        print("Warning: No pre-trained model found. Playing with random weights.")
    model.eval()
    
    mcts = MCTS(model, num_simulations=num_mcts_sims)
    
    all_data = [] # List to store (state, policy, value)
    
    for game_idx in range(num_games):
        env = ChesspellEnv()
        env.reset()
        
        import random
        all_spells = list(range(1, 21))
        white_deck = random.sample(all_spells, 3)
        black_deck = random.sample(all_spells, 3)
        env.spells[chess.WHITE] = {s: 1 for s in white_deck}
        env.spells[chess.BLACK] = {s: 1 for s in black_deck}

        
        game_data = [] # Stores (state, policy) for current game
        game_history = []
        step = 0
        done = False
        
        while not done and step < 75:
            if not env.board.king(chess.WHITE) or not env.board.king(chess.BLACK) or env.board.is_game_over():
                done = True
                break
                
            # 1. Run MCTS to get improved policy
            action_counts = mcts.search(env)
            
            if not action_counts:
                print("No valid moves returned by MCTS (possibly due to spell modifiers). Ending game early.")
                done = True
                break
            
            # 2. Extract policy vector
            policy_target = np.zeros(TOTAL_ACTION_SPACE, dtype=np.float32)
            total_visits = sum(action_counts.values())
            
            for move, visits in action_counts.items():
                policy_target[move_to_int(move)] = visits / total_visits
                
            # 3. Store state and policy (we don't know the final value yet)
            game_data.append((env.get_state(), policy_target))
            
            # 4. Pick best move (Explore early, Exploit later to finish games)
            current_temp = temperature if step < 60 else 0.01
            
            if current_temp <= 0.01: # Essentially deterministic
                best_move = max(action_counts, key=action_counts.get)
            else:
                moves = list(action_counts.keys())
                counts = list(action_counts.values())
                probs = np.array(counts) ** (1.0 / current_temp)
                probs /= np.sum(probs)
                best_move = np.random.choice(moves, p=probs)
            
            # 5. Execute move
            game_history.append(serialize_action(best_move))
            _, _, done = env.step(best_move)
            step += 1
            
        # Game over, determine actual value
        if not env.board.king(chess.WHITE):
            final_val = -1.0
            res = "0-1 (White King Captured)"
        elif not env.board.king(chess.BLACK):
            final_val = 1.0
            res = "1-0 (Black King Captured)"
        else:
            res = env.board.result(claim_draw=True)
            if res == '1-0': final_val = 1.0
            elif res == '0-1': final_val = -1.0
            else: 
                # Timeout penalty to discourage aimless shuffling
                final_val = -0.1 if res == '*' else 0.0
        
        # Retroactively assign value to all positions in the game
        print(f"Game {game_idx+1} finished in {step} steps. Result: {res}")
        for state, policy in game_data:
            # We assume value is always from White's perspective in this simple dataset
            all_data.append((state, policy, final_val))
            
        # Save game to JSON
        os.makedirs("self_play_logs", exist_ok=True)
        game_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
        log_path = os.path.join("self_play_logs", f"game_{game_id}.json")
        with open(log_path, "w") as f:
            json.dump({
                "game_id": game_id,
                "result": res,
                "num_steps": step,
                "moves": game_history
            }, f, indent=4)
            
    print(f"Self-play generated {len(all_data)} new training positions.")
    
    # Save training data to disk to avoid multiprocessing pipe limits
    os.makedirs("training_data_tmp", exist_ok=True)
    tmp_path = os.path.join("training_data_tmp", f"data_{uuid.uuid4().hex}.pt")
    torch.save(all_data, tmp_path)
    
    return tmp_path

if __name__ == "__main__":
    self_play()
