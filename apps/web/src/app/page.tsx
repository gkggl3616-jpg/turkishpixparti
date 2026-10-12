import ReleaseNotice from '../components/ReleaseNotice';
import Panel from '../components/Panel';
import BotHub from '../components/BotHub';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;return <><ReleaseNotice/>{params.view||params.error||params.create?<Panel/>:<BotHub/>}</>;}
