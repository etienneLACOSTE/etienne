import sys
import json
import chess
from chess_env import ChesspellEnv, SpellAction

def replay_game(log_path):
    print(f"Loading game from {log_path}...")
    with open(log_path, "r") as f:
        data = json.load(f)
        
    print(f"Game ID: {data['game_id']}")
    print(f"Result: {data['result']}")
    print(f"Steps: {data['num_steps']}")
    
    env = ChesspellEnv()
    env.reset()
    
    print("\nInitial Board:")
    print(env.board)
    print("\n" + "="*40 + "\n")
    
    input("Press Enter to start replaying...")
    
    for i, action_data in enumerate(data['moves']):
        if action_data['type'] == 'move':
            action = chess.Move.from_uci(action_data['uci'])
            action_desc = f"Move: {action_data['uci']}"
        elif action_data['type'] == 'spell':
            spell_id = action_data['spell_id']
            t1 = action_data['target1']
            t2 = action_data['target2']
            action = SpellAction(spell_id, target1=t1, target2=t2)
            
            t1_name = chess.square_name(t1) if t1 is not None else "None"
            t2_name = chess.square_name(t2) if t2 is not None else "None"
            action_desc = f"Spell: {spell_id} (Target1: {t1_name}, Target2: {t2_name})"
            
        print(f"\n--- Step {i+1} ---")
        turn_str = "White" if env.board.turn == chess.WHITE else "Black"
        print(f"{turn_str} played: {action_desc}")
        
        _, _, done = env.step(action)
        
        print(env.board)
        
        # Also print spell modifiers if any
        modifiers = []
        if env.frozen_square is not None: modifiers.append(f"Frozen: {chess.square_name(env.frozen_square)}")
        if env.shielded_square is not None: modifiers.append(f"Shielded: {chess.square_name(env.shielded_square)}")
        if env.wall_squares: modifiers.append(f"Walls: {[chess.square_name(sq) for sq in env.wall_squares]}")
        if modifiers:
            print("Active Modifiers: " + " | ".join(modifiers))
            
        if done:
            print(f"\nGame Over! Result: {data['result']}")
            break
            
        try:
            input("Press Enter for next move (or Ctrl+C to exit)...")
        except KeyboardInterrupt:
            print("\nExiting replay.")
            sys.exit(0)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python replay_game.py <path_to_json_log>")
        sys.exit(1)
        
    replay_game(sys.argv[1])
