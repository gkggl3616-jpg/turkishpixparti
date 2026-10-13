# Discord OwO · OCR ve tarama istatistikleri

Bu modül Discord botunda çalışır. Sonuçlar özel bot kartları, çizilmiş istatistik görselleri ve sayfa/oyun düğmeleriyle gösterilir; TXT/JSON istatistik eki gönderilmez.

## Komutlar

| Komut | İşlev |
|---|---|
| `/owo kur kanal:#owo kaynak:@oyun-botu` | Kanalı ve kaynak botu doğrular. Varsayılan resmî OwO hesabı `408785106942164992`. |
| `/owo takip acik:true` | Sürekli salt okunur izlemesini ve üç günlük otomatik taramayı açar. |
| `/owo takip acik:false` | Sürekli izlemesini kapatır. Süreli özel oturumlar ayrı çalışır. |
| `/owo tara adet:700` | Son 700 erişilebilir mesajı sayfalı tarar. 100–5000 seçilebilir. |
| `/owo istatistik` | Bu dönemin kanal raporunu ve oyun düğmelerini gösterir. |
| `/owo istatistik tarih:2026-10-13 oyun:BLACKJACK` | Tarihin ait olduğu üç günlük dönem ve oyun seçilir. |
| `/owo benim` | Aynı raporu yalnız kendi kimliğine bağlanan kayıtlardan hesaplar. |
| `/owo yardim sure:5` | 1–15 dakikalık özel canlı panel. |
| `/owo durum`, `/owo durdur` | Kendi oturumunu gösterir/kapatır. |
| `/owo ocr` | Son görsel okumalarının durum, metin ve OCR skorunu gösterir. |
| `/owo komutlar arama:bj` | Kaynak/alias/kapsam rehberi; 197 kayıt. |

Yalnız rol `1557607714681786448` veya yapılandırılmış owner hesapları kullanır. Sunucu üyeliği ve kanal geçmişi izni tekrar doğrulanır. Sürekli izlemenin yetkisi yaklaşık 30 saniyede, özel oturumun yetkisi yaklaşık 5 saniyede yeniden kontrol edilir. Kanal/kaynak değişikliği açık oturumları kapatır.

## Takvim ve tarama

İstanbul saatine göre ayın 1–3, 4–6, 7–9, 10–12, 13–15 gibi dönemleri kullanılır. Ayın son dönemi kısalabilir; sonraki ay tekrar 1’inden başlar. Örneğin 13 Ekim 2026 seçimi 13–15 Ekim dönemini verir.

Her yeni dönemde son 700 mesaj otomatik taranır. Bu sayı oyun değil, kanalda erişilen toplam mesaj sayısıdır. Canlı kaynağın yeni mesajları ve düzenlemeleri ayrıca izlenir. Bot kapalı kalmışsa çalışmaya döndüğünde güncel döneme devam eder; sonsuz geriye dönük arşiv oluşturmaz. Aynı dönemde otomatik tarama tekrar tekrar başlatılmaz; manuel `/owo tara` ayrıca kullanılabilir.

Rapor, oyun mesajının oluşturulma tarihine göre dönem seçer. Son 700 mesajın hepsinin aynı dönemde olması gerekmez. Tutulan kayıtlar 30 gün sonra temizlenir. Rapor örneği en fazla 5000 sonuç ve 20000 ara durum içerir; sınır aşımı belirtilir.

## Oranların anlamı

İstatistik yüzdeleri yalnız taranmış OwO mesajlarından hesaplanır. Standart deste/gerçek hayat Blackjack yüzdesi, teorik Coinflip yüzdesi veya hazır slot dağılımı kullanılmaz. Okunamayan kayıt kayıp veya sıfır kazanç sayılmaz. Net lider, bilinen parasal sonuçların toplamına göre belirlenir; gelecekte en iyi oyunu göstermez.

### Mines

