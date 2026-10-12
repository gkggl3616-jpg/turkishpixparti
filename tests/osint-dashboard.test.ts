import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RANKS,rankOf,levelProgress} from '../apps/web/src/components/osint-levels';

test('OSINT operator titles follow XP levels without changing quota thresholds',()=>{
 assert.deepEqual(RANKS.map(r=>[r.level,r.name]),[[0,'Acemi'],[5,'Deneyimli'],[10,'Analist'],[20,'Uzman'],[40,'Elit']]);
 for(const [level,title] of [[0,'Acemi'],[4,'Acemi'],[5,'Deneyimli'],[9,'Deneyimli'],[10,'Analist'],[19,'Analist'],[20,'Uzman'],[39,'Uzman'],[40,'Elit'],[120,'Elit']] as const)assert.equal(rankOf(level).name,title);
});

test('Level progress uses the XP threshold formula already applied in TurkishPix',()=>{
 assert.deepEqual(levelProgress(0,0),{previousXp:0,nextXp:100,remaining:100,percent:0});
 assert.equal(levelProgress(100,1).nextXp,400);
 assert.equal(levelProgress(225,1).percent,125/300*100);
 assert.equal(levelProgress(2500,5).percent,0);
 assert.equal(levelProgress(3600,5).percent,100);
});

test('An OSINT site join date is recorded on authenticated access, not inferred from Discord',async()=>{
 const migration=await readFile(new URL('../packages/core/sql/021_osint_portal_memberships.sql',import.meta.url),'utf8');
 const endpoint=await readFile(new URL('../apps/web/src/app/api/osint/route.ts',import.meta.url),'utf8');
 assert.match(migration,/osint_portal_memberships/);
 assert.match(endpoint,/INSERT INTO osint_portal_memberships/);
 assert.match(endpoint,/member\.joined_at/);
 assert.match(endpoint,/siteJoinedAt/);
});

test('The 25 OSINT category tools are routed into the dedicated sidebar',async()=>{
 const src=await readFile(new URL('../apps/web/src/components/OsintDashboard.tsx',import.meta.url),'utf8');
 assert.match(src,/Proxy & Network/);
 assert.match(src,/Altyapı Analizi/);
 assert.match(src,/Tehdit Araştırması/);
 assert.match(src,/İletişim & Kimlik/);
 assert.match(src,/Araştırma & Dosyalar/);
 assert.match(src,/osint-assets\/network-constellation\.svg/);
 assert.match(src,/osint-assets\/proxy-mesh\.svg/);
 assert.match(src,/osint-assets\/threat-matrix\.svg/);
});
