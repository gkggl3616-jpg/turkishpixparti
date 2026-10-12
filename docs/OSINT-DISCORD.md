# TurkishPix OSINT · 2.17.0

Server administrators can run `/kur proxy` in the desired channel to install the native Discord Components V2 card. `/kur proxy-checker` uses the same combined Generator/Checker panel. `/kur osint` installs the research panel; `/kur temp-mail` installs the provider-status panel. The optional `kanal` argument selects a different channel. Repeating setup updates the stored message instead of creating duplicates. Deleted messages can be recreated. Buttons route through the bot's permanent interaction handler and remain usable after restart.

Proxy results use the existing server XP profile: **10 + 5 × level**. This is the per-query result count, separate from the existing daily query allowance. A client cannot increase the count by changing `limit`. The provider list is filtered and deduplicated; fewer matching real records are reported honestly. DM TXT attachments include every selected address. Other tools deliver their full structured result as a text report.

Only the requesting user's DM receives Discord research results. Channel acknowledgements are ephemeral and contain no result payload. A denied DM is retained encrypted for 24 hours and can be retried with the private button or web console, without another query charge. Delivery IDs are bound to both user and guild. Known closed DMs wait for user retry; transient failures get bounded background retries. Successful and expired payloads are erased. A nonce and an atomic claim prevent concurrent delivery duplicates.

## Discord sign-in on the dedicated domain

The existing TurkishPix callback is already registered with Discord. Configure:

- **Turkish Osint:** `AUTH_BROKER_URL=https://turkishpix-web-production.up.railway.app`
- **TurkishPix Web:** `AUTH_HANDOFF_ORIGINS=https://turkish-osint.up.railway.app`
- Keep each service's `APP_URL` equal to its own origin. Keep both services on the same database and Discord OAuth application.

The OSINT host sets a private browser verifier, then redirects to the existing site's registered Discord OAuth flow. The callback issues a short-lived, single-use ticket to the explicitly allowed OSINT origin. The original browser must present its verifier to redeem the ticket and receive its own OSINT session cookie. Session secrets never appear in URLs. The ticket cannot be used on another origin or browser, and cannot be replayed. Direct Discord login on the existing TurkishPix site keeps its current behavior.

Migration `022_osint_delivery_auth` adds only the handoff, delivery, and panel state and one nullable OAuth-state column. All migration entrypoints apply it. Neither XP data nor level formulas are rewritten. Actual temporary addresses, inboxes, and SMS remain unavailable until their providers are connected.

Level lookups reload the database server settings before selecting the XP profile. Missing XP records are distinguished from recorded level zero. Command registration stores completed stages, honors Discord Retry-After, and keeps XP and result-delivery workers running while a registry update is throttled. The new global `/kur` entry is registered before the existing bulk guild-command sync; obsolete global `osint`, `proxy`, and `tempmail` roots are removed after setup is available.

## 2.18.0 — araştırma, haklar ve bağlantılar

`/kur proxy`, `/kur proxy-checker`, `/kur osint`, `/kur temp-mail` kalıcı Components V2 kartlarını kurar/günceller. Araştırma komutları slash listesinde yoktur; yeşil buton, araç seçimi ve modal üzerinden başlatılır. `/kur` global olarak önce kaydedilir. Discord Retry-After beklemesi XP ve özel teslim worker’larını durdurmaz.

### Kullanım hakları

- `DISCORD_OWNER_IDS` içindeki dört doğrulanmış **kullanıcı** ID’si uygulama günlük sorgu kotasından muaftır. Sayısal `Infinity` yerine API’de `unlimited: true`, `remaining: null`, `dailyLimit: null` döner.
- Diğer üyeler XP günlük hakkını kullanır. Owner `/osint/owner` üzerinde ek adet ve Türkiye saatiyle bitiş tarihi tanımlar. Ek hak günlük hak bittikten sonra en yakın bitiş sırasıyla kullanılır.
- Bitiş anı UTC timestamptz olarak saklanır, her tüketimde ve iptalde tekrar kontrol edilir. Kullanıcı/sunucu advisory lock ve işlem anahtarı tekrar eden istekte ikinci hak düşümünü önler. Sağlayıcı başarısızlığı hak düşürmez; kısmi kombo bir haktır.
- Sınırsız owner sorgusu sağlayıcı hız sınırını kaldırmaz. Merkezi sağlayıcı sayaçları, HTTP Retry-After beklemesi, 9 saniyelik istek süresi ve akış sırasında yanıt boyut sınırı uygulanır.
- Seviye `member_profiles` ve kaydedilmiş TurkishPix sunucu ID’sinden okunur. Seviye kaydı yoksa 0 açıkça belirtilir. Proxy adedi her hesap için `10 + 5 × level` olur; owner sınırsızlığı bu adedi değiştirmez.

### Gerçek kaynaklar

