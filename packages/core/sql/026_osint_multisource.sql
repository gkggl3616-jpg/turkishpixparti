ALTER TABLE osint_usage DROP CONSTRAINT IF EXISTS osint_usage_query_kind_check;
ALTER TABLE osint_usage ADD CONSTRAINT osint_usage_query_kind_check CHECK(query_kind IN ('aliases','combo-domain','combo-ip','mail-inbox','dns','ip','url','rdap','threat','mail','number','sms-inbox','proxy','malware','tls','subdomains','dns-history','asn','email','usernames','github','archives','metadata','headers','ioc','cve','hash','reports','proxy-check','geo','dns-mx','dns-ns','dns-soa','dns-caa','dnssec','spf','dmarc','dkim','mta-sts','tls-rpt','robots','sitemap','security-txt','csp','hsts','cors','cache-policy','redirects','web-status','tech','web-meta','web-links','cookies','domain-age','url-parts','idn','ip-scope','commoncrawl','ip-rdap','bgp','rpki','abuse-contact','rdns','reverse-ip','geo-consensus','cloud-ip','internetdb','otx','greynoise','public-breaches','humans','url-history','search-web','github-mentions','github-keys','gravatar','discord-id','spf-deep','proxy-live','business','web-inventory','isolation','waf-signals','method-hints','security-details','subdomains-verify','ct-deep','certspotter','hsts-preload','tranco','green-web','resolved-networks','origin-history','typosquat','mail-gateway','observatory','ssl-labs','combo-web','combo-email','combo-archive','combo-identity','combo-threat','scan','dns-multi','geo-multi','ip-multi','domain-multi','url-multi','hash-multi','cve-multi','security-score','inbox-hub','report-history'));
ALTER TABLE osint_sms_assignments ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'twilio';
ALTER TABLE osint_sms_assignments ADD COLUMN IF NOT EXISTS provider_number_id text;
CREATE TABLE IF NOT EXISTS osint_live_inboxes (
 id uuid PRIMARY KEY,guild_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),
 provider text NOT NULL CHECK(provider IN ('mailtm','mailgw','guerrilla','dropmail','mailslurp','twilio','signalwire','mailslurp-sms')),
 assignment_id uuid REFERENCES osint_sms_assignments(id),address text NOT NULL,credentials_cipher text NOT NULL,expires_at timestamptz NOT NULL,
 poll_seconds integer NOT NULL CHECK(poll_seconds BETWEEN 5 AND 60),
 next_poll_at timestamptz NOT NULL DEFAULT now(),snapshot_cipher text,checked_at timestamptz,last_error text NOT NULL DEFAULT '',
 discord_enabled boolean NOT NULL DEFAULT false,discord_channel_id text,discord_message_id text,discord_hash text NOT NULL DEFAULT '',discord_error text NOT NULL DEFAULT '',next_discord_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),stopped_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS osint_live_inbox_active ON osint_live_inboxes(guild_id,user_id,provider) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS osint_live_inbox_tick ON osint_live_inboxes(next_poll_at,next_discord_at) WHERE discord_enabled=true AND stopped_at IS NULL;
CREATE TABLE IF NOT EXISTS osint_reports (
 id uuid PRIMARY KEY,guild_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),request_id text NOT NULL,
 kind text NOT NULL,target text NOT NULL,title text NOT NULL,summary text NOT NULL,result_cipher text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 UNIQUE(guild_id,user_id,request_id)
);
CREATE INDEX IF NOT EXISTS osint_report_owner_history ON osint_reports(guild_id,user_id,created_at DESC);
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON osint_live_inboxes,osint_reports TO turkishpix_runtime; END IF; END $$;
INSERT INTO schema_migrations(version) VALUES('026_osint_multisource') ON CONFLICT DO NOTHING;
