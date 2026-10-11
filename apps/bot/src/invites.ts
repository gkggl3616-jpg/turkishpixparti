import {Events,PermissionFlagsBits,type Client} from 'discord.js';
import {config,database,discordRequest,recordInviteJoin,recordInviteLeave,seedInviteMembers,inviteStatistics,brightEmbed,userTag,displayText,theme,type InviteSource} from '@turkishpix/core';
type Snapshot={code:string;uses:number;inviterId?:string;maxUses:number};
export function identifyInvite(before:Snapshot[],after:Snapshot[]):InviteSource{
 const old=new Map(before.map(x=>[x.code,x])),changes=after.filter(x=>x.uses>(old.get(x.code)?.uses??x.uses));
 if(changes.length===1&&changes[0].uses-(old.get(changes[0].code)?.uses||0)===1)return {source:'INVITE',code:changes[0].code,inviterId:changes[0].inviterId};
 // Expired/deleted codes and simultaneous joins cannot be attributed reliably.
 return {source:'UNKNOWN'};
}
export class InviteTracker{
 private snapshot:Snapshot[]|null=null;private sequence=Promise.resolve();private started=false;private refreshing:Promise<Snapshot[]>|null=null;
 constructor(private client:Client){}
 private serial(task:()=>Promise<unknown>){const run=this.sequence.catch(()=>{}).then(task);this.sequence=run.then(()=>{},()=>{});return run;}
 private async fetch(){if(this.refreshing)return this.refreshing;this.refreshing=(async()=>{const rows=await discordRequest(`/guilds/${config().guildId}/invites`);return rows.filter((x:any)=>!x.target_type).map((x:any)=>({code:x.code,uses:x.uses||0,inviterId:x.inviter?.id,maxUses:x.max_uses||0}));})();try{return await this.refreshing;}finally{this.refreshing=null;}}
 install(){
  this.client.on(Events.GuildMemberAdd,m=>{if(m.guild.id!==config().guildId||m.user.bot)return;void this.serial(async()=>{let source:InviteSource={source:'UNKNOWN'};try{const next=await this.fetch();if(this.snapshot)source=identifyInvite(this.snapshot,next);this.snapshot=next;}catch{console.error('INVITE_LOOKUP_PENDING');}await recordInviteJoin({id:m.id,username:m.user.username,joinedAt:m.joinedAt?.toISOString()||new Date().toISOString()},source);}).catch(()=>console.error('INVITE_JOIN_PENDING'));});
  this.client.on(Events.GuildMemberRemove,m=>{if(m.guild.id!==config().guildId||m.user.bot)return;void this.serial(()=>recordInviteLeave({id:m.id,username:m.user.username})).catch(()=>console.error('INVITE_LEAVE_PENDING'));});
  this.client.on(Events.InviteCreate,invite=>{if(invite.guild?.id!==config().guildId)return;void this.serial(async()=>{const next=await this.fetch();this.snapshot=next;}).catch(()=>{});});
 }
 async start(){
  if(this.started)return;this.started=true;
  try{await this.serial(async()=>{this.snapshot=await this.fetch();});}catch{console.error('INVITE_LOOKUP_PENDING');}
  const saved=(await database().query('SELECT baseline_complete FROM invite_tracking WHERE guild_id=$1',[config().guildId])).rows[0];if(saved?.baseline_complete)return;
  try{let after='';for(let n=0;n<1000;n++){const rows=await discordRequest(`/guilds/${config().guildId}/members?limit=1000`+(after?'&after='+after:''));await seedInviteMembers(rows.filter((m:any)=>!m.user.bot).map((m:any)=>({id:m.user.id,username:m.user.username,joinedAt:m.joined_at})));if(rows.length<1000){await database().query('UPDATE invite_tracking SET baseline_complete=true WHERE guild_id=$1',[config().guildId]);console.log('INVITE_TRACKING_READY',JSON.stringify({baseline:true,persistent:true}));return;}const next=rows.at(-1)?.user.id;if(!next||next===after)break;after=next;}}catch{this.started=false;console.error('INVITE_BASELINE_PENDING');}
 }
 async handle(i:any){
  if(!i.isChatInputCommand?.()||i.commandName!=='inv')return false;
  await i.deferReply({});try{
   if(i.guildId!==config().guildId)throw Error('Bu komut TurkishPix sunucusunda kullanılabilir.');
   const selected=i.options.getUser('uye')||i.user,s=await inviteStatistics(selected.id),guild=i.guild;
   let current:Snapshot[]=[];try{current=await this.fetch();}catch{}
   const uses=current.filter(x=>x.inviterId===selected.id).reduce((n,x)=>n+x.uses,0),counts=new Map<string,number>();for(const row of current)if(row.inviterId)counts.set(row.inviterId,(counts.get(row.inviterId)||0)+row.uses);
   const leaders=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,10),total=s.totals,member=s.member;
   await i.editReply({embeds:[brightEmbed('💎 Davet & üye merkezi',userTag(selected.id)+' için davet raporu',[{name:'🔗 Davet kullanımı',value:'**'+uses+'** · Mevcut bağlantılar',inline:true},{name:'✅ İzlenen giriş',value:'**'+member.joins+'**',inline:true},{name:'🟢 Hâlâ sunucuda',value:'**'+member.active+'**',inline:true},{name:'🚪 Davet edilenlerden ayrılan',value:'**'+member.leaves+'**',inline:true},{name:'🔄 Tekrar katılım',value:'**'+member.rejoins+'**',inline:true},{name:'👥 Sunucu',value:'**'+guild.memberCount+'** mevcut üye',inline:true},{name:'📈 Takip edilen hareketler',value:'Giriş **'+total.joins+'** · Çıkış **'+total.leaves+'** · Yeniden giriş **'+total.rejoins+'**\nDaveti belirlenemeyen **'+total.unknown+'**'},{name:'🏆 Davet sıralaması',value:leaders.map(([id,count],n)=>'**'+(n+1)+'.** '+userTag(id)+' · **'+count+'** kullanım').join('\n')||s.leaders.map((r:any,n:number)=>'**'+(n+1)+'.** '+userTag(r.inviter_id)+' · **'+r.joins+'** izlenen giriş').join('\n')||'Henüz davet kaydı yok.'},{name:'🕒 Kayıt dönemi',value:s.startedAt?'<t:'+Math.floor(new Date(s.startedAt).getTime()/1000)+':f> itibarıyla. Önceki çıkışlar Discord tarafından verilmez.':'Takip hazırlanıyor.'}],theme.purple)],allowedMentions:{parse:[]}});
  }catch(e){await i.editReply({embeds:[brightEmbed('Davet raporu',e instanceof Error?e.message:'Rapor yüklenemedi.')],allowedMentions:{parse:[]}});}return true;
 }
}
