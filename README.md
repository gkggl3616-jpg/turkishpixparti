# TurkishPix Bot Merkezi v2.0.0

Discord bot + Next.js web panel + PostgreSQL. Uygulama kimliği ve public key, kullanıcı tarafından verilen ekran görüntülerinden alındı. Gizli anahtarlar kaynak kodda veya bu pakette bulunmaz.

## Durum

Parti kuruluşu, dört owner onayı, web/Discord ortak oylaması, TBMM, milletvekili atama, kanun/yönerge teklifleri, seçimler ve imzalı denetim zinciri uygulandı. v1.2, ayrı owner menüsü, yenilenen arayüz, elle kanal/rol ID girişi, bot daveti ve gerçek Discord izin tespiti ekler.

Bot kimliği doğrulandı; TurkishPix sunucu ID’si `1497372055530639504`. Botun sunucuya eklenmesi, OAuth callback adresinin Developer Portal’a kaydedilmesi ve owner panelinden kanal/rol ID’lerinin girilmesi gerekir. Gerçek Discord üzerinde oy/rol smoke testi bu kurulum tamamlanmadan çalıştırılamaz.

Canlı panel: **https://turkishpix-web-production.up.railway.app**. PostgreSQL, Web ve Bot mevcut Railway projesinde çevrim içi. Eski Pixmap web kaldırıldı; Pixmap mobil/APK, diski ve bucket’ı ile Pixelya korunur. Bot Discord Gateway’e bağlandı. Kısıtlı runtime hesabının audit kayıtlarını güncelleyemediği ve trigger’ları kapatamadığı gerçek PostgreSQL üzerinde doğrulandı.

## Bot merkezi v2.0

Ana sayfa modül seçim ekranıdır. Ayrı paneller: `/secim`, `/guvenlik`, `/karsilama`, `/duyurular`, `/yapay-zeka`. Kanal ID’leri ve tüm modül ayarları Discord ile giriş yapan dört owner hesabından yönetilir.

- Güvenlik: spam, etiket, Discord daveti ve izinli alan adı filtreleri; isteğe bağlı susturma; genç hesap ve yoğun giriş uyarıları. Owner, sunucu sahibi, yönetici ve belirlenen muaf roller/kanallar korunur. Varsayılan koruma kapalıdır, panelden etkinleştirilir.
- Karşılama: yeni üyeye tek mesaj, seçilen kanalda yalnızca o üyeye etiket; `{user}`, `{username}`, `{server}`, `{count}` alanları. `sa`, `selamünaleyküm`, `merhaba`, `selam` mesajlarına rastgele cevap ve kullanıcı başına dakika sınırı.
- Duyurular: kanal mesajı veya `/duyurukatıl` ile katılan DM aboneleri; `/duyuruayril`, önizleme ve gönderim onayı, 10 dakika kampanya aralığı, iptal ve teslim durumları. Üye listesinden izinsiz toplu DM gönderimi yoktur.
- Yapay zekâ: `/yapayzekaaktif`, `/yapayzekakapat`, `/sor`, botu etiketleme ve bot mesajını yanıtlama. Aritmetik kod değerlendirmeden yerelde çalışır. Genel sorular için Gemini, Groq veya OpenAI API anahtarı web panelinden AES-GCM ile şifrelenerek kaydedilir veya iki servisin `OPENAI_API_KEY` değişkenine eklenir. Model `OPENAI_MODEL`; varsayılan `gpt-4.1-mini`. API çağrıları kullanıcı/dakika ve sunucu/gün limitleriyle sınırlanır.

Üye olayları için **Server Members Intent**, genel sohbet için **Message Content Intent** gerekir. Bot uygulamasında bu izinler doğrulandı. Güvenlik için Manage Messages ve isteğe bağlı Moderate Members, karşılama/duyuru için View Channel ve Send Messages gerekir. Bot bu izinleri web panelinde raporlar.

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

