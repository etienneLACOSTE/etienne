# Ches'spell

Ches'spell est un jeu d'échecs magique moderne. En plus des pièces d'échecs classiques, chaque joueur possède un deck de sorts magiques qui permettent d'altérer le plateau, d'invoquer des murs, de téléporter des pièces, ou d'inverser le cours du temps !

## 🎮 Comment Jouer

Le jeu inclut plusieurs modes de jeu :
- **Online Multiplayer** : Jouez avec vos amis à distance avec des codes de salon.
- **Local Game** : Jouez à deux joueurs sur le même ordinateur.
- **Campaign Mode** : Affrontez l'Intelligence Artificielle (AlphaZero) en difficulté croissante !

## 🚀 Installation & Lancement

Ches'spell nécessite deux serveurs pour fonctionner correctement en mode Solo/Campagne (un serveur web pour le jeu, et un serveur d'Intelligence Artificielle en Python).

### 1. Démarrer le serveur Web (Interface & Multijoueur)
Ouvrez un terminal dans ce dossier et lancez :
```bash
node server.js
```
*Le jeu sera accessible sur http://localhost:3000 dans votre navigateur.*

### 2. Démarrer le serveur d'Intelligence Artificielle (AlphaZero)
Ouvrez un DEUXIÈME terminal, allez dans le sous-dossier `backend-ai`, activez l'environnement virtuel, puis lancez l'API :
```bash
cd backend-ai
source venv/bin/activate
python3 api.py
```
*L'IA écoutera sur le port 5000 et sera prête à affronter les joueurs en mode Campagne.*

## 🛠️ Technologies
- **Frontend** : Vanilla JS, HTML5, CSS3, Socket.io
- **Backend Web** : Node.js, Express
- **Backend IA** : Python 3, PyTorch, Flask, Algorithme Monte Carlo Tree Search (AlphaZero)
