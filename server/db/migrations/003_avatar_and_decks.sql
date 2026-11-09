-- The account's picture (a small image as a data URL, checked by server/accounts/avatar.js)
-- and each game's saved setup (Ches'spell: the deck of three cards).

ALTER TABLE users ADD COLUMN avatar text;

CREATE TABLE game_decks (
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    game text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, game)
);
