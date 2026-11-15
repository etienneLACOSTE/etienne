-- Chat messages reported by a player (server/chat.js), kept 90 days for moderation, then
-- deleted (server/reports.js). The message is copied from the server's memory, never
-- from what the reporting page sends. A reported player who deletes their account takes
-- the reports about them along; the reporter's own deletion only removes their name.

CREATE TABLE chat_reports (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reporter_id bigint REFERENCES users (id) ON DELETE SET NULL,
    reported_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reported_name text NOT NULL,
    game text NOT NULL,
    message text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_reports_reported ON chat_reports (reported_id);

CREATE INDEX chat_reports_reporter ON chat_reports (reporter_id);

CREATE INDEX chat_reports_created ON chat_reports (created_at);
