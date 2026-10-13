import {osintCategories} from './osint-navigation';
// Public Discord setup commands. Research happens through persistent panel buttons.
const channel={type:7,name:'kanal',description:'Panelin gönderileceği kanal (boşsa burası)',required:false,channel_types:[0,5]};
export const osintSetupCommand={name:'kur',description:'OSINT ana kategori panellerini kur veya güncelle.',default_member_permissions:null,options:osintCategories.map(c=>({type:1,name:c.command,description:(c.label+' ana kategori panelini kur.').slice(0,100),options:[channel]}))};
