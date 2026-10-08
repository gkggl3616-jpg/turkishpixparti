# Doğrulama kaydı — 8 Ekim 2026 / v2.1

| Kontrol | Sonuç |
| --- | --- |
| `npm test` | 41/41 test başarılı |
| `npm run typecheck` | Core, bot, scriptler ve testler başarılı |
| `npm run build` | Next.js production build ve web TypeScript kontrolü başarılı |
| Ses DM kuyruğu | Giriş, çıkış, kanal değişimi, cooldown, kapatma, 403, 429 ve bildirim süresi senaryoları başarılı |
| Kanal kataloğu | Kanal izin sırası, gizli kanal filtresi, salt okunur kanal ve kategori adları doğrulandı |
| Eski ayarlar | Ses ve aktivite varsayılanlarıyla mevcut kaydın korunması doğrulandı |

Testler PostgreSQL WASM motoru PGlite ile çalışır. Discord REST ve DM gönderimleri bu testlerde mock kullanır. PGlite tek bağlantı kullandığından cooldown testi art arda çağrılarla yürütülür; gerçek çok bağlantılı PostgreSQL yarış testi yapılmadı.

Gerçek Discord ses olayından DM teslimi bu testlerin kapsamında değildir. Canlı deployment, bot gateway ve HTTP health kontrolleri ayrıca doğrulanır. Bu ortamda Chromium indirme başarısız olduğu için görsel tarayıcı QA tamamlanamadı.

Önceki siyasi sistem, rol yönetimi, OAuth state/cookie, CSRF, HMAC denetim zinciri, tek oy, dört owner onayı, meclis/MP kuralları ve kısıtlı runtime rolü kontrolleri aynı test paketinde korunur.
