CREATE TABLE IF NOT EXISTS community_integrations (
 guild_id text NOT NULL, name text NOT NULL, secret jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,name)
);
CREATE TABLE IF NOT EXISTS member_utilities (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), afk_reason text, afk_at timestamptz,
 birthday_day integer CHECK(birthday_day BETWEEN 1 AND 31), birthday_month integer CHECK(birthday_month BETWEEN 1 AND 12),
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS community_voice_rooms (
 guild_id text NOT NULL, owner_id text NOT NULL REFERENCES users(id), channel_id text NOT NULL UNIQUE,
 empty_since timestamptz, lock_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,owner_id)
);
CREATE TABLE IF NOT EXISTS community_role_leases (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), role_id text NOT NULL,
 expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','DONE')),
 PRIMARY KEY(guild_id,user_id,role_id)
);
CREATE TABLE IF NOT EXISTS community_registrations (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), staff_id text NOT NULL REFERENCES users(id),
 name text NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DONE')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS youtube_library (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), video_id text NOT NULL, title text NOT NULL,
 metadata_updated_at timestamptz DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,user_id,video_id)
);
CREATE TABLE IF NOT EXISTS youtube_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
 video_id text NOT NULL, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS youtube_history_recent ON youtube_history(guild_id,created_at DESC);
ALTER TABLE feature_participants ADD COLUMN IF NOT EXISTS choice text NOT NULL DEFAULT 'GOING' CHECK(choice IN ('GOING','MAYBE','DECLINED','WAITLIST'));
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS voice_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS last_voice_xp_at timestamptz;
ALTER TABLE community_deliveries DROP CONSTRAINT IF EXISTS community_deliveries_kind_check;
ALTER TABLE community_deliveries ADD CONSTRAINT community_deliveries_kind_check CHECK(kind IN ('WELCOME','ANNOUNCEMENT','DM','SECURITY_LOG','VOICE_DM','REMINDER','SOCIAL'));
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON community_integrations,member_utilities,community_voice_rooms,community_role_leases,community_registrations,youtube_library,youtube_history TO turkishpix_runtime;
END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('012_community_expansion') ON CONFLICT DO NOTHING;
