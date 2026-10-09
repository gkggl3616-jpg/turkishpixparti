export const roomGuideSteps=[
 {title:'Giriş kanalını kur',command:'/topluluk oda kur kategori: Ses Kanalları',description:'Yetkili bir kez kurar. Botta Kanalları Yönet ve Üyeleri Taşı izinleri gerekir.'},
 {title:'Kendi odana geç',command:'/topluluk oda ac ad: Arkadaşlar',description:'➕・Oda Oluştur ses kanalına katılınca bot odanı açar ve seni taşır. Bu komutla da elle açabilirsin; ses kanalındaysan taşınırsın.'},
 {title:'Girişleri yönet',command:'/topluluk oda kilitle',description:'Oda başlangıçta kategori izinlerini alır. Yeni girişleri kapatmak için kilitle; davet ettiğin üyeler ve yetkililer girebilir.'},
 {title:'Arkadaşını davet et',command:'/topluluk oda davet uye: @Arkadaş',description:'Davet, seçilen üyeye giriş izni verir. Üye odaya kendisi katılır; bot DM daveti göndermez.'}
] as const;
export function roomHelpText(emptySeconds=120){return roomGuideSteps.map((s,i)=>`**${i+1}. ${s.title}**\n${s.description}\n\`${s.command}\``).join('\n\n')+`\n\n**Diğer kontroller**\n\`/topluluk oda kilitac\` · \`/topluluk oda limit adet: 5\` · \`/topluluk oda ad ad: Sohbet\`\n\`/topluluk oda devret uye: @Üye\` · \`/topluluk oda kapat\`\n\nHer üyeye bir oda. Oda boş kalınca yaklaşık **${emptySeconds} saniye** sonra silinir. Kanala basılı tutman gerekmez; ses kanalına katılman yeterlidir.`;}
