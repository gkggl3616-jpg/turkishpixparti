import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
test('Üretim ve geliştirme migration girişleri aynı şemaları, son seviye tablosu dahil uygular',async()=>{
 const versions=(await readdir(new URL('../packages/core/sql/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)&&!name.startsWith('002_')).sort().map(name=>name.replace(/\.sql$/,''));
 for(const name of ['migrate.ts','migrate.mjs','bootstrap-db.mjs']){
  const source=await readFile(new URL('../scripts/'+name,import.meta.url),'utf8');const match=/for\(const version of (\[[^\]]+\])\)/.exec(source);assert.ok(match,name);
  const selected=JSON.parse(match[1].replace(/'/g,'"'));assert.deepEqual(selected,versions,name);
 }
});
