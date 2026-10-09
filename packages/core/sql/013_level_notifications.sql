ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS last_chat_channel_id text;
CREATE TABLE IF NOT EXISTS level_up_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
 channel_id text NOT NULL, level integer NOT NULL CHECK(level>0), xp integer NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 message_id text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(guild_id,user_id,level)
);
CREATE INDEX IF NOT EXISTS level_up_pending ON level_up_notifications(guild_id,next_attempt_at) WHERE status IN ('PENDING','SENDING');
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON level_up_notifications TO turkishpix_runtime;
END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('013_level_notifications') ON CONFLICT DO NOTHING;
