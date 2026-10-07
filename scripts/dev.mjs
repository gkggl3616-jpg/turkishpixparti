import 'dotenv/config';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const args=process.argv.slice(2);
const portAt=args.findIndex(x=>x==='--port'||x==='-p');const hostAt=args.findIndex(x=>x==='--host'||x==='--hostname');
const port=portAt>=0?args[portAt+1]:process.env.PORT||'3000';const host=hostAt>=0?args[hostAt+1]:'0.0.0.0';
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','apps/web','--hostname',host,'--port',port],{stdio:'inherit',env:process.env});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code||0));