| İşlem | Birincil | Alternatif / şart |
| --- | --- | --- |
| A/AAAA/CNAME/MX/NS/TXT/SOA/CAA, SPF/DMARC | Cloudflare DNS JSON | Google DNS JSON |
| RDAP | RDAP.org | IANA resmî bootstrap üzerinden kayıt operatörü |
| CVE | NVD | CVE.org / MITRE kaydı |
| Pasif alt alan adı | crt.sh CT | HackerTarget hostsearch |
| Proxy havuzu | ProxyScrape jsDelivr snapshot | Aynı resmî deponun doğrudan JSON dosyası |
| IP / ASN / GeoIP | RIPEstat, IPwho.is | IP kombosu yanıt veren bölümleri korur; fiziksel kimlik iddiası yok |
| TLS | CT geçmişi | Genel HTTPS HEAD üzerinden canlı sertifika/başlık gözlemi |
| Açık kullanıcı profili | GitHub + GitLab | Aynı ad, aynı kişi demek değildir |
| Açık depo / arşiv | GitHub REST / Internet Archive CDX | Yalnızca kamuya açık meta veri |
| Geçici e-posta / inbox | Mail.tm | Platform erişimi 24 saat, anahtarlar şifreli, görünür Mail.tm atfı |
| Hash / örnek raporu | VirusTotal | MalwareBazaar; API anahtarları gerekli, dosya indirme/yükleme yok |
| IP itibarı | VirusTotal | AbuseIPDB; API anahtarı gerekli |
| DNS geçmişi | SecurityTrails | API anahtarı/sağlayıcı planı gerekli; eski IP origin kanıtı değil |
| URL geçmişi | urlscan.io açık indeks | API anahtarı gerekli; yeni tarama gönderilmez |
| Dosya meta verisi / IOC | Yerel | SHA-256, boyut, temel başlangıç imzası; ham dosya yüklenmez |

Anahtarlar owner panelinden şifreli girilir. Ortam değişkeni alternatifi: `VIRUSTOTAL_API_KEY`, `ABUSEIPDB_API_KEY`, `URLSCAN_API_KEY`, `SECURITYTRAILS_API_KEY`, `MALWAREBAZAAR_AUTH_KEY`. Mevcut anahtar tarayıcıya geri dönmez. `NOT_TESTED`, `KEY_REQUIRED`, son gerçek `OK` / `ERROR` ve kontrol zamanı ayrı gösterilir. Bot arka planda sabit kamu örnekleriyle eski bağlantı durumlarını kontrol eder; test amaçlı hesap/e-posta oluşturmaz. Lisanslı SMS/numara sağlayıcısı yapılandırılmadığından numara tahsis edilmez.

### Domain kombosu

Domain, DNS kayıtları ve yapılandırma gözlemleri; görünen en fazla üç IP’nin ASN/GeoIP’si; RDAP; en fazla 300 CT adı (alternatifte 100 pasif ad); sertifika geçmişi; canlı TLS ve HTTP başlıkları; SPF/DMARC. SecurityTrails bağlandıysa DNS geçmişi bölümü eklenir. Bir API yanıt vermezse hata yalnızca ilgili bölümde gösterilir. Her bölümün kaynak/sınır bilgisi ve raporun UTC gözlem zamanı bulunur. CDN IP’si backend IP diye etiketlenmez. CAA/NS/TTL, HSTS/CSP, SPF +all ve DMARC p=none gözlemleri zafiyet doğrulaması değildir.

HTTP incelemesi yalnızca 80/443 HEAD kullanır. DNS cevaplarının tamamı genel IP kontrolünden geçer, seçilen IP socket lookup’a sabitlenir, her yönlendirme yeniden denetlenir (en fazla iki). Yerel, özel, link-local, metadata, test ve IPv4-mapped özel hedefler kabul edilmez; TLS doğrulaması kapatılmaz. İçerik, çerez ve kimlik bilgileri toplanmaz. Kullanıcı yalnızca inceleme yetkisi olan hedeflerde kullanmalıdır.

### Denetim paneli

Yalnızca tanımlı owner + doğrulanmış sunucu üyesi. Kullanıcılar sayfalı aranır: kayıtlı Discord kimliği/username/avatar, siteye ilk katılım, platform son görülme ve etkinlik, XP/seviye, katkı/ses süresi, sorgu/ret sayısı, bekleyen DM **durumu**, erişim engeli. Güncel sunucuya katılım, rol ID’leri, üyelik doğrulaması ve timeout seçilen üyede Discord’dan okunur. Private DM/inbox içerikleri, oturum/CSRF sırları, şifreler ve sağlayıcı anahtarları kullanıcı tablolarına/dışa aktarıma girmez.

Erişim önizlemeleri ve gözlenen ağ IP’si 14 gün saklanır; IP kimlik/adres kanıtı değildir. Hassas URL query/fragment/userinfo ve kişisel mailbox/dosya içerikleri log önizlemesine girmez. Hak verme/iptal, anahtar değiştirme, engel değişikliği ve dışa aktarım mevcut HMAC denetim zincirine kaydedilir. JSON dışa aktarımı seçili 50 kullanıcı sayfası, son 250 erişim olayı ve son 250 hak kaydını kapsar. SHA-256, indirilmiş JSON’un `sha256` / `hashEncoding` hariç alanlarının UTF-8 canonical (alfabetik anahtar sırası) hâlinden hesaplanır. Hash dosya bütünlüğünü kontrol eder; hukuki delil geçerliliğine dair otomatik sertifika değildir.

Migration: `023_osint_research`. Tüm üretim/geliştirme migration girişleri ve runtime izinleri bu tablo setini içerir.
