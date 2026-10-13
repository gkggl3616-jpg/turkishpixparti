export const webIntelligenceTools=[
 ['web-inventory','Script / Mixed Content / API Envanteri','Sayfadaki script, SRI, HTTP kaynak ve API işaretleri','url','web'],
 ['isolation','CSP & Cross-Origin Isolation','CSP / COOP / COEP / CORP / Permissions politikaları','url','web'],
 ['waf-signals','WAF / CDN Signals','Başlık ve HTML üzerinden pasif WAF / CDN işaretleri','url','web'],
 ['method-hints','HTTP Method Hints','Allow yanıt beyanı; yöntem çalıştırılmaz','url','web'],
 ['security-details','RFC 9116 Review','security.txt alanları ve bitiş tarihi','domain','web'],
 ['subdomains-verify','Discovered Subdomain DNS','Pasif keşfedilen ilk 12 adı DNS ile kontrol et','domain','infrastructure'],
 ['ct-deep','Deep CT History','Sertifika issuer / tarih / DNS isimleri','domain','infrastructure'],
 ['certspotter','CertSpotter Discovery','SSLMate CT Search ilk sayfa','domain','infrastructure'],
 ['hsts-preload','HSTS Preload Status','Chromium preload kayıt durumu','domain','web'],
 ['tranco','Tranco Popularity','Yayımlanan tarihsel domain sıralaması','domain','research'],
 ['green-web','Green Hosting','Green Web Foundation hosting kaydı','domain','research'],
 ['resolved-networks','Resolved IP / ASN / Geo','Domainin gözlenen IP kayıtları için ağ raporu','domain','infrastructure'],
 ['origin-history','Historical IP Review','Mevcut DNS ve tarihî IP adayları; origin doğrulanmaz','domain','infrastructure'],
 ['typosquat','Domain Similarity','Sınırlı yazım varyantlarında DNS gözlemi','domain','infrastructure'],
 ['mail-gateway','Mail Gateway Signals','MX adlarındaki yayımlanmış servis işaretleri','domain','infrastructure'],
 ['observatory','Mozilla HTTP Observatory','Resmî MDN başlık skoru; üçüncü taraf HTTP incelemesi','domain','web'],
 ['ssl-labs','SSL Labs Cached Endpoint','Kayıtlı email ile mevcut uç nokta raporu','domain','web']
] as const;
export type WebIntelligenceKind=(typeof webIntelligenceTools)[number][0];
export const webIntelligenceCatalog=webIntelligenceTools.map(([id,name,label,input,group])=>({id,name,label,input,group,enabled:true,icon:'📑'}));
