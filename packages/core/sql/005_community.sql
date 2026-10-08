CREATE TABLE IF NOT EXISTS community_settings (
 guild_id text PRIMARY KEY, settings jsonb NOT NULL, updated_by text REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dm_subscriptions (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), active boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS announcement_campaigns (
 id uuid PRIMARY KEY, guild_id text NOT NULL, author_id text NOT NULL REFERENCES users(id), title text NOT NULL,
 content text NOT NULL, delivery text NOT NULL CHECK(delivery IN ('CHANNEL','DM')), channel_id text,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','CANCELLED','COMPLETED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_deliveries (
 id uuid PRIMARY KEY, guild_id text NOT NULL, campaign_id uuid REFERENCES announcement_campaigns(id),
 kind text NOT NULL CHECK(kind IN ('WELCOME','ANNOUNCEMENT','DM','SECURITY_LOG')), payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','SENT','FAILED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 last_error text, message_id text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 dedupe_key text UNIQUE
);
CREATE INDEX IF NOT EXISTS community_deliveries_pending ON community_deliveries(status,available_at);
CREATE TABLE IF NOT EXISTS security_events (
 id uuid PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL, channel_id text, reason text NOT NULL,
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_recent ON security_events(guild_id,created_at DESC);
CREATE TABLE IF NOT EXISTS community_secrets (
 guild_id text PRIMARY KEY, provider jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_daily_usage (
 guild_id text NOT NULL, day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date), requests integer NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,day)
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON community_settings,dm_subscriptions,announcement_campaigns,community_deliveries,security_events,ai_daily_usage,community_secrets TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('005_community') ON CONFLICT DO NOTHING;
