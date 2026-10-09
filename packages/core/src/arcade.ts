import {randomInt} from 'node:crypto';
import {z} from 'zod';
import {config,DomainError} from './config';
import {database,transaction} from './db';
import {syncUser,discordRequest} from './discord';
import {audit} from './audit';
import {featureMutation,memberProfile,type FeatureActor} from './features';
import {communitySettings} from './community';
import {arcadeGames,COMMUNITY_CURRENCY_CAMPAIGN,COMMUNITY_CURRENCY_AMOUNT} from './arcade-policy';
async function arcadeMember(actor:FeatureActor){
 if(config().demo)throw new DomainError('DEMO_READONLY','Oyun salonunda Discord hesabınla giriş yap.');
 const member=await discordRequest('/guilds/'+config().guildId+'/members/'+actor.id);
 if(!member||member.pending||member.user?.bot)throw new DomainError('NOT_MEMBER','Sunucu üyeliğini ve doğrulamayı tamamla.',403);
 const settings=await communitySettings();if(!settings.entertainment.enabled||!settings.features.enabled||!settings.features.economy)throw new DomainError('ARCADE_DISABLED','Oyun salonu veya sanal ekonomi kapalı.',403);
}
export async function arcadeOverview(actor?:FeatureActor|null){
 if(!actor)return {games:arcadeGames,me:null};await arcadeMember(actor);
 const profile=await memberProfile(actor.id),active=(await database().query("SELECT id,game,cost,seed,created_at,expires_at FROM arcade_sessions WHERE guild_id=$1 AND user_id=$2 AND status='ACTIVE' AND expires_at>now() ORDER BY created_at DESC LIMIT 1",[config().guildId,actor.id])).rows[0]||null;
 const history=(await database().query("SELECT game,cost,score,outcome,created_at FROM arcade_sessions WHERE guild_id=$1 AND user_id=$2 AND status='DONE' ORDER BY created_at DESC LIMIT 6",[config().guildId,actor.id])).rows;
 return {games:arcadeGames,me:{id:actor.id,username:actor.username,avatar:actor.avatar,coins:profile.coins},active,history};
}
const startSchema=z.object({game:z.enum(['neon','memory','orbit']),requestId:z.uuid()});
export async function startArcade(actor:FeatureActor,input:unknown){
 const data=startSchema.parse(input);await arcadeMember(actor);const game=arcadeGames.find(g=>g.id===data.game)!;
 return featureMutation(actor,'arcade-start:'+data.requestId,async tx=>{
  await tx.query("UPDATE arcade_sessions SET status='EXPIRED' WHERE guild_id=$1 AND user_id=$2 AND status='ACTIVE' AND expires_at<=now()",[config().guildId,actor.id]);
  const active=(await tx.query("SELECT id,game,cost,seed,created_at,expires_at FROM arcade_sessions WHERE guild_id=$1 AND user_id=$2 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1",[config().guildId,actor.id])).rows[0];
  if(active){const coins=(await tx.query('SELECT coins FROM member_profiles WHERE guild_id=$1 AND user_id=$2',[config().guildId,actor.id])).rows[0]?.coins||0;return {...active,coins,reused:true};}
  await tx.query('INSERT INTO member_profiles(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[config().guildId,actor.id]);
  const wallet=(await tx.query('UPDATE member_profiles SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins>=$3 RETURNING coins',[config().guildId,actor.id,game.cost])).rows[0];
  if(!wallet)throw new DomainError('NO_COINS','Bakiyen bu tur için yetersiz. /gunluk ile bot bakiyesi kazanabilirsin.');
  const record=(await tx.query('INSERT INTO arcade_sessions(guild_id,user_id,game,cost,seed) VALUES($1,$2,$3,$4,$5) RETURNING id,game,cost,seed,created_at,expires_at',[config().guildId,actor.id,game.id,game.cost,randomInt(1,2147483647)])).rows[0];
  await audit(tx,actor.id,'ARCADE_ENTRY',record.id,{game:game.id,cost:game.cost});return {...record,coins:wallet.coins,reused:false};
 },[actor.id]);
}
export async function finishArcade(actor:FeatureActor,input:unknown){
 const data=z.object({id:z.uuid(),outcome:z.enum(['WIN','LOSE','QUIT']),score:z.number().int().min(0).max(100000)}).parse(input);await arcadeMember(actor);
 return featureMutation(actor,'arcade-finish:'+data.id,async tx=>{
  const row=(await tx.query('SELECT * FROM arcade_sessions WHERE id=$1 AND guild_id=$2 AND user_id=$3 FOR UPDATE',[data.id,config().guildId,actor.id])).rows[0];
  if(!row)throw new DomainError('ARCADE_SESSION','Bu tur sana ait değil.',403);
  if(row.status!=='ACTIVE')return {id:row.id,status:row.status,coins:(await memberProfile(actor.id)).coins};
  const status=new Date(row.expires_at).getTime()<=Date.now()?'EXPIRED':'DONE';await tx.query("UPDATE arcade_sessions SET status=$2,outcome=$3,score=$4 WHERE id=$1",[row.id,status,data.outcome,data.score]);
  // Browser scores are personal records; they never mint currency or competitive rewards.
  await audit(tx,actor.id,'ARCADE_FINISHED',row.id,{game:row.game,outcome:data.outcome});return {id:row.id,status};
 });
}
export async function currencyCampaignStatus(){
 const row=(await database().query('SELECT id,status,jsonb_array_length(recipients) AS recipients,(SELECT count(*)::int FROM community_currency_grants WHERE campaign_id=c.id) AS paid FROM community_currency_campaigns c WHERE id=$1 AND guild_id=$2',[COMMUNITY_CURRENCY_CAMPAIGN,config().guildId])).rows[0];return row||null;
}
export async function snapshotCurrencyCampaign(members:FeatureActor[]){
 const selected=z.array(z.object({id:z.string().regex(/^\d{17,20}$/),username:z.string().min(1).max(100),avatar:z.string().nullable().optional()})).min(1).max(10000).parse(members);
 const recipients=[...new Map(selected.map(member=>[member.id,member])).values()];
 await transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[COMMUNITY_CURRENCY_CAMPAIGN]);await tx.query('INSERT INTO community_currency_campaigns(id,guild_id,amount,recipients) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[COMMUNITY_CURRENCY_CAMPAIGN,config().guildId,COMMUNITY_CURRENCY_AMOUNT,JSON.stringify(recipients)]);});return currencyCampaignStatus();
}
export async function applyCurrencyCampaignBatch(){
 return transaction(async tx=>{
  const campaign=(await tx.query('SELECT * FROM community_currency_campaigns WHERE id=$1 AND guild_id=$2 FOR UPDATE',[COMMUNITY_CURRENCY_CAMPAIGN,config().guildId])).rows[0];
  if(!campaign)throw new DomainError('CURRENCY_SNAPSHOT','Önce sunucu üyeleri doğrulanmalı.');
  const paid=new Set((await tx.query('SELECT user_id FROM community_currency_grants WHERE campaign_id=$1',[campaign.id])).rows.map(r=>r.user_id));
  const batch=(campaign.recipients as FeatureActor[]).filter(actor=>!paid.has(actor.id)).slice(0,50).sort((a,b)=>a.id.localeCompare(b.id));
  for(const actor of batch){
   await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['profile:'+config().guildId+':'+actor.id]);await syncUser(tx,actor);
   await tx.query('INSERT INTO member_profiles(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[config().guildId,actor.id]);
   const credited=await tx.query('UPDATE member_profiles SET coins=coins+$3 WHERE guild_id=$1 AND user_id=$2 AND coins+$3<=1000000 RETURNING coins',[config().guildId,actor.id,campaign.amount]);
   if(!credited.rows.length)throw new DomainError('WALLET_FULL','Dağıtımda cüzdan sınırı kontrolü gerekiyor.');
   await tx.query('INSERT INTO community_currency_grants(campaign_id,user_id,amount) VALUES($1,$2,$3)',[campaign.id,actor.id,campaign.amount]);
  }
  const completed=paid.size+batch.length,total=campaign.recipients.length;
  if(completed===total)await tx.query("UPDATE community_currency_campaigns SET status='DONE',completed_at=COALESCE(completed_at,now()) WHERE id=$1",[campaign.id]);
  if(batch.length)await audit(tx,config().clientId,'COMMUNITY_CURRENCY_GRANTED',campaign.id,{members:batch.length,amount:campaign.amount,completed,total});
  return {done:completed===total,paid:completed,recipients:total,amount:campaign.amount};
 });
}
