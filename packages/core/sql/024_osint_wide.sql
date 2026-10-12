ALTER TABLE osint_usage DROP CONSTRAINT IF EXISTS osint_usage_query_kind_check;
ALTER TABLE osint_usage ADD CONSTRAINT osint_usage_query_kind_check CHECK(query_kind IN ('dns','ip','url','rdap','subdomains','tls','asn','cve','email','hash','proxy','proxy-check','combo-domain','combo-ip','headers','geo','usernames','github','ioc','archives','mail','mail-inbox','threat','dns-history','malware','reports','metadata','number','sms-inbox','dns-mx','dns-ns','dns-soa','dns-caa','dnssec','spf','dmarc','dkim','mta-sts','tls-rpt','robots','sitemap','security-txt','csp','hsts','cors','cache-policy','redirects','web-status','tech','web-meta','web-links','cookies','domain-age','url-parts','idn','ip-scope','commoncrawl'));

CREATE TABLE IF NOT EXISTS osint_mail_pending (
 guild_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),address text NOT NULL,
 credentials_cipher text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS osint_sms_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id text NOT NULL,user_id text NOT NULL REFERENCES users(id),
 phone text NOT NULL CHECK(phone ~ '^\+[1-9][0-9]{7,14}$'),assigned_by text NOT NULL REFERENCES users(id),
 assigned_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,revoked_at timestamptz,CHECK(expires_at>assigned_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS osint_sms_active_phone ON osint_sms_assignments(phone) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS osint_sms_member ON osint_sms_assignments(guild_id,user_id,expires_at);
CREATE TABLE IF NOT EXISTS welcome_staff_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),guild_id text NOT NULL,member_id text NOT NULL,joined_at timestamptz NOT NULL,payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',queued_at timestamptz,available_at timestamptz NOT NULL DEFAULT now(),UNIQUE(guild_id,member_id,joined_at)
);
CREATE TABLE IF NOT EXISTS welcome_staff_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES welcome_staff_events(id) ON DELETE CASCADE,
 recipient_id text NOT NULL,status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','SENT','FAILED')),
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),locked_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,recipient_id)
);
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='turkishpix_runtime') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON osint_mail_pending,osint_sms_assignments,welcome_staff_events,welcome_staff_deliveries TO turkishpix_runtime;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('024_osint_wide') ON CONFLICT DO NOTHING;
