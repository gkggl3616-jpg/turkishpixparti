import {z} from 'zod';
import {moderationCategories,type ModerationCategory,type ModerationMode} from './moderation-catalog';
const ids=z.array(z.string().regex(/^\d{17,20}$/)).max(50),mode=z.enum(['DELETE','REVIEW','OFF']);
export const contentModerationSchema=z.object({
 enabled:z.boolean(),modes:z.object({MDK:mode,ADK:mode,DDK:mode,RACISM:mode,NAZI:mode,PROFANITY:mode,THREAT:mode,CUSTOM:mode}),
 normalizeObfuscation:z.boolean(),checkEdits:z.boolean(),contextReview:z.boolean(),strictSymbols:z.boolean(),strictInsults:z.boolean(),
 exemptModerators:z.boolean(),excludedChannelIds:ids,excludedRoleIds:ids.max(20),
 customTerms:z.array(z.string().trim().min(2).max(80)).max(100),allowedTerms:z.array(z.string().trim().min(2).max(80)).max(100),
 escalation:z.object({enabled:z.boolean(),threshold:z.number().int().min(2).max(20),windowMinutes:z.number().int().min(5).max(1440),timeoutMinutes:z.number().int().min(1).max(1440)}),
 nativeAutoMod:z.boolean(),reviewRetentionDays:z.number().int().min(7).max(90)
});
export type ContentModerationSettings=z.infer<typeof contentModerationSchema>;
export function defaultContentModeration():ContentModerationSettings{return {
 enabled:true,modes:Object.fromEntries(moderationCategories.map(c=>[c.id,'DELETE'])) as Record<ModerationCategory,ModerationMode>,
 normalizeObfuscation:true,checkEdits:true,contextReview:true,strictSymbols:true,strictInsults:false,
 exemptModerators:false,excludedChannelIds:[],excludedRoleIds:[],customTerms:[],allowedTerms:[],
 escalation:{enabled:true,threshold:3,windowMinutes:10,timeoutMinutes:10},nativeAutoMod:true,reviewRetentionDays:30
};}
