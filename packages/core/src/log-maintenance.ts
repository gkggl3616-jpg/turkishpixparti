import {config,DomainError} from './config';
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
export async function repairLegacySecurityLogs(botId:string,channelIds:string[],pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 const c=config(),channels=[...new Set(channelIds.filter(id=>/^\d{17,20}$/.test(id)))];
 let repaired=0;
 for(const channelId of channels){
  const marker='security-log-presentation-v3:'+channelId;
  if((await database().query('SELECT name FROM integration_status WHERE name=$1',[marker])).rows.length)continue;
  const channel=await discordRequest('/channels/'+channelId);
  if(channel.guild_id!==c.guildId)continue;
  // The delivery ledger identifies our own messages without requiring Read Message History.
  const delivered=(await database().query("SELECT id,message_id,payload,sent_at FROM community_deliveries WHERE guild_id=$1 AND kind='SECURITY_LOG' AND status='SENT' AND message_id IS NOT NULL AND payload->>'channelId'=$2 ORDER BY sent_at DESC LIMIT 100",[c.guildId,channelId])).rows;
  const messages=delivered.length?delivered.filter(row=>!row.payload.logPresentationVersion).map(row=>({id:row.message_id,deliveryId:row.id,author:{id:botId},content:row.payload.content,embeds:row.payload.embeds,timestamp:new Date(row.sent_at).toISOString()})):await discordRequest('/channels/'+channelId+'/messages?limit=100');
  let count=0;
  for(const message of messages){
   if(message.author?.id!==botId)continue;
   const oldText=message.content||message.embeds?.[0]?.description||'';
   const embed=legacySecurityEmbed(oldText,c.appUrl);if(!embed)continue;
   embed.timestamp=message.timestamp;
   let success=false,deleted=false;
   for(let attempt=0;attempt<5;attempt++){
    const response=await fetch('https://discord.com/api/v10/channels/'+channelId+'/messages/'+message.id,{method:'PATCH',headers:{Authorization:'Bot '+c.botToken,'Content-Type':'application/json'},body:JSON.stringify({content:null,embeds:[embed],allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});
    if(response.status===429){const limit=await response.json();await pause(Math.max(1000,Math.min(60000,Math.ceil((Number(limit.retry_after)||2)*1000))));continue;}
    if(response.status===404){deleted=true;break;}
    if(!response.ok)throw new DomainError('LOG_REPAIR_FAILED','Log onarımı yanıt vermedi ('+response.status+').',503);
    success=true;break;
   }
   if(!success&&!deleted)throw new DomainError('LOG_REPAIR_RATE_LIMIT','Discord hız sınırı nedeniyle log onarımı sonraki turda devam edecek.',429);
   // Mark each completed message so a later retry starts where it stopped.
   if(message.deliveryId)await database().query("UPDATE community_deliveries SET payload=jsonb_set(payload,'{logPresentationVersion}','\"bright-v1\"'::jsonb) WHERE id=$1",[message.deliveryId]);
   if(success){count++;repaired++;await pause(1100);}
  }
  await database().query('INSERT INTO integration_status(name,status) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',[marker,{repaired:count,scanned:messages.length}]);
 }
 return {repaired};
}
