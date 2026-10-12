import OsintOwnerPanel from '../../../components/OsintOwnerPanel';
import '../osint.css';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Turkish Osint · Owner Denetimi',icons:{icon:'/osint-assets/nexus-mark.svg'},robots:{index:false,follow:false}};
export default function OwnerPage(){return <OsintOwnerPanel/>;}
