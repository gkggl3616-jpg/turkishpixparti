# TurkishPix Siyasi Sistem v1.1.0

Discord bot + Next.js web panel + PostgreSQL. Uygulama kimliği ve public key, kullanıcı tarafından verilen ekran görüntülerinden alındı. Gizli anahtarlar kaynak kodda veya bu pakette bulunmaz.

## Durum

Kaynak kod, SQL şeması, Discord botu, OAuth2, dört owner onayı, parti başvuruları, web/Discord ortak oylaması, TBMM, milletvekili atama, kanun/yönerge teklifleri ve seçim akışları uygulandı. Yerel testler ve production build çalıştırıldı. Dört owner ID’si yapılandırıldı; Discord rol okuma, eşleştirme ve dört onaylı atama eklendi. Gerçek bot token’ı, sunucu ID’si ve kanal ID’leri eksik olduğu için Discord üzerinde canlı uçtan uca test yapılmadı.

Railway proje oluşturma isteği, hesabın `Free plan resource provision limit exceeded` hatasıyla reddedildi. Yeni bir Railway projesi, hizmeti veya canlı site oluşturulmadı. Bu durum bir yazılım hatası değildir; hesap yeni kaynak oluşturmaya izin vermiyor. Bu pakette canlı bir URL iddiası yoktur.

`npm run preview:build` ile üretilen `preview/TurkishPix-Onizleme.html` dosyasını tarayıcıda açarak paneli örnek kayıtlarla inceleyebilirsiniz. Bu dosya çevrimdışı bir arayüz önizlemesidir; gerçek veri oluşturmaz veya oy göndermez.

## Repo yapısı

| Dizin | İçerik |
| --- | --- |
| `apps/web` | Next.js App Router, Türkçe panel, HTTP API |
| `apps/bot` | Discord gateway botu ve oylama/bildirim worker’ı |
| `packages/core/src` | Ortak domain kuralları, OAuth, audit ve outbox |
| `packages/core/sql` | PostgreSQL tabloları, koruma trigger’ları, uygulama rolü |
| `scripts` | Migration, rol kurulumu, komut kaydı, audit doğrulama |
| `tests` | PostgreSQL WASM motoruyla domain ve HTTP testleri |
| `.railway/railway.ts` | Güncel Railway IaC servis tanımı |
| `Dockerfile.web`, `Dockerfile.bot` | Ayrı production container’ları |
| `docs` | Dağıtım, kurallar ve teknik sınırlar |

## Yerelde çalıştırma

Node.js 22 veya üzeri ve PostgreSQL gereklidir.

```bash
npm ci
cp .env.example .env
# .env içindeki DATABASE_URL ve Discord ayarlarını doldurun.
npm run db:migrate
npm run dev
```

Web varsayılan olarak `http://localhost:3000` adresinde çalışır. Botu ikinci terminalde `npm run bot` ile başlatın. Bot gerekli ayarlar eksikse veya `DEMO_MODE=true` ise çalışmayı reddeder. Bot çalışırken, zaman dolunca oylamalar otomatik sonuçlanır ve Discord gönderim kuyruğu işlenir.

Yalnızca arayüzü görmek için `.env` içinde `DEMO_MODE=true` kullanın. Örnek veriler gerçek kayıtlarla karıştırılmaz.

## Discord kurulumu

1. Developer Portal’da uygulama `1557484052133707896` açılır.
2. **Bot** bölümünden bot token’ı alınır. OAuth2 Client Secret, bot token’ı değildir.
3. OAuth2 Redirect URI: `APP_URL/api/auth/callback`. Yerelde `http://localhost:3000/api/auth/callback`.
4. Discord geliştirici modu açılıp sunucu, oylama kanalı ve log kanalı ID’leri kopyalanır. Dört owner ID’si `.env.example` ve Railway tanımında hazırdır.
5. `DISCORD_OWNER_IDS` virgülle ayrılmış, birbirinden farklı dört ID olmalıdır. Yetki kullanıcı adına veya girilen form bilgisine göre verilmez.
6. Bot sunucuya `bot` ve `applications.commands` scope’larıyla eklenir. İzinler: View Channel, Send Messages, Embed Links. Panelden siyasi rollerin atanması için ayrıca Manage Roles gerekir ve botun en üst rolü, atanacak rolün üstünde olmalıdır.
7. `npm run commands:register` çalıştırılır.

Bot Gateway kullanır; Developer Portal’daki **Interactions Endpoint URL boş bırakılır**. Message Content intent ve mesaj okuma yetkisi kullanılmaz.

Komutlar: `/partikur`, `/partiler`, `/oylamalar`, `/tbmm`, `/secimler`, `/teklif`, `/yardim`.

## Discord rolleri

Discord ile giriş yapan üyeler **Discord rolleri** sayfasından kendi sunucu rollerini görebilir. Owner’lar aynı sayfada mevcut Discord rollerini TBMM başkanı, parti başkanı, milletvekili ve parti üyesi görevleriyle eşleştirir. Botun hiyerarşisi ve izinleri canlı olarak kontrol edilir; yönetici, sunucu yönetimi veya rol yönetimi yetkisi içeren roller eşleştirilemez.

