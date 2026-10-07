CREATE TABLE IF NOT EXISTS server_settings (
 id integer PRIMARY KEY CHECK(id=1), settings jsonb NOT NULL,
 updated_by text NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_status (
 name text PRIMARY KEY, status jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON server_settings, integration_status TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('004_server_setup') ON CONFLICT DO NOTHING;
