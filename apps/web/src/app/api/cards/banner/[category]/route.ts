import {cardCategories,type CardCategory} from '../../../../../../../../packages/core/src/visuals';
import {renderCategoryBanner} from '../../../../../../../../packages/core/src/cards';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{category:string}>}){
 const {category}=await params;
 if(!Object.prototype.hasOwnProperty.call(cardCategories,category))return new Response('Kart bulunamadı',{status:404});
 const png=await renderCategoryBanner(category as CardCategory);
 return new Response(new Uint8Array(png),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
}
