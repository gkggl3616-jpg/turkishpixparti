import 'dotenv/config';
import {Pool} from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
const admin=process.env.DATABASE_ADMIN_URL||process.env.DATABASE_URL;
const password=process.env.DATABASE_RUNTIME_PASSWORD;
if(!admin||!password||password.length<32)throw new Error('Admin bağlantısı ve en az 32 karakter DATABASE_RUNTIME_PASSWORD gerekli.');
const pool=new Pool({connectionString:admin});const client=await pool.connect();
try{
 await client.query('BEGIN');await client.query(await readFile(new URL('../packages/core/sql/002_runtime_role.sql',import.meta.url),'utf8'));
 await client.query('ALTER ROLE turkishpix_runtime PASSWORD '+client.escapeLiteral(password));
 await client.query('COMMIT');const url=new URL(admin);url.username='turkishpix_runtime';url.password=password;
 await writeFile(new URL('../.runtime.env',import.meta.url),'DATABASE_URL='+url.toString()+'\n',{mode:0o600});
 console.log('Kısıtlı uygulama rolü hazır. Bağlantı .runtime.env dosyasına yazıldı; web ve bot DATABASE_URL değerini buradan ayarlayın.');
}catch{await client.query('ROLLBACK');console.error('Veritabanı rolü oluşturulamadı.');process.exitCode=1;}finally{client.release();await pool.end();}
