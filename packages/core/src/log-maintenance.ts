import {config} from './config';
import {database} from './db';
import {discordRequest} from './discord';
import {securityEmbed} from './presentation';

/** Recognize only the bot's old security template, never arbitrary member text. */
export function legacySecurityEmbed(content:string,panelUrl:string){
 const header=content.split('\n')[0].replace(/\*\*/g,'').trim();
 if(!/^🛡️\s+TurkishPix (sohbet koruması|güvenlik)$/u.test(header))return null;
 const field=(name:string)=>content.match(new RegExp('^'+name+':\\s*([^\\n]+)','m'))?.[1]?.trim();
 const userId=field('Üye')||field('Kullanıcı'),channelId=field('Kanal'),rule=field('Kural'),action=field('İşlem');
 if(!userId||!/^\d{17,20}$/.test(userId)||(channelId&&!/^\d{17,20}$/.test(channelId))||!rule||!action)return null;
 const ruleLabel=({SPAM:'Mesaj spamı',MASS_MENTION:'Aşırı etiket',DISCORD_INVITE:'Discord daveti',EXTERNAL_LINK:'Dış bağlantı',NEW_ACCOUNT:'Yeni hesap',JOIN_BURST:'Yoğun üye girişi'} as Record<string,string>)[rule]||rule;
 const count=field('Son ihlal sayısı');
 return securityEmbed({userId,username:'Üye',channelId,rule:ruleLabel,action,source:field('Kaynak'),hits:count&&/^\d+$/.test(count)?Number(count):undefined,caseId:field('Kayıt')},panelUrl);
}

/** Repair recent bot-owned messages once; audit records and message IDs stay intact. */
export async function repairLegacySecurityLogs(botId:string,channelIds:string[]){
 const c=config(),channels=[...new Set(channelIds.filter(id=>/^\d{17,20}$/.test(id)))];
 let repaired=0;
 for(const channelId of channels){
  const marker='security-log-presentation-v2:'+channelId;
  if((await database().query('SELECT name FROM integration_status WHERE name=$1',[marker])).rows.length)continue;
  const channel=await discordRequest('/channels/'+channelId);
  if(channel.guild_id!==c.guildId)continue;
  const messages=await discordRequest('/channels/'+channelId+'/messages?limit=100');
  let count=0;
  for(const message of messages){
   if(message.author?.id!==botId)continue;
   const oldText=message.content||message.embeds?.[0]?.description||'';
   const embed=legacySecurityEmbed(oldText,c.appUrl);if(!embed)continue;
   embed.timestamp=message.timestamp;
   await discordRequest('/channels/'+channelId+'/messages/'+message.id,{method:'PATCH',body:JSON.stringify({content:null,embeds:[embed],allowed_mentions:{parse:[]}})});
   count++;repaired++;
  }
  await database().query('INSERT INTO integration_status(name,status) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[marker,{repaired:count,scanned:messages.length}]);
 }
 return {repaired};
}
