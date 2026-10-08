export const moderationCategories=[
 {id:'MDK',name:'MDK · Millî değerlere hakaret',description:'Atatürk, Türk bayrağı, İstiklal Marşı, şehitler ve millî değerlere yönelik açık küfür.'},
 {id:'ADK',name:'ADK · Aileye hakaret',description:'Anne, baba, kardeş ve aileyi hedef alan ağır küfür ve cinsel hakaret.'},
 {id:'DDK',name:'DDK · Dinî değerlere hakaret',description:'İnanç, kutsal metin, peygamber ve dinî değerleri hedef alan açık küfür.'},
 {id:'RACISM',name:'Irkçılık ve nefret söylemi',description:'Etnik köken, milliyet veya inanç grubuna yönelik aşağılayıcı ve şiddet çağrısı içeren ifadeler.'},
 {id:'NAZI',name:'Nazi propagandası',description:'Nazi sloganları, övgü, Holokost inkârı ve propaganda amaçlı semboller.'},
 {id:'PROFANITY',name:'Genel küfür',description:'Türkçe ve İngilizce ağır küfürler; kelime sınırlarıyla kontrol edilir.'},
 {id:'THREAT',name:'Doğrudan tehdit',description:'Bir üyeye yönelik açık öldürme veya ağır şiddet tehdidi.'},
 {id:'CUSTOM',name:'Özel yasaklı ifadeler',description:'Senin eklediğin kelime ve ifadeler. Düzenli ifade yazmak gerekmez.'}
] as const;
export type ModerationCategory=typeof moderationCategories[number]['id'];
export type ModerationMode='DELETE'|'REVIEW'|'OFF';
export const moderationLabels=Object.fromEntries(moderationCategories.map(c=>[c.id,c.name])) as Record<ModerationCategory,string>;
