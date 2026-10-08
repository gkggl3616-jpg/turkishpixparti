import {type ContentModerationSettings} from './moderation-policy';
import {moderationLabels,type ModerationCategory,type ModerationMode} from './moderation-catalog';
export type ModerationDecision={category:ModerationCategory;label:string;ruleId:string;mode:ModerationMode;confidence:'HIGH'|'REVIEW';obfuscated:boolean};
const confusables:Record<string,string>={'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ј':'j','ѕ':'s','к':'k','м':'m','т':'t','в':'b','н':'h','α':'a','ο':'o','ρ':'p','χ':'x','κ':'k','τ':'t'};
export function normalizeModeration(text:string,obfuscation=true){let value=text.slice(0,16000).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFKD').replace(/\p{M}/gu,'');
 if(obfuscation)value=value.replace(/[\p{Cf}\u200b-\u200f\u202a-\u202e\u2060-\u206f]/gu,'').replace(/[аеорсхуіјѕкмтвнαορχκτ]/g,x=>confusables[x]).replace(/[\p{L}\p{N}@!$]+/gu,word=>/\p{L}/u.test(word)?word.replace(/[013457@$]/g,x=>({'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','@':'a','$':'s'}[x]!)).replace(/(?<=[a-z0-9])!(?=[a-z0-9])/g,'i'):word).replace(/([a-z])\1{2,}/g,'$1$1');
 return value.replace(/\s+/g,' ').trim();}
