import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {publicNumberSources} from '../packages/core/src/osint-public-number-catalog';
import {parsePublicNumbers,publicNumberList,publicNumberLists} from '../packages/core/src/osint-public-numbers';
import {GET} from '../apps/web/src/app/api/osint/public-numbers/route';
const fixtures:Record<string,string>={
 'sms-receive-online.com':'/message/447884641162.html',
 'receive-sms.io':'/temporary-numbers/usa/12020836451/',
 'sms24.me':'/en/numbers/46794011388',
 'anonymsms.com':'/number/61468207913/',
 'receive-smss.com':'/sms/14692466072/',
 'freephonenum.com':'/be/receive-sms/460210041',
 'sms-online.co':'/receive-free-sms/447593932683',
 'receive-sms.cc':'/Finland-Phone-Number/3584573988996',
 'receive-sms-online.info':'/46731299509-Sweden',
 'receive-sms-free.cc':'/Free-Netherlands-Phone-Number/3197058026599/'
};
const originalFetch=globalThis.fetch,originalNow=Date.now;let clock=originalNow(),active=0,peak=0,calls:string[]=[],handler:(url:URL)=>Response|Promise<Response>;
const page=(html:string)=>new Response(html,{headers:{'content-type':'text/html; charset=UTF-8'}});
function next(fn:(url:URL)=>Response|Promise<Response>){clock+=310000;calls=[];handler=fn;}
before(()=>{Date.now=()=>clock;globalThis.fetch=async(input,init)=>{const url=new URL(String(input));calls.push(url.href);assert.equal(init?.redirect,'manual');assert.equal(init?.method,'GET');assert.equal((init?.headers as Record<string,string>).Authorization,undefined);active++;peak=Math.max(peak,active);try{return await handler(url);}finally{active--;}};});
after(()=>{globalThis.fetch=originalFetch;Date.now=originalNow;});
test('Every screenshot provider has a number-link parser; mailbox text and verification codes never enter output',()=>{
 assert.equal(publicNumberSources.length,10);
 for(const source of publicNumberSources){const href=fixtures[source.id],r=parsePublicNumbers(source.id,`<a href="${href}">private SMS: 839204</a><div>foreign message secret</div><a href="${href}">duplicate</a>`);assert.equal(r.numbers.length,1,source.id);assert.match(r.numbers[0].number,/^\+[1-9]\d{7,14}$/);assert.equal(new URL(r.numbers[0].url).hostname,new URL(source.url).hostname);assert.ok(!JSON.stringify(r).includes('839204'));assert.ok(!JSON.stringify(r).includes('foreign'));}
 assert.equal(parsePublicNumbers('freephonenum.com','<a href="/be/receive-sms/460210041">Belgium</a>').numbers[0].number,'+32460210041');
});
test('Rejects foreign hosts, javascript, credentials, query URLs, scripts, assets and unsupported number routes',()=>{
 const r=parsePublicNumbers('sms24.me',`<script>let fake='<a href="/en/numbers/12025550001">secret</a>';</script><!-- <a href="/en/numbers/12025550002">hidden</a> --><a href="https://evil.test/en/numbers/12025550003">evil</a><a href="https://user@sms24.me/en/numbers/12025550004">auth</a><a href="javascript:alert(1)">js</a><a href="/en/numbers/12025550005?token=private">query</a><a href="/en/messages/private">SMS</a><a href="/assets/12025550006.js">asset</a><a href="/en/numbers/00000000000">bad</a>`);
 assert.equal(r.numbers.length,0);
});
test('Bounded list extraction advertises truncation instead of claiming all records',()=>{
 const r=parsePublicNumbers('sms24.me',Array.from({length:501},(_,i)=>`<a href="/en/numbers/${12025550000+i}">number</a>`).join(''));assert.equal(r.numbers.length,500);assert.equal(r.truncated,true);
});
test('All-provider reads use only fixed list pages, three concurrent fetches and deduplicate overlapping requests',async()=>{
 peak=0;next(async url=>{await new Promise<void>(resolve=>setImmediate(resolve));const source=publicNumberSources.find(s=>new URL(s.url).hostname===url.hostname)!;assert.equal(url.href,source.url);return page(`<a href="${fixtures[source.id]}">SMS secret code</a>`);});
 const [a,b]=await Promise.all([publicNumberLists(),publicNumberLists()]);assert.equal(a.sources.length,10);assert.ok(a.sources.every(s=>s.state==='OK'&&s.numbers.length===1));assert.equal(calls.length,10);assert.ok(peak<=3);assert.deepEqual(a,b);assert.ok(!JSON.stringify(a).includes('secret code'));await publicNumberLists();assert.equal(calls.length,10);
});
test('Expired refresh failure retains old number links with an explicit stale/error state and cooldown',async()=>{
 next(()=>new Response('provider failed',{status:503}));const r=await publicNumberList('sms24.me');assert.equal(r.state,'ERROR');assert.equal(r.code,'HTTP_503');assert.equal(r.stale,true);assert.equal(r.numbers.length,1);assert.ok(r.lastSuccessAt);await publicNumberList('sms24.me');assert.equal(calls.length,1);
});
test('Stops cross-host and per-number redirects without fetching the target',async()=>{
 next(()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}}));assert.equal((await publicNumberList('sms-online.co')).code,'REDIRECT');assert.equal(calls.length,1);
 next(()=>new Response(null,{status:302,headers:{location:'/sms/14692466072/'}}));assert.equal((await publicNumberList('receive-smss.com')).code,'REDIRECT');assert.equal(calls.length,1);
});
test('Access challenges and rate limits are blocked states; no challenge bypass or immediate retry',async()=>{
 next(()=>page('<title>Just a moment</title><script src="/cdn-cgi/challenge-platform"></script>'));const r=await publicNumberList('anonymsms.com');assert.equal(r.state,'BLOCKED');assert.equal(r.code,'BLOCKED');await publicNumberList('anonymsms.com');assert.equal(calls.length,1);
 next(()=>new Response(null,{status:429}));assert.equal((await publicNumberList('receive-sms.cc')).state,'BLOCKED');
});
test('Rejects oversized/non-HTML responses and distinguishes changed list markup from success',async()=>{
 next(()=>new Response('too large',{headers:{'content-type':'text/html','content-length':'1500001'}}));assert.equal((await publicNumberList('receive-sms-free.cc')).code,'SIZE');
 next(()=>Response.json({privateSms:'never read'}));assert.equal((await publicNumberList('receive-sms.io')).code,'FORMAT');
 next(()=>page('<div>no matching number links</div>'));const r=await publicNumberList('receive-sms-online.info');assert.equal(r.state,'EMPTY');assert.equal(r.code,'NO_NUMBER_LINKS');assert.equal(r.numbers.length,0);
});
test('Read-only endpoint rejects arbitrary provider URLs before any upstream call',async()=>{
 next(()=>{throw Error('Must not fetch');});const r=await GET(new Request('https://osint.example/api/osint/public-numbers?provider=http://127.0.0.1/'));assert.equal(r.status,400);assert.equal(calls.length,0);
});
test('Read-only endpoint returns source status and public number fields without message payloads',async()=>{
 next(()=>page(`<a href="${fixtures['sms24.me']}">OTP not returned</a>`));const r=await GET(new Request('https://osint.example/api/osint/public-numbers?provider=sms24.me')),d=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.equal(d.sources[0].state,'OK');assert.equal(d.sources[0].numbers.length,1);assert.equal(d.refreshSeconds,120);assert.deepEqual(Object.keys(d.sources[0].numbers[0]).sort(),['country','number','source','url']);
});
