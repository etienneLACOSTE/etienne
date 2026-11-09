-- One row per finished game of a signed-in player: what they played, against whom, how
-- it ended and how long it lasted. Online games are written by the game servers (the
-- referee); games against the bot or on the same screen are sent by the page.
CREATE TABLE game_results (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    game text NOT NULL CHECK (game IN ('chesspell', 'chessdown')),
    mode text NOT NULL CHECK (mode IN ('online', 'bot', 'local')),
    result text NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
    reason text NOT NULL,
    opponent text NOT NULL,
    duration_s integer NOT NULL CHECK (duration_s >= 0),
    played_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX game_results_user ON game_results (user_id, played_at DESC);
