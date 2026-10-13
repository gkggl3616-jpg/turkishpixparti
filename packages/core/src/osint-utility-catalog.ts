export const utilityCatalog=[
 {id:'qr-code',name:'QR Kod Üretici',label:'Metin / bağlantı için 1024 px PNG ve SVG',enabled:true,icon:'🔳'},
 {id:'repository-search',name:'Açık Kaynak Proje Bulucu',label:'GitHub bot, araç ve altyapı araması; lisans / dil filtreleri',enabled:true,icon:'📦'},
 {id:'api-directory',name:'Ücretsiz API Kataloğu',label:'Kategori, anahtar ve HTTPS filtreleri; belge / cURL örnekleri',enabled:true,icon:'📚'},
 {id:'roblox-username',name:'Roblox Kullanıcı Adı',label:'Resmî API’de tam kullanıcı adı eşleşmesi',enabled:true,icon:'🎮'},
 {id:'minecraft-status',name:'Minecraft Sunucu Durumu',label:'Java sunucusu için tek durum ping’i; oyuncu sayısı / sürüm',enabled:true,icon:'🟩'}
] as const;
export type UtilityKind=typeof utilityCatalog[number]['id'];
export type QrArtifact={pngDataUrl:string;svg:string;width:number};
export type RepositoryHit={name:string;url:string;description:string;language:string|null;license:string|null;stars:number;forks:number;pushedAt:string|null;archived:boolean;topics:string[]};
export type RepositorySearch={query:string;total:number;page:number;pageSize:number;hasNext:boolean;incomplete:boolean;checkedAt:string;cached:boolean;repositories:RepositoryHit[]};
export type ApiEntry={name:string;description:string;category:string;url:string;auth:string;https:boolean;cors:string;curl:string;curlKind:'docs'|'api'};
export type ApiDirectory={entries:ApiEntry[];categories:string[];total:number;page:number;hasNext:boolean;checkedAt:string;cached:boolean;source:string};
export const repositoryLanguages=['any','JavaScript','TypeScript','Python','Go','Rust','Java','C#','Lua','PHP'] as const;
export const repositoryLicenses=['any','mit','apache-2.0','bsd-2-clause','bsd-3-clause','gpl-3.0','agpl-3.0','mpl-2.0','unlicense'] as const;
