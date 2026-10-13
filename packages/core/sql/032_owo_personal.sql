CREATE TABLE IF NOT EXISTS owo_requests (
 guild_id text NOT NULL,channel_id text NOT NULL,source_id text NOT NULL,message_id text NOT NULL,user_id text NOT NULL,
 command text NOT NULL,game text,names text[] NOT NULL,requested_at timestamptz NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 PRIMARY KEY(guild_id,channel_id,message_id)
);
CREATE INDEX IF NOT EXISTS owo_request_correlation ON owo_requests(guild_id,channel_id,source_id,game,requested_at DESC);
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON owo_requests TO turkishpix_runtime;
 END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('032_owo_personal') ON CONFLICT DO NOTHING;
