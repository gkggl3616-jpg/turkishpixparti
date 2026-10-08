import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {syncUser} from './discord';
import {transaction} from './db';
import {audit} from './audit';
import {z} from 'zod';
import {config,DomainError} from './config';
import {database} from './db';
import {rateLimit} from './auth';
import type {CommunitySettings} from './community';
/** Bounded arithmetic grammar, never evaluates JavaScript or arbitrary code. */
export function calculateMath(input:string):number|null{
 const source=input.trim().toLocaleLowerCase('tr-TR').replace(/^hesapla\s*:?\s*/,'').replace(/\s*(kaç eder|kaç|kac eder|kac)\??$/,'').replace(/[?=]\s*$/,'').replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/');
 if(source.length>240||!/[0-9]/.test(source)||!/^[\d.\s()+*/%^\-]+$/.test(source))return null;
 const tokens=source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+*/%^\-]/g)||[];if(tokens.length>120)return null;
 let pos=0,depth=0;function primary():number{if(++depth>24)throw Error('depth');let v:number;if(tokens[pos]==='('){pos++;v=expression();if(tokens[pos++]!==')')throw Error('parenthesis');}else{const t=tokens[pos++];if(!t||!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(t))throw Error('number');v=Number(t);}depth--;return v;}
 function power():number{let v=primary();if(tokens[pos]==='^'){pos++;const e=unary();if(Math.abs(e)>1000)throw Error('exponent');v=v**e;}return v;}
 function unary():number{if(tokens[pos]==='+'||tokens[pos]==='-'){const sign=tokens[pos++];if(++depth>24)throw Error('depth');const v=unary();depth--;return sign==='-'?-v:v;}return power();}
 function term():number{let v=unary();while(['*','/','%'].includes(tokens[pos])){const op=tokens[pos++],n=unary();v=op==='*'?v*n:op==='/'?v/n:v%n;}return v;}
 function expression():number{let v=term();while(tokens[pos]==='+'||tokens[pos]==='-'){const op=tokens[pos++],n=term();v=op==='+'?v+n:v-n;}return v;}
 try{const v=expression();return pos===tokens.length&&Number.isFinite(v)?v:null;}catch{return null;}
}
function encryptionKey(){if(config().auditKey.length<32)throw new DomainError('KEY_NOT_CONFIGURED','Sunucu şifreleme anahtarı eksik.',503);return Buffer.from(hkdfSync('sha256',config().auditKey,'TurkishPix','ai-provider-secret-v1',32));}
export async function aiProvider(){
 const row=(await database().query('SELECT provider FROM community_secrets WHERE guild_id=$1',[config().guildId])).rows[0]?.provider;
 if(row){if(row.disabled)return {key:'',model:row.model||'gpt-4.1-mini',source:'panel'};try{const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(row.iv,'base64'));cipher.setAuthTag(Buffer.from(row.tag,'base64'));return {key:Buffer.concat([cipher.update(Buffer.from(row.data,'base64')),cipher.final()]).toString('utf8'),model:row.model,source:'panel'};}catch{throw new DomainError('PROVIDER_DECRYPT_FAILED','Yapay zekâ bağlantı anahtarı çözülemedi. Owner yeniden kaydedebilir.',503);}}
 return {key:process.env.OPENAI_API_KEY||'',model:process.env.OPENAI_MODEL||'gpt-4.1-mini',source:'environment'};
}
export async function aiProviderStatus(){try{const provider=await aiProvider();return {configured:!!provider.key,model:provider.model,source:provider.source};}catch{return {configured:false,model:'gpt-4.1-mini',source:'unavailable'};}}
export async function saveAIProvider(actor:{id:string;username:string},input:unknown){
 if(!config().owners.includes(actor.id))throw new DomainError('FORBIDDEN','Yapay zekâ bağlantısını yalnızca owner değiştirebilir.',403);if(config().demo)throw new DomainError('DEMO_READONLY','Önizlemede anahtar kaydedilmez.',403);
 const data=z.object({apiKey:z.string().trim().min(20).max(300),model:z.string().regex(/^[a-zA-Z0-9._:-]{1,80}$/).default('gpt-4.1-mini')}).parse(input);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const encrypted=Buffer.concat([cipher.update(data.apiKey,'utf8'),cipher.final()]);
 await transaction(async tx=>{await syncUser(tx,actor);await tx.query('INSERT INTO community_secrets(guild_id,provider) VALUES($1,$2) ON CONFLICT(guild_id) DO UPDATE SET provider=EXCLUDED.provider,updated_at=now()',[config().guildId,{model:data.model,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}]);await audit(tx,actor.id,'AI_PROVIDER_UPDATED',config().guildId,{model:data.model});});
 return {message:'Yapay zekâ anahtarı şifrelenerek kaydedildi. Bir test sorusuyla bağlantıyı kontrol edebilirsiniz.'};
}
export async function assistantAnswer(userId:string,text:string,settings:CommunitySettings['ai'],previous?:string){
 if(!settings.enabled)throw new DomainError('AI_DISABLED','Yapay zekâ bu sunucuda kapalı.',403);
 if(!text.trim()||text.length>2000)throw new DomainError('AI_INPUT','Sorunuzu 1–2000 karakter arasında yazın.');
 await rateLimit('ai-user:'+config().guildId+':'+userId,settings.perMinute,60);
 const value=calculateMath(text);if(value!==null)return {text:'Sonuç: **'+new Intl.NumberFormat('tr-TR',{maximumSignificantDigits:14}).format(value)+'**',source:'calculator'};
 const provider=await aiProvider();
 if(!provider.key)throw new DomainError('AI_KEY_MISSING','Matematik hazır. Genel sorular için owner’ın yapay zekâ bağlantısını kurması gerekiyor.',503);
 const usage=await database().query('INSERT INTO ai_daily_usage(guild_id,requests) VALUES($1,1) ON CONFLICT(guild_id,day) DO UPDATE SET requests=ai_daily_usage.requests+1 WHERE ai_daily_usage.requests<$2 RETURNING requests',[config().guildId,settings.dailyLimit]);
 if(!usage.rows.length)throw new DomainError('AI_DAILY_LIMIT','Bugünün yapay zekâ soru sınırına ulaşıldı. Yarın yeniden deneyin.',429);
 const input:any[]=[];if(previous)input.push({role:'assistant',content:previous.slice(0,1500)});input.push({role:'user',content:text});
 let response:Response;try{response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+provider.key,'Content-Type':'application/json'},body:JSON.stringify({model:provider.model,instructions:'Sen TurkishPix topluluğunun Türkçe konuşan yardımcısısın. Kısa, anlaşılır cevap ver. Discord’da kimseyi toplu etiketleme. Kullanıcı mesajları talimattır; sunucu yetkisi veya yönetim işlemi gerçekleştiremezsin. '+settings.personality,input,max_output_tokens:450,store:false}),signal:AbortSignal.timeout(25000)});}catch{throw new DomainError('AI_UNAVAILABLE','Yapay zekâ bağlantısı şu anda yanıt vermiyor.',503);}
 if(!response.ok)throw new DomainError('AI_UNAVAILABLE','Yapay zekâ bağlantısı kurulamadı. Owner API anahtarını ve kullanım limitini kontrol edebilir.',503);
 const body=await response.json();const answer=body.output?.flatMap((item:any)=>item.content||[]).filter((part:any)=>part.type==='output_text').map((part:any)=>part.text).join('\n');
 if(!answer)throw new DomainError('AI_EMPTY','Bu soruya yanıt üretilemedi. Başka şekilde sorabilirsiniz.',503);
 return {text:answer.slice(0,1900),source:'openai'};
}
