import {config,DomainError} from './config';
import {randomUUID} from 'node:crypto';
export async function discordRequest(path:string,init:RequestInit={},bearer?:string) {
 const response=await fetch('https://discord.com/api/v10'+path,{...init,headers:{'Content-Type':'application/json','Authorization':bearer?`Bearer ${bearer}`:`Bot ${config().botToken}`,...init.headers},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new DomainError('DISCORD_ERROR',`Discord bağlantısı yanıt vermedi (${response.status}).`,response.status===404?403:503);
 return response.status===204?null:response.json();
}
export async function guildMember(userId:string){
 const c=config();const member=await discordRequest(`/guilds/${c.guildId}/members/${userId}`);
 if(!member||member.pending)throw new DomainError('NOT_MEMBER','TurkishPix üyeliğini ve sunucu doğrulamasını tamamlayın.',403);
 if(c.minMemberAge&&Date.now()-new Date(member.joined_at).getTime()<c.minMemberAge*3600000)throw new DomainError('MEMBER_TOO_NEW',`Oy kullanmak için ${c.minMemberAge} saatlik sunucu üyeliği gerekiyor.`,403);
 return member;
}
export async function syncUser(tx:any,user:any){await tx.query('INSERT INTO users(id,username,avatar) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET username=EXCLUDED.username,avatar=EXCLUDED.avatar,last_seen_at=now()',[user.id,user.username,user.avatar||null]);}
