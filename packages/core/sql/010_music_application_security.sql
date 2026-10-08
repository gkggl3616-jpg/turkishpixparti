CREATE TABLE IF NOT EXISTS application_permission_backups (
 guild_id text NOT NULL,channel_id text NOT NULL,target_id text NOT NULL,target_type integer NOT NULL,original boolean,
 PRIMARY KEY(guild_id,channel_id,target_id)
);
CREATE TABLE IF NOT EXISTS music_jobs (
 id uuid PRIMARY KEY,guild_id text NOT NULL,actor_id text NOT NULL REFERENCES users(id),channel_id text NOT NULL,action text NOT NULL,payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','DONE','FAILED')),result text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS music_jobs_pending ON music_jobs(created_at) WHERE status='QUEUED';
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON application_permission_backups,music_jobs TO turkishpix_runtime;
END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('010_music_application_security') ON CONFLICT DO NOTHING;
