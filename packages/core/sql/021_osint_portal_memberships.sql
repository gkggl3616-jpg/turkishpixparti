-- First authenticated visit to the independent Turkish Osint portal.
-- The timestamp is not backfilled from Discord account creation.
CREATE TABLE IF NOT EXISTS osint_portal_memberships (
 user_id text PRIMARY KEY REFERENCES users(id),
 joined_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT ON osint_portal_memberships TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('021_osint_portal_memberships') ON CONFLICT DO NOTHING;
