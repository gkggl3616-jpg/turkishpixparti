import type {Metadata} from 'next';
import BotShell from '../../components/BotShell';
import UpdatesPanel from '../../components/UpdatesPanel';
import './updates.css';
import OsintUpdates from '../../components/OsintUpdates';
import '../osint/workbench.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Güncellemeler · TurkishPix',description:'Yeni bot özellikleri, Discord komutları ve sürüm notları.'};
export default function Page(){if(process.env.OSINT_ONLY==='true')return <OsintUpdates/>;return <BotShell active="guncellemeler"><UpdatesPanel/></BotShell>;}
