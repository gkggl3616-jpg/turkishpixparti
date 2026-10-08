import {z} from 'zod';
export const applicationProtectionSchema=z.object({
 enabled:z.boolean().default(true),blockUserInstalled:z.boolean().default(true),nativeBlock:z.boolean().default(true),
 blockForwards:z.boolean().default(true),allowedApplicationIds:z.array(z.string().regex(/^\d{17,20}$/)).max(30).default([]),
 timeoutAfter:z.number().int().min(2).max(30).default(4),windowSeconds:z.number().int().min(5).max(300).default(30),timeoutMinutes:z.number().int().min(0).max(60).default(5)
});
export const defaultApplicationProtection=()=>applicationProtectionSchema.parse({});
/** Metadata identifies the invoker, never the app's bot account or installation owner. */
export function applicationIdentity(message:any,ownBotId:string){
 const metadata=message.interactionMetadata||message.interaction_metadata;
 const owners=metadata?.authorizingIntegrationOwners||metadata?.authorizing_integration_owners||{};
 const user=metadata?.user||message.interaction?.user;
 const appId=message.applicationId||message.application_id||(message.author?.bot?message.author.id:null);
 return {own:message.author?.id===ownBotId||appId===ownBotId,appId:appId||null,appName:message.author?.username||'Uygulama',
 user:user?.id?{id:user.id,username:user.username||'Üye',avatar:user.avatar||null}:null,
 userInstalled:!!owners['1']&&!owners['0'],forwarded:message.reference?.type===1||!!message.messageSnapshots?.size||!!message.message_snapshots?.length};
}
export function applicationViolation(message:any,policy:z.infer<typeof applicationProtectionSchema>,ownBotId:string){
 const identity=applicationIdentity(message,ownBotId);if(!policy.enabled||identity.own)return null;
 if(identity.appId&&policy.allowedApplicationIds.includes(identity.appId))return null;
 if(policy.blockUserInstalled&&identity.userInstalled)return 'USER_INSTALLED_APP';
 if(policy.blockForwards&&identity.forwarded)return 'FORWARDED_MESSAGE';
 return null;
}