3×3 görselde her hücre için gözlenen elmas/mayın oranı, açıklanan hücre sayısı ve doğrulanmış seçim sayısı gösterilir. Kapalı/bilinmeyen kareler paydaya alınmaz. Mayın sayıları ayrı gruplara ayrılır. Az örnek açıkça işaretlenir; %95 örnek aralığı yeterli kayıt olduğunda gösterilir.

Tam açıklanmış tahtalarda aynı mayın dizilimi ve döndürme/yansıtma ile aynı geometrik şablon tekrarları sayılır. Kısmi tahtalar senaryo araştırmasına katılmaz. Tekrar görmek sabit senaryo, gizli konum veya gelecek kazanç kanıtı değildir.

### Blackjack

Canlı mesajın ara el durumları saklanır ve son Win/Loss/Push sonucuna bağlanır. Bir oyun aynı el satırında bir kez sayılır. Soft/hard durumlar ayrı gösterilir. Eşik karşılaştırması ilk gözlenen aktif el üzerinden yapılır; iki grupta da en az 20 oyun gerekir. Bu, gözlenen ilişkiyi gösterir; o sayıda durmanın kazanmayı artırdığını kanıtlamaz.

Eski mesajların önceki düzenlemeleri Discord geçmişinden elde edilemez. Yalnız terminal el görüldüyse son el tablosu ayrı etiketlenir; ara el veya kart çekme riski uydurulmaz. Oyun ve el tabloları sayfa düğmeleriyle gezilir.

### Diğer kategoriler

Coinflip, Slots, WSG ve Battle için tanınan mesaj biçimleri sonuçlara bağlanır. Battle XP’si cowoncy değildir. Diğer katalog komutlarının kullanım sayısı izlenir; kaynak botun doğrudan yanıt referansı varsa yanıt kaydı ilişkilendirilir. Tanınmayan sonuç biçiminde başarı veya parasal sonuç üretilmez.

## OCR

Tesseract sunucuda çalışır; harici görüntü/AI servisine gönderim yoktur. PNG/JPEG/WebP, 8 MB ve 12 milyon giriş pikseli sınırı uygulanır. Kaynak görselleri HTTPS ile yalnız Discord CDN ve onaylı OwO CDN alanlarından alınır; yönlendirme kabul edilmez.

OCR sözcük skoru 75’in altındaysa ilgili sözcük `[?]` ile maskelenir ve sayı/sonuç çıkarımına sokulmaz. Tam/kısmi/düşük güven/boş durumları ayrıdır. OCR skoru gerçek doğruluk yüzdesi değildir. Küçük, sıkıştırılmış veya stilize hayvan/kart ikonları kesin okunmuş sayılmaz; gerçek Mines bileşenleri varsa bunlar görsel tahminin önünde tutulur.

Kuyruk kalıcıdır, sınırlı paralellikte çalışır, geçici görsel dosyaları silinir. Hatalı görsel en fazla üç deneme görür. Eski OCR işi yeni mesaj düzenlemesini ezemez. Yalnız eksik alanlar yüksek güvenli okumalardan doldurulur.

## Sınırlar ve doğrulama

Mesajlar yalnız yapılandırılan kaynak bot hesabından alınır. Takma ad, kullanıcı ID’si yerine kabul edilmez: açık mention/avatar ID’si veya tek anlamlı komut eşleştirmesi gerekir; çakışma bilinmeyen kalır. Özel paneller yalnız kendi uygulamamıza ait yanıtı düzenler. Başka botun düğmesine basma, otomatik bahis veya CAPTCHA aşma bulunmaz.

Doğrulamalar: takvim sınırları, 700 mesajda durma, ara el/sonuç bağlantısı, düzenleme tekrarları, kişisel kanal kapsamı, mikro saniyeli tarama imleci, gerçek Tesseract çalıştırması, OCR kaynak/boyut/güven sınırları, PNG üretimi ve özel cevap düğmeleri.

Tesseract kaynağı: https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html
