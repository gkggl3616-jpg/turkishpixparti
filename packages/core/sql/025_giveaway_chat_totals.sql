CREATE TABLE IF NOT EXISTS giveaway_chat_totals (
 guild_id text NOT NULL,
 user_id text NOT NULL,
 messages bigint NOT NULL DEFAULT 0,
 PRIMARY KEY (guild_id, user_id)
);

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turkishpix_runtime') THEN
  GRANT SELECT, INSERT, UPDATE ON giveaway_chat_totals TO turkishpix_runtime;
 END IF;
END $$;

INSERT INTO schema_migrations(version) VALUES ('025_giveaway_chat_totals') ON CONFLICT DO NOTHING;
