/** Shared by Discord commands, the ticket panel and its web preview. */
export const ticketTopics = [
 {id:'reward',label:'Ödül Talebi',slug:'odul-talebi',emoji:'🎁',description:'Çekiliş veya etkinlik ödülünü teslim al.'},
 {id:'support',label:'Destek',slug:'destek',emoji:'💬',description:'Bir sorun için yetkililerden yardım iste.'},
 {id:'complaint',label:'Şikâyet',slug:'sikayet',emoji:'🛡️',description:'Bir üyeyi veya yaşanan olayı yetkililere bildir.'},
 {id:'application',label:'Başvuru',slug:'basvuru',emoji:'📝',description:'Ekibe, etkinliğe veya bir göreve başvur.'},
 {id:'other',label:'Diğer',slug:'diger',emoji:'📌',description:'Diğer konular için özel görüşme aç.'}
] as const;
export type TicketTopic = typeof ticketTopics[number];
export const ticketTopic = (id:string) => ticketTopics.find(topic=>topic.id===id);
export const ticketTopicOption = () => ({name:'tur',description:'Bilet kategorisini seç',type:3,required:true,choices:ticketTopics.map(topic=>({name:topic.label,value:topic.id}))});
export function ticketChannelName(topic:TicketTopic,username:string){
 const name=username.normalize('NFKD').replace(/ı/g,'i').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'uye';
 return `${topic.slug}-${name}`.slice(0,100).replace(/-+$/g,'');
}
export function ticketTopicButtons(enabled=true){return [{type:1,components:ticketTopics.map(topic=>({type:2,style:topic.id==='reward'?3:topic.id==='support'?1:2,custom_id:'ticket:open:'+topic.id,label:topic.label,emoji:{name:topic.emoji},disabled:!enabled}))}];}
