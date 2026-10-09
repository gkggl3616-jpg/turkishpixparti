CREATE TABLE discord_audit_settings (
 guild_id text PRIMARY KEY, settings jsonb NOT NULL, updated_by text NOT NULL,
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE discord_audit_events (
 id uuid PRIMARY KEY, guild_id text NOT NULL, event_key text NOT NULL, kind text NOT NULL,
 actor_id text, actor_name text, target_id text, channel_id text, message_id text,
 before_content text, after_content text, metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(guild_id,event_key)
);
CREATE INDEX discord_audit_recent ON discord_audit_events(guild_id,created_at DESC,id);
CREATE INDEX discord_audit_kind ON discord_audit_events(guild_id,kind,created_at DESC);
CREATE TABLE discord_message_snapshots (
 guild_id text NOT NULL, message_id text NOT NULL, channel_id text NOT NULL,
 author_id text NOT NULL, author_name text NOT NULL, content text NOT NULL,
 attachments jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,message_id)
);
CREATE INDEX discord_snapshot_expiry ON discord_message_snapshots(guild_id,updated_at);
CREATE TABLE bot_join_jobs (
 guild_id text NOT NULL, bot_id text NOT NULL, joined_at timestamptz NOT NULL, bot_name text NOT NULL,
 added_by text, status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','REMOVED','SKIPPED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 last_error text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,bot_id)
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON discord_audit_settings,discord_audit_events,discord_message_snapshots,bot_join_jobs TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('016_discord_audit') ON CONFLICT DO NOTHING;
