import type {Metadata} from 'next';
import BotShell from '../../components/BotShell';
import UpdatesPanel from '../../components/UpdatesPanel';
import './updates.css';
export const metadata:Metadata={title:'Güncellemeler · TurkishPix',description:'Yeni bot özellikleri, Discord komutları ve sürüm notları.'};
export default function Page(){return <BotShell active="guncellemeler"><UpdatesPanel/></BotShell>;}
