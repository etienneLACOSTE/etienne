-- A first sign-in with Google or GitHub, waiting for the player to choose a username.
-- Kept on the server (the browser only holds a random token, stored here hashed), so
-- nobody can claim someone else's Google or GitHub account by editing a cookie.
CREATE TABLE oauth_pending (
    token_hash text PRIMARY KEY,
    provider text NOT NULL,
    subject text NOT NULL,
    suggested_username text,
    expires_at timestamptz NOT NULL
);
