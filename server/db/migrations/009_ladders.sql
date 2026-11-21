-- Chessdown ladders (server/ladders.js): one rating per account, mode and monthly season
-- ('2026-11'), changed by each ranked best of 3. Past seasons' rows stay: they make the
-- podium of the month before and the carry-over of a rating into the next season.
CREATE TABLE ladder_ratings (
    user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    mode text NOT NULL CHECK (mode IN ('classic', 'allstar')),
    season text NOT NULL CHECK (season ~ '^[0-9]{4}-[0-9]{2}$'),
    rating integer NOT NULL,
    series integer NOT NULL DEFAULT 0,
    wins integer NOT NULL DEFAULT 0,
    losses integer NOT NULL DEFAULT 0,
    draws integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, mode, season)
);

CREATE INDEX ladder_ratings_board ON ladder_ratings (mode, season, rating DESC);

-- Every ranked series, for the limit between the same two players (3 counted a day). A
-- player who deletes their account takes their series along.
CREATE TABLE ladder_series (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mode text NOT NULL,
    season text NOT NULL,
    player1 bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    player2 bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    winner smallint NOT NULL CHECK (winner IN (0, 1, 2)),
    counted boolean NOT NULL,
    played_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ladder_series_pair ON ladder_series (least(player1, player2), greatest(player1, player2), played_at);

CREATE INDEX ladder_series_player1 ON ladder_series (player1);

CREATE INDEX ladder_series_player2 ON ladder_series (player2);

-- "Hide me from the public leaderboard" (account page): the player still has a rating and
-- sees their own rank, but other players never see their name on the board.
ALTER TABLE users ADD COLUMN ladder_hidden boolean NOT NULL DEFAULT false;
