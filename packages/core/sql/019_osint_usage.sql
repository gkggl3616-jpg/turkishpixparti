-- Turkish Osint: XP based daily quotas, shared by Web + Discord.
CREATE TABLE IF NOT EXISTS osint_usage (
  guild_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  request_id text NOT NULL,
  day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date),
  query_kind text NOT NULL CHECK (query_kind IN ('dns','ip','url')),
  target_sha256 text NOT NULL CHECK (length(target_sha256)=64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id,user_id,request_id)
);
CREATE INDEX IF NOT EXISTS osint_usage_daily ON osint_usage(guild_id,user_id,day);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,DELETE ON osint_usage TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('019_osint_usage') ON CONFLICT DO NOTHING;
