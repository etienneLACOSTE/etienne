import os
# CRITICAL: Prevent PyTorch from using all threads inside each worker, causing massive CPU throttling
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
import torch
torch.set_num_threads(1)
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import multiprocessing as mp
from model import ChesspellNet
from self_play import self_play

class ReplayBufferDataset(Dataset):
    def __init__(self, data):
        self.data = data
        
    def __len__(self):
        return len(self.data)
        
    def __getitem__(self, idx):
        state, policy, value = self.data[idx]
        return torch.tensor(state), torch.tensor(policy, dtype=torch.float32), torch.tensor([value], dtype=torch.float32)

def worker_task(kwargs):
    # Wrapper to unpack kwargs
    return self_play(**kwargs)

def continuous_training_loop(model_path="chesspell_model.pth", num_workers=4, games_per_worker=5, epochs_per_iter=3):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Starting continuous training on {device} with {num_workers} workers.")
    
    model = ChesspellNet().to(device)
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location=device))
        print("Loaded existing model.")
    else:
        # Save initial random model so workers have something to load
        torch.save(model.state_dict(), model_path)
        print("Created new random model.")
        
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    iteration = 1
    
    # Create the pool ONCE outside the loop to prevent memory and file descriptor leaks
    import concurrent.futures
    executor = concurrent.futures.ProcessPoolExecutor(
        max_workers=num_workers,
        mp_context=mp.get_context('spawn'),
        max_tasks_per_child=1
    )
    
    import gc
    
    while True:
        print(f"\n--- Iteration {iteration} ---")
        print("Generating self-play games...")
        tasks = [{"model_path": model_path, "num_games": games_per_worker, "num_mcts_sims": 100, "temperature": 1.0} for _ in range(num_workers)]
        
        # Run self-play in parallel using the persistent pool
        results = list(executor.map(worker_task, tasks))
        
        # Flatten results
        all_data = []
        for file_path in results:
            if isinstance(file_path, str) and os.path.exists(file_path):
                data = torch.load(file_path, weights_only=False)
                all_data.extend(data)
                os.remove(file_path)
            else:
                print(f"Warning: Expected file path, got {file_path}")
                
        print(f"Generated {len(all_data)} positions from self-play.")
        
        if not all_data:
            print("No data generated, skipping training.")
            continue
            
        dataset = ReplayBufferDataset(all_data)
        loader = DataLoader(dataset, batch_size=128, shuffle=True)
        
        model.train()
        for epoch in range(epochs_per_iter):
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
            print(f"Epoch {epoch+1}/{epochs_per_iter}, Loss: {total_loss/len(loader):.4f}")
            
        torch.save(model.state_dict(), model_path)
        print(f"Saved updated model to {model_path}.")
        iteration += 1
        
        # Force garbage collection to prevent memory creeping up over iterations
        del results
        del all_data
        del dataset
        del loader
        gc.collect()

if __name__ == "__main__":
    mp.set_start_method('spawn')
    # Leave at least 2 cores free to avoid choking the OS and running out of RAM
    num_cores = max(1, mp.cpu_count() - 2)
    continuous_training_loop(num_workers=num_cores)
