CREATE TABLE IF NOT EXISTS ticket_settings (
 guild_id text PRIMARY KEY, settings jsonb NOT NULL, panel_message_id text, panel_channel_id text, panel_updated_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON ticket_settings TO turkishpix_runtime;
END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('011_tickets_giveaways') ON CONFLICT DO NOTHING;
