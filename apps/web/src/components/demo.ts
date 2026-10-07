const date=new Date().toISOString();
export const demo={
 demo:true,me:null,parties:[
 {id:'demo-1',name:'Cumhuriyet ve Birlik Partisi',abbreviation:'CBP',color:'#d73c4a',leader_username:'demir',members:47,description:'Birlik, adalet ve güçlü bir meclis için ortak bir gelecek.',goals:'Şeffaf yönetim, katılımcı kararlar ve eşit temsil.',logo:''},
 {id:'demo-2',name:'Hürriyet Partisi',abbreviation:'HP',color:'#5d8fca',leader_username:'deniz',members:32,description:'Özgür düşünce ve katılımcı demokrasi.',goals:'Halkın katılımını artırmak ve yerel temsili güçlendirmek.',logo:''},
 {id:'demo-3',name:'Milli İrade Partisi',abbreviation:'MİP',color:'#d4ab56',leader_username:'atlas',members:26,description:'Milli irade, dayanışma ve sorumlu yönetim.',goals:'Etkin meclis çalışması ve sürdürülebilir etkinlikler.',logo:''}
 ],
 items:[{id:'demo-item-1',kind:'PARTY',title:'Anadolu Dayanışma Partisi',description:'Topluluğun dayanışmasını güçlendirmek ve aktif bir meclis oluşturmak.',author_username:'efe',author_id:'demo-user',payload:{abbreviation:'ADP',goals:'Etkinlikleri artırmak, şeffaf bütçe, güçlü temsil.'},state:'OWNER_REVIEW',approval_quorum:4,approvals:[{ownerId:'demo-owner1',username:'Owner 1',decision:'APPROVE',reason:''},{ownerId:'demo-owner2',username:'Owner 2',decision:'APPROVE',reason:''}],created_at:date},
 {id:'demo-item-2',kind:'BILL',title:'Haftalık meclis oturumları',description:'Meclisin haftada bir toplanması ve alınan kararların yayımlanması.',author_username:'demir',payload:{articles:'Madde 1: Haftalık oturum düzenlenir.\nMadde 2: Kararlar kayıt altına alınır.'},state:'VOTING',approval_quorum:4,approvals:[1,2,3,4].map(i=>({ownerId:'demo-owner'+i,username:'Owner '+i,decision:'APPROVE',reason:''})),created_at:date}],
 ballots:[{id:'demo-ballot',item_id:'demo-item-2',title:'Haftalık meclis oturumları',kind:'BILL',audience:'MP',state:'OPEN',options:[{id:'YES',label:'Kabul'},{id:'NO',label:'Ret'},{id:'ABSTAIN',label:'Çekimser'}],totals:{YES:8,NO:2,ABSTAIN:1},ends_at:new Date(Date.now()+11*3600000).toISOString(),discord_message_id:null}],
 deputies:['demir','deniz','atlas','efe','selin','baran','duru','kaan','arda','nehir','mert','ada'].map((name,i)=>({id:'demo-mp'+i,user_id:'demo-user'+i,username:name,abbreviation:['CBP','HP','MİP'][i%3],color:['#d73c4a','#5d8fca','#d4ab56'][i%3],party_name:['Cumhuriyet ve Birlik Partisi','Hürriyet Partisi','Milli İrade Partisi'][i%3]})),
 term:{name:'I. Yasama Dönemi',seats:20,starts_at:date},auditHead:{seq:128,hash:'örnek',created_at:date},rules:{owners:4,quorum:4,ballotHours:24,minVotes:1,minMemberAge:0},serverTime:date
};
export const demoEvents=[
 {seq:128,action:'BALLOT_OPENED',actor_id:'SYSTEM',entity_id:'demo-ballot',details:{audience:'MP'},created_at:date,hash:'Önizleme kaydı'},
 {seq:127,action:'OWNER_APPROVE',username:'Owner 4',entity_id:'demo-item-2',details:{reason:''},created_at:date,hash:'Önizleme kaydı'},
 {seq:126,action:'ITEM_SUBMITTED',username:'demir',entity_id:'demo-item-2',details:{kind:'BILL'},created_at:date,hash:'Önizleme kaydı'}
];
