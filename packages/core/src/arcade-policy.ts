export const arcadeGames=[
 {id:'neon',name:'Neon Kaçış',dimension:'2D',cost:100,color:'#8b8dff',description:'Engellerden kaç, yıldızları topla. Üç canla 60 saniye dayan.',controls:'WASD / ok tuşları veya dokunarak hareket'},
 {id:'memory',name:'Hafıza Bahçesi',dimension:'2D',cost:150,color:'#53d6aa',description:'16 kartın içindeki sekiz çifti bul. Daha az hamle, daha iyi skor.',controls:'Kartlara dokun; eşleşen çiftler açık kalır'},
 {id:'orbit',name:'Yörünge 3D',dimension:'3D',cost:200,color:'#ffa85d',description:'Üç boyutlu tünelde uç. Mor küplerden kaçıp altın yıldızları yakala.',controls:'WASD / ok tuşları veya dokunarak uç'}
] as const;
export type ArcadeGame=typeof arcadeGames[number]['id'];
export const COMMUNITY_CURRENCY_CAMPAIGN='turkishpix-2026-10-09-50000';
export const COMMUNITY_CURRENCY_AMOUNT=50000;
