import {discordRequest} from './discord';
import type {OsintResult} from './osint';
// User-initiated research only. The bot never bulk-DMs server membership.
export function formatOsintDm(r:OsintResult,remaining:number):string{
 const body=r.items.map(x=>'**'+x.name.replaceAll('*','')+'**\n'+x.value.replace(/@everyone|@here/gi,'(mention)').slice(0,330)).join('\n\n');
 return ('🛰️ **TURKISH OSINT · '+r.title+'**\n*'+r.summary+'*\n\n'+body+'\n\n⚠️ '+r.notice+'\n📊 Kalan günlük hak: '+remaining).slice(0,1900);
}
export async function deliverOsintDm(userId:string,content:string):Promise<boolean>{
 try{
  const dm=await discordRequest('/users/@me/channels',{method:'POST',body:JSON.stringify({recipient_id:userId})});
  await discordRequest('/channels/'+dm.id+'/messages',{method:'POST',body:JSON.stringify({content:content.slice(0,1950),allowed_mentions:{parse:[]}})});
  return true;
 }catch{return false;}
}
