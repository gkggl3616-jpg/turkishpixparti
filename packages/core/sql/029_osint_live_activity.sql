ALTER TABLE osint_portal_memberships ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
CREATE INDEX IF NOT EXISTS osint_portal_activity ON osint_portal_memberships(last_active_at DESC);
ALTER TABLE osint_live_inboxes ADD COLUMN IF NOT EXISTS service_filter text NOT NULL DEFAULT 'all' CHECK(service_filter IN ('all','whatsapp','google','tiktok','telegram','other'));
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN GRANT UPDATE(last_active_at) ON osint_portal_memberships TO turkishpix_runtime; END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('029_osint_live_activity') ON CONFLICT DO NOTHING;
