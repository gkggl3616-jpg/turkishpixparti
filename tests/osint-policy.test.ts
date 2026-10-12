import {test} from 'node:test';
import assert from 'node:assert/strict';
import {osintTier,validateOsint} from '../packages/core/src/osint';

test('XP quotas advance through five configured levels and are never unlimited',()=>{
 const samples:[[number,string,number],...[number,string,number][]]=[[0,'Starter',5],[4,'Starter',5],[5,'Researcher',15],[10,'Analyst',35],[20,'Expert',75],[40,'Elite',150],[100,'Elite',150]];
 for(const [level,name,dailyLimit] of samples)assert.deepEqual(osintTier(level),{name,dailyLimit});
});
test('DNS accepts public formatted domain names and rejects dangerous inputs',()=>{
 assert.deepEqual(validateOsint('dns','Example.COM'),{kind:'dns',target:'Example.COM'});
 assert.throws(()=>validateOsint('dns','localhost'));
 assert.throws(()=>validateOsint('dns','192.168.1.1'));
 assert.throws(()=>validateOsint('dns','example.com/path'));
});
test('IP parser refuses non-IP and permits regular IP literals',()=>{
 assert.equal(validateOsint('ip','8.8.8.8').kind,'ip');
 assert.equal(validateOsint('ip','2001:db8::1').kind,'ip');
 assert.throws(()=>validateOsint('ip','example.com'));
});
test('URL checks are passive and reject unsupported protocols or credential-bearing URLs',()=>{
 assert.equal(validateOsint('url','https://example.com/login').kind,'url');
 assert.throws(()=>validateOsint('url','file:///etc/passwd'));
 assert.throws(()=>validateOsint('url','https://user:pass@example.com'));
});
