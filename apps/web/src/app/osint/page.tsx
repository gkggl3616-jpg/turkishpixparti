import type {Metadata} from 'next';
import OsintPanel from '../../components/OsintPanel';
import './osint.css';
import './nexus-dashboard.css';
export const metadata:Metadata={title:'Turkish Osint · Intelligence Command Center',description:'TurkishPix Discord hesabın ve XP seviyen ile OSINT araştırma araçları.',robots:{index:false,follow:false}};
export default function OsintPage(){return <OsintPanel/>;}
