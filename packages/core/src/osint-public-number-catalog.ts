// Public service inventory, safe to import in the browser. These are HTML list adapters, not SMS APIs.
export const publicNumberSources=[
 {id:'sms-receive-online.com',name:'SMS Receive Online',url:'https://www.sms-receive-online.com/'},
 {id:'receive-sms.io',name:'Receive-SMS.io',url:'https://receive-sms.io/'},
 {id:'sms24.me',name:'SMS24.me',url:'https://sms24.me/en/numbers'},
 {id:'anonymsms.com',name:'AnonymSMS',url:'https://anonymsms.com/'},
 {id:'receive-smss.com',name:'Receive-SMSS',url:'https://receive-smss.com/'},
 {id:'freephonenum.com',name:'FreePhoneNum',url:'https://freephonenum.com/receive-sms'},
 {id:'sms-online.co',name:'SMS Online',url:'https://sms-online.co/receive-free-sms'},
 {id:'receive-sms.cc',name:'Receive-SMS.cc',url:'https://receive-sms.cc/'},
 {id:'receive-sms-online.info',name:'Receive SMS Online Info',url:'https://receive-sms-online.info/'},
 {id:'receive-sms-free.cc',name:'Receive SMS Free',url:'https://receive-sms-free.cc/'}
] as const;
export type PublicNumberSourceId=(typeof publicNumberSources)[number]['id'];
export type PublicNumber={number:string;url:string;country:string;source:string};
export type PublicNumberSnapshot={id:string;name:string;url:string;state:'OK'|'EMPTY'|'BLOCKED'|'ERROR';code:string;checkedAt:string;nextCheckAt:string;latencyMs:number;numbers:PublicNumber[];stale:boolean;truncated:boolean;lastSuccessAt?:string};
