-- One sign-in per provider and account (one Google account per Pawnet account), held by
-- the database too: two links sent at the same time can no longer both pass the check in
-- server/accounts/oauth.js. If an account already has two, the migration stops (the
-- server does not start) and says so: unlink one by hand first.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM identities GROUP BY user_id, provider HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'identities: an account has two sign-ins with the same provider. Remove one by hand, then restart.';
    END IF;
END
$$;

ALTER TABLE identities ADD CONSTRAINT identities_one_per_provider UNIQUE (user_id, provider);
