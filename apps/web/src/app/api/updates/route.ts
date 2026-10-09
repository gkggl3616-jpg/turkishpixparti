import {NextResponse} from 'next/server';
import {database} from '../../../../../../packages/core/src/db';
import {RELEASE_VERSION} from '../../../../../../packages/core/src/config';
import {releases} from '../../../../../../packages/core/src/releases';
import {botInviteUrl} from '../../../../../../packages/core/src/setup';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 let bot=null;
 if(process.env.DATABASE_URL)try{
  const row=(await database().query("SELECT status,updated_at FROM integration_status WHERE name='discord'")).rows[0];
  if(row){const fresh=Date.now()-new Date(row.updated_at).getTime()<30000,s=row.status;bot={version:s.version||null,connected:fresh&&!!s.connected,guildAvailable:fresh&&!!s.configuredGuild,commandsRegistered:fresh&&!!s.configuredGuild&&!!s.commandsRegistered,registeredVersion:s.configuredGuild?s.registeredVersion||null:null};}
 }catch{}
 return NextResponse.json({webVersion:RELEASE_VERSION,bot,releases,installUrl:botInviteUrl()},{headers:{'Cache-Control':'no-store'}});
}
