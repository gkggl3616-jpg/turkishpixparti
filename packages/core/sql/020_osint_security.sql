ALTER TABLE osint_usage DROP CONSTRAINT IF EXISTS osint_usage_query_kind_check;
ALTER TABLE osint_usage ADD CONSTRAINT osint_usage_query_kind_check CHECK(query_kind IN ('dns','ip','url','rdap','subdomains','tls','asn','cve','email','hash','proxy','proxy-check'));
CREATE TABLE IF NOT EXISTS osint_access_blocks (
 guild_id text NOT NULL,
 user_id text NOT NULL REFERENCES users(id),
 reason text NOT NULL DEFAULT '',
 blocked_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS osint_access_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 guild_id text NOT NULL,
 user_id text NOT NULL REFERENCES users(id),
 event_type text NOT NULL CHECK(event_type IN ('VISIT','QUERY','DENIED','BLOCK','UNBLOCK')),
 source text NOT NULL CHECK(source IN ('WEB','DISCORD','OWNER')),
 query_kind text NOT NULL DEFAULT '',
 target_preview text NOT NULL DEFAULT '',
 observed_ip text,
 error_code text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS osint_events_recent ON osint_access_events(guild_id,created_at DESC);
CREATE INDEX IF NOT EXISTS osint_events_user ON osint_access_events(guild_id,user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS osint_channel_settings (
 guild_id text PRIMARY KEY,
 channel_id text NOT NULL,
 updated_by text NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
DO $ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON osint_access_blocks,osint_access_events,osint_channel_settings TO turkishpix_runtime;
  GRANT USAGE,SELECT ON SEQUENCE osint_access_events_id_seq TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('020_osint_security') ON CONFLICT DO NOTHING;
