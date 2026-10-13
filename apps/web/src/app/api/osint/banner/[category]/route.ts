import {renderOsintBanner} from '../../../../../../../../packages/core/src/osint-visuals';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{category:string}>}){const {category}=await params,png=renderOsintBanner(category);if(!png)return new Response('Kategori bulunamadı',{status:404});return new Response(new Uint8Array(await png),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});}
