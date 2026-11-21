-- A signed-in player's Chessdown club (All Star) and career, kept with the account so they
-- follow the player from one browser to another, and so online All Star games use the club
-- the server holds (never one sent with the game). Both are checked by the shared rules
-- (games/chessdown/club-rules.js sanitizeClub, career-rules.js sanitizeCareer) before they
-- are written. Deleted with the account.
CREATE TABLE chessdown_clubs (
    user_id bigint PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    club jsonb NOT NULL,
    career jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);
