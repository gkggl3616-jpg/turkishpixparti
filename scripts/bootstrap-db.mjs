import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
const password=process.env.DATABASE_RUNTIME_PASSWORD;
if(!password||!/^[a-f0-9]{64}$/.test(password))throw new Error('Runtime password must be a generated 64-character hexadecimal value');
const pool=new Pool({connectionString:process.env.DATABASE_ADMIN_URL,connectionTimeoutMillis:15000});
const client=await pool.connect();
try{
 await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(1557484054)');
 for(const version of ['001_initial','003_discord_roles','004_server_setup','005_community']){
  const exists=(await client.query("SELECT to_regclass('public.schema_migrations') AS present")).rows[0].present;
  if(!exists||!(await client.query('SELECT version FROM schema_migrations WHERE version=$1',[version])).rows.length)await client.query(await readFile(new URL('../packages/core/sql/'+version+'.sql',import.meta.url),'utf8'));
 }
 await client.query(await readFile(new URL('../packages/core/sql/002_runtime_role.sql',import.meta.url),'utf8'));
 await client.query("ALTER ROLE turkishpix_runtime PASSWORD '"+password+"'");
 await client.query('COMMIT');
 const runtimeUrl=new URL(process.env.DATABASE_ADMIN_URL);runtimeUrl.username='turkishpix_runtime';runtimeUrl.password=password;
 const runtime=new Pool({connectionString:runtimeUrl.toString(),connectionTimeoutMillis:15000});
 try{
  const identity=(await runtime.query('SELECT current_user')).rows[0].current_user;
  if(identity!=='turkishpix_runtime')throw new Error('Runtime identity mismatch');
  for(const sql of ['UPDATE audit_events SET action=action','ALTER TABLE audit_events DISABLE TRIGGER USER']){
   let denied=false;try{await runtime.query(sql);}catch(e){denied=e.code==='42501';}if(!denied)throw new Error('Runtime audit protection failed');
  }
  console.log('TURKISHPIX_RUNTIME_AUDIT_PROTECTED');
 }finally{await runtime.end();}
 console.log('TURKISHPIX_DATABASE_READY');
}catch(e){await client.query('ROLLBACK');console.error('Database bootstrap failed:',typeof e.code==='string'?e.code:'VALIDATION');process.exitCode=1;}
finally{client.release();await pool.end();}
if(!process.exitCode&&process.env.BOOTSTRAP_KEEP_ALIVE==='true')setInterval(()=>{},60000);
