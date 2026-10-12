import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {setTestDatabase,defaultCommunitySettings,awardVoiceXP,awardChatXP,memberProfile,recordInviteJoin,recordInviteLeave,seedInviteMembers,inviteStatistics,communitySettings} from '../packages/core/src/index';
import {guildCommands,globalCommands} from '../packages/core/src/commands';
import {identifyInvite} from '../apps/bot/src/invites';
import {youtubeAudioArguments,youtubeAudioResult} from '../apps/bot/src/youtube-audio';
process.env.DISCORD_GUILD_ID='888888888888888888';process.env.DISCORD_BOT_TOKEN='test-only';process.env.AUDIT_HMAC_KEY='activity-tests-only-key-012345678901234567890';process.env.DEMO_MODE='false';
const member={id:'222222222222222222',username:'Üye'},inviter='111111111111111111';let pg:PGlite;
before(async()=>{pg=new PGlite();setTestDatabase({query:async(sql,params=[])=>{const r=await pg.query(sql,params);return {rows:r.rows as any[],rowCount:r.affectedRows||0};}});const dir=new URL('../packages/core/sql/',import.meta.url);for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')&&!f.startsWith('002')).sort())await pg.exec(await readFile(new URL(f,dir),'utf8'));});
beforeEach(async()=>{await pg.exec('DELETE FROM level_up_notifications;DELETE FROM member_profiles;DELETE FROM invite_events;DELETE FROM invite_members;DELETE FROM invite_tracking;DELETE FROM community_settings;');});
after(async()=>{await pg.close();});
test('Chat XP waits five seconds; duplicate text and daily limits remain enforced',async()=>{
 const settings=defaultCommunitySettings();assert.equal(settings.features.xpCooldownSeconds,5);const channel='999999999999999999';
 assert.equal(await awardChatXP(member,'Birinci sohbet katkısı',settings.features,channel),true);assert.equal(await awardChatXP(member,'İkinci sohbet katkısı',settings.features,channel),false);
 await pg.query("UPDATE member_profiles SET last_xp_at=now()-interval '6 seconds'");assert.equal(await awardChatXP(member,'İkinci sohbet katkısı',settings.features,channel),true);
 await pg.query("UPDATE member_profiles SET last_xp_at=now()-interval '6 seconds'");assert.equal(await awardChatXP(member,'İkinci sohbet katkısı',settings.features,channel),false);assert.equal((await memberProfile(member.id)).xp,20);
});
test('Voice XP credits actual seconds, blocks duplicate ticks and respects the shared cap',async()=>{
 const settings=defaultCommunitySettings();assert.equal(settings.expansion.voiceXP.perSecond,1);
 assert.equal(await awardVoiceXP(member,settings),true);assert.equal(await awardVoiceXP(member,settings),false);let p=await memberProfile(member.id);assert.equal(p.xp,1);assert.equal(p.voice_seconds,1);assert.equal(p.voice_minutes,0);
 await pg.query("UPDATE member_profiles SET last_voice_xp_at=now()-interval '6 seconds',xp_today=499");assert.equal(await awardVoiceXP(member,settings,5),true);p=await memberProfile(member.id);assert.equal(p.xp,2);assert.equal(p.xp_today,500);assert.equal(p.voice_seconds,6);
 await pg.query("UPDATE member_profiles SET last_voice_xp_at=now()-interval '2 seconds'");assert.equal(await awardVoiceXP(member,settings),false);p=await memberProfile(member.id);assert.equal(p.xp,2);assert.equal(p.voice_seconds,7);
});
test('Join, leave and rejoin survive duplicate delivery and retain inviter attribution',async()=>{
 const first={...member,joinedAt:'2026-10-11T06:00:00Z'},source={source:'INVITE' as const,inviterId:inviter,code:'code'};
 assert.equal(await recordInviteJoin(first,source),true);assert.equal(await recordInviteJoin(first,source),false);assert.equal(await recordInviteLeave(member),true);assert.equal(await recordInviteLeave(member),false);
 assert.equal(await recordInviteJoin({...first,joinedAt:'2026-10-11T06:05:00Z'},source),true);const s=await inviteStatistics(inviter);assert.deepEqual(s.totals,{joins:2,leaves:1,rejoins:1,unknown:0});assert.deepEqual(s.member,{joins:2,leaves:1,rejoins:1,active:1});
});
test('Baseline members do not invent old joins; their later return counts as a rejoin',async()=>{
 await seedInviteMembers([{...member,joinedAt:'2026-10-10T00:00:00Z'}]);assert.equal((await inviteStatistics(inviter)).totals.joins,0);await recordInviteLeave(member);await recordInviteJoin({...member,joinedAt:'2026-10-11T06:05:00Z'},{source:'UNKNOWN'});assert.deepEqual((await inviteStatistics(inviter)).totals,{joins:1,leaves:1,rejoins:1,unknown:1});
});
test('Invite attribution never assigns ambiguous simultaneous joins or deleted links',()=>{
 const a={code:'a',uses:5,inviterId:inviter,maxUses:0},b={code:'b',uses:2,inviterId:member.id,maxUses:0};assert.equal(identifyInvite([a,b],[{...a,uses:6},b]).inviterId,inviter);assert.equal(identifyInvite([a,b],[{...a,uses:7},b]).source,'UNKNOWN');assert.equal(identifyInvite([a,b],[{...a,uses:6},{...b,uses:3}]).source,'UNKNOWN');assert.equal(identifyInvite([a],[]).source,'UNKNOWN');
});
test('New /inv uses the independent global quota and preserves all hundred guild commands',()=>{
 assert.equal(guildCommands.length,100);assert.ok(globalCommands.length<=100);for(const name of ['kick','ban','sil','inv','osint'])assert.ok(globalCommands.some(c=>c.name===name));assert.equal(globalCommands[0].contexts[0],0);assert.ok(guildCommands.some(c=>c.name==='cekilis'));assert.ok(guildCommands.some(c=>c.name==='bilet'));
});
test('YouTube audio accepts only canonical video IDs and Google audio streams',()=>{
 const args=youtubeAudioArguments('https://youtu.be/M7lc1UVf-VE');assert.equal(args.at(-1),'https://www.youtube.com/watch?v=M7lc1UVf-VE');assert.ok(args.includes('node'));assert.throws(()=>youtubeAudioArguments('https://127.0.0.1/audio'));
 assert.equal(youtubeAudioResult({url:'https://r1.googlevideo.com/audio',duration:120}).duration,120);assert.throws(()=>youtubeAudioResult({url:'https://127.0.0.1/private'}));assert.throws(()=>youtubeAudioResult({url:'https://googlevideo.com.evil.test/a'}));assert.throws(()=>youtubeAudioResult({url:'https://r1.googlevideo.com/a',is_live:true}));
});
