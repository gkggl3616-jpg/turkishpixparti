import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {proxy} from '../apps/web/src/proxy';
test('Dedicated OSINT host serves public updates and policies but keeps private community APIs closed',()=>{
 const old=process.env.OSINT_ONLY;process.env.OSINT_ONLY='true';
 try{for(const path of ['/osint','/api/osint','/api/osint/mail-domains','/guncellemeler','/api/updates','/privacy','/terms']){const r=proxy(new NextRequest('https://osint.example'+path));assert.equal(r.headers.get('x-middleware-next'),'1',path);}for(const path of ['/api/config','/api/community','/karsilama','/api/welcome'])assert.equal(proxy(new NextRequest('https://osint.example'+path)).status,404,path);}finally{if(old===undefined)delete process.env.OSINT_ONLY;else process.env.OSINT_ONLY=old;}
});
test('Main website retains normal community and welcome routes',()=>{
 const old=process.env.OSINT_ONLY;delete process.env.OSINT_ONLY;try{for(const path of ['/welcome','/karsilama','/api/welcome'])assert.equal(proxy(new NextRequest('https://main.example'+path)).headers.get('x-middleware-next'),'1');}finally{if(old!==undefined)process.env.OSINT_ONLY=old;}
});
