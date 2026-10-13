import {createHmac,randomBytes} from 'node:crypto';
import {config,DomainError} from './config';
import {dnsQuery,publicWeb,researchUrl,type HeadObservation} from './osint-research';
import {scoreSecurity,type SecurityCheck} from './osint-security';
import type {ProviderResult} from './osint-providers';
export const sqlErrorSignature=/(?:SQLSTATE\[[A-Z0-9]+\]|You have an error in your SQL syntax|Unclosed quotation mark after the character string|ORA-\d{5}|PG::SyntaxError|psycopg2?\.errors\.[A-Za-z]+|SQLite(?:Exception|3::SQLException)|mysqli_sql_exception)/i;
export function ownershipChallenge(domain:string,actorId:string,day=Math.floor(Date.now()/86400000)){
 if(config().auditKey.length<32||!/^\d{17,20}$/.test(actorId))throw new DomainError('OWNERSHIP_CONTEXT','Doğrulanmış oturum ve sunucu anahtarı gerekli.',403);
 return {domain,record:'_osint-verify.'+domain,value:'osint-verify='+day+'.'+createHmac('sha256',config().auditKey).update('web-validation-v1:'+actorId+':'+domain+':'+day).digest('hex'),expiresAt:new Date((day+1)*86400000).toISOString()};
}
export function validationChecks(baseline:HeadObservation,quote?:HeadObservation,marker?:HeadObservation,probe=''):SecurityCheck[]{
 const sqlBase=sqlErrorSignature.test(baseline.body||''),sql=quote?.body?.match(sqlErrorSignature),usable=(h?:HeadObservation)=>!!h&&h.status>=200&&h.status<600&&![401,403,429,451].includes(h.status)&&h.body!==undefined;
 const shared={category:'Web' as const,source:baseline.url,confidence:'SIGNAL' as const,weight:0};
 return [{...shared,id:'authorized-sql-error',title:'Yetkili SQL hata farkı',status:!usable(quote)||sqlBase?'UNKNOWN':sql?'FAIL':'INFO',severity:sql?'HIGH':'INFO',evidence:sqlBase?'Referans yanıt zaten SQL hata imzası içeriyor; fark doğrulanamadı.':!usable(quote)?'Tek tırnak kontrolü yapılmadı veya değerlendirilebilir yanıt alınmadı.':sql?'Tek tırnak sonrası yeni SQL hata imzası: '+sql[0]+' · HTTP '+quote!.status:'Tek parametreli kontrolde yeni SQL hata imzası gözlenmedi. Kör, boolean veya zaman tabanlı SQLi test edilmedi.',remediation:'Parametreli sorgular ve genel hata yanıtları kullan. Bu sinyali uygulama logları ve kapsamlı yetkili testle doğrula; SQL injection doğrulanmış değildir.'},
 {...shared,id:'authorized-reflection',title:'Yetkili işaretçi yansıması',status:!usable(marker)?'UNKNOWN':'INFO',severity:'INFO',evidence:!usable(marker)?'İşaretçi kontrolü değerlendirilemedi.':probe&&marker!.body!.includes(probe)?'Rastgele alfanümerik işaretçi yanıt gövdesinde bulundu. HTML/JS çalıştırılmadı; yansıma XSS kanıtı değildir.':'İşaretçi yanıt gövdesinde gözlenmedi; XSS güvenliği doğrulanmadı.',remediation:'Çıktıyı bağlama uygun kodla, güvenli DOM API’leri ve CSP kullan. Yetkili XSS testi ayrı kapsam gerektirir.'}];
}
export async function authorizedWebValidation(input:string,actorId:string,enabled:boolean,baseline?:Promise<HeadObservation>,transport:typeof publicWeb=publicWeb):Promise<ProviderResult&{security?:ReturnType<typeof scoreSecurity>;authorization:ReturnType<typeof ownershipChallenge>&{verified:boolean};billable:boolean}>{
 const u=researchUrl(input),challenge=ownershipChallenge(u.hostname,actorId),base={title:'Sahipliği doğrulanmış giriş kontrolü',authorization:{...challenge,verified:false},billable:false,items:[{name:'DNS TXT doğrulama adı',value:challenge.record},{name:'DNS TXT doğrulama değeri',value:challenge.value},{name:'Doğrulama son tarihi (UTC)',value:challenge.expiresAt}],notice:'En fazla 2 ek GET; tek mevcut parametreye bir tırnak ve rastgele alfanümerik işaretçi. Çerez/kimlik bilgisi, POST, gecikme, veri çıkarma, UNION veya kod çalıştırma kullanılmaz. Yönlendirme takip edilmez. SQL hata sinyali ve metin yansıması doğrulanmış SQLi/XSS değildir.'};
 if(!enabled)return {...base,summary:'Aktif kontrol kapalı. DNS TXT kaydını ekleyip yetkili kontrolü seç.'};
 let proof=false;try{const txt=await dnsQuery(challenge.record,'TXT');proof=txt.records.some(r=>r.type===16&&r.data.replace(/"\s*"/g,'').replace(/^"|"$/g,'')===challenge.value);}catch{throw new DomainError('OWNERSHIP_DNS','Sahiplik TXT kaydı okunamadı; ek test isteği gönderilmedi.',503);}
 if(!proof)return {...base,summary:'Sahiplik doğrulanmadı; ek test isteği gönderilmedi.'};
 base.authorization.verified=true;
 if(u.protocol!=='https:'||/(?:logout|signout|delete|remove|purchase|checkout|transfer|unsubscribe|reset|confirm|activate|redeem|callback)/i.test(decodeURIComponent(u.pathname)))return {...base,summary:'Bu URL sınırlı GET kontrolüne uygun değil; HTTPS ve yan etkisiz bir arama/görüntüleme adresi kullan.'};
 const entries=[...u.searchParams.entries()];if(entries.length!==1||!/^(?:q|query|search|s|id|item|page|category|filter)$/i.test(entries[0][0])||entries[0][1].length>100)return {...base,summary:'Tam olarak bir kısa q/query/search/s/id/item/page/category/filter parametresi olan URL gerekli.'};
 const b=await (baseline||transport(u.href,'GET',0,{followRedirects:false}));if(new URL(b.url).origin!==u.origin||b.url!==u.href||![200,201,202,203,204].includes(b.status)||b.body===undefined)return {...base,summary:'Aynı URL’den değerlendirilebilir referans yanıt yok; ek test gönderilmedi.'};
 const [key,value]=entries[0],quote=new URL(u),marker=new URL(u),probe='osint'+randomBytes(12).toString('hex');quote.searchParams.set(key,value+"'");marker.searchParams.set(key,probe);
 const observations=await Promise.allSettled([transport(quote.href,'GET',0,{followRedirects:false}),transport(marker.href,'GET',0,{followRedirects:false})]);
 const get=(i:number)=>observations[i].status==='fulfilled'?observations[i].value:undefined,security=scoreSecurity(validationChecks(b,get(0),get(1),probe));
 return {...base,billable:true,security,summary:'Sahiplik doğrulandı · 2 sınırlı GET kontrolü · '+security.findings.length+' hata sinyali',items:[...base.items,...security.checks.map(c=>({name:c.title,value:c.status+' · '+c.evidence+'\n'+c.remediation}))]};
}
