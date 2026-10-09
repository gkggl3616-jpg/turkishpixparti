CREATE TABLE IF NOT EXISTS arcade_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
 game text NOT NULL CHECK(game IN ('neon','memory','orbit')), cost integer NOT NULL CHECK(cost>0), seed integer NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DONE','EXPIRED')),
 outcome text, score integer, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '12 minutes'
);
CREATE INDEX IF NOT EXISTS arcade_member_sessions ON arcade_sessions(guild_id,user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS community_currency_campaigns (
 id text PRIMARY KEY, guild_id text NOT NULL, amount integer NOT NULL CHECK(amount>0),
 recipients jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DONE')),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS community_currency_grants (
 campaign_id text NOT NULL REFERENCES community_currency_campaigns(id), user_id text NOT NULL REFERENCES users(id),
 amount integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(campaign_id,user_id)
);
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON arcade_sessions,community_currency_campaigns,community_currency_grants TO turkishpix_runtime;
END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('014_arcade_currency') ON CONFLICT DO NOTHING;
