// Labels observed in the user's own messages; never account-registration assertions.
export const inboxServices=[{id:'all',name:'Tüm mesajlar'},{id:'whatsapp',name:'WhatsApp'},{id:'google',name:'Google / Gmail'},{id:'tiktok',name:'TikTok'},{id:'telegram',name:'Telegram'},{id:'other',name:'Diğer'}] as const;
export type InboxService=(typeof inboxServices)[number]['id'];
type Message={from:string;subject:string;text:string};
export function messageServices(m:Message){const text=[m.from,m.subject,m.text].join(' '),services:InboxService[]=[];if(/\bwhatsapp\b/i.test(text))services.push('whatsapp');if(/\b(?:google|gmail)\b/i.test(text))services.push('google');if(/\btiktok\b/i.test(text))services.push('tiktok');if(/\btelegram\b/i.test(text))services.push('telegram');return services.length?services:['other'];}
export function filterInboxMessages<T extends Message>(messages:T[],service:string='all'){return service==='all'?messages:messages.filter(m=>messageServices(m).includes(service as InboxService));}
export function inboxServiceCounts(messages:Message[]){return Object.fromEntries(inboxServices.map(s=>[s.id,filterInboxMessages(messages,s.id).length]));}
