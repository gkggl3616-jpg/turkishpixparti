CREATE TABLE IF NOT EXISTS osint_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guild_id text NOT NULL,
 user_id text NOT NULL REFERENCES users(id), assigned_by text NOT NULL REFERENCES users(id),
 credits bigint NOT NULL CHECK(credits>0 AND credits<=9007199254740991),
 used bigint NOT NULL DEFAULT 0 CHECK(used>=0 AND used<=credits),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS osint_grants_member ON osint_grants(guild_id,user_id,expires_at);
ALTER TABLE osint_usage ADD COLUMN IF NOT EXISTS billing_source text NOT NULL DEFAULT 'DAILY' CHECK(billing_source IN ('DAILY','GRANT','OWNER'));
ALTER TABLE osint_usage ADD COLUMN IF NOT EXISTS grant_id uuid REFERENCES osint_grants(id);
ALTER TABLE osint_usage DROP CONSTRAINT IF EXISTS osint_usage_query_kind_check;
ALTER TABLE osint_usage ADD CONSTRAINT osint_usage_query_kind_check CHECK(query_kind IN ('dns','ip','url','rdap','subdomains','tls','asn','cve','email','hash','proxy','proxy-check','combo-domain','combo-ip','headers','geo','usernames','github','ioc','archives','mail','mail-inbox','threat','dns-history','malware','reports','metadata'));
CREATE TABLE IF NOT EXISTS osint_provider_health (
 provider text PRIMARY KEY, state text NOT NULL CHECK(state IN ('OK','ERROR')),
 checked_at timestamptz NOT NULL DEFAULT now(), last_success_at timestamptz,
 code text NOT NULL DEFAULT '', latency_ms integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS osint_provider_keys (
 provider text PRIMARY KEY, key_cipher text NOT NULL, updated_by text NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS osint_mailboxes (
 guild_id text NOT NULL,user_id text NOT NULL REFERENCES users(id), address text NOT NULL,
 credentials_cipher text NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,user_id)
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON osint_grants,osint_provider_health,osint_provider_keys,osint_mailboxes TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('023_osint_research') ON CONFLICT DO NOTHING;
