CREATE TABLE IF NOT EXISTS owo_channels (
 guild_id text PRIMARY KEY,channel_id text NOT NULL,source_id text NOT NULL,configured_by text NOT NULL REFERENCES users(id),
 scan_state text NOT NULL DEFAULT 'IDLE' CHECK(scan_state IN ('IDLE','RUNNING','COMPLETE','ERROR')),cursor_before text,
 scanned_count bigint NOT NULL DEFAULT 0,scan_started_at timestamptz,scan_completed_at timestamptz,last_error text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS owo_observations (
 guild_id text NOT NULL,channel_id text NOT NULL,source_id text NOT NULL,message_id text NOT NULL,player_id text,
 game text NOT NULL,phase text NOT NULL,bet bigint,payout bigint,net bigint,state jsonb NOT NULL,signature text NOT NULL,
 source_created_at timestamptz NOT NULL,source_edited_at timestamptz NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 PRIMARY KEY(guild_id,channel_id,message_id)
);
CREATE INDEX IF NOT EXISTS owo_observation_source ON owo_observations(guild_id,channel_id,source_id,source_created_at DESC);
CREATE TABLE IF NOT EXISTS owo_sessions (
 id uuid PRIMARY KEY,guild_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),channel_id text NOT NULL,source_id text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','STOPPED','REVOKED')),expires_at timestamptz NOT NULL,
 webhook_cipher text NOT NULL,next_update_at timestamptz NOT NULL DEFAULT now(),last_signature text NOT NULL DEFAULT '',last_error text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS owo_session_one_active ON owo_sessions(guild_id,user_id) WHERE status='ACTIVE';
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON owo_channels,owo_observations,owo_sessions TO turkishpix_runtime;
 END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('031_owo_analysis') ON CONFLICT DO NOTHING;
