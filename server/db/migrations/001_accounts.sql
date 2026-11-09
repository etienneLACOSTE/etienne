-- Accounts: a player signs in with a password, Google or GitHub (several can be linked).

CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL,
    -- Only for password accounts (reset links); NULL for Google / GitHub only.
    email text,
    -- scrypt, see server/accounts/passwords.js; NULL when the account has no password.
    password_hash text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Usernames and emails are unique whatever their case.
CREATE UNIQUE INDEX users_username_key ON users (lower(username));

CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Google or GitHub accounts linked to a user: the provider's id for that person.
CREATE TABLE identities (
    provider text NOT NULL,
    subject text NOT NULL,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);

-- Signed-in browsers. The cookie holds a random token; only its SHA-256 is stored,
-- so the table alone cannot be used to sign in.
CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id ON sessions (user_id);

-- Password reset links: single use, short-lived, stored hashed like sessions.
CREATE TABLE password_resets (
    token_hash text PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz
);
