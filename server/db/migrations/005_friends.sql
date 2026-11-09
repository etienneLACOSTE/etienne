-- Friends: a request from one player to another; once accepted, a friendship (stored once
-- per pair, smaller id first); and blocks (the blocked player can no longer send
-- requests or invitations, and any friendship ends).

CREATE TABLE friend_requests (
    from_user bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    to_user bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (from_user, to_user),
    CHECK (from_user <> to_user)
);

CREATE INDEX friend_requests_to ON friend_requests (to_user);

CREATE TABLE friendships (
    user_a bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_b bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    since timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
);

CREATE INDEX friendships_b ON friendships (user_b);

CREATE TABLE blocks (
    blocker bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    blocked bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker, blocked),
    CHECK (blocker <> blocked)
);