Owner, Discord kullanıcı ID’sini girerek bir üyeyi bulur ve gerekçeli rol atama/kaldırma başvurusu açar. Her işlem dört ayrı onay ister. Parti kabulü, üyelik değişikliği ve seçim sonucundaki otomatik rol işleri ayrıca kuyrukta işlenir. **Görevleri eşitle** düğmesi tüm kayıtlı hesapları yeniden kontrol eder. Rol değişimleri Discord audit gerekçesi ve uygulamanın imzalı log’unda kayıtlıdır.

TBMM başkanı aktif milletvekilleri arasından atanır; tek başkan bulunur ve görev yasama dönemiyle sınırlıdır. Milletvekili oy hakkı aktif meclis kaydından gelir; rol atamak mecliste yeni koltuk oluşturmaz. Parti başkanı/üyeliği için manuel Discord görevleri de atanabilir; bunlar parti kayıtlarındaki lideri veya üyelik ilişkisini değiştirmez.

Tanımlı owner hesapları:

| Hesap | Discord kullanıcı ID’si |
| --- | --- |
| Owner 1 | `1317890469673566279` |
| Owner 2 | `1437618075766624326` |
| Owner 3 | `1140563797036249178` |
| Owner 4 | `1510231175854031018` |

## Kurallar

- Lider başvuruyu kendi Discord hesabıyla gönderir. Parti adı ve kısaltması benzersizdir.
- Her owner bir başvuru için tek karar verir. Dört onay olmadan oylama açılmaz. Bir gerekçeli ret başvuruyu sonlandırır.
- Halk oylamalarında güncel Discord sunucu üyeliği doğrulanır. Web ve Discord aynı `votes` tablosunu kullanır.
- Her Discord hesabı bir oy kullanır. Oy değiştirme ve ikinci oy yoktur.
- Kanun ve yönergeyi milletvekilleri veya owner’lar sunar. Dört owner onayından sonra meclis oylaması açılır.
- Meclis seçmen listesi oylama açılırken sabitlenir. Oy kullanırken kişinin hâlâ aktif milletvekili ve Discord üyesi olması gerekir.
- Meclis tekliflerinde sabit seçmen listesinin yarısından fazlasının katılımı gerekir. Kabul sayısı ret sayısından fazla olmalı; eşitlikte teklif geçmez. Çekimser oy katılım sayılır.
- Milletvekili ataması dört owner onayıyla kesinleşir; mevcut dönemde boş koltuk gerekir.
- Seçim adaylarının daha önce Discord ile panele giriş yapmış olması gerekir. Her aday yalnızca bir listede yer alır.
- Seçimler D’Hondt yöntemiyle koltuk dağıtır. Parti listesi sırasına göre milletvekili atanır. Liste kısa ise o partinin dolduramadığı koltuk boş kalır. Eşit oranlarda toplam oy, sonra parti ID’siyle tutarlı bir sıra kullanılır.
- Kabul edilen yeni seçim, önceki dönemi kapatır. Eski milletvekili rolleri çıkarılır ve yeni rolleri kuyruk üzerinden eklenir.
- Minimum halk/seçim katılımı `MIN_VOTES` ile belirlenir. Varsayılan 1, süre varsayılan 24 saat; açılan başvuruda bu değerler sabitlenir.

## Denetim kayıtları

İşlem, domain verisi ve audit kaydı aynı transaction’da yazılır. SHA-256 önceki hash zinciri ve HMAC imzası kullanılır. Audit, oy ve owner kararlarında UPDATE/DELETE/TRUNCATE yasaktır. `npm run db:harden` ile sahiplik/DDL yetkisi olmayan ayrı uygulama rolü kurulur. Production web ve bot bu rolle çalıştırılmalıdır.

`AUDIT_HMAC_KEY` en az 32 karakter olmalı ve sabit tutulmalıdır. Anahtarın tek bir değeri kullanılır; otomatik anahtar rotasyonu uygulanmadı. Kayıtlar owner panelinde doğrulanabilir ve JSON olarak indirilebilir. CLI: `npm run audit:verify`.

Bu sistem uygulama ve kısıtlı veritabanı rolü düzeyinde append-only koruma sağlar. PostgreSQL superuser’ı, sunucu yöneticisi veya HMAC anahtarına erişen bir saldırgana karşı fiziksel WORM garantisi değildir. Başka bir ortama düzenli yedek ve hash checkpoint aktarımı kurulmuş değildir.

## Kontroller

```bash
npm test
npm run typecheck
npm run build
npm run check:config
```

Testlerde PostgreSQL uyumlu PGlite motoru kullanılır; HTTP testlerindeki Discord cevapları kontrollü mock’tur. Gerçek Discord/Railway üretim erişimi ve bağımsız PostgreSQL sunucusunda eşzamanlı yük testi tamamlanmadı. Browser ile görsel etkileşim testi bu ortamda tamamlanamadı.

Dağıtım için `docs/RAILWAY.md`, güvenlik/işletim sınırları için `docs/OPERATIONS.md` okuyun.
