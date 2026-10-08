ALTER TABLE community_deliveries DROP CONSTRAINT IF EXISTS community_deliveries_kind_check;
ALTER TABLE community_deliveries ADD CONSTRAINT community_deliveries_kind_check CHECK(kind IN ('WELCOME','ANNOUNCEMENT','DM','SECURITY_LOG','VOICE_DM','REMINDER'));
CREATE TABLE IF NOT EXISTS member_profiles (
 guild_id text NOT NULL, user_id text NOT NULL REFERENCES users(id), xp integer NOT NULL DEFAULT 0 CHECK(xp>=0),
 coins integer NOT NULL DEFAULT 0 CHECK(coins BETWEEN 0 AND 1000000), messages integer NOT NULL DEFAULT 0,
 reputation integer NOT NULL DEFAULT 0, last_xp_at timestamptz, last_content_hash text,
 xp_day date, xp_today integer NOT NULL DEFAULT 0, daily_date date, streak integer NOT NULL DEFAULT 0, inventory jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS feature_records (
 id uuid PRIMARY KEY, guild_id text NOT NULL, owner_id text NOT NULL REFERENCES users(id), kind text NOT NULL
 CHECK(kind IN ('REMINDER','NOTE','TASK','GIVEAWAY','EVENT','SUGGESTION','TICKET','WARNING','ROLE_MENU','FAQ')),
 title text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', channel_id text, message_id text, due_at timestamptz,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','DONE','CLOSED','CANCELLED','APPROVED','REJECTED')),
 discord_updated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feature_records_lookup ON feature_records(guild_id,kind,status,created_at DESC);
CREATE INDEX IF NOT EXISTS feature_records_due ON feature_records(due_at) WHERE status='OPEN';
CREATE TABLE IF NOT EXISTS feature_participants (
 record_id uuid NOT NULL REFERENCES feature_records(id) ON DELETE CASCADE, user_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(record_id,user_id)
);
CREATE TABLE IF NOT EXISTS feature_receipts (
 guild_id text NOT NULL, interaction_id text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guild_id,interaction_id)
);
CREATE TABLE IF NOT EXISTS member_reputation (
 guild_id text NOT NULL, giver_id text NOT NULL REFERENCES users(id), day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul')::date),
 receiver_id text NOT NULL REFERENCES users(id), PRIMARY KEY(guild_id,giver_id,day)
);
CREATE TABLE IF NOT EXISTS feature_channel_locks (
 guild_id text NOT NULL, channel_id text NOT NULL, original jsonb NOT NULL, locked_by text NOT NULL REFERENCES users(id),
 PRIMARY KEY(guild_id,channel_id)
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON member_profiles,feature_records,feature_participants,feature_receipts,member_reputation,feature_channel_locks TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('009_community_features') ON CONFLICT DO NOTHING;
