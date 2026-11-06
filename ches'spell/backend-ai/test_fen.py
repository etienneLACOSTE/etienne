import requests
import json
data = {
    "fen": "rnQ1kbnr/p1ppppp1/7p/8/1p1PP3/8/PPP2PPP/RNB1KBNR b - - 0 1",
    "elo": 1500,
    "white_spells": {},
    "black_spells": {},
    "walls": [],
    "traps": [],
    "frozen": [],
    "shielded": []
}
res = requests.post("http://127.0.0.1:5000/get_move", json=data)
print(res.status_code)
print(res.text)
