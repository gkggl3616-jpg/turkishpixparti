ALTER TABLE community_deliveries DROP CONSTRAINT community_deliveries_kind_check;
ALTER TABLE community_deliveries ADD CONSTRAINT community_deliveries_kind_check CHECK(kind IN ('WELCOME','ANNOUNCEMENT','DM','SECURITY_LOG','VOICE_DM'));
CREATE TABLE IF NOT EXISTS voice_dm_preferences (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS community_voice_cooldown ON community_deliveries(guild_id,(payload->>'userId'),(payload->>'event'),created_at DESC) WHERE kind='VOICE_DM';
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON voice_dm_preferences TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('006_voice_presence') ON CONFLICT DO NOTHING;
