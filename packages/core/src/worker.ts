import {database,transaction} from './db';
import {closeBallot} from './service';
import {config} from './config';
import {discordRequest} from './discord';
import {ROLE_LABELS,roleMappings,desiredRole,assertManageableRole} from './roles';
import {roleKeySchema} from './validation';
import {audit} from './audit';
import {createHash} from 'node:crypto';
function nonce(id:string){return createHash('sha256').update(id).digest('hex').slice(0,24);}
export async function processOutbox(){
 const job=await transaction(async tx=>{
  await tx.query("UPDATE outbox SET status='PENDING',locked_at=NULL WHERE status='PROCESSING' AND locked_at<now()-interval '2 minutes'");
  const j=(await tx.query("SELECT * FROM outbox WHERE status='PENDING' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
  if(j)await tx.query("UPDATE outbox SET status='PROCESSING',locked_at=now(),attempts=attempts+1 WHERE id=$1",[j.id]);return j;
 });
 if(!job)return false;
 try{
  const c=config();const p=job.payload;
  if(job.kind==='LOG'){
   if(!c.logChannel)throw new Error('DISCORD_LOG_CHANNEL_ID eksik');
   await discordRequest(`/channels/${c.logChannel}/messages`,{method:'POST',body:JSON.stringify({content:p.text+'\n'+c.appUrl+'/?view=basvurular',allowed_mentions:{parse:[]},nonce:nonce(job.id),enforce_nonce:true})});
  }else if(['ROLE_ADD','ROLE_REMOVE','ROLE_SYNC','ROLE_UNMAP'].includes(job.kind)){
   const key=roleKeySchema.parse(p.roleKey||'MP');
   await transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(1557484055)');
    const mappings=await roleMappings(tx);const roleId=job.kind==='ROLE_UNMAP'?p.roleId:mappings[key];
    if(!roleId)return;
    let enabled=await desiredRole(tx,p.userId,key);
    if(job.kind==='ROLE_UNMAP'){
     for(const currentKey of Object.keys(ROLE_LABELS))if(mappings[currentKey as keyof typeof ROLE_LABELS]===roleId&&await desiredRole(tx,p.userId,currentKey as keyof typeof ROLE_LABELS))return;
     enabled=false;
    }
    await assertManageableRole(roleId);
    await discordRequest(`/guilds/${c.guildId}/members/${p.userId}/roles/${roleId}`,{method:enabled?'PUT':'DELETE',headers:{'X-Audit-Log-Reason':encodeURIComponent(('TurkishPix: '+(p.reason||'Görev eşitlemesi')).slice(0,180))}});
    await audit(tx,'SYSTEM','DISCORD_ROLE_SYNCED',p.userId,{roleKey:key,roleId,enabled,jobId:job.id});
   });
  }else if(job.kind==='BALLOT_OPEN'||job.kind==='BALLOT_CLOSE'){
   const b=(await database().query('SELECT b.*,i.title,i.description FROM ballots b JOIN items i ON i.id=b.item_id WHERE b.id=$1',[p.ballotId])).rows[0];
   if(!b)throw new Error('Oylama bulunamadı');
   const closed=b.state==='CLOSED';const components=closed?[]:b.options.length<=5?[{type:1,components:b.options.map((o:any)=>({type:2,style:o.id==='YES'?3:o.id==='NO'?4:2,label:o.label.slice(0,80),custom_id:`vote:${b.id}:${o.id}`}))}]:[{type:1,components:[{type:3,custom_id:`elect:${b.id}`,placeholder:'Oy vereceğiniz partiyi seçin',min_values:1,max_values:1,options:b.options.map((o:any)=>({label:o.label.slice(0,100),value:o.id}))}]}];
   const resultText=closed?`\n\n${b.result.passed?'Kabul edildi':'Kabul edilmedi'}\n${b.options.map((o:any)=>`${o.label}: ${b.result.totals[o.id]||0}`).join(' · ')}`:'';
   const body={embeds:[{title:b.title.slice(0,256),description:b.description.slice(0,1500)+resultText,color:closed?b.result.passed?0x43b982:0xdd454c:0xd6ad55,fields:[{name:'Oylama',value:b.audience==='MP'?'TBMM milletvekilleri':'TurkishPix halk oylaması'},{name:'Bitiş',value:`<t:${Math.floor(new Date(b.ends_at).getTime()/1000)}:F>`}],footer:{text:'TurkishPix • Her Discord hesabı bir oy'},url:c.appUrl+'/?view=oylamalar'}],components,allowed_mentions:{parse:[]},nonce:nonce('ballot:'+b.id),enforce_nonce:true};
   if(b.discord_message_id)await discordRequest(`/channels/${b.discord_channel_id}/messages/${b.discord_message_id}`,{method:'PATCH',body:JSON.stringify(body)});
   else{
    if(!c.voteChannel)throw new Error('DISCORD_VOTE_CHANNEL_ID eksik');
    const msg=await discordRequest(`/channels/${c.voteChannel}/messages`,{method:'POST',body:JSON.stringify(body)});
    await database().query('UPDATE ballots SET discord_channel_id=$2,discord_message_id=$3 WHERE id=$1',[b.id,c.voteChannel,msg.id]);
   }
  }
  await database().query("UPDATE outbox SET status='DONE',locked_at=NULL,last_error=NULL WHERE id=$1",[job.id]);
 }catch(e){
  const safeError=e instanceof Error?e.message.slice(0,300):'Discord gönderim hatası';
  await database().query("UPDATE outbox SET status='PENDING',locked_at=NULL,available_at=now()+$2*interval '1 second',last_error=$3 WHERE id=$1",[job.id,Math.min(3600,5*2**Math.min(job.attempts,10)),safeError]);
 }
 return true;
}
export async function workerTick(){
 const due=(await database().query("SELECT id FROM ballots WHERE state='OPEN' AND ends_at<=now() ORDER BY ends_at LIMIT 30")).rows;
 for(const b of due)await closeBallot(b.id);
 for(let n=0;n<10;n++)if(!await processOutbox())break;
 await database().query('DELETE FROM sessions WHERE expires_at<now()');await database().query('DELETE FROM oauth_states WHERE expires_at<now()');await database().query('DELETE FROM rate_limits WHERE expires_at<now()');
}
