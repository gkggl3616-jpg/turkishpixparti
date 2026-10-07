import {Pool, type PoolClient, type QueryResultRow} from 'pg';
import {DomainError} from './config';
export type DB={query<T extends QueryResultRow=any>(sql:string,params?:any[]):Promise<{rows:T[];rowCount:number|null}>};
let pool:Pool|undefined; let testDatabase:DB|undefined;
export function database():DB { if(testDatabase)return testDatabase; if(!process.env.DATABASE_URL)throw new DomainError('DATABASE_UNAVAILABLE','Veritabanı bağlantısı tanımlanmadı.',503); return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000}); }
export function setTestDatabase(db:DB){testDatabase=db;}
export async function transaction<T>(fn:(tx:DB)=>Promise<T>):Promise<T>{
 if(testDatabase){await testDatabase.query('BEGIN');try{const value=await fn(testDatabase);await testDatabase.query('COMMIT');return value;}catch(e){await testDatabase.query('ROLLBACK');throw e;}}
 const client=await (database() as Pool).connect();
 try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function closeDatabase(){await pool?.end();pool=undefined;}
