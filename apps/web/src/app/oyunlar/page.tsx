import type {Metadata} from 'next';
import BotShell from '../../components/BotShell';
import ArcadePanel from '../../components/ArcadePanel';
export const metadata:Metadata={title:'2D & 3D Oyun Salonu · TurkishPix'};
export default function Page(){return <BotShell active="oyunlar"><ArcadePanel/></BotShell>;}
