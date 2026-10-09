import 'dotenv/config';
export const RELEASE_VERSION='2.14.2';
export const APPLICATION_ID = '1557484052133707896';
export const PUBLIC_KEY = '880bd59730ab7eeb5ba83a147634fd648c729a7cb2a3a87ad427bdae4c54a74d';
export type ServerSettings={guildId:string;voteChannel:string;logChannel:string};
let serverSettings:Partial<ServerSettings>={};
export function setServerSettings(settings:Partial<ServerSettings>){serverSettings={...settings};}
const integer = (name: string, fallback: number, min: number, max: number) => {
 const n=Number(process.env[name] ?? fallback); if(!Number.isInteger(n)||n<min||n>max) throw new Error(`Geçersiz ${name}`); return n;
};
export function config() {
 const owners=(process.env.DISCORD_OWNER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 return {
  appUrl:(process.env.APP_URL||'http://localhost:3000').replace(/\/$/,''),
  clientId:process.env.DISCORD_CLIENT_ID||APPLICATION_ID, publicKey:process.env.DISCORD_PUBLIC_KEY||PUBLIC_KEY,
  clientSecret:process.env.DISCORD_CLIENT_SECRET||'', botToken:process.env.DISCORD_BOT_TOKEN||'',
  guildId:serverSettings.guildId??process.env.DISCORD_GUILD_ID??'', voteChannel:serverSettings.voteChannel??process.env.DISCORD_VOTE_CHANNEL_ID??'',
  logChannel:serverSettings.logChannel??process.env.DISCORD_LOG_CHANNEL_ID??'', mpRole:process.env.DISCORD_MP_ROLE_ID||'', owners,
  quorum:integer('OWNER_APPROVAL_QUORUM',4,4,4), ballotHours:integer('BALLOT_HOURS',24,1,720),
  minVotes:integer('MIN_VOTES',1,1,1000000), minMemberAge:integer('MIN_MEMBER_AGE_HOURS',0,0,8760),
  sessionHours:integer('SESSION_HOURS',24,1,168), demo:process.env.DEMO_MODE==='true',
  auditKey:process.env.AUDIT_HMAC_KEY||'',
 };
}
export function readiness() {
 const c=config(); const checks={database:!!process.env.DATABASE_URL, oauth:!!c.clientSecret,
  bot:!!c.botToken, guild:/^\d{17,20}$/.test(c.guildId), owners:c.owners.length===4&&new Set(c.owners).size===4&&c.owners.every(s=>/^\d{17,20}$/.test(s)),
  voteChannel:/^\d{17,20}$/.test(c.voteChannel), logChannel:/^\d{17,20}$/.test(c.logChannel), audit:c.auditKey.length>=32};
 return {checks,ready:Object.values(checks).every(Boolean),demo:c.demo};
}
export class DomainError extends Error { constructor(public code:string, message:string,public status=400){super(message);} }
export function requireOperational() {
 if(!readiness().ready) throw new DomainError('NOT_CONFIGURED','Sunucu bağlantısı henüz tamamlanmadı.',503);
 if(config().demo) throw new DomainError('DEMO_READONLY','Önizlemede kayıt ve oy gönderimi kapalı.',403);
}
