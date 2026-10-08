CREATE TABLE entertainment_sessions (
 id uuid PRIMARY KEY, guild_id text NOT NULL, channel_id text NOT NULL, owner_id text NOT NULL REFERENCES users(id),
 kind text NOT NULL, state jsonb NOT NULL, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','FINISHED','EXPIRED')),
 message_id text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entertainment_active_expiry ON entertainment_sessions(expires_at) WHERE status='ACTIVE';
CREATE INDEX entertainment_owner ON entertainment_sessions(guild_id,owner_id,created_at DESC);
CREATE TABLE entertainment_votes (
 session_id uuid NOT NULL REFERENCES entertainment_sessions(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id),
 choice smallint NOT NULL CHECK(choice BETWEEN 0 AND 4), PRIMARY KEY(session_id,user_id)
);
CREATE TABLE entertainment_scores (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), played integer NOT NULL DEFAULT 0, wins integer NOT NULL DEFAULT 0,
 points integer NOT NULL DEFAULT 0, best_reflex_ms integer, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE entertainment_results (
 session_id uuid PRIMARY KEY REFERENCES entertainment_sessions(id) ON DELETE CASCADE, guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id),
 points integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entertainment_daily_points ON entertainment_results(guild_id,user_id,created_at);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON entertainment_sessions,entertainment_votes,entertainment_scores,entertainment_results TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('007_entertainment') ON CONFLICT DO NOTHING;
