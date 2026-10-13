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

## OSINT 2.22 — public social profiles and controlled web validation

The existing NEXUS styles are retained. There are now 132 tools and 9 combo presets. The 696 username presence adapters and 68 API/data-provider counts remain separate; the eleven structured social adapters reuse existing services and are not counted as eleven newly discovered APIs.

The `social-*` tools normalize publicly returned fields, exact identity evidence, source URL, timestamp and error state. `social-all` reports all eleven adapters with four workers; Bitbucket requires an explicit ID and does not query arbitrary nicknames. GitHub, GitLab and DEV support explicit `id:123`; Bluesky supports full handles and DID; Discord accepts a Snowflake or a single exact username within the configured shared guild. Account IDs belong to their platform and cannot be reused as cross-platform identifiers. Avatar/banner URLs use fixed HTTPS image hosts. Images load only after the user opts in, with no referrer; unsupported hosts have no embedded image. JSON exports, field/status filters, server report history and the identity combo preserve these results. HTML biographies render as text.

| Platform | Implemented query | Public fields, when returned |
| --- | --- | --- |
| GitHub | username / explicit numeric ID | ID, login/name, avatar, bio, public email, website/company/location, follow counts, public repositories/Gists, dates |
| GitLab | exact username / explicit ID | ID, name/avatar, profile URL, bio, public email, organization/location/site, public social handles and dates; authentication/privacy may restrict fields |
| Bluesky | handle / DID | DID, handle, display name, avatar/banner, bio, counts, dates and public labels |
| Codeberg | username | Forgejo public user ID/name/avatar, description, public email/site/location/counts |
| Bitbucket | UUID / account ID; nickname lookups removed | UUID/account ID, name/avatar, location/site/date when public; privacy and API permissions apply |
| DEV | username / explicit ID | ID, name/avatar, bio, site/location, public GitHub/X handles and join date |
| Hugging Face | username | Hub ID/name/avatar, public bio/site, published counters and organizations |
| Lichess | username | ID/name/title, public profile, game counts/performance and timestamps; no invented avatar |
| Chess.com | username | player ID/name/avatar/title, public country/location/counts/status/timestamps |
| Hacker News | exact username | ID, public about text, karma/date/submission count; API has no avatar |
| Discord | Snowflake / exact shared-guild username | public ID/name/avatar/banner, flags, bot/system markers, creation time; no email/MFA/private connections/messages |
| Instagram | capability report only | Business Discovery requires authorized professional-account setup; personal/private account dumps are unavailable |
| TikTok | capability report only | Display API requires account OAuth and basic/profile/stats scopes; arbitrary nickname lookup is not that endpoint |
| WhatsApp | capability report only | Cloud API reads the authorized business's profile; arbitrary personal phone/photo/status lookup is unavailable |
| X | capability report only | API project/token/access billing required; connector not implemented in this release |
| LinkedIn | capability report only | consented OpenID user information; connector not implemented in this release |

The capability report clearly marks the five unconnected platforms; it makes no upstream profile query and consumes no query credit. All-error structured social queries also consume no credit. A genuine API `NOT_FOUND` is a completed lookup, not a transport failure. An hourly, concurrency-three probe uses known public examples (and the configured Discord application ID). `/api/osint?status=1` publishes only last social-adapter health metadata, never returned account fields or bot credentials. Fixture validation does not prove uninterrupted live upstream availability.

### Web pentest preparation combo

`combo-pentest` combines passive SQL-error/debug/stack-trace/directory-list/DOM/form signals, HTTP/TLS/CSP/CORS/cookie/isolation controls, WAF/method hints and domain/DNS context. Each signal carries evidence, source, severity and a remediation. Signals have weight zero so that absence of a signature never increases the configuration score or coverage. These are observations, not verified SQLi, XSS, auth bypass or CVE exploitability.

The optional `web-authorized` module first shows a daily UTC DNS TXT record at `_osint-verify.<host>`. Its HMAC is tied to that hostname, the authenticated Discord actor and the server key. The checkbox defaults off and resets when the target changes. The exact current-day TXT value must match before any additional probe. Resolver failure, missing/incorrect TXT or missing session context cannot open the probe transport.

After verification, only HTTPS URLs with exactly one short `q/query/search/s/id/item/page/category/filter` parameter and a usable same-URL, same-origin baseline are eligible. Obvious action routes are excluded. At most two additional GETs run: append one single quote to that parameter, and replace it with a random alphanumeric marker. No redirects are followed, each fetch revalidates/pins public DNS addresses, and existing time/body caps remain. No cookies, authenticated application session, POST/write methods, delays, UNION, extraction, code execution or payload enumeration. Results retain only matched error signatures, never response-body dumps. A new SQL error is a candidate requiring application-log review; reflection is not XSS. A blocked response or pre-existing SQL error is unknown. No observed error does not rule out blind/boolean/time SQLi. Sole challenge/unsupported-query reports do not consume a query credit.

