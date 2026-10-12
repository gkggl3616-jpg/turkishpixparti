# OSINT Console 2.21.2

This release is deployed from an OSINT-specific branch. Do not merge into the shared production branch or deploy the TurkishPix management bot as part of this release.

## Delivery and application scope

- `/api/osint/run` returns WEB results and does not call or enqueue Discord DM delivery.
- Personal inbox subscriptions are explicit opt-in and update only the initiating user’s own DM when message content changes. The worker lives only in the OSINT web service.
- Existing Discord OSINT interactions remain on the existing bot deployment and keep their Discord DM delivery.
- `/guncellemeler` and `/api/updates` use the OSINT-only release catalog when `OSINT_ONLY=true`. The updates page is dynamic so Docker build-time environment cannot accidentally render the management catalog.
- OSINT health requires migration `026_osint_multisource` and reports the separate OSINT version.
- No bot command registration, role, welcome, music, moderation or political-system behavior is changed.

## Implemented recording features

| Recording feature | Implementation |
| --- | --- |
| Target detection and category/module selection | Browser-safe typed module catalog, automatic domain/IP/URL/email/nick/Snowflake/repository/hash detection; incompatible modules rejected server-side |
| Expanded combos | Domain, IP, web policy, email policy, archive, public profile, threat and custom console; one credit per completed scan |
| Progress and activity | NDJSON real start/completion events, observed duration, source status; device-local per-account recent activity |
| Saved and comparable reports | Every completed WEB research result is stored compressed and encrypted per account for 7 days, with paginated history and download; ten optional device-local reports; text search, status filters, section expansion, comparison and TXT/JSON/CSV export |
| DNS/domain research | Existing full DNS, RDAP, CT, DNSSEC and email policy modules; CertSpotter, deep CT, passive-discovered DNS verification, bounded domain-variation DNS checks |
| IP intelligence | IP RDAP, RIPE BGP/RPKI/abuse/reverse DNS, public reverse-IP, three-source country consensus and official AWS/Google/Cloudflare CIDR matching |
| Threat and historic ports | Shodan InternetDB passive port/CPE/CVE index, public HIBP site breach catalog; optional VirusTotal, AbuseIPDB, OTX and GreyNoise |
| Web review | HTTP/TLS, CSP/HSTS/CORS observations, cookie flags, redirects, cache, technology, metadata and public link inventory; script/SRI/mixed content/API path inventory, isolation, WAF/CDN signals, RFC 9116, Mozilla Observatory and cached SSL Labs endpoint |
| Archives and search | Wayback, Common Crawl, humans/robots/sitemap, urlscan existing report/screenshot links, Tranco ranks, Green Web hosting registry; Brave and GitHub reference search with credentials |
| Public identity | 696-source nick research (604 new normalized WhatsMyName HTTPS GET adapters), SSH fingerprints/GPG/Gist metadata, Gravatar v3 and local Discord Snowflake decoding |
| Bulk live proxy checking | HTTP CONNECT, HTTPS CONNECT, SOCKS4a and SOCKS5 tunnels to a fixed HTTPS endpoint; certificate validation, repeated observations, latency/jitter/exit IP, success filter and export |
| Hourly proxy refresh | Explicit opt-in, once per hour while the browser tab is visible; each refresh uses one credit; personal browser notifications after permission |
| Temporary email/SMS | Mail.tm/Mail.gw, Guerrilla Mail, keyed DropMail/ MailSlurp; owner-assigned existing Twilio / SignalWire / MailSlurp numbers; personal assignment-scoped incoming SMS; web refresh every second, provider polls 5–15 seconds, opt-in Discord DM updates |
| Personal aliases and forwarding | Each user connects their own SimpleLogin key; encrypted per-user storage; random/word/custom aliases, notes, paging, counts/activity, enable/disable, verified forwarding targets, verified own-domain catch-all |
| Multiple API sources | Seven HTTP2 DoH resolvers, ten GeoIP connections, IP/domain/URL/hash/CVE aggregation across all configured compatible API sources; source-by-source status, credentials and errors |
| Security assessment | Weighted observed configuration score, minimum three assessed checks, coverage, severity, evidence, confidence, remediation and explicit untested vulnerabilities |
| Public place/business search | Bounded Nominatim public place search with source attribution; no person-address identification |

## Deliberate limits and unimplemented recording items

This is not a claim that every feature named in the recording is complete.

