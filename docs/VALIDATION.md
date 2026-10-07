# Doğrulama kaydı — 7 Ekim 2026

| Kontrol | Sonuç |
| --- | --- |
| `npm test` | 23/23 test başarılı |
| `npm run typecheck` | Başarılı; core, bot, scriptler, testler ve Railway IaC |
| `npm run build` | Next.js 16.4.0 production build başarılı; web TypeScript kontrolü dahil |
| `npm audit --omit=dev --audit-level=high` | 0 güvenlik açığı raporlandı |
| `npm run preview:build` | Tek dosyalık offline HTML oluşturuldu |
| Railway proje oluşturma | Hesap resource provision limitinden reddedildi |
| Gerçek Discord OAuth/gateway testi | Bot token ve sunucu/kanal ID’leri eksik; yapılmadı |
| Browser görsel/etkileşim QA | Bu ortamda tamamlanmadı |
| Docker container build | Docker runtime bulunmadığı için doğrudan çalıştırılmadı |

Testler PostgreSQL WASM motoru PGlite ile çalışır. Gerçek Discord REST cevapları HTTP/OAuth testlerinde mock kullanır. Bu testler üretim Discord erişiminin çalıştığını kanıtlamaz.

Doğrulanan senaryolar: dört ayrı owner onayı, çift karar engeli, tek hesap tek oy, süresi biten oylama, ret gerekçesi, lider kimliği, parti kabulü, D’Hondt ve dönem başlatma, MP seçmen snapshot’ı ve katılım çoğunluğu, audit/oy/onay değişiklik engeli, HMAC zinciri ve bozulma tespiti, transaction rollback, CSRF/origin/rate limit, logo doğrulama, kişiye özel oy verisi, kısıtlı PostgreSQL rolünün DDL engeli, HTTP yetkilendirme, OAuth state/cookie eşleşmesi ve tek kullanımlık callback, session logout.

Rol testleri ayrıca bot izinlerini, rol hiyerarşisini, yönetici/entegrasyon rollerinin engelini, owner-only eşleştirmeyi, aynı rolün iki göreve bağlanmamasını, kişisel rol görünürlüğünü, dört onaylı atama/kaldırmayı, gecikmiş işlerde güncel durum kontrolünü, aktif MP şartını, tek TBMM başkanını, dönem sınırını ve eski/yeni rol eşitlemesini doğruladı.
