import {MessageFlags} from 'discord.js';
import {config,DomainError} from '../../../packages/core/src/config';
import {osintRun,osintQuota,osintTools} from '../../../packages/core/src/osint';

const sub=(name:string,description:string,targetName:string,targetDescription:string)=>({type:1,name,description,options:[{type:3,name:targetName,description:targetDescription,required:true,max_length:250}]});
export const osintCommand={name:'osint',description:'Turkish Osint: XP seviyene göre araştırma konsolu.',options:[
 {type:1,name:'profil',description:'Günlük hakkını, XP seviyeni ve erişim paketini gör.'},
 sub('dns','Alan adının DNS kayıtlarını kontrol et.','alan','Örnek: example.com'),
 sub('ip','IP adresinin sınıfını ve PTR kaydını incele.','adres','Örnek: 8.8.8.8'),
 sub('url','URL biçimini ve pasif risk sinyallerini incele.','adres','Örnek: https://example.com'),
 {type:1,name:'yardim',description:'Araçların kapsamı ve web giriş bağlantısını gör.'}
]};
export async function handleOsintInteraction(i:any):Promise<boolean>{
 if(!i.isChatInputCommand()||i.commandName!=='osint')return false;
 await i.deferReply({flags:MessageFlags.Ephemeral});
 try{
  const subcommand=i.options.getSubcommand();
  if(['profil','yardim'].includes(subcommand)){
   const q=await osintQuota(i.user.id);
   const content=subcommand==='profil'?'🔎 **TURKISH OSINT · XP PROFİLİ**\n⭐ '+q.xp+' XP · Seviye '+q.level+' · '+q.tier+'\n📊 Günlük hakkın: **'+q.remaining+' / '+q.dailyLimit+'**\n🔁 Sıfırlanma: Türkiye saati 00:00':'🛰️ **TURKISH OSINT · NEXUS**\n'+osintTools.filter(t=>t.enabled).map(t=>t.icon+' **'+t.name+'** · '+t.label).join('\n')+'\n\nDiğer modüller sağlayıcı entegrasyonu bekliyor. Sonuçlar güvenlik garantisi değildir.';
   await i.editReply({content:content+'\n🌐 '+config().appUrl+'/osint',allowedMentions:{parse:[]}});
   return true;
  }
  const kind=subcommand==='dns'?'dns':subcommand==='ip'?'ip':subcommand==='url'?'url':'';
  const target=i.options.getString(kind==='dns'?'alan':'adres',true);
  const data=await osintRun({id:i.user.id,username:i.user.username,avatar:i.user.avatar},kind,target,i.id);
  const r=data.result;
  const lines=r.items.map(item=>'**'+item.name+'**\n'+item.value.slice(0,400));
  const content='🔎 **'+r.title+'** · '+r.target+'\n*'+r.summary+'*\n\n'+lines.join('\n\n')+'\n\n⚠️ '+r.notice+'\n📊 Kalan: **'+data.quota.remaining+'/'+data.quota.dailyLimit+'** · '+data.quota.tier;
  await i.editReply({content:content.slice(0,1950),allowedMentions:{parse:[]}});
 }catch(e){
  await i.editReply({content:e instanceof DomainError?'⚠️ '+e.message:'⚠️ Araştırma tamamlanamadı. Tekrar deneyin.',allowedMentions:{parse:[]}});
 }
 return true;
}
