import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const pool=new Pool({connectionString:process.env.DATABASE_ADMIN_URL||process.env.DATABASE_URL});
const client=await pool.connect();
try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(1557484054)');
 const exists=(await client.query("SELECT to_regclass('public.schema_migrations') AS present")).rows[0].present;
 for(const version of ['001_initial','003_discord_roles','004_server_setup','005_community','006_voice_presence','007_entertainment','008_chat_moderation','009_community_features']){
  const applied=exists&&(await client.query('SELECT version FROM schema_migrations WHERE version=$1',[version])).rows.length>0;
  if(!applied)await client.query(await readFile(new URL('../packages/core/sql/'+version+'.sql',import.meta.url),'utf8'));
 }
 await client.query('COMMIT');console.log('Veritabanı şeması hazır.');
}catch(e){await client.query('ROLLBACK');console.error('Migration başarısız. Veritabanı izinlerini kontrol edin.');process.exitCode=1;}finally{client.release();await pool.end();}