Web varsayılan olarak `http://localhost:3000` adresinde çalışır. Botu ikinci terminalde `npm run bot` ile başlatın. Bot token/veritabanı eksikse veya `DEMO_MODE=true` ise çalışmayı reddeder. Kanal ID’leri eksikse çevrim içi kalır; oylama worker’ı yapılandırma tamamlanınca çalışır. Bot çalışırken, zaman dolunca oylamalar otomatik sonuçlanır ve Discord gönderim kuyruğu işlenir.

Yalnızca arayüzü görmek için `.env` içinde `DEMO_MODE=true` kullanın. Örnek veriler gerçek kayıtlarla karıştırılmaz.

## Discord kurulumu

1. [Developer Portal](https://discord.com/developers/applications), uygulama sahibi **@frizz2025** hesabıyla açılır. Uygulamalar listesinden `TurkishPix Parti Sistemi` (`1557484052133707896`) seçilir. “Application not found” hatasında bu hesabı ve uygulama seçimini kontrol edin.
2. **Bot** bölümünden bot token’ı alınır. OAuth2 Client Secret, bot token’ı değildir.
3. OAuth2 Redirect URI: `APP_URL/api/auth/callback`. Yerelde `http://localhost:3000/api/auth/callback`.
4. Discord geliştirici modu açılıp sunucu, oylama kanalı ve log kanalı ID’leri kopyalanır. Dört owner ID’si `.env.example` ve Railway tanımında hazırdır.
5. `DISCORD_OWNER_IDS` virgülle ayrılmış, birbirinden farklı dört ID olmalıdır. Yetki kullanıcı adına veya girilen form bilgisine göre verilmez.
6. Bot sunucuya `bot` ve `applications.commands` scope’larıyla eklenir. İzinler: View Channel, Send Messages, Embed Links. Panelden siyasi rollerin atanması için ayrıca Manage Roles gerekir ve botun en üst rolü, atanacak rolün üstünde olmalıdır.
7. Bot sunucuya eklendiğinde 99 slash komutunu otomatik kaydeder; gerekirse `npm run commands:register` kullanılabilir.

Canlı OAuth callback adresi **`https://turkishpix-web-production.up.railway.app/api/auth/callback`**. OAuth2 → Redirects → Add Redirect alanına eksiksiz eklenir ve **Save Changes** ile kaydedilir. Sitedeki owner giriş ekranı kayıt durumunu Discord API’den kontrol eder. Kayıt yokken giriş isteği Discord’un hata sayfasına gönderilmez.

General Information için:

| Alan | Değer |
| --- | --- |
| Terms of Service URL | `https://turkishpix-web-production.up.railway.app/terms` |
| Privacy Policy URL | `https://turkishpix-web-production.up.railway.app/privacy` |
| Interactions Endpoint URL | Boş bırakılır |
| Linked Roles Verification URL | Boş bırakılır; rol atamaları bot API’si kullanır |

Bot avatarı ve uygulama simgesine meclis temalı TurkishPix arması eklendi. Profil görseli `apps/web/public/brand/turkishpix-bot.png` konumundadır; slash komutları bu görselli embed ile panel bağlantısı sunar.

Bot Gateway kullanır; Developer Portal’daki **Interactions Endpoint URL boş bırakılır**. Karşılama, selam ve güvenlik modülleri için Guild Members ve Message Content intent’leri kullanılır.

Komutlar: `/partikur`, `/partiler`, `/oylamalar`, `/tbmm`, `/secimler`, `/teklif`, `/yardim`.

## Discord rolleri

Discord rollerini okuma API’si giriş yapan hesabın kendi rollerini gösterir. Owner’lar **Görev ve roller** sayfasında mevcut Discord rollerini TBMM başkanı, parti başkanı, milletvekili ve parti üyesi görevleriyle eşleştirir. Botun hiyerarşisi ve izinleri canlı olarak kontrol edilir; yönetici, sunucu yönetimi veya rol yönetimi yetkisi içeren roller eşleştirilemez.

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

Testlerde PostgreSQL uyumlu PGlite motoru kullanılır; HTTP testlerindeki Discord cevapları kontrollü mock’tur. Discord üzerindeki gerçek dört owner/oy/rol akışı ve bağımsız PostgreSQL sunucusunda eşzamanlı yük testi tamamlanmadı. Eğlence, oyun, kurulum ve izin testleri dahil otomatik testler `npm test` ile çalışır. Canlı site masaüstü ve 390 px mobil tarayıcıda doğrulandı; tema, menü, rol ID alanları ve modal davranışları kontrol edildi.

Dağıtım için `docs/RAILWAY.md`, güvenlik/işletim sınırları için `docs/OPERATIONS.md` okuyun.


## v2.2 · 30 yeni eğlence ve topluluk komutu

| Kategori | Komutlar |
| --- | --- |
| Eğlence (14) | `/zar`, `/yazitura`, `/8top`, `/sans`, `/uyum`, `/iltifat`, `/saka`, `/espri`, `/motivasyon`, `/gununsozu`, `/sec`, `/karistir`, `/takim`, `/anket` |
| Mini oyunlar (10) | `/tas-kagit-makas`, `/sayi-tahmin`, `/kelime-tahmin`, `/bilmece`, `/bilgi`, `/tarih-sorusu`, `/matematik`, `/hafiza`, `/refleks`, `/xox` |
| Topluluk (6) | `/profil`, `/liderlik`, `/avatar`, `/kullanici`, `/sunucu`, `/ping` |

Discord’da `/yardim` kategori menüsü sistem ve eğlence komutlarını; `/ozellikler` 50 yeni topluluk aracını açıklar. Owner panelindeki `/eglence` sayfası modülü, tek tek komutları, izinli metin kanallarını ve 3–60 saniyelik beklemeyi yönetir. Eski ayarlar yeni grubu otomatik olarak açık varsayılanıyla alır.

- Listeleri `|` ile ayırın: `/takim kisiler:Ali | Ayşe | Ece | Mehmet adet:2`. `/anket soru:Ne içelim? secenekler:Çay | Kahve dakika:10`.
- Her oyun 5 dakika açık kalır; sahibi oynar ve “Turu bitir” ile kapatabilir. Aynı üyeye en fazla üç aktif oturum; toplam 12 komut/dakika; anket başlatırken 5 dakika bekleme uygulanır. Hafıza ve refleks oyunları oyuncuya özeldir.
- Galibiyet 20, beraberlik 5 puan verir. Türkiye saatiyle günlük üst sınır 500 puandır. Puanların parasal değeri yoktur. Sonuçlar tek kez yazılır; eski düğmeler ve başka oyuncuların hamleleri reddedilir.
- XOX üç seviyelidir; zor seviye minimax kullanır. Tahmin oyunları form, diğer oyunlar düğme kullanır. Refleks ölçümü ağ ve Discord gecikmesini de içerir.
- Anketlerde 2–5 seçenek, 1–60 dakika ve hesap başına bir oy vardır; anket sahibi veya owner erken kapatabilir. Süre bitince düğmeler en geç 30 saniyelik işçi turunda kapatılır. Bot yeniden başladığında oturumlar veritabanından okunur.
- `007_entertainment` migration’ı dört tabloyu ve runtime izinlerini ekler. Kapalı oturum ayrıntıları 7 gün sonra temizlenir; toplam puanlar korunur. Botun kanalda Bağlantıları Yerleştir izni gerekir.
- Otomatik testler 30 komutun bot yönlendirmesini, Discord payload sınırlarını, oyun kurallarını, tüm insan hamlelerinde zor XOX’un yenilmezliğini, puan tekrar korumasını, süreleri ve anket izinlerini kapsar. Gerçek üye komutları test amacıyla tetiklenmez.


## v2.3 · Ayrıntılı sohbet koruması

`/guvenlik` panelinde sekiz içerik kategorisi ayrı ayrı **sil**, **incele** veya **kapalı** olarak ayarlanır: MDK (millî), ADK (ailevi), DDK (dinî), ırkçılık, Nazi propagandası, ağır küfür, doğrudan tehdit ve özel ifadeler. Yeni `008_chat_moderation` migration'ı mevcut sunucuda güvenlik anahtarını bir kez açar; diğer modül ayarlarını korur.

Varsayılan profil: tüm kategoriler silme modunda, düzenlenen mesaj kontrolü ve yazım kaçamaklarının normalleştirilmesi açık, yönetici muafiyeti kapalı. 10 dakika içinde 3 ayrı ihlal → 10 dakika susturma. İnceleme kayıtları susturma sayısına girmez; aynı mesaj yeniden gelince ikinci ihlal sayılmaz. Mevcut daha uzun timeout korunur. Kalıcı ban ve sunucudan atma yapılmaz.

Kelime sınırları; Türkçe harfler; sıfır genişlikli karakterler; benzer Unicode harfler; yaygın leet, harf aralığı, sansür ve tekrarlar kontrol edilir. Bir millet, din veya tarihî kişi adı tek başına engellenmez. Açıkça kınanan, tırnak içindeki tarihî alıntılar varsayılan olarak incelemeye gider. Bu kurallar deterministiktir; bağlamı kusursuz anlayan bir yapay zekâ hizmeti kullanılmaz. Görsel, video ve ses dosyalarının içeriği taranmaz.

Owner paneli ayrıca özel yasaklı ifadeleri, tam ifade istisnalarını, içerik filtresine özel kanal/rol muafiyetlerini, hafif hakaret seçeneğini, 7–90 günlük ayrıntı saklamasını ve mesajı göndermeden deneme alanını içerir. Yanlış eşleşme bir kaydı ihlal toplamından çıkarır; silinmiş mesajı geri getirmez ve uygulanmış Discord işlemini değiştirmez.

Botta Message Content Intent ve ilgili kanalda Mesajları Yönet izni gerekir; susturma için Üyeleri Sustur ve uygun rol hiyerarşisi gerekir. Discord AutoMod ek katmanı `Sunucuyu Yönet` varsa botun kendi oluşturduğu bir anahtar kelime kuralını yönetir. Diğer kurallara dokunmaz; sunucunun altı anahtar kelime kuralı doluysa bot filtresi çalışmaya devam eder. Yerleşik kural yalnızca dar kapsamlı ağır kelimeleri ve bağımsız propaganda sloganlarını engeller. Discord bu kurallarda yöneticileri kendi davranışına göre muaf tutar; bot filtresinin yönetici ayarı ayrıdır.

Yeni ve düzenlenen mesajlar ile `AutoModerationActionExecution` olayları test edilir. Kural/işlem/kullanıcı/kanal/mesaj kimliği ve metnin hash'i saklanır; ham mesaj metni loga, audit zincirine veya inceleme tablosuna yazılmaz. Varsayılan ayrıntı saklama 30 gündür; özet güvenlik kayıtları ve imzalı audit geçmişi korunur.


## v2.4 — 50 topluluk aracı, etiketli loglar ve ücretsiz API

Tüm bot logları parlak renkli embed, Türkçe işlem açıklaması, zaman damgası ve kullanıcı/kanal/rol etiketleri kullanır. Loglarda `allowed_mentions.parse=[]` bildirimleri kapatır; entity bağlantıları Discord tarafından görüntülenir. Moderasyon logları ihlal metnini içermez. Not, görev ve destek komutları üyeye özel yanıt verir.

Yeni komutların tam listesi ve seçenekleri `packages/core/src/features-catalog.ts` içindedir. 50 yeni + 30 eğlence + 15 sistem = 95 slash komutu. Owner `/topluluk` panelinde beş modülü, tek tek komutları, izinli kanalları, XP bekleme/kota değerlerini ve günlük sanal ödülü yönetir. Owner panelinde kişisel not/görev/hatırlatmalar listelenmez. Destek ve öneriler owner işlemlerine açıktır.

- **12 seviye/ekonomi komutu:** `/uyeprofil`, `/seviye`, `/siralama`, `/gunluk`, `/cuzdan`, `/transfer`, `/magaza`, `/satinal`, `/envanter`, `/rozetler`, `/tesekkur`, `/itibar`.
- **10 kişisel araç:** `/hatirlat`, `/hatirlatmalar`, `/hatirlatmasil`, `/notekle`, `/notlar`, `/notsil`, `/gorevekle`, `/gorevler`, `/gorevtamamla`, `/gorevsil`.
- **12 topluluk komutu:** `/cekilis`, `/cekilissonuc`, `/cekiliskapat`, `/etkinlik`, `/etkinlikler`, `/etkinlikkapat`, `/oner`, `/oneriler`, `/oneridurum`, `/destek`, `/destekler`, `/destekkapat`.
- **9 yetkili aracı:** `/uyar`, `/uyarilar`, `/uyarikaldir`, `/yavasmod`, `/kilitle`, `/kilitac`, `/temizle`, `/duyuru`, `/sabitle`.
- **7 rol/rehber aracı:** `/rolmenu`, `/rolmenukapat`, `/sss`, `/sssekle`, `/ssssil`, `/kanalbilgi`, `/ozellikler`.

XP sadece korunmuş sohbetin uygun katkılarında verilir; en az 8 karakter, varsayılan 60 saniye bekleme, tekrar hash kontrolü ve günlük 500 XP sınırı vardır. Seviye eşiği `100 × seviye²`. Sanal Pix ve rozetlerin nakit veya yetki karşılığı yoktur. Ekonomi hareketleri PostgreSQL kilitleri ve interaction makbuzlarıyla tekrarlara karşı korunur. Günlük ödül/teşekkür Türkiye saatine göre yenilenir. DM hatırlatıcıları kalıcı kuyrukta işlenir ve iptal/modül kontrolleri gönderimden önce tekrarlanır.

Çekiliş tek sefer, Node kriptografik rastgele sayı üreteciyle sonuçlanır; bedelsiz katılım ve organizatör teslimi. Etkinlik ve öneri düğmeleri tekil üyelik tutar. Rol menüsü izinleri sıfır, entegrasyon tarafından yönetilmeyen, botun altında olan kozmetik rollerle sınırlıdır; kanal izin overwrite'larında erişim sağlayan veya siyasi görevle eşleşen roller reddedilir. Rol her tıklamada yeniden doğrulanır. Uyarı, temizlik, yavaş mod, kilit ve duyuru komutları gerçek Discord izinlerini kontrol eder. Temizlik onayı 60 saniyelik HMAC düğmesine bağlıdır, bir kere siler; 14 günden eski mesajları atlar. Kanal kilidi @everyone yazma alanlarını kapatır; özel rol izinleri korunur ve açmada önceki üç durumlu değerler geri getirilir.

### Groq ücretsiz API kurulumu

1. https://console.groq.com/keys adresinde kendi hesabında API anahtarı oluştur.
2. `/yapay-zeka` owner panelinde **Groq** seç. Varsayılan model `openai/gpt-oss-20b`; anahtarı girip **Bağla ve yapay zekâyı aç** kullan.
3. Deneme alanında soru sor; `/sor`, etiket ve bot mesajına yanıt aynı bağlantıyı kullanır.

Anahtar AES-256-GCM ile şifrelenir; tarayıcıya geri dönmez ve audit kaydına yazılmaz. Alternatif olarak her iki servise `GROQ_API_KEY` ve `GROQ_MODEL` eklenebilir. Groq hesap kotası geçerlidir; 429 durumunda anlaşılır hata verilir, ücretli sağlayıcıya otomatik geçiş yoktur. Kota rakamları sabit varsayılmaz: https://console.groq.com/docs/rate-limits . OpenAI ayarları geriye uyumludur. Aritmetik yerel çalışır. Gerçek API yanıtını doğrulamak için kullanıcının kendi anahtarı gerekir; test suite sağlayıcı protokolünü ve hatalarını mock ile doğrular.

Migration zincirine `009_community_features` eklenmiştir. Yeni tablolar runtime rolüne sınırlı CRUD erişimi alır; denetim tablosunun koruması korunur. Kapanmış destek ve tamamlanan/iptal edilen kişisel kayıtlar 30 günde, idempotency makbuzları 90 günde temizlenir. Owner paneli kayıt geçmişinde son 60 kaydı gösterir.

## v2.5 — Dış uygulama koruması ve müzik

Hesaba kurulan uygulamaların yanıtları `interactionMetadata.user` üzerinden tetikleyen üyeye bağlanır. Kurulum sahibi cezalandırılmaz. Normal sunucu botları korunur; gerçek yönlendirilmiş mesajlar ayrı yakalanır. Oluşturma ve düzenleme olaylarında, bot/webhook atlama kuralından önce uygulanır. Varsayılan olarak dış uygulama yanıtı silinir; 30 saniyede 4 ihlal için 5 dakika susturma denenir. Bilinmeyen tetikleyiciye ceza verilmez. Discord UseExternalApps izin kilidi açık rol/üye geçersiz kılmalarını kapatır ve önceki üç durumlu değerleri saklar; kapatıldığında yalnızca bu bit geri yüklenir. Yönetici izni Discord kilidini aşabilir; mesaj silme denetimi devam eder. `/guvenlik` panelinde izin kilidi, yönlendirme, uygulama izin listesi ve eşikler yönetilir.

`/ses` (katil, ayril, durum) ve `/muzik` (oynat, radyo, duraklat, devam, atla, oyla, durdur, kuyruk, simdi, ses, tekrar, karistir, temizle, cikar, tasi, ileri, yardim) 20 işlem ekler. Toplam 97 kök komutla Discord'un 100 komut sınırı korunur. `/muzik oynat dosya:` ile ses dosyası; `baglanti:` ile doğrudan HTTPS ses akışı oynatılır. YouTube/Spotify sayfa bağlantıları desteklenmez. Altı SomaFM istasyonu hazırdır. Kaynaklar DNS yanıtını public IPv4 adresine sabitleyerek, her yönlendirmeyi tekrar denetleyerek alınır; kimlik bilgisi, özel ağ ve 100 MB üstü dosyalar reddedilir. FFmpeg PCM üretir, Opus ve DAVE şifrelemesiyle Discord'a iletilir. Bot konteyneri FFmpeg içerir; @discordjs/voice 0.19.2 DAVE desteğiyle kurulur.

`/muzik` paneli aynı canlı botu kalıcı işlem kuyruğuyla yönetir. İş sonucu görünür; owner ve CSRF gerekir. Slash kontrolleri aynı ses kanalını, DJ/ManageGuild yetkisini veya tek dinleyiciyi denetler. Üyeler kendi parçasını atlayabilir/çıkarabilir; dinleyiciler tekil atlama oyu verir. Üye/kuyruk kotası, ses sınırı, kanal izinleri, boş kanal ve boş kuyruk zaman aşımı uygulanır. Yeniden başlatmada oynatma kuyruğu kapanır; kalıcı panel işlemleri 5 dakika geçince uygulanmaz. İş sonucu 7 gün tutulur.

## v2.6 — Biletler ve çekiliş paneli

`/bilet kur` ile metin kanalı, kategori ve en fazla üç yetkili rolü Discord seçicisinden seçilir. `/bilet ac`, `/bilet kapat` ve `/bilet liste` özel destek kanallarını yönetir; `/destek` ve `/destekkapat` aynı akışı kullanır. Web panelindeki `/biletler` ekranı kanal ve kategori adları ile beş yetkili rolü seçer. Bilet panelindeki form özel kanal açar ve seçilen rolleri etiketler. Talep sahibi ve yetkililer kapatabilir; kapanan bilet görüşmeleri saklanır. Botun Kanalları Yönet, Rolleri Yönet ve metin/mesaj geçmişi izinleri gerekir; etiketlenecek roller etiketlenebilir olmalı veya bot Herkesten Bahset iznine sahip olmalıdır.

`/cekilis` ödül, dakika, isteğe bağlı kanal ve 1–10 kazanan ile katılım düğmesi gönderir. `/cekilisler` ve web `/cekilisler` ekranı listeleme, erken bitirme, iptal ve yeniden seçim sunar. Kazananlar kriptografik rastgele örnekleme ile benzersiz seçilir. Yeniden seçim önceki kazananları dışlar. İşlem makbuzları, kayıt kilitleri, kanal konu işaretleri ve mesaj nonce değerleri tekrar teslimde aynı kaydı/kanalı bulur. Bot kapalıyken süresi dolan çekiliş açılışta sonuçlanır. Migration `011_tickets_giveaways` önce çalıştırılmalıdır.


## v2.7 — Kategori biletleri ve yeni komut rehberi

Bilet panelinde **Ödül Talebi**, **Destek**, **Şikâyet**, **Başvuru** ve **Diğer** düğmeleri bulunur. Konu veya açıklama formu yoktur. `/bilet ac tur:` ve `/destek tur:` aynı beş seçeneği sunar. Kanal adı seçilen konu ve Discord kullanıcı adından oluşur: `odul-talebi-frizz2025`, `destek-musty`. Türkçe ve dekoratif harfler okunabilir kanal adına çevrilir. Ayrıntılar özel kanala yazılır; yalnızca seçilen yetkili rolleri ve talep sahibi etiketlenir. Önceden açılmış UUID adlı özel bilet kanalları ve tek düğmeli panel, botun eşitleme turunda otomatik yenilenir; ikinci bir kanal veya panel açılmaz.

`/yardim` tüm 99 kök komutu 13 kategoride gösterir. Alt komut kullanımları beşerli sayfalara ayrılır; gerekli/isteğe bağlı alanlar, örnekler ve ilgili panel bağlantısı görünür. `/ozellikler` aynı rehberin topluluk kategorilerini açar. Komut kartları ortak canlı renkler ve dekoratif TurkishPix başlığı kullanır. Yapay zekâ, `/sor`, etiket ve mesaj yanıtlarında düz konuşma mesajı gönderir; kart, çerçeve veya robot başlığı eklemez.

### Google Gemini ücretsiz API kurulumu

1. https://aistudio.google.com/apikey adresinde Google hesabınla API anahtarı oluştur.
2. `/yapay-zeka` panelinde **Google Gemini** seç. Varsayılan model `gemini-3.8-flash`.
3. Anahtarı panelde girip **Bağla ve yapay zekâyı aç** düğmesini kullan; deneme alanında bir soru sor.

Gemini bağlantısı resmi Interactions API üzerinden çalışır. Anahtar AES-256-GCM ile şifrelenir; sohbet geçmişi sağlayıcının sunucusunda saklanması için `store:false` gönderilir. Gemini ücretsiz katmanının hesap kotası ve veri kullanım koşulları geçerlidir; ücretsiz içerikler ürün geliştirmede kullanılabilir. Kota dolunca anlaşılır hata gösterilir; sağlayıcı kendiliğinden değiştirilmez. https://ai.google.dev/gemini-api/docs/pricing . Ortam değişkeni tercih edilirse `GEMINI_API_KEY` ve `GEMINI_MODEL` kullanılabilir; panel bağlantısı önceliklidir. Groq ve OpenAI bağlantıları kullanılmaya devam eder.
