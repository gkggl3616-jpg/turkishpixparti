import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {cardCategories,cardText,rankCardSVG,helpCardCategory,type RankCardInput} from '../packages/core/src/visuals';
import {renderCategoryBanner,renderRankCard,discordAvatarData} from '../packages/core/src/cards';
import {GET} from '../apps/web/src/app/api/cards/banner/[category]/route';
const sample:RankCardInput={username:'frizz2025',displayName:'Frizz',guildName:'TurkishPix',xp:18420,level:13,start:16900,end:19600,percent:56,remaining:1180,rank:3,rankedMembers:284,messages:1235,voiceMinutes:410};
test('Fotoğraflı rank kartı gerçek PNG üretir; avatar kartın içine gömülür',async()=>{
 const avatar=await sharp({create:{width:164,height:164,channels:4,background:'#edb991'}}).png().toBuffer();
 const input={...sample,avatarData:'data:image/png;base64,'+avatar.toString('base64')};
 const png=await renderRankCard(input),meta=await sharp(png).metadata();
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(meta.width,1200);assert.equal(meta.height,440);assert.ok(rankCardSVG(input).includes(input.avatarData));
 const fallback=await renderRankCard(sample);assert.notDeepEqual(png,fallback);
});
test('Tüm kategori görselleri PNG olarak üretilir ve aynı kategori tekrar render edilmez',async()=>{
 for(const category of Object.keys(cardCategories) as (keyof typeof cardCategories)[]){
  const png=await renderCategoryBanner(category);const meta=await sharp(png).metadata();
  assert.equal(meta.width,1200);assert.equal(meta.height,280);assert.strictEqual(await renderCategoryBanner(category),png);
 }
 assert.equal(helpCardCategory('feature-ekonomi'),'rank');assert.equal(helpCardCategory('fun-oyun'),'games');
});
test('Kart isimlerinde XML ve kontrol karakterleri etkisizdir; avatar URL’si dışarıdan verilemez',async()=>{
 assert.equal(cardText('<script>&"'), '&lt;script&gt;&amp;&quot;');
 assert.ok(!rankCardSVG({...sample,displayName:'<image href="file:///secret"/>'}).includes('<image href="file:///secret"'));
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('network should not run');};
 try{assert.equal(await discordAvatarData('invalid'),undefined);assert.equal(await discordAvatarData('1317890469673566279','https://evil.test'),undefined);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('Genel kategori kartı girişi PNG döndürür; bilinmeyen dosya veya yol kabul edilmez',async()=>{
 const response=await GET(new Request('https://example.test/api/cards/banner/music'),{params:Promise.resolve({category:'music'})});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.ok((await response.arrayBuffer()).byteLength>1000);
 const invalid=await GET(new Request('https://example.test/api/cards/banner/missing'),{params:Promise.resolve({category:'../../secret'})});assert.equal(invalid.status,404);
});
