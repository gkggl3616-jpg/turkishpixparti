export const moderationCommands=[...['kick','ban'].map(name=>({
 name,description:name==='kick'?'Bir üyeyi sunucudan çıkar; isteğe bağlı sebep belirt.':'Bir üyeyi yasakla ve DM ile bildir; isteğe bağlı sebep belirt.',
 default_member_permissions:name==='kick'?'2':'4',
 options:[{type:6,name:'uye',description:'İşlem yapılacak sunucu üyesi',required:true},{type:3,name:'reason',description:'İsteğe bağlı işlem sebebi',required:false,max_length:500}]
})),{name:'sil',description:'Mesajları temizle; istersen yalnızca seçtiğin kullanıcının mesajlarını sil.',default_member_permissions:'8192',options:[{type:4,name:'adet',description:'Silinecek mesaj sayısı (1–100)',required:true,min_value:1,max_value:100},{type:6,name:'uye',description:'Yalnızca bu kullanıcının mesajları; boşsa tüm kullanıcılar',required:false}]}];