const boundaryStart='(?:^|[^a-z0-9])',boundaryEnd='(?=$|[^a-z0-9])';
function literal(value:string){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function whole(pattern:string){return new RegExp(boundaryStart+'('+pattern+')'+boundaryEnd,'g');}
const profanity=whole('amk|amq|aq|siktir(?:in)?|siker(?:im|iz|sin)?|sikeyim|sikiyim|sik(?:tim|tiniz|tigin|tigi|er|en|mis|mek)|sikik|orospu(?:lar|sun|nun)?|pic(?:ler|sin)?|yarrak(?:lar|tan|li)?|gotveren|amina(?:koyayim|koyim|koydum)|fuck(?:ing|er|ed)?|motherfucker(?:s)?|bitch(?:es)?|asshole(?:s)?');
const separatedWords=['amk','siktir','sikerim','sikeyim','orospu','yarrak','heilhitler','siegheil','nigger','nigga','kike','raghead'];
function separatedRegex(word:string){return whole([...word].map(x=>literal(x)+'{1,2}').join('[ ._*~\\-]{0,3}'));}
const family=whole('anne(?:n|ni|ne|nin|mi|m|sini|sine)?|ana(?:n|ni|nin|mi|m|si|sini|sina)?|baci(?:n|ni|nin|m|si|sini)?|avrat(?:ini|in)?|avrad(?:ini|in)?|baba(?:n|ni|nin|m)?|kardes(?:in|ini|imin)?|ailen(?:i|in)?');
const religion=whole('allah(?:a|i|in|ini|ina|inin)?|tanri(?:yi|ya|nin|ni|sini)?|peygamber(?:in|i|e|ini|ine|inin)?|kuran(?:a|i|in|ini|ina|inin)?|kur[ \'’]*an(?:a|i|in|ini|ina|inin)?|muhammed(?:i|e|in)?|isa(?:yi|ya|nin)?|incil(?:i|e|in)?|tevrat(?:i|a|in)?|din(?:ini|ine|in|i)|islam(?:i|a|in)?|hiristiyanlik|yahudilik|budizm');
const national=whole('ataturk(?:e|u|un|unu|unun|une)?|ata[ \'’]*turk(?:e|u|un)?|mustafa kemal(?:e|i|in)?|turk(?:lerin|lere|leri)?|turkiye(?:yi|ye|nin)?|bayrak(?:i|in|a)?|bayrag(?:i|in|a)?|istiklal mars(?:i|ini|ina)|sehit(?:ler|leri|lere|lerin)?|gazi(?:ler|leri|lere|lerin)?');
const groups='(?:yahudi|kurt|turk|arap|ermeni|rum|yunan|suriyeli|afgan|roman|zenci|siyahi|musluman|hiristiyan|ateist|alevi|ezidi)';
const racism=whole(groups+'(?:ler|lar|leri|lari|lerin|larin|lere|lara|yi|i)?[ ,:;]*(?:(?:hepsi|butunu|her biri|birer|gercekten) )?(?:insan degil(?:dir|ler)?|alt irk|asagi irk|asagilik irk|hayvand(?:ir|irlar)|pislikt(?:ir|irler)|oldurulmeli(?:dir)?|gebermeli|yok edilmeli|imha edilmeli|ulke(?:den)? temizlenmeli|dunyayi yonetiyor)');
const racialViolence=whole(groups+'(?:leri|lari|ler|lar|i|yi)[ ,:;]+(?:oldur(?:elim|un|meli|meliyiz)|yok ed(?:elim|in)|temizle(?:yin|yelim)|yak(?:alim|in|maliyiz)|katlet(?:meli|elim|in))');
const slurs=whole('nigger(?:s)?|nigga(?:s)?|kike(?:s)?|raghead(?:s)?');
const nazi=whole('heil[ _.-]*hitler|sieg[ _.-]*heil|hitler[ \'’]*(?:i|e)?[ ,:;]+(?:hakli(?:ydi|dir)?(?![ ,:;]+(?:degil|degildi|degildir|mi|miydi|olmad))|yasasin|destekliyorum|ovuyorum)|naziler[ ,:;]+(?:hakli(?:ydi|dir)?(?![ ,:;]+(?:degil|degildi|degildir|mi|miydi|olmad))|yasasin)|yasasin[ ,:;]+(?:hitler|nazizm|naziler)|holokost[ ,:;]+(?:yalan|uydurma|olmadi)(?![ ,:;]+(?:degil|degildir))|holocaust[ ,:;]+(?:is a lie|never happened)|white[ _.-]+power');
const threat=whole('seni[ ,:;]+(?:oldurecegim|oldurucem|gebert(?:irim|ecegim)|katledecegim)|bogazini[ ,:;]+kesecegim|i[ ,:;]+will[ ,:;]+kill[ ,:;]+you');
const mild=whole('aptal(?:sin)?|gerizekali(?:sin)?|salak(?:sin)?|beyinsiz(?:sin)?');
function matches(regex:RegExp,text:string){regex.lastIndex=0;return [...text.matchAll(regex)].map(m=>({start:m.index!,end:m.index!+m[0].length}));}
function nearby(a:Array<{start:number;end:number}>,b:Array<{start:number;end:number}>){return a.some(x=>b.some(y=>Math.max(x.start,y.start)-Math.min(x.end,y.end)<=100));}
function isEducationalQuote(text:string,span:{start:number;end:number}){const quotes=[...text.matchAll(/["“«]([^"”»]{2,600})["”»]/g)];return quotes.some(q=>span.start>=q.index!&&span.end<=q.index!+q[0].length)&&/\b(?:slogan|propaganda|hakaret|ifade|soylem|irkcilik|tarih|kitap)\b/.test(text)&&/\b(?:yasak|yanlis|suc|sucludur|kin(?:iyorum|iyoruz)|reddediyorum|kabul edilemez|kotu)\b/.test(text);}
export function inspectContent(content:string,settings:ContentModerationSettings):ModerationDecision|null{
 if(!settings.enabled||!content.trim())return null;
 let text=normalizeModeration(content,settings.normalizeObfuscation);
 // Exact allowed fragments are masked, not a blanket exemption for the whole message.
 for(const phrase of settings.allowedTerms){const normalized=normalizeModeration(phrase,settings.normalizeObfuscation);if(normalized)text=text.replace(whole(literal(normalized)),m=>' '.repeat(m.length));}
 const profane=matches(profanity,text),spaced=settings.normalizeObfuscation?separatedWords.flatMap(word=>matches(separatedRegex(word),text).map(span=>({...span,word}))):[];
 const censored=settings.normalizeObfuscation?matches(whole('s[i*._]{1,3}k[e*._]{1,3}r[i*._]{1,3}m|s[i*._]{1,3}k[e*._]{1,3}y[i*._]{1,3}m|s[i*._]{1,3}kt[i*._]{1,3}r|[o*._]{1,3}r[o*._]{1,3}sp[u*._]{1,3}'),text):[];
 const p=[...profane,...censored,...spaced.filter(x=>!['heilhitler','siegheil','nigger','nigga','kike','raghead'].includes(x.word))];
 const found:Array<{category:ModerationCategory;ruleId:string;span:{start:number;end:number};obfuscated?:boolean}>=[];
 const add=(category:ModerationCategory,ruleId:string,spans:Array<{start:number;end:number}>,obfuscated=false)=>{for(const span of spans)found.push({category,ruleId,span,obfuscated});};
 add('NAZI','NAZI_PROMOTION',matches(nazi,text));add('NAZI','NAZI_OBFUSCATED',spaced.filter(x=>['heilhitler','siegheil'].includes(x.word)),true);
 if(settings.strictSymbols&&/[卐卍]/u.test(content)&&!/(?:hindu|budiz|tapinak|dini sembol)/.test(text))add('NAZI','NAZI_SYMBOL',[{start:0,end:text.length}]);
 if(settings.strictSymbols&&/<(?:a:|:)[^:>]*(?:nazi|heil_hitler|sieg_heil|swastika)[^:>]*:\d+>/i.test(content))add('NAZI','NAZI_EMOJI',[{start:0,end:text.length}]);
 add('RACISM','GROUP_DEHUMANIZATION',matches(racism,text));add('RACISM','GROUP_VIOLENCE',matches(racialViolence,text));add('RACISM','RACIAL_SLUR',matches(slurs,text));add('RACISM','OBFUSCATED_RACIAL_SLUR',spaced.filter(x=>['nigger','nigga','kike','raghead'].includes(x.word)),true);
 add('THREAT','DIRECT_VIOLENCE_THREAT',matches(threat,text));
 const rawSexual=settings.allowedTerms.some(t=>normalizeModeration(t)==='sik')?[]:matches(/(?:^|[^\p{L}\p{N}])sik(?=$|[^\p{L}\p{N}])/gu,content.normalize('NFKC').toLocaleLowerCase('tr-TR'));
 const targeted=[...p,...rawSexual,...matches(whole('am(?:i|ini|ina|cik|cigi)'),text)];
 if(nearby(targeted,matches(family,text)))add('ADK','FAMILY_INSULT',targeted);
 if(nearby(targeted,matches(religion,text)))add('DDK','RELIGIOUS_INSULT',targeted);
 if(nearby(targeted,matches(national,text)))add('MDK','NATIONAL_INSULT',targeted);
 add('PROFANITY','CENSORED_PROFANITY',censored,true);add('PROFANITY','EXPLICIT_PROFANITY',profane);add('PROFANITY','OBFUSCATED_PROFANITY',spaced.filter(x=>!['heilhitler','siegheil','nigger','nigga','kike','raghead'].includes(x.word)),true);
 if(settings.strictInsults)add('PROFANITY','DIRECT_INSULT',matches(mild,text));
 for(const phrase of settings.customTerms){const normalized=normalizeModeration(phrase,settings.normalizeObfuscation);if(normalized)add('CUSTOM','OWNER_DEFINED_TERM',matches(whole(literal(normalized)),text));}
 // A disabled high-priority rule does not suppress another applicable category.
 const candidates=found.filter(x=>settings.modes[x.category]!=='OFF');if(!candidates.length)return null;
 const automatic=candidates.find(x=>settings.modes[x.category]==='DELETE'&&!(settings.contextReview&&isEducationalQuote(text,x.span)));
 const chosen=automatic||candidates[0],review=settings.contextReview&&isEducationalQuote(text,chosen.span);
 return {category:chosen.category,label:moderationLabels[chosen.category],ruleId:chosen.ruleId,mode:review?'REVIEW':settings.modes[chosen.category],confidence:review?'REVIEW':'HIGH',obfuscated:chosen.obfuscated||false};
}
