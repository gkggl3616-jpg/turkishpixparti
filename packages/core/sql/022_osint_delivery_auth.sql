-- Private result delivery and browser-bound, single-use OAuth handoff.
ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS handoff_hash text;
CREATE TABLE IF NOT EXISTS oauth_handoffs (
 request_hash text PRIMARY KEY CHECK(length(request_hash)=64),
 verifier_hash text NOT NULL CHECK(length(verifier_hash)=64),
 target_origin text NOT NULL,
 return_path text NOT NULL,
 user_id text REFERENCES users(id),
 ticket_hash text UNIQUE,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS oauth_handoffs_expiry ON oauth_handoffs(expires_at);
CREATE TABLE IF NOT EXISTS osint_dm_deliveries (
 id uuid PRIMARY KEY,
 guild_id text NOT NULL,
 user_id text NOT NULL REFERENCES users(id),
 request_id text NOT NULL,
 payload_cipher text,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','EXPIRED')),
 attempts integer NOT NULL DEFAULT 0,
 last_error text NOT NULL DEFAULT '',
 available_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz,
 UNIQUE(guild_id,user_id,request_id)
);
CREATE INDEX IF NOT EXISTS osint_dm_pending ON osint_dm_deliveries(status,available_at);
CREATE TABLE IF NOT EXISTS osint_panels (
 guild_id text NOT NULL,
 channel_id text NOT NULL,
 panel_type text NOT NULL CHECK(panel_type IN ('proxy','osint','mail')),
 message_id text NOT NULL,
 updated_by text NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,channel_id,panel_type)
);
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON oauth_handoffs,osint_dm_deliveries,osint_panels TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('022_osint_delivery_auth') ON CONFLICT DO NOTHING;