This implementation does not provide a complete pentest, private profile access, public shared SMS reading, or 300 verified new APIs. Only the OSINT deployment is updated; the management bot and primary web service stay pinned to their existing releases.

Official sources checked 2026-10-13: [GitHub users](https://docs.github.com/en/rest/users/users), [GitLab users](https://docs.gitlab.com/api/users/), [Discord user resource](https://docs.discord.com/developers/resources/user), [TikTok user info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/), [Meta WhatsApp business profile](https://www.postman.com/meta/whatsapp-business-platform/request/i21qxwn/get-business-profile), [Bitbucket users](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-users/), [Forem](https://developers.forem.com/api/v0), [HF Hub](https://huggingface.co/docs/hub/api), [HN official API](https://github.com/HackerNews/API), [Chess Published Data](https://www.chess.com/news/view/published-data-api), [X lookup](https://docs.x.com/x-api/users/lookup/introduction), [LinkedIn OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2), [OWASP SQL injection testing](https://owasp.org/www-project-web-security-testing-guide/v42/4-Web_Application_Security_Testing/07-Input_Validation_Testing/05-Testing_for_SQL_Injection). Meta Instagram documentation was not retrievable from the research environment; its restricted capability is documented without claiming a validated connector.

Live adapter verification also confirmed the current Hugging Face `user` field (not `name`) and Bitbucket’s account-ID/UUID-only endpoint. The OSINT avatar CSP is baked into `/osint/:path*` routing and works without a build-time OSINT_ONLY variable; other paths keep their original policy.

The legacy 696-source BitBucket nickname check also returns NOT_CHECKED with the ID requirement, without calling the removed endpoint; direct classification of its 404 is UNVERIFIABLE, never proof of account absence. Final live structured-adapter probes verified all 11 providers using valid supported target identifiers.

## OSINT 2.23 — unified communication workspaces and category panels

The public UI has one Temp Mail & Inbox workspace (`?tool=mail`) and one Temp Number & SMS workspace (`?tool=number`). Legacy inbox links resolve to those workspaces and no longer create duplicate sidebar entries. Email has an Alias Tool tab using the existing account-bound SimpleLogin integration. Mail.tm/Mail.gw retain local-name and validated active-domain selection. Inbox refresh is one second on a visible inbox tab; provider polling remains 5–15 seconds with server leases and cooldowns. Messages are scoped by both inbox ID and message ID in the UI.

The screenshot's seven mail provider names and ten phone-source names are included. Mail.tm, Mail.gw, Guerrilla Mail, DropMail, MailSlurp, Temp-Mail.io and TempMail.lol have personal-inbox adapters. Temp-Mail.io requires a premium API key; its message read checks both the cached message ID and response recipient. TempMail.lol uses a new private token and filters message recipients. The documented v2 API returned HTTP 405 in the scratch verification environment; a live probe must pass before claiming availability. TempMail.plus and Inboxes.com are reference entries with explicit unconnected API status. Public SMS sources remain directory references; their shared OTP/messages are not copied into private application inboxes. Twilio, SignalWire and MailSlurp SMS remain assigned owned-number providers. No purchases or outbound SMS are added.

Web navigation and Discord setup now share eight main categories. `/kur kombolar`, `/kur proxy`, `/kur altyapi`, `/kur tehdit`, `/kur iletisim`, `/kur arastirma`, `/kur web` and `/kur sosyal` are the only OSINT setup choices. Subtools are selected inside the category panel. Reinstalling updates the existing message; legacy osint/mail records can be reused as infrastructure/communication panels. Each category has a rendered 1200×360 PNG cover, an accent palette, example, tool buttons and help. Public PNGs expose no private account data. Communication panels offer combined mail/inbox and number/SMS flows; selecting a provider opens only the invoking user's DM subscription. Alias remains a web account connection.

Every category and sidebar subtool has an independent keyboard-accessible question button, dialog, examples and limitations. Combo module selections and communication headings also have contextual help. Escape/backdrop dismiss and focus restoration are supported; help is not nested inside navigation buttons.

Migration 028 extends only inbox-provider and OSINT-panel constraints. The user's added Discord request authorizes deployment of `/kur` and OSINT panel changes to the bot service. Management feature code and management releases are unchanged, and the primary web service is not redeployed. This is an exception to the earlier site-only deployment scope for the explicit requested Discord changes.

Official provider references: [Temp-Mail.io](https://docs.temp-mail.io/docs/getting-started), [TempMail.lol maintainer API client](https://github.com/tempmail-lol/tempmail-api-javascript), [TempMail.plus PIN UI](https://tempmail.plus), [Inboxes.com API conditions](https://inboxes.com/ourapi), [Receive-SMS.io public-log notice](https://receive-sms.io), [Discord Components V2](https://docs.discord.com/developers/components/reference). Directory entries do not establish a validated API or a successful live request.
