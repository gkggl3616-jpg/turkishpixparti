ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS scan_after timestamptz;
ALTER TABLE owo_sessions ADD COLUMN IF NOT EXISTS panel_message_id text;
ALTER TABLE owo_observations ADD COLUMN IF NOT EXISTS last_scan_at timestamptz;
ALTER TABLE owo_channels ADD COLUMN IF NOT EXISTS last_completed_scan_at timestamptz;
CREATE INDEX IF NOT EXISTS owo_observation_scan ON owo_observations(guild_id,channel_id,source_id,last_scan_at);
INSERT INTO schema_migrations(version) VALUES('034_owo_advisor') ON CONFLICT DO NOTHING;
