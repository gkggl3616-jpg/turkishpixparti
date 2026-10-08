import {config,DomainError} from './config';
import {discordRequest} from './discord';
export type ApplicationConnection={verified:boolean;redirectRegistered:boolean|null;owner:{id:string;username:string}|null;error?:string};
let cached:{key:string;expires:number;value:ApplicationConnection}|undefined;
let pending:{key:string;value:Promise<ApplicationConnection>}|undefined;
export function resetApplicationCache(){cached=undefined;pending=undefined;}
export async function applicationConnection():Promise<ApplicationConnection>{
 const c=config(),key=c.clientId+':'+c.appUrl+':'+c.botToken;
 if(cached?.key===key&&cached.expires>Date.now())return cached.value;
 if(pending?.key===key)return pending.value;
 const task=(async()=>{
  try{
   if(!c.botToken)throw new DomainError('BOT_NOT_CONFIGURED','Bot bağlantısı henüz hazır değil.',503);
   const app=await discordRequest('/applications/@me');
   if(app.id!==c.clientId)throw new DomainError('APPLICATION_MISMATCH','Bot ve OAuth uygulama kimlikleri farklı.',503);
   const value:ApplicationConnection={verified:true,redirectRegistered:Array.isArray(app.redirect_uris)?app.redirect_uris.includes(c.appUrl+'/api/auth/callback'):null,owner:app.owner?{id:app.owner.id,username:app.owner.username}:null};
   cached={key,expires:Date.now()+30000,value};return value;
  }catch(e){const value:ApplicationConnection={verified:false,redirectRegistered:null,owner:null,error:e instanceof DomainError?e.message:'Discord uygulaması doğrulanamadı.'};cached={key,expires:Date.now()+10000,value};return value;}
 })();pending={key,value:task};try{return await task;}finally{if(pending?.value===task)pending=undefined;}
}
