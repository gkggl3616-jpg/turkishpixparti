# OSINT Console 2.20.0

This release is deployed from an OSINT-specific branch. Do not merge into the shared production branch or deploy the TurkishPix management bot as part of this release.

## Delivery and application scope

- `/api/osint/run` returns WEB results and does not call or enqueue Discord DM delivery.
- Existing Discord OSINT interactions remain on the existing bot deployment and keep their Discord DM delivery.
- `/guncellemeler` and `/api/updates` use the OSINT-only release catalog when `OSINT_ONLY=true`. The updates page is dynamic so Docker build-time environment cannot accidentally render the management catalog.
- OSINT health requires migration `025_osint_console` and reports the separate OSINT version.
- No bot command registration, role, welcome, music, moderation or political-system behavior is changed.

## Implemented recording features

| Recording feature | Implementation |
| --- | --- |
| Target detection and category/module selection | Browser-safe typed module catalog, automatic domain/IP/URL/email/nick/Snowflake/repository/hash detection; incompatible modules rejected server-side |
| Expanded combos | Domain, IP, web policy, email policy, archive, public profile, threat and custom console; one credit per completed scan |
| Progress and activity | NDJSON real start/completion events, observed duration, source status; device-local per-account recent activity |
| Saved and comparable reports | Ten per-account device-local reports; text search, status filters, section expansion, comparison and TXT/JSON/CSV export |
| DNS/domain research | Existing full DNS, RDAP, CT, DNSSEC and email policy modules; CertSpotter, deep CT, passive-discovered DNS verification, bounded domain-variation DNS checks |
| IP intelligence | IP RDAP, RIPE BGP/RPKI/abuse/reverse DNS, public reverse-IP, three-source country consensus and official AWS/Google/Cloudflare CIDR matching |
| Threat and historic ports | Shodan InternetDB passive port/CPE/CVE index, public HIBP site breach catalog; optional VirusTotal, AbuseIPDB, OTX and GreyNoise |
| Web review | HTTP/TLS, CSP/HSTS/CORS observations, cookie flags, redirects, cache, technology, metadata and public link inventory; script/SRI/mixed content/API path inventory, isolation, WAF/CDN signals, RFC 9116, Mozilla Observatory and cached SSL Labs endpoint |
| Archives and search | Wayback, Common Crawl, humans/robots/sitemap, urlscan existing report/screenshot links, Tranco ranks, Green Web hosting registry; Brave and GitHub reference search with credentials |
| Public identity | Existing 92-source nick research, SSH fingerprints/GPG/Gist metadata, Gravatar v3 and local Discord Snowflake decoding |
| Bulk live proxy checking | HTTP CONNECT, HTTPS CONNECT, SOCKS4a and SOCKS5 tunnels to a fixed HTTPS endpoint; certificate validation, repeated observations, latency/jitter/exit IP, success filter and export |
| Hourly proxy refresh | Explicit opt-in, once per hour while the browser tab is visible; each refresh uses one credit; personal browser notifications after permission |
| Temporary email/SMS | Existing Mail.tm/Mail.gw selection and inbox; existing owner-assigned owned Twilio numbers and scoped incoming SMS |
| Personal aliases and forwarding | Each user connects their own SimpleLogin key; encrypted per-user storage; random/word/custom aliases, notes, paging, counts/activity, enable/disable, verified forwarding targets, verified own-domain catch-all |
| Public place/business search | Bounded Nominatim public place search with source attribution; no person-address identification |

## Deliberate limits and unimplemented recording items

This is not a claim that every feature named in the recording is complete.

- The live proxy batch is limited to ten explicitly specified endpoints and four concurrent proxies, each with up to two attempts. Ports are required. No guessed port scan is performed. Provider-list uptime/anonymity is separate from live HTTPS observations.
- Geo consensus uses three actual providers, not the ten named in the recording. Official cloud matching covers AWS, Google Cloud and Cloudflare, not Azure/Fastly.
- Nick research remains the existing 92-source dataset; no unverified 300+ source claim is made. Account-recovery enumeration (Holehe) and private breach/stealer dumps are not implemented.
- Origin research shows current/historical candidates and explicitly does not claim a verified backend. No WAF bypass is performed.
- The 200-concurrent-request load test, arbitrary sensitive-file/VCS/backup probes, secret dumping, active directory/admin/API discovery and active CORS/TRACE tests are not implemented.
- Live page screenshot capture and favicon/ENS intelligence are not implemented. urlscan historical screenshot/report links are available when returned by the provider.
- E-mail/Telegram proxy alerts and unattended server-side hourly collection are not implemented. The current hourly refresh requires the visible browser tab.
- Alias expiration, message-count limits and sender allow/block lists are not implemented. Alias lifetime and plan restrictions remain with the connected provider. Verification of real forwarding addresses/custom domains happens in SimpleLogin; the app never invents verification.
- No shared public SMS scraping or outbound SMS is implemented. SMS inboxes are restricted to the user's current owner-assigned owned number and assignment period.
- Local file metadata remains SHA-256, file size, signature, MIME and local modified time; no facial identity or reverse-image recognition is performed.

## Required optional credentials

Owner API connection panel supports VirusTotal, AbuseIPDB, SecurityTrails, MalwareBazaar, urlscan, OTX, GreyNoise, Brave Search, GitHub code-search token, optional Gravatar credential, Twilio and SSL Labs v4 registered organizational email. Keys remain server-side and encrypted. Personal SimpleLogin keys are isolated per member and are never returned to the browser or owner panel.

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
- SimpleLogin: https://github.com/simple-login/app/blob/master/docs/api.md

## Verification

Regression tests cover WEB delivery without DM writes, single-credit scans, stream events, partial source failures, missing credentials, target/module validation, SQL catalog compatibility, migration idempotency, private proxy rejection, source uncertainty, real documented API parsing and verified personal forwarding boundaries. Build/typecheck and full regression suite must pass before deployment. Production provider credentials and real user OAuth cannot be asserted from fixtures. Browser QA is unavailable in the current managed environment because the supported control-browser capability is absent.
