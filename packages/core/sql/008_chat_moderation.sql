ALTER TABLE security_events ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';
CREATE TABLE moderation_cases (
 id uuid PRIMARY KEY, guild_id text NOT NULL, message_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), channel_id text NOT NULL,
 category text NOT NULL, rule_id text NOT NULL, mode text NOT NULL CHECK(mode IN ('DELETE','REVIEW')), source text NOT NULL CHECK(source IN ('CREATE','EDIT','NATIVE')),
 fingerprint text NOT NULL, action text NOT NULL, strike boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DISMISSED','CONFIRMED')),
 reviewed_by text REFERENCES users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(guild_id,message_id)
);
CREATE INDEX moderation_member_strikes ON moderation_cases(guild_id,user_id,created_at DESC) WHERE strike AND status<>'DISMISSED';
CREATE INDEX moderation_review_queue ON moderation_cases(guild_id,created_at DESC) WHERE status='OPEN';
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON moderation_cases TO turkishpix_runtime;
 END IF;
END $$;
-- Requested activation. The migration runs once and preserves all other module settings.
UPDATE community_settings SET settings=jsonb_set(settings,'{security}',coalesce(settings->'security','{}'::jsonb)||'{"enabled":true}'::jsonb),updated_at=now();
INSERT INTO schema_migrations(version) VALUES('008_chat_moderation') ON CONFLICT DO NOTHING;
