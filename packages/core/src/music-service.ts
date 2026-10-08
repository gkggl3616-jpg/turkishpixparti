import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {ownerOnly} from './service';
import {config,DomainError} from './config';
import {transaction,database} from './db';
import {discordRequest,syncUser} from './discord';
import {audit} from './audit';
import {communitySettings} from './community';
export const musicJobSchema=z.object({channelId:z.string().regex(/^\d{17,20}$/),action:z.enum(['katil','ayril','oynat','radyo','duraklat','devam','atla','durdur','ses','tekrar','karistir','temizle','cikar','tasi','ileri']),url:z.string().max(1500).optional(),title:z.string().trim().max(120).optional(),station:z.string().max(20).optional(),index:z.number().int().min(1).max(100).optional(),target:z.number().int().min(1).max(100).optional(),volume:z.number().int().min(1).max(100).optional(),mode:z.enum(['OFF','TRACK','QUEUE']).optional(),seconds:z.number().int().min(0).max(14400).optional()});
export async function queueMusicJob(actor:{id:string;username:string;avatar?:string|null},input:unknown){
 ownerOnly(actor);if(config().demo)throw new DomainError('DEMO_READONLY','Önizlemede ses bağlantısı kurulmaz.',403);const data=musicJobSchema.parse(input),settings=(await communitySettings()).music;if(!settings.enabled)throw new DomainError('MUSIC_DISABLED','Müzik modülü kapalı.');
 if(settings.channelIds.length&&!settings.channelIds.includes(data.channelId))throw new DomainError('MUSIC_CHANNEL','Bu ses kanalı müzik için açık değil.');
 const heartbeat=(await database().query("SELECT status,updated_at FROM integration_status WHERE name='discord'")).rows[0];if(!heartbeat?.status?.connected||Date.now()-new Date(heartbeat.updated_at).getTime()>30000)throw new DomainError('BOT_OFFLINE','Bot bağlantısı bekleniyor.',503);
 const ch=await discordRequest('/channels/'+data.channelId);if(ch.guild_id!==config().guildId||ch.type!==2)throw new DomainError('VOICE_CHANNEL','Bu sunucudan normal bir ses kanalı seçin.');
 const id=randomUUID();await transaction(async tx=>{await tx.query('SELECT pg_advisory_xact_lock(1557484057)');if((await tx.query("SELECT id FROM music_jobs WHERE guild_id=$1 AND status='QUEUED'",[config().guildId])).rows.length>=20)throw new DomainError('MUSIC_BUSY','Müzik işlemleri yoğun. Biraz sonra deneyin.',429);await syncUser(tx,actor);await tx.query('INSERT INTO music_jobs(id,guild_id,actor_id,channel_id,action,payload) VALUES($1,$2,$3,$4,$5,$6)',[id,config().guildId,actor.id,data.channelId,data.action,data]);await audit(tx,actor.id,'MUSIC_REQUEST',id,{action:data.action,channelId:data.channelId});});return {id,message:'İşlem bota gönderildi. Sonuç birkaç saniye içinde görünür.'};
}
