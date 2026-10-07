import {z} from 'zod';
const snowflake=z.string().regex(/^\d{17,20}$/,'Discord ID 17–20 rakam olmalı.');
const id=z.uuid();
export const logo=z.string().refine(s=>!s||/^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//.test(s)||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s),'PNG, JPEG veya WebP logo yükleyin.').max(700000).default('');
const text=z.string().trim().min(10).max(10000);
export const roleKeySchema=z.enum(['TBMM_PRESIDENT','PARTY_LEADER','MP','PARTY_MEMBER']);
export const roleRequestSchema=z.object({userId:snowflake,roleKey:roleKeySchema,enabled:z.boolean(),reason:text});
export const roleMappingSchema=z.object({mappings:z.object({TBMM_PRESIDENT:snowflake.nullable(),PARTY_LEADER:snowflake.nullable(),MP:snowflake.nullable(),PARTY_MEMBER:snowflake.nullable()})});
export const serverSettingsSchema=z.object({guildId:snowflake,voteChannel:z.union([snowflake,z.literal('')]),logChannel:z.union([snowflake,z.literal('')])});
export const createSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('PARTY'),name:z.string().trim().min(3).max(80),abbreviation:z.string().trim().min(2).max(12).transform(s=>s.toLocaleUpperCase('tr-TR')),logo,description:text,goals:text,leaderUsername:z.string().trim().min(2).max(40),color:z.string().regex(/^#[a-fA-F0-9]{6}$/).default('#dc3a45')}),
 z.object({kind:z.enum(['BILL','DIRECTIVE']),title:z.string().trim().min(5).max(150),description:text,articles:z.string().trim().min(10).max(30000)}),
 z.object({kind:z.literal('APPOINTMENT'),userId:snowflake,partyId:id,termId:id,reason:text}),
 z.object({kind:z.literal('ELECTION'),title:z.string().trim().min(5).max(150),description:text,seats:z.number().int().min(1).max(300),hours:z.number().int().min(1).max(720),slates:z.array(z.object({partyId:id,candidates:z.array(snowflake).min(1).max(300)})).min(2).max(25)}),
 roleRequestSchema.extend({kind:z.literal('ROLE_ASSIGNMENT')})
]);
export const approvalSchema=z.object({itemId:id,decision:z.enum(['APPROVE','REJECT']),reason:z.string().trim().max(1000).default('')}).refine(x=>x.decision!=='REJECT'||x.reason.length>=5,'Ret gerekçesi en az 5 karakter olmalı.');
export const voteSchema=z.object({ballotId:id,choice:z.string().max(50)});
export const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),data:createSchema}),
 z.object({action:z.literal('approve'),data:approvalSchema}),
 z.object({action:z.literal('vote'),data:voteSchema}),
 z.object({action:z.literal('join'),data:z.object({partyId:id})}),
 z.object({action:z.literal('leave'),data:z.object({}).default({})}),
 z.object({action:z.literal('roleMappings'),data:roleMappingSchema}),
 z.object({action:z.literal('reconcileRoles'),data:z.object({}).default({})}),
 z.object({action:z.literal('serverSettings'),data:serverSettingsSchema})
]);
export function dhondt(votes:Record<string,number>,seats:number,capacity:Record<string,number>={}){
 const result:Record<string,number>=Object.fromEntries(Object.keys(votes).sort().map(k=>[k,0]));
 for(let n=0;n<seats;n++){
  const parties=Object.keys(votes).filter(k=>votes[k]>0&&(capacity[k]===undefined||result[k]<capacity[k]));
  parties.sort((a,b)=>votes[b]/(result[b]+1)-votes[a]/(result[a]+1)||votes[b]-votes[a]||a.localeCompare(b));
  if(!parties.length)break;result[parties[0]]++;
 }return result;
}
