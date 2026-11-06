import chess
import chess.engine
import chess.pgn
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
from chess_env import ChesspellEnv, move_to_int, TOTAL_ACTION_SPACE
from model import ChesspellNet
import os

class ChessDataset(Dataset):
    def __init__(self, data):
        self.data = data
        
    def __len__(self):
        return len(self.data)
        
    def __getitem__(self, idx):
        state, policy_target, value_target = self.data[idx]
        return torch.tensor(state), torch.tensor(policy_target, dtype=torch.float32), torch.tensor([value_target], dtype=torch.float32)


def parse_pgn_data(pgn_path, max_games=1000):
    print(f"Parsing PGN file: {pgn_path}")
    data = []
    env = ChesspellEnv()
    
    if not os.path.exists(pgn_path):
        print(f"Error: {pgn_path} not found.")
        return []
        
    with open(pgn_path) as pgn:
        games_parsed = 0
        while games_parsed < max_games:
            game = chess.pgn.read_game(pgn)
            if game is None:
                break
                
            res_str = game.headers.get("Result", "*")
            if res_str == '1-0': final_val = 1.0
            elif res_str == '0-1': final_val = -1.0
            else: final_val = 0.0 # Draw or unknown
            
            env.reset()
            board = game.board()
            
            for move in game.mainline_moves():
                state = env.get_state()
                
                # Policy target: one-hot encode the actual played move
                policy_target = np.zeros(TOTAL_ACTION_SPACE, dtype=np.float32)
                policy_target[move_to_int(move)] = 1.0
                
                # We assume final_val is from White's perspective
                data.append((state, policy_target, final_val))
                
                env.step(move)
                
            games_parsed += 1
            if games_parsed % 100 == 0:
                print(f"Parsed {games_parsed} games... ({len(data)} positions)")
                
    print(f"Finished parsing. Total positions extracted: {len(data)}")
    return data

def train(pgn_path=None):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device}")
    
    model = ChesspellNet().to(device)
    if os.path.exists("chesspell_model.pth"):
        model.load_state_dict(torch.load("chesspell_model.pth"))
        print("Loaded existing model weights.")
        
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    if pgn_path:
        data = parse_pgn_data(pgn_path, max_games=5000) # Load up to 5000 games
    else:
        print("No PGN file provided. Please provide a dataset.")
        return
        
    if not data:
        return
        
    dataset = ChessDataset(data)
    loader = DataLoader(dataset, batch_size=256, shuffle=True) # Larger batch size for PGN
    
    model.train()
    epochs = 10
    print(f"Starting training for {epochs} epochs...")
    
    for epoch in range(epochs):
        total_loss = 0
        for states, policies, values in loader:
            states = states.to(device)
            policies = policies.to(device)
            values = values.to(device)
            
            optimizer.zero_grad()
            
            pred_policies, pred_values = model(states)
            
            value_loss = nn.MSELoss()(pred_values, values)
            policy_loss = -torch.sum(policies * torch.log_softmax(pred_policies, dim=1)) / states.size(0)
            
            loss = value_loss + policy_loss
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            
        print(f"Epoch {epoch+1}/{epochs}, Loss: {total_loss/len(loader):.4f}")
        
    torch.save(model.state_dict(), "chesspell_model.pth")
    print("Model saved to chesspell_model.pth")

if __name__ == "__main__":
    import sys
    # Usage: python3 train_supervised.py data.pgn
    if len(sys.argv) > 1:
        train(sys.argv[1])
    else:
        print("Usage: python3 train_supervised.py <path_to_pgn_file>")
