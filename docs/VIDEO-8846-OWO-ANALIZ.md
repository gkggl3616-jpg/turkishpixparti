# 8846.mp4 değerlendirmesi · 13 Ekim 2026

82,8 saniyelik kayıtta kanal geçmişi, Mines, Blackjack, Slots ve Coinflip örnekleri incelendi.

| Yaklaşık süre | Görünen durum | Uygulanan düzeltme |
|---|---|---|
| 6–9 sn | Özel istatistik yanıtında geçmiş `RUNNING · 0` | PostgreSQL mikrosaniyeleri kaybetmeden tarama revizyonunu karşılaştırma; kalıcı imleç testi |
| 12–21 sn | 250.000 bahisli, 3 mayınlı tahta; orta elmas ve sonrasında kayıp | Açıklanan hücre ile seçilen hücreyi ayırma; eski üzeri çizilmiş Cash Out’u ödeme saymama |
| 24–30 sn | Blackjack author `frizz2025`, el 21, dealer 23, footer kazanım 250.000 | Author/avatar kimliği, field kartları, footer ve net/brüt ödeme ayrımı |
| 33–45 sn | Slots bahis 250.000, sonuç ödeme 500.000 | Animasyonun tamamlanmasını bekleme, gözlenen net +250.000 |
| 57–66 sn | 100.000 bahisli, 4 mayınlı Mines | Mayın sayısına göre ayrı geçmiş ve güncel kapalı kare riski |
| 69–75 sn | Blackjack 17’den 27’ye, footer kayıp 250.000 | Gözlenen 17 elini terminal kaybına bağlama; ara durum yoksa el oranını uydurmama |
| 78–82 sn | Coinflip `spent`, `chose heads`, `The coin spins`, `lost it all` | Gerçek metin biçimi, bahis/seçim/sonuç ayrıştırma; kullanıcı eşleştirmesi |

Sadece güvenilir bot kaynağı işlenir. Yalnız görseldeki takma adı kaynak ID’si diye kabul etmeyiz. Embed avatarının Discord kullanıcı ID’si, açık mention veya tek anlamlı yakın komut eşleştirmesi kullanılır. Ad çakışmasında sonuç kişisel hesaba atanmaz. Eski sayfalardan gelen komutlar sonradan eşleştirilir; sonradan bulunan çakışma önceki belirsiz atamayı kaldırır.

## Komut kaynağı

Yayıncının erişilebilir deposu: https://github.com/ChristopherBThai/Discord-OwO-Bot

İncelenen snapshot: `9aec92b274bae64ea078fc04540398713e7f7928`.

314 kullanıcı komutu/yardımcı JS dosyası ve `src/data/emotes.json` incelendi. Kodlar ürünümüze kopyalanmadı; komut adları, alias ve kategori gibi katalog bilgileri çıkarıldı, açıklamalar ve analiz kodu bağımsız yazıldı. Admin/personel dosyaları bu kullanıcı rehberine alınmadı. Katalog 195 açık kaynak komut kaydı, videoda görülen Mines ve kaynakta doğrulanmamış WSG içerir. Canlı botun özel/yeni özellikleri için kapsam açıkça belirtilir.

Kart gösterimi ve Blackjack ödeme anlamı için `gamble/blackjackUtil.js` ile `gamble/blackjack.js`; Coinflip/Slots mesaj biçimleri için `gamble/coinflip.js` ve `gamble/slots.js` incelendi. Güncel rapor yüzdeleri hazır kaynak olasılıklarından değil, taranan mesajların sonuçlarından hesaplanır.

## Sonuçların yorumu

Orta hücrenin birkaç kez elmas çıkması “her zaman kazandırır” demek değildir. Kişisel başarı/adet ve %95 aralık gösterilir; yeni gizli konum önerilmez. Blackjack oranları yalnız gözlenen ara el/sonuç çiftlerinden hesaplanır. Eski mesajda ara el bulunmadığında son el tablosu ayrı gösterilir. Standart deste yüzdesi kullanılmaz.

Modül yalnız Discord’a eklenir, özel süreli paneller kullanır. Web arayüzü değiştirilmez. Otomatik bahis/düğme basma veya CAPTCHA aşma eklenmez.
