import {randomUUID} from 'node:crypto';
import {type DB,database,transaction} from './db';
import {config,DomainError,requireOperational} from './config';
import {audit,enqueue} from './audit';
import {createSchema,approvalSchema,voteSchema,dhondt} from './validation';
import {guildMember,syncUser} from './discord';
import {ROLE_LABELS,validateRoleRequest,applyRoleRequest,queueRoleSync} from './roles';
export type Actor={id:string;username:string;avatar?:string|null};
export function isOwner(actor:Actor){return config().owners.includes(actor.id);}
export function ownerOnly(actor:Actor){if(!isOwner(actor))throw new DomainError('FORBIDDEN','Bu işlem yalnızca owner hesaplarına açık.',403);}
export async function isDeputy(id:string,db:DB=database()){return !!(await db.query('SELECT d.id FROM deputies d JOIN terms t ON t.id=d.term_id WHERE d.user_id=$1 AND d.revoked_at IS NULL AND t.ends_at IS NULL',[id])).rows.length;}
export async function checkActor(actor:Actor){requireOperational();await guildMember(actor.id);}
export async function createItem(actor:Actor,input:unknown){
 const data=createSchema.parse(input);const c=config();
 if(data.kind==='ROLE_ASSIGNMENT'){
  await validateRoleRequest(actor,data);const member=await guildMember(data.userId);
  await transaction(tx=>syncUser(tx,member.user));
 }
 return transaction(async tx=>{
  await syncUser(tx,actor);
  if(['ELECTION','APPOINTMENT','ROLE_ASSIGNMENT'].includes(data.kind))ownerOnly(actor);
  if((data.kind==='BILL'||data.kind==='DIRECTIVE')&&!isOwner(actor)&&!await isDeputy(actor.id,tx))throw new DomainError('MP_ONLY','Teklif sunmak için milletvekili olmalısınız.',403);
  let title:string;let description:string;let payload:any=data;
  if(data.kind==='PARTY'){
   if(data.leaderUsername.toLocaleLowerCase('tr-TR')!==actor.username.toLocaleLowerCase('tr-TR'))throw new DomainError('LEADER_MISMATCH','Başvuruyu lider kendi Discord hesabıyla göndermeli.');
   title=data.name;description=data.description;payload={...data,leaderId:actor.id};
   if((await tx.query('SELECT id FROM parties WHERE lower(name)=lower($1) OR lower(abbreviation)=lower($2)',[data.name,data.abbreviation])).rows.length)throw new DomainError('DUPLICATE_PARTY','Bu parti adı veya kısaltması kullanımda.');
   if((await tx.query("SELECT id FROM items WHERE kind='PARTY' AND author_id=$1 AND state IN ('OWNER_REVIEW','VOTING')",[actor.id])).rows.length)throw new DomainError('PENDING_PARTY','Sonuçlanmamış bir parti başvurunuz var.');
   if((await tx.query('SELECT id FROM parties WHERE leader_id=$1',[actor.id])).rows.length)throw new DomainError('ALREADY_LEADER','Zaten bir partinin liderisiniz.');
  }else if(data.kind==='APPOINTMENT'){
   title='Milletvekili ataması';description=data.reason;
   await validateAppointment(tx,data);
  }else if(data.kind==='ROLE_ASSIGNMENT'){
   title=ROLE_LABELS[data.roleKey]+(data.enabled?' rol ataması':' rol kaldırma');description=data.reason;
   await tx.query('SELECT pg_advisory_xact_lock(1557484055)');
   if((await tx.query("SELECT id FROM items WHERE kind='ROLE_ASSIGNMENT' AND payload->>'userId'=$1 AND payload->>'roleKey'=$2 AND state='OWNER_REVIEW'",[data.userId,data.roleKey])).rows.length)throw new DomainError('ROLE_REQUEST_PENDING','Bu hesap ve görev için inceleme bekleyen rol başvurusu var.');
  }else{
   title=data.title;description=data.description;
   if(data.kind==='ELECTION'){
    await tx.query('SELECT pg_advisory_xact_lock(1557484053)');
    if((await tx.query("SELECT id FROM items WHERE kind='ELECTION' AND state IN ('OWNER_REVIEW','VOTING')")).rows.length)throw new DomainError('ELECTION_PENDING','Devam eden bir seçim süreci var.');
    const parties=data.slates.map(s=>s.partyId);const candidates=data.slates.flatMap(s=>s.candidates);
    if(new Set(parties).size!==parties.length||new Set(candidates).size!==candidates.length)throw new DomainError('DUPLICATE_SLATE','Partiler ve adaylar seçimde yalnızca bir kez yer alabilir.');
    if((await tx.query('SELECT id FROM parties WHERE id=ANY($1::uuid[])',[parties])).rows.length!==parties.length)throw new DomainError('INVALID_PARTIES','Aday listesinde onaylı olmayan bir parti var.');
    if((await tx.query('SELECT id FROM users WHERE id=ANY($1::text[])',[candidates])).rows.length!==candidates.length)throw new DomainError('UNKNOWN_CANDIDATE','Tüm adaylar önce Discord ile panele giriş yapmalı.');
   }
  }
  const id=randomUUID();await tx.query('INSERT INTO items(id,kind,title,description,payload,author_id,owner_ids,approval_quorum,min_votes,ballot_hours) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,data.kind,title,description,payload,actor.id,JSON.stringify(c.owners),c.quorum,c.minVotes,data.kind==='ELECTION'?data.hours:c.ballotHours]);
  await audit(tx,actor.id,'ITEM_SUBMITTED',id,{kind:data.kind,title});
  await enqueue(tx,'LOG',{text:`Yeni başvuru: ${title} (${data.kind})`,itemId:id,actorId:actor.id},`submitted:${id}`);
  return {id,message:'Başvurunuz dört owner’ın incelemesine gönderildi.'};
 });
}
async function validateAppointment(tx:DB,data:any){
 const term=(await tx.query('SELECT * FROM terms WHERE id=$1 AND ends_at IS NULL',[data.termId])).rows[0];
 if(!term)throw new DomainError('NO_TERM','Aktif meclis dönemi bulunamadı. Önce bir seçim tamamlanmalı.');
 if(!(await tx.query('SELECT id FROM users WHERE id=$1',[data.userId])).rows.length)throw new DomainError('UNKNOWN_USER','Atanacak kişi önce Discord ile panele giriş yapmalı.');
 if(!(await tx.query('SELECT id FROM parties WHERE id=$1',[data.partyId])).rows.length)throw new DomainError('NO_PARTY','Parti bulunamadı.');
 const count=Number((await tx.query('SELECT count(*) AS count FROM deputies WHERE term_id=$1 AND revoked_at IS NULL',[data.termId])).rows[0].count);
 if(count>=term.seats)throw new DomainError('NO_SEAT','Bu dönemde boş milletvekili koltuğu kalmadı.');
 if((await tx.query('SELECT id FROM deputies WHERE user_id=$1 AND term_id=$2',[data.userId,data.termId])).rows.length)throw new DomainError('ALREADY_MP','Bu kişi bu döneme zaten atanmış.');
}
export async function approveItem(actor:Actor,input:unknown){
 ownerOnly(actor);const data=approvalSchema.parse(input);
 return transaction(async tx=>{
  const item=(await tx.query('SELECT * FROM items WHERE id=$1 FOR UPDATE',[data.itemId])).rows[0];
  if(!item)throw new DomainError('NOT_FOUND','Başvuru bulunamadı.',404);
  if(item.state!=='OWNER_REVIEW')throw new DomainError('NOT_REVIEWING','Bu başvuru artık owner incelemesinde değil.',409);
  if(!item.owner_ids.includes(actor.id))throw new DomainError('NOT_REVIEWER','Başvurunun owner listesinde değilsiniz.',403);
  // Worker ve eşleştirme işlemleriyle aynı kilit sırası: rol kilidi, ardından audit kilidi.
  if(item.kind==='ROLE_ASSIGNMENT')await tx.query('SELECT pg_advisory_xact_lock(1557484055)');
  if((await tx.query('SELECT owner_id FROM approvals WHERE item_id=$1 AND owner_id=$2',[item.id,actor.id])).rows.length)throw new DomainError('ALREADY_REVIEWED','Bu başvuru için kararınız zaten kaydedildi.',409);
  await tx.query('INSERT INTO approvals(item_id,owner_id,decision,reason) VALUES($1,$2,$3,$4)',[item.id,actor.id,data.decision,data.reason]);
  await audit(tx,actor.id,'OWNER_'+data.decision,item.id,{reason:data.reason});
  if(data.decision==='REJECT'){
   await tx.query("UPDATE items SET state='REJECTED',updated_at=now() WHERE id=$1",[item.id]);
   await enqueue(tx,'LOG',{text:`Başvuru reddedildi: ${item.title}. Gerekçe: ${data.reason}`,itemId:item.id,actorId:actor.id},`rejected:${item.id}`);
   return {message:'Başvuru gerekçenizle reddedildi.'};
  }
  const count=Number((await tx.query("SELECT count(*) AS count FROM approvals WHERE item_id=$1 AND decision='APPROVE'",[item.id])).rows[0].count);
  if(count<item.approval_quorum)return {message:`Onay kaydedildi (${count}/${item.approval_quorum}).`};
  if(item.kind==='ROLE_ASSIGNMENT'){
   await applyRoleRequest(tx,item,actor);
   await tx.query("UPDATE items SET state='PASSED',updated_at=now() WHERE id=$1",[item.id]);
   return {message:'Dört owner onayı tamamlandı. Discord rol işlemi kuyruğa eklendi.'};
  }
  if(item.kind==='APPOINTMENT'){
   await validateAppointment(tx,item.payload);await applyAppointment(tx,item,actor.id);
   await tx.query("UPDATE items SET state='PASSED',updated_at=now() WHERE id=$1",[item.id]);
   return {message:'Dört owner onayı tamamlandı. Milletvekili atandı.'};
  }
  const audience=['BILL','DIRECTIVE'].includes(item.kind)?'MP':'PUBLIC';
  let electorate:null|string[]=null;
  if(audience==='MP'){
   electorate=(await tx.query('SELECT d.user_id FROM deputies d JOIN terms t ON t.id=d.term_id WHERE t.ends_at IS NULL AND d.revoked_at IS NULL')).rows.map(r=>r.user_id);
   if(!electorate.length)throw new DomainError('NO_PARLIAMENT','Teklifin oylanabilmesi için aktif milletvekilleri gerekiyor.');
  }
  let options:any[]=[{id:'YES',label:'Kabul'},{id:'NO',label:'Ret'},{id:'ABSTAIN',label:'Çekimser'}];
  if(item.kind==='ELECTION'){
   const p=(await tx.query('SELECT id,name,abbreviation FROM parties WHERE id=ANY($1::uuid[])',[item.payload.slates.map((s:any)=>s.partyId)])).rows;
   options=item.payload.slates.map((s:any)=>({id:s.partyId,label:p.find(r=>r.id===s.partyId)?.abbreviation||s.partyId}));
  }
  const id=randomUUID();const endsAt=new Date(Date.now()+item.ballot_hours*3600000).toISOString();
  await tx.query('INSERT INTO ballots(id,item_id,audience,options,electorate,ends_at) VALUES($1,$2,$3,$4,$5,$6)',[id,item.id,audience,JSON.stringify(options),electorate?JSON.stringify(electorate):null,endsAt]);
  await tx.query("UPDATE items SET state='VOTING',updated_at=now() WHERE id=$1",[item.id]);
  await audit(tx,'SYSTEM','BALLOT_OPENED',id,{itemId:item.id,audience,endsAt,electorate,options});
  await enqueue(tx,'BALLOT_OPEN',{ballotId:id},`ballot-open:${id}`);
  return {message:audience==='MP'?'Owner onayları tamamlandı. Meclis oylaması açıldı.':'Owner onayları tamamlandı. Discord halk oylaması açıldı.',ballotId:id};
 });
}
export async function castVote(actor:Actor,input:unknown,interactionId?:string){
 const data=voteSchema.parse(input);
 return transaction(async tx=>{
  await syncUser(tx,actor);
  const b=(await tx.query('SELECT * FROM ballots WHERE id=$1 FOR UPDATE',[data.ballotId])).rows[0];
  if(!b)throw new DomainError('NOT_FOUND','Oylama bulunamadı.',404);
  if(b.state!=='OPEN'||new Date(b.ends_at).getTime()<=Date.now())throw new DomainError('BALLOT_CLOSED','Bu oylama sona erdi.',409);
  if(!b.options.some((o:any)=>o.id===data.choice))throw new DomainError('INVALID_CHOICE','Geçersiz oy seçeneği.');
  if(b.audience==='MP'&&(!b.electorate?.includes(actor.id)||!await isDeputy(actor.id,tx)))throw new DomainError('MP_ONLY','Bu oylama, açıldığı sırada görev yapan milletvekillerine açık.',403);
  if((await tx.query('SELECT user_id FROM votes WHERE ballot_id=$1 AND user_id=$2',[b.id,actor.id])).rows.length)throw new DomainError('ALREADY_VOTED','Bu oylamada oyunuz zaten kaydedildi.',409);
  await tx.query('INSERT INTO votes(ballot_id,user_id,choice,interaction_id) VALUES($1,$2,$3,$4)',[b.id,actor.id,data.choice,interactionId||null]);
  await audit(tx,actor.id,'VOTE_CAST',b.id,{choice:data.choice,source:interactionId?'DISCORD':'WEB'});
  return {message:'Oyunuz kaydedildi. Teşekkürler.'};
 });
}
async function applyAppointment(tx:DB,item:any,actor:string){
 const p=item.payload;await tx.query('INSERT INTO deputies(id,user_id,party_id,term_id,source_item_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),p.userId,p.partyId,p.termId,item.id]);
 await audit(tx,actor,'MP_APPOINTED',p.userId,{termId:p.termId,partyId:p.partyId,itemId:item.id});
 await enqueue(tx,'ROLE_ADD',{userId:p.userId},`mp-role:${item.id}:${p.userId}`);
}
export async function closeBallot(id:string){
 return transaction(async tx=>{
  const b=(await tx.query('SELECT * FROM ballots WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!b||b.state!=='OPEN'||new Date(b.ends_at).getTime()>Date.now())return null;
  const item=(await tx.query('SELECT * FROM items WHERE id=$1 FOR UPDATE',[b.item_id])).rows[0];
  const rows=(await tx.query('SELECT choice,count(*) AS count FROM votes WHERE ballot_id=$1 GROUP BY choice',[id])).rows;
  const totals:Record<string,number>=Object.fromEntries(b.options.map((o:any)=>[o.id,Number(rows.find(r=>r.choice===o.id)?.count||0)]));
  const total=Object.values(totals).reduce((a,n)=>a+n,0);let passed=total>=item.min_votes;
  if(item.kind!=='ELECTION')passed=passed&&(totals.YES||0)>(totals.NO||0)&&(totals.YES||0)>0;
  if(b.audience==='MP')passed=passed&&total>=Math.floor(b.electorate.length/2)+1;
  let allocation:any=null;
  if(passed&&item.kind==='PARTY'){
   const p=item.payload;
   await tx.query('INSERT INTO parties(id,item_id,name,abbreviation,logo,color,description,goals,leader_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[item.id,item.id,p.name,p.abbreviation,p.logo,p.color,p.description,p.goals,p.leaderId]);
   await tx.query('INSERT INTO party_members(user_id,party_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET party_id=EXCLUDED.party_id,joined_at=now()',[p.leaderId,item.id]);
   await queueRoleSync(tx,p.leaderId,'PARTY_LEADER','Parti halk oylamasında kabul edildi');
   await queueRoleSync(tx,p.leaderId,'PARTY_MEMBER','Parti halk oylamasında kabul edildi');
  }
  if(passed&&item.kind==='ELECTION'){
   await tx.query('SELECT pg_advisory_xact_lock(1557484053)');
   const previous=(await tx.query('SELECT d.user_id FROM deputies d JOIN terms t ON t.id=d.term_id WHERE t.ends_at IS NULL AND d.revoked_at IS NULL')).rows;
   await tx.query('UPDATE terms SET ends_at=now() WHERE ends_at IS NULL');
   const presidents=(await tx.query("SELECT user_id FROM discord_role_grants WHERE role_key='TBMM_PRESIDENT' AND enabled")).rows;
   for(const president of presidents)await queueRoleSync(tx,president.user_id,'TBMM_PRESIDENT','Yeni yasama dönemi');
   const termId=randomUUID();await tx.query('INSERT INTO terms(id,election_item_id,name,seats) VALUES($1,$2,$3,$4)',[termId,item.id,item.title,item.payload.seats]);
   allocation=dhondt(totals,item.payload.seats);
   const newlyAppointed=new Set<string>();
   for(const slate of item.payload.slates){for(const userId of slate.candidates.slice(0,allocation[slate.partyId]||0)){
    newlyAppointed.add(userId);await tx.query('INSERT INTO deputies(id,user_id,party_id,term_id,source_item_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),userId,slate.partyId,termId,item.id]);
    await enqueue(tx,'ROLE_ADD',{userId},`election-role:${item.id}:${userId}`);
   }}
   for(const old of previous)if(!newlyAppointed.has(old.user_id))await enqueue(tx,'ROLE_REMOVE',{userId:old.user_id},`election-role-remove:${item.id}:${old.user_id}`);
   await audit(tx,'SYSTEM','TERM_STARTED',termId,{election:item.id,allocation,seats:item.payload.seats,filled:newlyAppointed.size});
  }
  const result={totals,total,passed,allocation,closedAt:new Date().toISOString()};
  await tx.query("UPDATE ballots SET state='CLOSED',result=$2 WHERE id=$1",[id,result]);
  await tx.query('UPDATE items SET state=$2,updated_at=now() WHERE id=$1',[item.id,passed?'PASSED':'FAILED']);
  await audit(tx,'SYSTEM','BALLOT_CLOSED',id,result);
  await enqueue(tx,'BALLOT_CLOSE',{ballotId:id},`ballot-close:${id}`);
  return result;
 });
}
export async function membership(actor:Actor,partyId?:string){
 return transaction(async tx=>{
  if((await tx.query('SELECT id FROM parties WHERE leader_id=$1',[actor.id])).rows.length)throw new DomainError('LEADER_MEMBERSHIP','Parti liderinin üyeliği kuruluş kaydına bağlıdır.');
  if(partyId){if(!(await tx.query('SELECT id FROM parties WHERE id=$1',[partyId])).rows.length)throw new DomainError('NO_PARTY','Parti bulunamadı.');await tx.query('INSERT INTO party_members(user_id,party_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET party_id=EXCLUDED.party_id,joined_at=now()',[actor.id,partyId]);}
  else await tx.query('DELETE FROM party_members WHERE user_id=$1',[actor.id]);
  await audit(tx,actor.id,partyId?'PARTY_JOINED':'PARTY_LEFT',partyId||actor.id);
  await queueRoleSync(tx,actor.id,'PARTY_MEMBER',partyId?'Partiye katılım':'Partiden ayrılma');
  return {message:partyId?'Parti üyeliğiniz güncellendi.':'Partiden ayrıldınız.'};
 });
}
export async function overview(actor?:Actor){
 const db=database();const c=config();
 const [parties,items,ballots,deputies,terms,auditHead]=await Promise.all([
  db.query('SELECT p.*,u.username AS leader_username,(SELECT count(*) FROM party_members m WHERE m.party_id=p.id) AS members FROM parties p JOIN users u ON u.id=p.leader_id ORDER BY p.created_at DESC'),
  db.query("SELECT i.*,u.username AS author_username,COALESCE((SELECT jsonb_agg(jsonb_build_object('ownerId',a.owner_id,'username',ou.username,'decision',a.decision,'reason',a.reason,'createdAt',a.created_at)) FROM approvals a JOIN users ou ON ou.id=a.owner_id WHERE a.item_id=i.id),'[]'::jsonb) AS approvals FROM items i JOIN users u ON u.id=i.author_id ORDER BY i.created_at DESC LIMIT 200"),
  db.query("SELECT b.*,i.title,i.kind,COALESCE((SELECT jsonb_object_agg(v.choice,v.n) FROM (SELECT choice,count(*) AS n FROM votes WHERE ballot_id=b.id GROUP BY choice) v),'{}'::jsonb) AS totals FROM ballots b JOIN items i ON i.id=b.item_id ORDER BY b.created_at DESC LIMIT 200"),
  db.query('SELECT d.*,u.username,p.name AS party_name,p.abbreviation,p.color FROM deputies d JOIN terms t ON t.id=d.term_id JOIN users u ON u.id=d.user_id LEFT JOIN parties p ON p.id=d.party_id WHERE t.ends_at IS NULL AND d.revoked_at IS NULL ORDER BY p.name,u.username'),
  db.query('SELECT * FROM terms WHERE ends_at IS NULL'),db.query('SELECT seq,hash,created_at FROM audit_events ORDER BY seq DESC LIMIT 1')
 ]);
 let me:any=null;
 if(actor){const [v,m]=await Promise.all([db.query('SELECT ballot_id,choice FROM votes WHERE user_id=$1',[actor.id]),db.query('SELECT party_id FROM party_members WHERE user_id=$1',[actor.id])]);me={...actor,isOwner:isOwner(actor),ownerSlot:c.owners.indexOf(actor.id)+1,isDeputy:deputies.rows.some(d=>d.user_id===actor.id),votes:v.rows,membership:m.rows[0]?.party_id||null};}
 return {parties:parties.rows,items:items.rows,ballots:ballots.rows,deputies:deputies.rows,term:terms.rows[0]||null,auditHead:auditHead.rows[0]||null,me,rules:{owners:4,quorum:c.quorum,ballotHours:c.ballotHours,minVotes:c.minVotes,minMemberAge:c.minMemberAge},serverTime:new Date().toISOString()};
}