- Ordinary users have a ten-address live proxy batch. Owners have no level/count cap; request-size and concurrency bounds still protect the server. All matching provider-list rows are returned to owners. Live connections run four at a time, up to two attempts. Ports are required. No guessed port scan is performed. Provider-list uptime/anonymity is separate from live HTTPS observations.
- The original consensus tool remains a three-provider comparison; the new GeoIP aggregation has ten real integrations (five need credentials). Official cloud matching covers AWS, Google Cloud and Cloudflare, not Azure/Fastly.
- Nick research now contains 696 distinct source adapters, with 604 added from WhatsMyName. Public profile pages are not counted as official APIs. The provider inventory contains 68 API/data providers separately from 696 profile sources; 25 API connections are new. No claim of 300 independent live official APIs is made. Account-recovery enumeration (Holehe) and private breach/stealer dumps are not implemented.
- Origin research shows current/historical candidates and explicitly does not claim a verified backend. No WAF bypass is performed.
- The 200-concurrent-request load test, arbitrary sensitive-file/VCS/backup probes, secret dumping, active directory/admin/API discovery and active CORS/TRACE tests are not implemented.
- Live page screenshot capture and favicon/ENS intelligence are not implemented. urlscan historical screenshot/report links are available when returned by the provider.
- E-mail/Telegram proxy alerts and unattended server-side hourly collection are not implemented. The current hourly refresh requires the visible browser tab.
- Alias expiration, message-count limits and sender allow/block lists are not implemented. Alias lifetime and plan restrictions remain with the connected provider. Verification of real forwarding addresses/custom domains happens in SimpleLogin; the app never invents verification.
- No shared public SMS scraping or outbound SMS is implemented. SMS inboxes are restricted to the user's current owner-assigned owned number and assignment period.
- Local file metadata remains SHA-256, file size, signature, MIME and local modified time; no facial identity or reverse-image recognition is performed.

## Required optional credentials

Owner API connection panel additionally supports SignalWire space:projectUUID:apiToken, DropMail af_ token, MailSlurp, IPinfo Lite, ipregistry, IPGeolocation v3, ipdata, IP2Location, Shodan, Pulsedive, abuse.ch URLhaus/ThreatFox, Google Safe Browsing/Web Risk, WhoisXML and OpenPageRank. It supports VirusTotal, AbuseIPDB, SecurityTrails, MalwareBazaar, urlscan, OTX, GreyNoise, Brave Search, GitHub code-search token, optional Gravatar credential, Twilio and SSL Labs v4 registered organizational email. Keys remain server-side and encrypted. Personal SimpleLogin keys are isolated per member and are never returned to the browser or owner panel.

## Runtime and data boundaries

The OSINT-only Next instrumentation worker polls personal subscriptions with atomic database leases, a four-request fan-out and provider backoff. Membership/access is checked before private delivery. A number inbox is tied to one assignment ID: revocation, expiration and reassignment cannot expose another member’s messages. Provider secrets and inbox snapshots are AES-GCM encrypted. Cookies, attachments and remote HTML are not rendered. Report ciphertext is compressed before encryption; only sanitized report metadata is indexed. The role used by the running app receives table CRUD grants, not migration administration. `DATABASE_ADMIN_URL` is unset at runtime and cleared from scoped service variables after deployment.

`exhaustive` is the default scan profile and starts every selected compatible module. Bounded quick/balanced/deep profiles remain optional. Username research checks every adapter with twelve concurrent reads and emits real observations. Streaming heartbeats keep long requests alive. Individual endpoint timeouts, provider-specific rate limits, HTTP response bounds and retry/backoff still apply. Failed or unavailable sources remain visible instead of becoming safe/empty results.

The recording’s external mail domains and public SMS sites appear in the directory with explicit unverified/external states. A directory entry does not create an API adapter or allow reading shared third-party SMS. All provider keys must be configured by the owner; an adapter existing in code does not prove a paid account is active.

## Source references

- RIPE network/RPKI: https://stat.ripe.net/docs/data-api/api-endpoints/network-info.html and https://stat.ripe.net/docs/data-api/api-endpoints/rpki-validation
- Shodan InternetDB: https://book.shodan.io/developer-apis/internetdb/
- HIBP public breach catalog: https://haveibeenpwned.com/API/v3
- Gravatar v3: https://docs.gravatar.com/sdk/profiles/
- SSLMate CT Search: https://sslmate.com/help/reference/ct_search_api_v1
- Tranco: https://tranco-list.eu/api_documentation
- Greencheck: https://developers.thegreenwebfoundation.org/api/greencheck/v3/check-single-domain/
- MDN Observatory: https://github.com/mdn/mdn-http-observatory/blob/main/README.md
- SSL Labs v4: https://github.com/ssllabs/ssllabs-scan/blob/master/ssllabs-api-docs-v4.md
- WhatsMyName: https://github.com/WebBreacher/WhatsMyName (normalized data and attribution manifest; CC BY-SA 4.0; pinned upstream commit in manifest)
- Mail.tm: https://docs.mail.tm/
- DropMail: https://dropmail.me/api/ and https://dropmail.me/api/schema.graphql
- Guerrilla Mail: https://www.guerrillamail.com/GuerrillaMailAPI.html
- MailSlurp: https://www.mailslurp.com/docs/api/ and https://www.mailslurp.com/docs/txt-sms/
- SignalWire: https://signalwire.com/docs/compatibility-api/rest/messages/list-messages
- Quad9: https://docs.quad9.net/services/
- DNS.SB: https://dns.sb/doh/
- IPGeolocation v3: https://ipgeolocation.io/documentation/ip-location-api.html
- SimpleLogin: https://github.com/simple-login/app/blob/master/docs/api.md

## Verification

Regression tests cover WEB delivery without DM writes, single-credit scans, stream events, partial source failures, missing credentials, target/module validation, SQL catalog compatibility, migration idempotency, private proxy rejection, source uncertainty, real documented API parsing and verified personal forwarding boundaries. Build/typecheck and full regression suite must pass before deployment. Production provider credentials and real user OAuth cannot be asserted from fixtures. Browser QA is unavailable in the current managed environment because the supported control-browser capability is absent.
