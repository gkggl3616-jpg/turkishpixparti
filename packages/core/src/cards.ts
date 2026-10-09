import sharp from 'sharp';
import {categoryBannerSVG,rankCardSVG,type CardCategory,type RankCardInput} from './visuals';
const banners=new Map<CardCategory,Promise<Buffer>>();
export async function renderCategoryBanner(category:CardCategory){let p=banners.get(category);if(!p){p=sharp(Buffer.from(categoryBannerSVG(category))).png().toBuffer();banners.set(category,p);p.catch(()=>banners.delete(category));}return p;}
export async function discordAvatarData(id:string,hash?:string|null){
 if(!/^\d{17,20}$/.test(id)||hash&&!/^(?:a_)?[a-f0-9]{32}$/i.test(hash))return undefined;
 const url=hash?'https://cdn.discordapp.com/avatars/'+id+'/'+hash+'.png?size=256':'https://cdn.discordapp.com/embed/avatars/'+String(Number((BigInt(id)>>22n)%6n))+'.png';
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(3500),redirect:'error'});
  if(!response.ok||Number(response.headers.get('content-length')||0)>1024*1024||!response.body)return undefined;
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>1024*1024){await reader.cancel();return undefined;}chunks.push(r.value);}
  const image=await sharp(Buffer.concat(chunks),{limitInputPixels:1024*1024}).resize(164,164,{fit:'cover'}).png().toBuffer();
  return 'data:image/png;base64,'+image.toString('base64');
 }catch{return undefined;}
}
export async function renderRankCard(input:RankCardInput){return sharp(Buffer.from(rankCardSVG(input))).png().toBuffer();}
