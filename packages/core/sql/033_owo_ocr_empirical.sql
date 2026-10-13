ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS watch_until timestamptz NOT NULL DEFAULT '-infinity';
ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS next_scan_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS scan_limit integer NOT NULL DEFAULT 700;
ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS scan_period text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS owo_frames (
 guild_id text NOT NULL,channel_id text NOT NULL,source_id text NOT NULL,message_id text NOT NULL,signature text NOT NULL,
 game text NOT NULL,phase text NOT NULL,score integer,soft boolean,state jsonb NOT NULL,source_edited_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 PRIMARY KEY(guild_id,channel_id,message_id,signature)
);
CREATE INDEX IF NOT EXISTS owo_frame_scope ON owo_frames(guild_id,channel_id,source_id,message_id,source_edited_at);
CREATE TABLE IF NOT EXISTS owo_ocr_jobs (
 id text PRIMARY KEY,guild_id text NOT NULL,channel_id text NOT NULL,source_id text NOT NULL,message_id text NOT NULL,
 image_url text NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','RUNNING','COMPLETE','FAILED','UNSUPPORTED')),
 attempts integer NOT NULL DEFAULT 0,result jsonb,last_error text NOT NULL DEFAULT '',next_try_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
CREATE INDEX IF NOT EXISTS owo_ocr_queue ON owo_ocr_jobs(status,next_try_at);
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON owo_frames,owo_ocr_jobs TO turkishpix_runtime;
 END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('033_owo_ocr_empirical') ON CONFLICT DO NOTHING;
