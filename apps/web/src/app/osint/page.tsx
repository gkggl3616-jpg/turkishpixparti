import type {Metadata} from 'next';
import OsintDashboard from '../../components/OsintDashboard';
import './dashboard.css';
export const metadata:Metadata={title:'NEXUS OSINT | TurkishPix Intelligence',description:'TurkishPix OSINT çalışma alanı: Discord üyeliği, operatör unvanları ve güvenli araştırma araçları.',icons:{icon:'/osint-assets/nexus-mark.svg'},robots:{index:false,follow:false}};
export default function OsintPage(){return <OsintDashboard/>;}
