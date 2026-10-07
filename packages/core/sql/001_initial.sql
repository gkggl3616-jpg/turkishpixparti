CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY CHECK (id ~ '^[0-9]{17,20}$'), username text NOT NULL, avatar text,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf_token text NOT NULL,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_states (state_hash text PRIMARY KEY, expires_at timestamptz NOT NULL, return_path text NOT NULL DEFAULT '/');
CREATE TABLE IF NOT EXISTS items (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('PARTY','BILL','DIRECTIVE','ELECTION','APPOINTMENT')),
 title text NOT NULL, description text NOT NULL, payload jsonb NOT NULL,
 author_id text NOT NULL REFERENCES users(id), state text NOT NULL DEFAULT 'OWNER_REVIEW'
 CHECK(state IN ('OWNER_REVIEW','REJECTED','VOTING','PASSED','FAILED')),
 owner_ids jsonb NOT NULL, approval_quorum integer NOT NULL CHECK(approval_quorum BETWEEN 1 AND 4),
 min_votes integer NOT NULL CHECK(min_votes >= 1), ballot_hours integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS approvals (
 item_id uuid NOT NULL REFERENCES items(id), owner_id text NOT NULL REFERENCES users(id),
 decision text NOT NULL CHECK(decision IN ('APPROVE','REJECT')), reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(item_id, owner_id)
);
CREATE TABLE IF NOT EXISTS parties (
 id uuid PRIMARY KEY, item_id uuid UNIQUE NOT NULL REFERENCES items(id), name text NOT NULL, abbreviation text NOT NULL,
 logo text, color text NOT NULL DEFAULT '#dc3a45', description text NOT NULL, goals text NOT NULL,
 leader_id text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS parties_name_unique ON parties(lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS parties_abbreviation_unique ON parties(lower(abbreviation));
CREATE UNIQUE INDEX IF NOT EXISTS pending_party_name ON items(lower(payload->>'name')) WHERE kind='PARTY' AND state IN ('OWNER_REVIEW','VOTING');
CREATE UNIQUE INDEX IF NOT EXISTS pending_party_abbreviation ON items(lower(payload->>'abbreviation')) WHERE kind='PARTY' AND state IN ('OWNER_REVIEW','VOTING');
CREATE TABLE IF NOT EXISTS party_members (
 user_id text PRIMARY KEY REFERENCES users(id), party_id uuid NOT NULL REFERENCES parties(id), joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS terms (id uuid PRIMARY KEY, election_item_id uuid UNIQUE REFERENCES items(id), name text NOT NULL, seats integer NOT NULL CHECK(seats > 0), starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_term ON terms((ends_at IS NULL)) WHERE ends_at IS NULL;
CREATE TABLE IF NOT EXISTS deputies (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), party_id uuid REFERENCES parties(id),
 term_id uuid NOT NULL REFERENCES terms(id), source_item_id uuid NOT NULL REFERENCES items(id),
 appointed_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, UNIQUE(user_id, term_id)
);
CREATE TABLE IF NOT EXISTS ballots (
 id uuid PRIMARY KEY, item_id uuid UNIQUE NOT NULL REFERENCES items(id), audience text NOT NULL CHECK(audience IN ('PUBLIC','MP')),
 options jsonb NOT NULL, electorate jsonb, starts_at timestamptz NOT NULL DEFAULT now(), ends_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','CLOSED')), result jsonb,
 discord_channel_id text, discord_message_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ballots_due ON ballots(ends_at) WHERE state='OPEN';
CREATE TABLE IF NOT EXISTS votes (
 ballot_id uuid NOT NULL REFERENCES ballots(id), user_id text NOT NULL REFERENCES users(id), choice text NOT NULL,
 interaction_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(ballot_id,user_id)
);
CREATE TABLE IF NOT EXISTS audit_events (
 seq bigserial PRIMARY KEY, id uuid UNIQUE NOT NULL, actor_id text NOT NULL, action text NOT NULL,
 entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL,
 previous_hash text NOT NULL, hash text UNIQUE NOT NULL, mac text NOT NULL
);
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only records cannot be updated, deleted or truncated'; END $$;
DROP TRIGGER IF EXISTS audit_no_mutation ON audit_events;
CREATE TRIGGER audit_no_mutation BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS audit_no_truncate ON audit_events;
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS votes_no_mutation ON votes;
CREATE TRIGGER votes_no_mutation BEFORE UPDATE OR DELETE ON votes FOR EACH ROW EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS approvals_no_mutation ON approvals;
CREATE TRIGGER approvals_no_mutation BEFORE UPDATE OR DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS votes_no_truncate ON votes;
CREATE TRIGGER votes_no_truncate BEFORE TRUNCATE ON votes FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
DROP TRIGGER IF EXISTS approvals_no_truncate ON approvals;
CREATE TRIGGER approvals_no_truncate BEFORE TRUNCATE ON approvals FOR EACH STATEMENT EXECUTE FUNCTION reject_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, votes, approvals FROM PUBLIC;
CREATE TABLE IF NOT EXISTS outbox (
 id uuid PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, dedupe_key text UNIQUE NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','DONE')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), locked_at timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_due ON outbox(available_at) WHERE status='PENDING';
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL DEFAULT 1, expires_at timestamptz NOT NULL);
INSERT INTO schema_migrations(version) VALUES ('001_initial') ON CONFLICT DO NOTHING;
