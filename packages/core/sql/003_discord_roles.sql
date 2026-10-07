ALTER TABLE items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE items ADD CONSTRAINT items_kind_check CHECK(kind IN ('PARTY','BILL','DIRECTIVE','ELECTION','APPOINTMENT','ROLE_ASSIGNMENT'));
CREATE TABLE IF NOT EXISTS discord_role_mappings (
 role_key text PRIMARY KEY CHECK(role_key IN ('TBMM_PRESIDENT','PARTY_LEADER','MP','PARTY_MEMBER')),
 role_id text UNIQUE CHECK(role_id ~ '^[0-9]{17,20}$'),
 updated_by text REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS discord_role_grants (
 user_id text NOT NULL REFERENCES users(id),
 role_key text NOT NULL CHECK(role_key IN ('TBMM_PRESIDENT','PARTY_LEADER','MP','PARTY_MEMBER')),
 enabled boolean NOT NULL, term_id uuid REFERENCES terms(id), source_item_id uuid REFERENCES items(id),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,role_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS single_tbmm_president ON discord_role_grants(role_key) WHERE role_key='TBMM_PRESIDENT' AND enabled;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON discord_role_mappings, discord_role_grants TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('003_discord_roles') ON CONFLICT DO NOTHING;
