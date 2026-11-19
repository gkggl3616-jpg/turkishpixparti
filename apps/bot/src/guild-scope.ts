import {AsyncLocalStorage} from 'node:async_hooks';
import {setGuildScopeReader} from '../../../packages/core/src/config';

const guildScope = new AsyncLocalStorage<string>();
setGuildScopeReader(()=>guildScope.getStore());

export function withGuildScope<T>(guildId:string,work:()=>T):T {
 return guildScope.run(guildId,work);
}
