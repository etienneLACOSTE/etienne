import torch
import torch.nn as nn
import torch.nn.functional as F
from chess_env import TOTAL_ACTION_SPACE

class ResidualBlock(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        residual = x
        x = F.relu(self.bn1(self.conv1(x)))
        x = self.bn2(self.conv2(x))
        x += residual
        x = F.relu(x)
        return x

class ChesspellNet(nn.Module):
    def __init__(self, input_channels=63, num_res_blocks=5, channels=128):
        super().__init__()
        
        # Initial Convolutional Block
        self.conv_initial = nn.Conv2d(input_channels, channels, kernel_size=3, padding=1)
        self.bn_initial = nn.BatchNorm2d(channels)
        
        # Residual Blocks (the "body" of the network)
        self.res_blocks = nn.ModuleList([ResidualBlock(channels) for _ in range(num_res_blocks)])
        
        # Action space: dynamically loaded from chess_env
        self.policy_conv = nn.Conv2d(channels, 32, kernel_size=1)
        self.policy_bn = nn.BatchNorm2d(32)
        self.policy_fc = nn.Linear(32 * 8 * 8, TOTAL_ACTION_SPACE)
        
        # Value Head (Outputs winning probability -1 to 1)
        self.value_conv = nn.Conv2d(channels, 3, kernel_size=1)
        self.value_bn = nn.BatchNorm2d(3)
        self.value_fc1 = nn.Linear(3 * 8 * 8, 128)
        self.value_fc2 = nn.Linear(128, 1)

    def forward(self, x):
        # x is (batch_size, 14, 8, 8)
        x = F.relu(self.bn_initial(self.conv_initial(x)))
        
        for block in self.res_blocks:
            x = block(x)
            
        # Policy Head
        p = F.relu(self.policy_bn(self.policy_conv(x)))
        p = p.view(p.size(0), -1)
        policy = self.policy_fc(p)
        
        # Value Head
        v = F.relu(self.value_bn(self.value_conv(x)))
        v = v.view(v.size(0), -1)
        v = F.relu(self.value_fc1(v))
        value = torch.tanh(self.value_fc2(v))
        
        return policy, value
