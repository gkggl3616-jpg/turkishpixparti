ALTER TABLE arcade_sessions DROP CONSTRAINT IF EXISTS arcade_sessions_game_check;
ALTER TABLE arcade_sessions ADD CONSTRAINT arcade_sessions_game_check CHECK(game IN ('neon','memory','orbit','snake','breaker','space','2048','mines','connect4'));
INSERT INTO schema_migrations(version) VALUES('015_arcade_games') ON CONFLICT DO NOTHING;
