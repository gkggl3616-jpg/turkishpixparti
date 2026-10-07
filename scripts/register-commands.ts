import 'dotenv/config';
import {config,discordRequest} from '@turkishpix/core';
import {commands} from '../packages/core/src/commands';
const c=config();if(!c.botToken||!c.guildId)throw new Error('Bot token ve guild ID gerekli.');
await discordRequest(`/applications/${c.clientId}/guilds/${c.guildId}/commands`,{method:'PUT',body:JSON.stringify(commands)});
console.log(`${commands.length} TurkishPix komutu kaydedildi.`);
