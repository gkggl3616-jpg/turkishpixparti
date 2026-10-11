-- Additive upgrade. Existing giveaways, entries and ticket channels are untouched.
ALTER TABLE member_profiles ADD COLUMN IF NOT EXISTS voice_seconds bigint NOT NULL DEFAULT 0;
UPDATE member_profiles SET voice_seconds=voice_minutes::bigint*60 WHERE voice_seconds=0 AND voice_minutes>0;
UPDATE community_settings SET settings=jsonb_set(settings,'{features,xpCooldownSeconds}','5'::jsonb),updated_at=now() WHERE settings ? 'features';
CREATE TABLE IF NOT EXISTS invite_members (
 guild_id text NOT NULL,user_id text NOT NULL,username text NOT NULL,present boolean NOT NULL DEFAULT true,
 joined_at timestamptz,seen_before boolean NOT NULL DEFAULT true,inviter_id text,invite_code text,
 PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS invite_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id text NOT NULL,user_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('JOIN','LEAVE')),rejoin boolean NOT NULL DEFAULT false,
 inviter_id text,invite_code text,source text NOT NULL DEFAULT 'UNKNOWN',event_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(guild_id,event_key)
);
CREATE INDEX IF NOT EXISTS invite_events_stats ON invite_events(guild_id,inviter_id,kind);
CREATE TABLE IF NOT EXISTS invite_tracking (
 guild_id text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),baseline_complete boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS ticket_transcripts (
 record_id uuid PRIMARY KEY REFERENCES feature_records(id),guild_id text NOT NULL,channel_id text NOT NULL,
 content text NOT NULL,message_count integer NOT NULL,log_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 GRANT SELECT,INSERT,UPDATE,DELETE ON invite_members,invite_events,invite_tracking TO turkishpix_runtime;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ticket_transcripts TO turkishpix_runtime;
END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('018_voice_invites') ON CONFLICT DO NOTHING;
