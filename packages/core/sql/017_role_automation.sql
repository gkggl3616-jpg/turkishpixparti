CREATE TABLE role_automation_settings (
 guild_id text PRIMARY KEY, settings jsonb NOT NULL, updated_by text NOT NULL,
 revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE role_automation_jobs (
 guild_id text NOT NULL, user_id text NOT NULL, role_id text NOT NULL, source text NOT NULL,
 desired boolean NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', revision integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','DONE','SKIPPED','FAILED')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 last_error text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,user_id,role_id)
);
CREATE INDEX role_jobs_pending ON role_automation_jobs(guild_id,status,available_at);
CREATE TABLE role_bulk_campaigns (
 id uuid PRIMARY KEY, guild_id text NOT NULL, owner_id text NOT NULL, role_id text NOT NULL,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','QUEUED','SCANNING','APPLYING','DONE','CANCELLED','FAILED')),
 cursor_id text NOT NULL DEFAULT '0', queued integer NOT NULL DEFAULT 0,
 estimated integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE role_reaction_panels (
 id uuid PRIMARY KEY, guild_id text NOT NULL, channel_id text NOT NULL, message_id text NOT NULL,
 role_id text NOT NULL, emoji_key text NOT NULL, emoji text NOT NULL, active boolean NOT NULL DEFAULT true,
 owner_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(guild_id,message_id,emoji_key)
);
CREATE UNIQUE INDEX reaction_role_unique_active ON role_reaction_panels(guild_id,role_id) WHERE active;
CREATE TABLE role_bulk_targets (
 campaign_id uuid NOT NULL REFERENCES role_bulk_campaigns(id) ON DELETE CASCADE,
 user_id text NOT NULL, status text NOT NULL DEFAULT 'QUEUED', last_error text,
 PRIMARY KEY(campaign_id,user_id)
);
CREATE TABLE role_scan_state (
 guild_id text PRIMARY KEY, cursor_id text NOT NULL DEFAULT '0', next_scan timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1,
 last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON role_automation_settings,role_automation_jobs,role_bulk_campaigns,role_bulk_targets,role_reaction_panels,role_scan_state TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('017_role_automation') ON CONFLICT DO NOTHING;
