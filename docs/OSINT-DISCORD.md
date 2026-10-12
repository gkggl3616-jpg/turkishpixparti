# TurkishPix OSINT · 2.17.0

Server administrators can run `/proxy gen kur` in the desired channel to install the native Discord Components V2 card. `/proxy checker kur` uses the same combined Generator/Checker panel. `/osint kur` installs the research panel; `panel: proxy` or `panel: mail` chooses another card. `/tempmail kur` installs a provider-status panel. The optional `kanal` argument selects a different channel. Repeating setup updates the stored message instead of creating duplicates. Deleted messages can be recreated. Buttons route through the bot's permanent interaction handler and remain usable after restart.

Proxy results use the existing server XP profile: **10 + 5 × level**. This is the per-query result count, separate from the existing daily query allowance. A client cannot increase the count by changing `limit`. The provider list is filtered and deduplicated; fewer matching real records are reported honestly. DM TXT attachments include every selected address. Other tools deliver their full structured result as a text report.

Only the requesting user's DM receives Discord research results. Channel acknowledgements are ephemeral and contain no result payload. A denied DM is retained encrypted for 24 hours and can be retried with the private button or web console, without another query charge. Delivery IDs are bound to both user and guild. Known closed DMs wait for user retry; transient failures get bounded background retries. Successful and expired payloads are erased. A nonce and an atomic claim prevent concurrent delivery duplicates.

## Discord sign-in on the dedicated domain

The existing TurkishPix callback is already registered with Discord. Configure:

- **Turkish Osint:** `AUTH_BROKER_URL=https://turkishpix-web-production.up.railway.app`
- **TurkishPix Web:** `AUTH_HANDOFF_ORIGINS=https://turkish-osint.up.railway.app`
- Keep each service's `APP_URL` equal to its own origin. Keep both services on the same database and Discord OAuth application.

The OSINT host sets a private browser verifier, then redirects to the existing site's registered Discord OAuth flow. The callback issues a short-lived, single-use ticket to the explicitly allowed OSINT origin. The original browser must present its verifier to redeem the ticket and receive its own OSINT session cookie. Session secrets never appear in URLs. The ticket cannot be used on another origin or browser, and cannot be replayed. Direct Discord login on the existing TurkishPix site keeps its current behavior.

Migration `022_osint_delivery_auth` adds only the handoff, delivery, and panel state and one nullable OAuth-state column. All migration entrypoints apply it. Neither XP data nor level formulas are rewritten. Actual temporary addresses, inboxes, and SMS remain unavailable until their providers are connected.
