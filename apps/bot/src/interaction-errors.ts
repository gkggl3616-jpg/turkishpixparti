import {MessageFlags} from 'discord.js';
import {DomainError,discordErrorDetails} from '@turkishpix/core';
export async function safeInteraction(i:any,work:()=>Promise<unknown>){
 try{await work();}catch(e:any){
  console.error('INTERACTION_FAILED',JSON.stringify({command:i.commandName||'component',...discordErrorDetails(e)}));
  if([10062,10015,50027].includes(e?.code)||!i.isRepliable?.())return;
  const content=e instanceof DomainError?e.message:'İşlem tamamlanamadı. Bilet veya çekiliş listesinden kayıt durumunu kontrol ederek yeniden dene.';
  try{if(i.deferred||i.replied)await i.editReply({content,allowedMentions:{parse:[]}});else await i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});}catch(replyError){console.error('INTERACTION_REPLY_UNAVAILABLE',JSON.stringify(discordErrorDetails(replyError)));}
 }
}
