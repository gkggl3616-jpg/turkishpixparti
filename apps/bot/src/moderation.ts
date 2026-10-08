import {inspectContent,recordModeration,moderationAction,moderationLabels,config,database,cleanupModeration,sha256,type CommunitySettings,type ModerationDecision} from '@turkishpix/core';
const pending=new Map<string,Promise<unknown>>();
async function serialized<T>(key:string,work:()=>Promise<T>){const previous=pending.get(key)||Promise.resolve(),next=previous.catch(()=>{}).then(work);pending.set(key,next);try{return await next;}finally{if(pending.get(key)===next)pending.delete(key);}}
async function logCase(actor:any,input:any,result:any,action:string,settings:CommunitySettings){
 if(result.duplicate)return;const channel=settings.security.logChannel||config().logChannel;if(!channel)return;
 const lines=['🛡️ **TurkishPix sohbet koruması**','Kural: '+moderationLabels[input.decision.category as keyof typeof moderationLabels],'Üye: '+actor.id,'Kanal: '+input.channelId,'İşlem: '+action,'Kaynak: '+({CREATE:'Yeni mesaj',EDIT:'Düzenlenmiş mesaj',NATIVE:'Discord AutoMod'} as any)[input.source],'Son ihlal sayısı: '+result.hits,'Kayıt: '+result.id];
 if(input.decision.mode==='REVIEW')lines.push('İnceleme: '+config().appUrl+'/guvenlik');
 await database().query("INSERT INTO community_deliveries(id,guild_id,kind,payload,dedupe_key) VALUES(gen_random_uuid(),$1,'SECURITY_LOG',$2,$3) ON CONFLICT(dedupe_key) DO NOTHING",[config().guildId,{channelId:channel,content:lines.join('\n')},'moderation:'+result.id]);
}
async function timeoutMember(member:any,result:any,action:string,settings:CommunitySettings){
 if(!result.shouldTimeout)return action;const duration=settings.security.content.escalation.timeoutMinutes*60000;
 if(!member?.moderatable)return action+' + TIMEOUT_PERMISSION_MISSING';
 // Preserve an existing longer timeout rather than shortening another moderator's action.
 if((member.communicationDisabledUntilTimestamp||0)>=Date.now()+duration-1000)return action+' + ALREADY_TIMED_OUT';
 try{await member.timeout(duration,'TurkishPix: tekrarlanan sohbet ihlali');return action+' + TIMEOUT';}catch{return action+' + TIMEOUT_FAILED';}
}
export async function moderateChat(message:any,settings:CommunitySettings,privileged:boolean,edited=false):Promise<boolean>{
 if(!settings.security.enabled||!settings.security.content.enabled||!message.guild||message.author?.bot||message.webhookId||message.system||(edited&&!settings.security.content.checkEdits))return false;
 const rules=settings.security.content,roles=message.member?.roles?.cache?[...message.member.roles.cache.keys()]:[];
 if((privileged&&rules.exemptModerators)||rules.excludedChannelIds.includes(message.channelId)||roles.some((id:string)=>rules.excludedRoleIds.includes(id)))return false;
 return serialized(message.id,async()=>{
  const content=message.content||'',decision=inspectContent(content,rules);if(!decision)return false;
  const actor={id:message.author.id,username:message.author.username,avatar:message.author.avatar};let action=decision.mode==='REVIEW'?'REVIEW_ONLY':'DELETE_PERMISSION_MISSING';
  if(decision.mode==='DELETE'&&message.deletable){try{await message.delete();action='MESSAGE_DELETED';}catch{action='DELETE_FAILED';}}
  const input={messageId:message.id,channelId:message.channelId,content,source:edited?'EDIT' as const:'CREATE' as const,decision,action};
  try{const result=await recordModeration(actor,input,rules);if(!result.duplicate){action=await timeoutMember(message.member,result,action,settings);if(action!==input.action)await moderationAction(result.id,action);await logCase(actor,input,result,action,settings);}}
  catch{console.error('CHAT_MODERATION_RECORD_FAILED');}
  return true;
 });
}
export async function nativeModerationExecution(execution:any,settings:CommunitySettings,nativeRuleId:string){
 if(execution.guild?.id!==config().guildId||execution.ruleId!==nativeRuleId||execution.action?.type!==1||!settings.security.enabled||!settings.security.content.enabled||!settings.security.content.nativeAutoMod||!execution.channelId)return;
 const user=execution.user||await execution.guild.client.users.fetch(execution.userId),content=execution.content||execution.matchedContent||'',decision=inspectContent(content,settings.security.content)||{category:'CUSTOM',label:'Discord AutoMod',ruleId:'NATIVE_OWNED_RULE',mode:'DELETE',confidence:'HIGH',obfuscated:false} as ModerationDecision;
 // Blocked messages have no message ID. Gateway replays within 10 seconds are deduplicated.
 const messageId=execution.messageId||'native:'+sha256([execution.ruleId,execution.userId,execution.channelId,content,Math.floor(Date.now()/10000)].join(':'));
 await serialized(messageId,async()=>{const actor={id:user.id,username:user.username,avatar:user.avatar},input={messageId,channelId:execution.channelId,content:content||'Discord AutoMod',source:'NATIVE' as const,decision,action:'NATIVE_BLOCKED'},result=await recordModeration(actor,input,settings.security.content);let member=execution.member||execution.guild.members.cache.get(user.id);if(!member&&result.shouldTimeout)try{member=await execution.guild.members.fetch(user.id);}catch{}
  const action=await timeoutMember(member,result,input.action,settings);if(action!==input.action&&!result.duplicate)await moderationAction(result.id,action);await logCase(actor,input,result,action,settings);
 });
}
export async function moderationMaintenance(settings:CommunitySettings){await cleanupModeration(settings.security.content);}
