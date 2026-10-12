import type {Metadata} from 'next';
import BotShell from '../../components/BotShell';
import OsintPanel from '../../components/OsintPanel';
import './osint.css';
export const metadata:Metadata={title:'Turkish Osint · NEXUS OSINT',description:'TurkishPix Discord hesabın ve XP seviyen ile OSINT araştırma araçları.',robots:{index:false,follow:false}};
export default function OsintPage(){return <BotShell active="osint"><OsintPanel/></BotShell>;}
