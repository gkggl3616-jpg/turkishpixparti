# Discord OwO analiz modülü

Bu modül yalnız Discord botuna eklenmiştir. Web arayüzü ve yönetim botunun sürüm/güncelleme listesi değiştirilmez.

## Erişim ve kurulum

Yalnız `1557607714681786448` rolüne sahip sunucu üyeleri ve yapılandırılmış owner hesapları kullanabilir. Yönetici izni tek başına yeterli değildir. Üyelik, rol ve kanal geçmişine erişim oturum boyunca tekrar kontrol edilir.

1. `/owo kur kanal:#owo kaynak:@oyun-botu`: İzlenecek normal metin kanalını ve bot hesabını belirler. Kaynak belirtilmezse resmî OwO hesabı `408785106942164992` kullanılır. Ekran görüntüsündeki takma ad kaynak hesabının ID'sini doğrulamaz; farklı bot kullanılıyorsa onu açıkça seçin.
2. `/owo yardim sure:5`: Yalnız kullanıcıya görünen, beş dakikalık analiz paneli açar. Süre 1–15 dakika olabilir. Gösterilen durum yaklaşık 5–10 saniyede güncellenir; Discord erişimi/rate limit nedeniyle gecikebilir.
3. `/owo tara`: Yapılandırılan kanalın erişilebilir mesaj geçmişini 100 mesajlık sayfalarla sonuna kadar okur. Kalıcı imleç yeniden başlatmadan sonra taramayı sürdürür. Yetki kaybı taramayı durdurur.
4. `/owo istatistik`: Tarama ilerlemesini, oyuncu/oyun bazında gözlenen sonuçları ve açıklanmış Mines tahtalarını özel JSON ekiyle verir.
5. `/owo durum` ve `/owo durdur`: Kendi oturumunu görüntüler veya kapatır.

Yeni bir kanal/kaynak kurulumu mevcut oturumları kapatır. Yeni geçmiş taraması ilk kez başlatıldığında sona kadar gider; tamamlanmış taramanın tekrar başlatılması geçmişi baştan kontrol eder; yarım kalan tarama imleçten sürer. Yeni mesajlar, aktif oturum veya tarama sırasında olay dinleyicileriyle alınır. Modül sürekli, sınırsız bir arşiv değildir.

## Okunan veriler

Discord'un sunduğu mesaj metni, embed alanları ve 3×3 Mines düğmelerindeki görünen emoji/etiketler okunur. Kapalı, elmas, mayın, patlama ve bilinmeyen durumlar ayrı tutulur. Aynı mesajın düzenlenmesi yeni oyun olarak sayılmaz; eski düzenlemeler daha yeni gözlemleri değiştirmez. Yalnız seçilen bot kaynağı işlenir.

Mines, Blackjack, WSG, Coinflip, Slots ve Battle için tanınan metinler ayrıştırılır. Tanınmayan biçimler kesin sonuç diye gösterilmez. Raster savaş görsellerine OCR eklenmemiştir; hayvan/kart detayları resimden çıkarılmaz. Battle XP'si cowoncy kazancı sayılmaz.

Ödeme, net sonuç ve bilinmeyen tutarlar ayrıdır. Kaybedilmiş Mines mesajında kalan eski `Cash Out` değeri kazanç değildir. Oyuncu ID'si ancak açık bir mention veya etkileşim kimliğinden belirlenir; belirsiz kayıtlar isimsiz kalır. Bunlar hesap bakiyeleri değil, bot mesajlarından gözlenen sonuçlardır.

## Mines örneği

Dokuz kare, üç mayın ve açılmış bir elmas bulunan tahtada sekiz kapalı kare kalır. Her kapalı karenin güvenli olma olasılığı `5/8 = %62,5` olur. Önceki oyunların bomba yerleri yeni oyunun kapalı karelerini göstermez.

Ekrandaki `Cash Out = 352.500`, `Next = 564.000` için sonraki adımın koşullu beklenen ödemesi `0,625 × 564.000 = 352.500` olur. Devam etmek aynı beklenen tutarda daha fazla risk taşır. İlk adımda `6/9 × 1,41 = 0,94` geri ödeme, bahis başına %6 negatif beklenti demektir; garantili kazanç stratejisi yoktur.

## Kapsam ve sınırlar

- Konum tablosu son 1.000 tamamlanmış Mines mesajının görünen hücrelerinden oluşur; kullanıcı listesi en fazla 20.000 oyuncu/oyun satırıdır ve kesilme açıkça belirtilir.
- Gözlemler 30 gün tutulur. Botun göremediği, silinmiş veya sağlayıcı tarafından açıklanmamış sonuçlar elde edilemez.
- Discord Message Content erişimi ve Kanalı Görüntüle/Mesaj Geçmişini Oku izinleri gerekir.
- Oturum tokenleri şifreli tutulur ve oturum kapanınca temizlenir. Paneller yalnız kendi uygulamamızın özel yanıtını günceller.
- Bot bahis göndermez, başka botun düğmelerine basmaz, kullanıcı tokeni kullanmaz ve CAPTCHA aşmaz. Hamleleri kullanıcı yapar.

## Doğrulama

Tip kontrolü ve 418 test geçti. Bunlar ayrıştırma, yetki kontrolü, süre sınırı, geçmiş sayfalama, mesaj düzenlemeleri ve özel panel güncellemelerini kapsar. Canlı oyun biçimleri değişirse yeni parser örnekleriyle yeniden doğrulama gerekir.
