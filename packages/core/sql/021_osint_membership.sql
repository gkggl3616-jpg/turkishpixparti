-- Record the first authenticated visit to the standalone OSINT portal.
-- This is separate from Discord guild joined_at and from the general bot users.created_at.
CREATE TABLE IF NOT EXISTS osint_member_accounts (
 guild_id text NOT NULL,
 user_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (guild_id,user_id)
);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON osint_member_accounts TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('021_osint_membership') ON CONFLICT DO NOTHING;
