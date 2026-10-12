import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProxyFilters} from '../packages/core/src/osint-providers';
import {eventPreview} from '../packages/core/src/osint-access';
import {osintSetupCommand} from '../packages/core/src/osint-policy';
import {osintTools,validateOsint} from '../packages/core/src/osint';
test('Turkish Osint lists >=20 categories but does not pretend integrations are connected',()=>{
 assert.ok(osintTools.length>=20);
 const ids=new Set(osintTools.map(t=>t.id));assert.equal(ids.size,osintTools.length);
 assert.ok(osintTools.find(t=>t.id==='mail'&&!t.enabled));
 assert.ok(osintTools.find(t=>t.id==='number'&&!t.enabled));
});
test('Proxy options reject invalid countries, protocols, high volumes and latency',()=>{
 assert.equal(parseProxyFilters('{"protocol":"socks5","country":"TR","limit":5}').country,'TR');
 for(const x of ['{"protocol":"evil"}','{"country":"../../foo"}','{"limit":40001}','{"maxLatency":-1}','{"minUptime":200}','{}{}'])assert.throws(()=>parseProxyFilters(x));
});
test('Private URL tokens are stripped from owner log previews',()=>{
 const p=eventPreview('url','https://example.com/login?access_token=supersecret#private');
 assert.match(p,/example.com\/login/);assert.ok(!p.includes('supersecret'));
 assert.equal(eventPreview('proxy','{"country":"DE"}'),'[proxy filtreleri]');
});
test('Discord OSINT slash commands remain under 25 subcommands, all have valid option ordering',()=>{
 assert.equal(osintSetupCommand.name,'kur');assert.ok(osintSetupCommand.options.length<=25);
 const names=osintSetupCommand.options.map(x=>x.name);
 for(const n of ['proxy','proxy-checker','osint','temp-mail'])assert.ok(names.includes(n));
 for(const cmd of osintSetupCommand.options){let optional=false;for(const option of ('options' in cmd?cmd.options:[])||[]){if(option.required)assert.equal(optional,false);else optional=true;}}
});
test('Additional provider inputs are strictly validated',()=>{
 assert.equal(validateOsint('asn','8.8.8.8').kind,'asn');
 assert.equal(validateOsint('cve','CVE-2024-12345').kind,'cve');
 assert.throws(()=>validateOsint('cve','not-a-cve'));
 assert.throws(()=>validateOsint('rdap','localhost'));
 assert.throws(()=>validateOsint('proxy-check','http://evil.example.com:8080'));
});
