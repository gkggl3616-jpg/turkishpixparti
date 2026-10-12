import {test} from 'node:test';
import assert from 'node:assert/strict';
import {osintRank,osintXpProgress,osintRanks} from '../packages/core/src/osint-ranks';
import {osintTier} from '../packages/core/src/osint';
test('New Turkish OSINT ranks map existing XP level thresholds without changing quota tiers',()=>{
 const expected=[[0,'Acemi',5],[4,'Acemi',5],[5,'Deneyimli',15],[9,'Deneyimli',15],[10,'Analist',35],[19,'Analist',35],[20,'Kıdemli Analist',75],[39,'Kıdemli Analist',75],[40,'Baş Analist',150]];
 for(const [level,name,quota] of expected){assert.equal(osintRank(Number(level)).name,name);assert.equal(osintTier(Number(level)).dailyLimit,quota);}
 assert.equal(new Set(osintRanks.map(x=>x.title)).size,5);
});
test('XP progress calculates next Discord level instead of changing XP records',()=>{
 assert.deepEqual(osintXpProgress(0),{level:0,currentLevelXp:0,nextLevelXp:100,intoLevel:0,toNextLevel:100,percent:0});
 assert.deepEqual(osintXpProgress(100),{level:1,currentLevelXp:100,nextLevelXp:400,intoLevel:0,toNextLevel:300,percent:0});
 assert.equal(osintXpProgress(225).percent,42);
 assert.equal(osintXpProgress(2500).level,5);
 assert.equal(osintRank(40).nextRank,null);
});
