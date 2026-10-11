import {createHash} from 'node:crypto';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {discordRequest,discordBotIdentity,isDiscordMissing} from './discord';
import {ticketOverwrites} from './tickets';
import {getFeatureRecord,type FeatureRecord} from './features';
import {brightEmbed,userTag,theme} from './presentation';

export function ticketTranscript(r:FeatureRecord,messages:any[]){
 const lines=['TurkishPix • Destek görüşmesi','Bilet: '+r.id,'Kategori: '+r.title,'Talep sahibi: '+r.owner_id,'Kapatan: '+r.payload.closedBy,'Kapanış: '+r.payload.closeRequestedAt,'',...messages.flatMap(m=>{
  const author=m.author||{},name=m.member?.nick||author.global_name||author.username||'Bilinmeyen üye';
  return ['['+(m.timestamp||'Zaman bilinmiyor')+'] '+name+' (@'+(author.username||'?')+' • '+(author.id||'?')+')'+(m.edited_timestamp?' [düzenlendi: '+m.edited_timestamp+']':''),m.content||'',...(m.attachments||[]).map((a:any)=>'Dosya: '+(a.filename||'dosya')+' • '+a.url),...(m.embeds||[]).map((e:any)=>[e.title,e.description,...(e.fields||[]).map((f:any)=>f.name+': '+f.value)].filter(Boolean).join('\n')),''];
 })];return lines.join('\r\n');
}
export function transcriptParts(text:string,maxBytes=7*1024*1024){
 const parts:string[]=[];let current='',size=0;
 for(const line of text.split('\n')){const value=line+'\n',bytes=Buffer.byteLength(value);if(bytes>maxBytes)throw new DomainError('TICKET_TRANSCRIPT_SIZE','Görüşmedeki bir satır dosya sınırını aşıyor. Kanal korunuyor.');if(size+bytes>maxBytes){parts.push(current);current='';size=0;}current+=value;size+=bytes;}
 if(current)parts.push(current);return parts;
}
async function readMessages(channelId:string){
 const all:any[]=[];let before:string|undefined;
 for(let page=0;page<1000;page++){
  const batch=await discordRequest(`/channels/${channelId}/messages?limit=100`+(before?'&before='+before:''));
  if(!Array.isArray(batch))throw new DomainError('TICKET_TRANSCRIPT','Görüşme okunamadı; kanal korunuyor.');
  all.push(...batch);if(batch.length<100)return all.reverse();
  const next=batch.at(-1)?.id;if(!next||next===before)throw new DomainError('TICKET_TRANSCRIPT','Mesaj geçmişi tamamlanamadı; kanal korunuyor.');before=next;
 }
 throw new DomainError('TICKET_TRANSCRIPT_SIZE','Görüşme çok uzun; tam döküm hazırlanana kadar kanal korunuyor.');
}
/** Commit each upload receipt even if deletion fails; retries never delete before archiving. */
export async function archiveClosedTicket(id:string){
 const outcome=await transaction(async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['ticket-channel:'+id]);
  const r=await getFeatureRecord(id,tx,true);if(r.kind!=='TICKET'||r.status!=='CLOSED'||!r.payload.closeRequestedAt||r.payload.channelDeletedAt)return {record:r};
  try{
   const logId=r.payload.transcriptChannelId;if(!logId||logId===r.channel_id)throw new DomainError('TICKET_LOG','Görüşme dökümü için ayrı bir log kanalı seç.');
   let archive=(await tx.query('SELECT * FROM ticket_transcripts WHERE record_id=$1',[id])).rows[0];
   if(!archive){
    const self=await discordBotIdentity();
    await discordRequest('/channels/'+r.channel_id,{method:'PATCH',body:JSON.stringify({permission_overwrites:ticketOverwrites(r.guild_id,self.id,r.owner_id,r.payload.staffRoleIds,true)})});
    const messages=await readMessages(r.channel_id!);const content=ticketTranscript(r,messages);
    archive=(await tx.query('INSERT INTO ticket_transcripts(record_id,guild_id,channel_id,content,message_count) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,r.guild_id,logId,content,messages.length])).rows[0];
   }
   const parts=transcriptParts(archive.content),sent:string[]=[...(archive.log_message_ids||[])];
   for(let part=sent.length;part<parts.length;part++){
    const nonce=BigInt('0x'+createHash('sha256').update(id+':transcript:'+part).digest('hex').slice(0,16)).toString();
    const recent=await discordRequest(`/channels/${archive.channel_id}/messages?limit=100`);let message=recent.find((m:any)=>m.nonce===nonce);
    if(!message){const body=new FormData(),filename='ticket-'+id.slice(0,8)+(parts.length>1?'-'+(part+1):'')+'.txt';
     body.append('payload_json',JSON.stringify({embeds:[brightEmbed('📁 Bilet arşivlendi','Görüşmenin TXT dökümü ektedir.',[{name:'Talep sahibi',value:userTag(r.owner_id),inline:true},{name:'Kapatan',value:userTag(r.payload.closedBy),inline:true},{name:'Kategori',value:r.title,inline:true},{name:'Mesajlar',value:String(archive.message_count),inline:true},{name:'Kayıt',value:id}],theme.purple)],attachments:[{id:0,filename}],allowed_mentions:{parse:[]},nonce,enforce_nonce:true}));
     body.append('files[0]',new Blob([parts[part]],{type:'text/plain;charset=utf-8'}),filename);
     message=await discordRequest(`/channels/${archive.channel_id}/messages`,{method:'POST',body});
    }
    sent.push(message.id);await tx.query('UPDATE ticket_transcripts SET log_message_ids=$2 WHERE record_id=$1',[id,JSON.stringify(sent)]);
   }
   // Commit the confirmed archive and receipts before deleting the channel.
   await tx.query("UPDATE feature_records SET payload=payload||$2::jsonb WHERE id=$1",[id,JSON.stringify({transcriptMessageId:sent[0],transcriptChannelId:archive.channel_id})]);
   return {deleteChannel:r.channel_id};
  }catch(error){return {error};}
 });
 if(outcome.error)throw outcome.error;
 if(outcome.deleteChannel){
  try{await discordRequest('/channels/'+outcome.deleteChannel,{method:'DELETE'});}catch(e){if(!isDiscordMissing(e,10003))throw e;}
  return (await database().query("UPDATE feature_records SET payload=payload||jsonb_build_object('channelDeletedAt',now()::text),discord_updated_at=updated_at WHERE id=$1 RETURNING *",[id])).rows[0] as FeatureRecord;
 }
 return outcome.record as FeatureRecord;
}
