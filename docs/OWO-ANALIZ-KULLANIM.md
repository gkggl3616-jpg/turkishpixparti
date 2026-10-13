# OwO · kanal, tarama ve canlı öneri

Bu modül yalnız Discord botundadır. Oyunu kullanıcı oynar; bot görünür oyun mesajlarını okuyup kendi yanıtını günceller. Kullanıcı tokenı veya başka botun butonlarına otomatik tıklama yoktur.

| Komut | İşlev |
|---|---|
| `/owo kanal kanal:#owo kaynak:@oyun-botu` | Kanal/kaynak bot doğrulaması. Kaynak boşsa resmî OwO. |
| `/owo tara` | Erişilebilir en eski mesaja kadar 100 mesajlık sayfalar; kayıtlı imleçle yeniden başlatmada devam. |
| `/owo tara tarih:2026-10-10` | İstanbul saatinde 10 Ekim 00:00’dan itibaren geçmiş. |
| `/owo calistir` | Kullanıcının sürekli canlı paneli; Durdur düğmesine veya rol/kanal yetkisi kaldırılana kadar. |
| `/owo calistir sure:5` | İsteğe bağlı süre, 1–1440 dakika. |

Eski OwO slash seçenekleri kaldırılmıştır. Rapor, oyun/sayfa seçimi, OCR durumu, yenileme ve durdurma panel düğmeleriyle kullanılır. Aynı kullanıcının yeni oturumu eskisini kapatır; diğer kullanıcıların oturumu kapatılamaz. Canlı panel kanal mesajı olarak güncellenir; 15 dakikalık interaction tokenı sınırına bağlı değildir. İçerik bu kanalı görebilenlere açıktır. Kişisel ve kanal rapor düğmeleri özel yanıt verir.

## Yetki

Yalnız `1557607714681786448` rolü veya yapılandırılmış owner hesabı. Yönetici rolü tek başına yeterli değildir. Üyelik, rol ve kanal erişimi taze veriden doğrulanır; yetki kaldırılırsa oturum kapanır. Bot Kanalı Görüntüle, Mesaj Geçmişini Oku, Mesaj Gönder, Bağlantı Yerleştir ve Dosya Ekle izinlerine ihtiyaç duyar. Yalnız seçilen kanal ve seçilen oyun botu sonuç kaynağıdır. Bilinen OwO komut metadatası dışında sohbet kaydedilmez.

## Son tarama + canlı gözlemler

Taranan oyunların son tarama zamanı kaydedilir. Canlı öneri son tamamlanan taramanın örnekleri ve sonradan gözlenen oyunlardan hesaplanır. Öneri hesabı en yeni 5000 oyun ve 20000 görünür durumla sınırlıdır; sınır aşılırsa panelde belirtilir. Gözlemler alındıktan itibaren 30 gün korunur. Eski mesajın ara düzenlemeleri Discord’dan geri alınamaz; canlı görülen değişimler ayrıca kaydedilir. Aynı mesajın düzenlemeleri ikinci oyun sayılmaz.

- **Mines:** aynı mayın sayısındaki açıklanmış hücre frekansları, n ve %95 Wilson aralıkları. 3×3 görselde güncel açık elmas/mayın/patlama bilgisi ve kapalı kare etiketleri. Kapalı kareler için en az 20 örnek varsa en düşük gözlenen mayın frekansı belirtilir. Bu, sonraki tahtanın kesin konumunu göstermez.
- **Blackjack:** aynı görünen el toplamı, soft/hard ve krupiye açık kartında gözlenen sonuçlar. Kart dizisine yeni kart eklenmesi Kart Çek, aynı kartlarla terminal yanıt Pas çıkarımıdır; başka uygulamanın tıklama olayına erişim yoktur. Her hamlede en az 20 eşleşmiş örnek ve ayrışan %95 aralık varsa Kart Çek/Pas önerisi verilir. Veri yoksa veya aralıklar örtüşüyorsa açıkça belirtilir. Görünen 21’de Pas denir. Standart deste olasılıkları bu oranlara katılmaz.
- **Coinflip:** taranan HEADS/TAILS tercihleri ve sonuçlar; önceki oyun bir sonraki yazı/turayı belirlemez.
- **Slots/WSG/Battle ve katalog:** tanınan formatın görünür tutarları/sonuçları; tanınmayanlar UNKNOWN. Battle XP para değildir. Yayıncı katalogunda 197 komut kaydı/346 kısa ad bulunur; katalog kapsamı her oyunun tüm mekaniklerinin çözüldüğü anlamına gelmez.

Ayın 1’inden itibaren 1–3, 4–6, ... üç günlük pencerelerde son 700 mesaj otomatik taranır. Manuel tam/tarihli tarama bu 700 sınırına bağlı değildir. Dönem raporları tarihe bağlıdır; net tutarı bilinmeyen oyunlar sıfır kazanç sayılmaz. Bir sonraki kazanım garanti edilmez.

## OCR ve 8858 ekranındaki hata

Önce Discord’un `proxy_url` / `proxyURL` görsel adresi, sonra doğrulanmış asıl adres kullanılır. Desteklenen kesin HTTPS hostları: `cdn.discordapp.com`, `media.discordapp.net`, `images-ext-1.discordapp.net`, `images-ext-2.discordapp.net`, `cdn.owobot.com`. Eski OWO_OCR_HOST kayıtlarının kaynak mesajı yeniden alınır; desteklenen proxy bulunursa yeni OCR işi açılır. Keyfî URL yönlendirmeleri izlenmez.

Tesseract yerelde çalışır; PNG/JPEG/WebP/GIF (ilk kare), en fazla 8 MB ve 12 milyon piksel. Yalnız seçilen oyun botunun mesaj görselleri okunur; avatarlar ve insan yüklemeleri OCR kaynağı değildir. Düşük güvenli sözcükler ve rakamlar `[?]` olarak işaretlenir; kesin istatistiğe zorla eklenmez. Gösterilen OCR güveni doğruluk garantisi değildir. OCR durumu panelin OCR düğmesindedir.
