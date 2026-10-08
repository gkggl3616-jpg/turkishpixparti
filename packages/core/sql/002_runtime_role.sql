DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
 CREATE ROLE turkishpix_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
 END IF;
END $$;
GRANT USAGE ON SCHEMA public TO turkishpix_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, oauth_states, items, parties, party_members, terms, deputies, ballots, outbox, rate_limits, discord_role_mappings, discord_role_grants, server_settings, integration_status, community_settings, dm_subscriptions, announcement_campaigns, community_deliveries, security_events, ai_daily_usage, community_secrets, voice_dm_preferences, entertainment_sessions, entertainment_votes, entertainment_scores, entertainment_results, moderation_cases, member_profiles, feature_records, feature_participants, feature_receipts, member_reputation, feature_channel_locks TO turkishpix_runtime;
GRANT SELECT ON schema_migrations TO turkishpix_runtime;
REVOKE ALL ON audit_events, votes, approvals FROM turkishpix_runtime;
GRANT SELECT, INSERT ON audit_events, votes, approvals TO turkishpix_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO turkishpix_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
