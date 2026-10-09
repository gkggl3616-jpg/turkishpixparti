export const arcadeGames=[
 {id:'neon',name:'Neon Kaçış',dimension:'2D',cost:100,color:'#8b8dff',description:'Engellerden kaç, yıldızları topla. Üç canla 60 saniye dayan.',controls:'WASD / ok tuşları veya dokunarak hareket'},
 {id:'memory',name:'Hafıza Bahçesi',dimension:'2D',cost:150,color:'#53d6aa',description:'16 kartın içindeki sekiz çifti bul. Daha az hamle, daha iyi skor.',controls:'Kartlara dokun; eşleşen çiftler açık kalır'},
 {id:'orbit',name:'Yörünge 3D',dimension:'3D',cost:200,color:'#ffa85d',description:'Üç boyutlu tünelde uç. Mor küplerden kaçıp altın yıldızları yakala.',controls:'WASD / ok tuşları veya dokunarak uç'},
 {id:'snake',name:'Neon Yılan',dimension:'2D',cost:100,color:'#7fe1aa',description:'Işık izini uzat, enerji kürelerini topla. Her lokmada hızlan; 20 küreye ulaş.',controls:'Ok tuşları / WASD · telefonda yön düğmeleri'},
 {id:'breaker',name:'Tuğla Kıran',dimension:'2D',cost:150,color:'#ff89b6',description:'Üç renkli dalgayı temizle. Geniş raket ve ateş topu güçlerini yakala.',controls:'Fare / dokunma veya sağ-sol · başlatmak için dokun'},
 {id:'space',name:'Uzay Savunması',dimension:'2D',cost:200,color:'#66d8ff',description:'Meteorları ve düşman filolarını durdur. Kalkan, çift atış ve üç bölüm sonu savaşı.',controls:'WASD / ok tuşları veya sürükle · otomatik ateş'},
 {id:'2048',name:'2048 · Işık Taşları',dimension:'2D',cost:100,color:'#ffd074',description:'Aynı taşları birleştir, zincirler kur ve 2048’e ulaş. Her hamleyi düşün.',controls:'Ok tuşları / kaydırma / yön düğmeleri · Discord’da da oynanır'},
 {id:'mines',name:'Mayın Tarlası',dimension:'2D',cost:100,color:'#bd9aff',description:'Dört gizli mayını bul; güvenli kareleri aç. İlk açtığın kare ve çevresi güvenlidir.',controls:'Kareye dokun · bayrak moduyla işaretle · Discord’da da oynanır'},
 {id:'connect4',name:'Dörtlü Bağla',dimension:'2D',cost:150,color:'#fb966e',description:'Akıllı bota karşı dört taşı yatay, dikey veya çapraz bağla. Bir hamle sonrası değişir.',controls:'Bir sütun seç · sen altın, bot mor · Discord’da da oynanır'}
] as const;
export type ArcadeGame=typeof arcadeGames[number]['id'];
export const arcadeNativeIds=['2048','mines','connect4'] as const;
export type ArcadeBoardGame=typeof arcadeNativeIds[number];
export function isArcadeBoard(game:string):game is ArcadeBoardGame{return (arcadeNativeIds as readonly string[]).includes(game);}
export const COMMUNITY_CURRENCY_CAMPAIGN='turkishpix-2026-10-09-50000';
export const COMMUNITY_CURRENCY_AMOUNT=50000;
