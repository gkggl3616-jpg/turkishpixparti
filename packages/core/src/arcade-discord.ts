import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {config,DomainError} from './config';
import {featureMutation,type FeatureActor} from './features';
import {arcadeMember} from './arcade';
import {arcadeGames,arcadeNativeIds,type ArcadeBoardGame} from './arcade-policy';
import {createGame} from './entertainment-games';
import {checkEntertainment,getEntertainmentSession} from './entertainment';
import {communitySettings} from './community';
import {audit} from './audit';
// A confirmation nonce is persisted with the debit: retries cannot charge twice.
export async function startDiscordArcade(actor:FeatureActor,channelId:string,game:ArcadeBoardGame,nonce:string){
 z.enum(arcadeNativeIds).parse(game);z.uuid().parse(nonce);z.string().regex(/^\d{17,20}$/).parse(channelId);
 await arcadeMember(actor);const settings=await communitySettings();checkEntertainment(settings.entertainment,game,channelId);
 const catalog=arcadeGames.find(g=>g.id===game)!;
 const receipt=await featureMutation(actor,'discord-arcade:'+nonce,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['fun:'+config().guildId+':'+actor.id]);
  const active=(await tx.query("SELECT count(*)::int AS n FROM entertainment_sessions WHERE guild_id=$1 AND owner_id=$2 AND status='ACTIVE' AND expires_at>now()",[config().guildId,actor.id])).rows[0].n;
  if(active>=3)throw new DomainError('TOO_MANY_GAMES','Aynı anda en fazla üç oyun açık olabilir. Önce birini bitir.');
  await tx.query('INSERT INTO member_profiles(guild_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[config().guildId,actor.id]);
  const wallet=(await tx.query('UPDATE member_profiles SET coins=coins-$3 WHERE guild_id=$1 AND user_id=$2 AND coins>=$3 RETURNING coins',[config().guildId,actor.id,catalog.cost])).rows[0];
  if(!wallet)throw new DomainError('NO_COINS','Bakiyen yetersiz. /gunluk ile Bot TL kazanabilirsin.');
  const id=randomUUID(),state={...createGame(game),entryCost:catalog.cost};
  await tx.query("INSERT INTO entertainment_sessions(id,guild_id,channel_id,owner_id,kind,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '12 minutes')",[id,config().guildId,channelId,actor.id,game,state]);
  await audit(tx,actor.id,'DISCORD_ARCADE_ENTRY',id,{game,cost:catalog.cost});return {sessionId:id,coins:wallet.coins};
 },[actor.id]);
 const session=await getEntertainmentSession(receipt.sessionId);
 if(!session||session.owner_id!==actor.id||session.channel_id!==channelId)throw new DomainError('GAME_NOT_FOUND','Bu oyun başka bir kanalda başlatılmış.');
 return {session,coins:receipt.coins};
}
