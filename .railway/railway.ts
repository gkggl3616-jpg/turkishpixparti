import {defineRailway,project,service,postgres,github} from 'railway/iac';
export default defineRailway(ctx=>{
 const db=postgres('Postgres');
 const common={
  NODE_ENV:'production',DEMO_MODE:'false',DISCORD_CLIENT_ID:'1557484052133707896',
  DISCORD_PUBLIC_KEY:'880bd59730ab7eeb5ba83a147634fd648c729a7cb2a3a87ad427bdae4c54a74d',
  DATABASE_URL:ctx.shared.DATABASE_RUNTIME_URL,
  APP_URL:ctx.shared.APP_URL,DISCORD_CLIENT_SECRET:ctx.shared.DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN:ctx.shared.DISCORD_BOT_TOKEN,DISCORD_GUILD_ID:ctx.shared.DISCORD_GUILD_ID,
  DISCORD_VOTE_CHANNEL_ID:ctx.shared.DISCORD_VOTE_CHANNEL_ID,DISCORD_LOG_CHANNEL_ID:ctx.shared.DISCORD_LOG_CHANNEL_ID,
  DISCORD_MP_ROLE_ID:ctx.shared.DISCORD_MP_ROLE_ID,DISCORD_OWNER_IDS:'1317890469673566279,1437618075766624326,1140563797036249178,1510231175854031018',
  AUDIT_HMAC_KEY:ctx.shared.AUDIT_HMAC_KEY,OWNER_APPROVAL_QUORUM:'4',BALLOT_HOURS:'24',MIN_VOTES:'1',MIN_MEMBER_AGE_HOURS:'0',SESSION_HOURS:'24'
 };
 const web=service('Web',{
  source:github('gkggl3616-jpg/turkishpixparti',{branch:'main'}),
  start:'node apps/web/server.js',preDeploy:'node scripts/migrate.mjs',healthcheck:'/api/health',healthcheckTimeout:180,replicas:1,
  env:{...common,PORT:'3000',RAILWAY_DOCKERFILE_PATH:'Dockerfile.web'}
 });
 const bot=service('Bot',{
  source:github('gkggl3616-jpg/turkishpixparti',{branch:'main'}),
  start:'npm run bot',replicas:1,
  env:{...common,RAILWAY_DOCKERFILE_PATH:'Dockerfile.bot'}
 });
 return project('TurkishPix Siyasi Sistem',{resources:[db,web,bot]});
});
