# İşletim ve teknik sınırlar

- PostgreSQL `FOR UPDATE` kilitleri, unique index’ler ve transaction’lar çift onay/oy/sonuçlandırmayı önler. Test motoru PGlite olduğu için bağımsız Postgres sunucusunda paralel istek stres testi ayrıca yapılmalıdır.
- Worker her 5 saniyede süresi dolan oylamaları ve outbox’u kontrol eder. Bot kapalıysa mevcut kayıtlar korunur; worker döndüğünde süresi dolan oylamalar sonuçlanır.
- Discord gönderimleri transaction’dan sonra outbox ile işlenir. Hatalarda üstel geri çekilme uygulanır; son hata owner panelinde görünür. Discord `nonce`/`enforce_nonce` ve kayıtlı mesaj ID’si tekrarları azaltır. Ağ kesintisi ile veritabanı kaydı arasında kalan nadir durumlar için mutlak exactly-once Discord mesaj garantisi yoktur.
- Dört siyasi rol owner panelinden eşleştirilir; milletvekili rolü için eski ortam değişkeni yalnızca ilk varsayılandır. Uygulama yetkisi Discord rol adına göre değil, aktif PostgreSQL milletvekili kaydına göre verilir. Bot kendi rolünden yüksek Discord rollerini yönetemez. Rol eşleştirmesi değişince uygulamanın kayıtlı görevlerine ait eski roller kaldırılır, yeni roller eklenir; uygulamada kayıtlı olmayan sunucu hesapları otomatik taranmaz. Owner dört onaylı manuel parti rolü verirse bu manuel görev, otomatik üyelikten bağımsız devam eder.
- OAuth2 state tek kullanımlı ve 10 dakika geçerlidir. Session token veritabanında hash olarak tutulur. HTTP-only cookie, SameSite=Lax, HTTPS’te Secure kullanılır. API yazma isteklerinde origin ve CSRF doğrulanır.
- Sunucu üyeliği her kullanıcı işleminde Discord REST API’den kontrol edilir. Kullanıcı adı lider yetkisini veya owner yetkisini belirlemez; Discord kullanıcı ID’si belirler. Çok yeni üyeler için `MIN_MEMBER_AGE_HOURS` kullanılabilir.
- Parti listesi, başvurular, oy toplamları ve TBMM listesi herkese açıktır. Kullanıcının kendi oy tercihi sadece kendi web oturumuna döner. Tam audit geçmişi ve outbox owner erişimindedir.
- Logo tarayıcıda PNG’ye dönüştürülüp en fazla 256 px olarak küçültülür. Server MIME/format allowlist ve boyut sınırı kullanır; SVG kabul edilmez. Görseller PostgreSQL’de saklanır; object storage bağlanmadı.
- Seçimlerde toplam oyla D’Hondt dağılımı uygulanır. Liste sırası bağlayıcıdır. Liste kısa ise partiye ayrılan koltukların bir kısmı boş kalır. Siyasi seçim barajı ve kişisel tercihli oy eklenmedi.
- Milletvekili atama bir boş koltuğu doldurur. Görevden alma/deputy revoke endpoint’i kullanıcıya açılmadı. Yeni seçim eski dönemi otomatik kapatır.
- Bu sürümde fiziksel WORM depolama, bağımsız hash checkpoint servisi, HMAC anahtar rotasyonu, otomatik yedek servisinin kurulumu ve monitoring alarm entegrasyonu yoktur. SQL trigger’ları ve kısıtlı rol, uygulama düzeyinde append-only sağlar; PostgreSQL superuser’ının yetkilerini ortadan kaldırmaz.
- Dört owner ID’si başvuru açılırken kayda alınır. Ortam listesinden çıkarılan kişi yeni işlemlerde owner yetkisi kullanamaz; eski bekleyen başvurulardaki owner snapshot’ı değişmez. Owner değişikliği öncesinde bekleyen başvuruları sonuçlandırmak gerekir.
- Kanun teklifinin seçmen listesi açılışta sabitlenir. Yeni döneme geçiş sırasında eski teklifler otomatik iptal edilmez; artık aktif olmayan üyeler oy veremez. Yetersiz katılımda teklif başarısız sonuçlanır.
- Renk temaları ve ses/imleç tercihleri cihazda saklanır. Ses, tarayıcının kullanıcı etkileşimi izniyle Web Audio’dan üretilir. Dokunmatik cihazlarda özel imleç gösterilmez; reduced-motion tercihi gözetilir.


## v2.1 — Kanal listeleri, ses DM ve aktivite

- Owner panelindeki metin ve ses kanalları Discord REST üzerinden alınır; botun View Channel izni olmayan kanallar listeden çıkarılır. Gönderim izni olmayan metin kanalları seçimde pasif görünür.
- Karşılama sayfasında ses DM modülü, giriş/çıkış anahtarları, kanal filtresi, iki mesaj şablonu ve bekleme süresi bulunur. Yeni modül varsayılan olarak kapalıdır; mevcut ayarlar korunur. Şablonlar `{username}`, `{user}`, `{server}`, `{channel}` destekler.
- `/sesdmkapat` bekleyen ve gelecekteki ses DM bildirimlerini durdurur. `/sesdmac` yeniden açar. Duyuru aboneliği bağımsızdır.
- Mikrofon/kamera değişiklikleri bildirim üretmez. Kanal değişikliği ilgili çıkış ve giriş olayı olarak işlenir. Kullanıcı başına olay türüne göre bekleme süresi PostgreSQL üzerinde kontrol edilir; kilit birden fazla worker'ın aynı kullanıcıyı aynı anda hazırlamasını engeller. 5 dakikadan eski ses bildirimleri gönderilmez.
- `/bot-ayarlari` üzerinden çevrim içi durum, aktivite türü ve yazısı yönetilir. Bot değişiklikleri yaklaşık 5 saniyede uygular. Discord bot presence alanları resim veya Rich Presence düğmelerini desteklemez.
- `006_voice_presence` migration'ı ses DM türünü, kullanıcı tercihlerini ve cooldown indeksini ekler. Bot pre-deploy komutu admin bağlantısıyla migration uygular. Web health endpoint'i beş migration'ın tamamını gerektirir.
- Railway'de bot ve web source `gkggl3616-jpg/turkishpixparti`, branch `main`, Dockerfile.bot / Dockerfile.web. Deploy ayarları Railway API ile güncellenmiştir: uyku kapalı, ALWAYS restart; botta migration pre-deploy ve overlap 0. Diğer üç serviste de uyku kapalı ve ALWAYS restart uygulanır. Kaynak limitleri veya replika sayıları artırılmaz.
- `railway.bot.json` ve `railway.web.json` eski Config as Code örnekleridir. Güncel Railway bu dosyalara yeni servis bağlantısını kabul etmez; canlı ayarlar API/dashboard üzerinden yönetilir. Bu güncelleme kaynak kodunda IaC sahipliği veya kaynak silme işlemi yapmaz.
