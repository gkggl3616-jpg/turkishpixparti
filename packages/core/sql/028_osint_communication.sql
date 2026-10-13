ALTER TABLE osint_live_inboxes DROP CONSTRAINT IF EXISTS osint_live_inboxes_provider_check;
ALTER TABLE osint_live_inboxes ADD CONSTRAINT osint_live_inboxes_provider_check CHECK(provider IN ('mailtm','mailgw','guerrilla','dropmail','mailslurp','temp-mail-io','tempmail-lol','twilio','signalwire','mailslurp-sms'));
ALTER TABLE osint_panels DROP CONSTRAINT IF EXISTS osint_panels_panel_type_check;
ALTER TABLE osint_panels ADD CONSTRAINT osint_panels_panel_type_check CHECK(panel_type IN ('proxy','osint','mail','combos','infrastructure','threats','communication','research','web','social'));
INSERT INTO schema_migrations(version) VALUES('028_osint_communication') ON CONFLICT DO NOTHING;
