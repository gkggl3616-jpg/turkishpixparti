import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {config,DomainError} from './config';
import {type DB,database} from './db';
export function canonical(value:any):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
export function auditDocument(row:any){return {id:row.id,actor_id:row.actor_id,action:row.action,entity_id:row.entity_id,details:row.details,created_at:new Date(row.created_at).toISOString(),previous_hash:row.previous_hash};}
export async function audit(tx:DB,actor:string,action:string,entity:string,details:any={}) {
 const key=config().auditKey;if(key.length<32)throw new DomainError('AUDIT_NOT_CONFIGURED','Denetim anahtarı eksik.',503);
 await tx.query('SELECT pg_advisory_xact_lock(1557484052)');
 const last=await tx.query('SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1');
 const row={id:randomUUID(),actor_id:actor,action,entity_id:entity,details,created_at:new Date().toISOString(),previous_hash:last.rows[0]?.hash||'0'.repeat(64)};
 const hash=sha256(canonical(row));const mac=createHmac('sha256',key).update(hash).digest('hex');
 await tx.query('INSERT INTO audit_events(id,actor_id,action,entity_id,details,created_at,previous_hash,hash,mac) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[row.id,actor,action,entity,details,row.created_at,row.previous_hash,hash,mac]);
 return {hash,mac};
}
export async function verifyAudit(db:DB=database()) {
 const {rows}=await db.query('SELECT * FROM audit_events ORDER BY seq');let previous='0'.repeat(64);
 for(const row of rows){const hash=sha256(canonical(auditDocument(row)));const expected=createHmac('sha256',config().auditKey).update(hash).digest('hex');
  if(row.previous_hash!==previous||hash!==row.hash||expected!==row.mac)return {valid:false,count:rows.length,brokenAt:String(row.seq)};
  previous=row.hash;
 }
 return {valid:true,count:rows.length,head:previous};
}
export async function enqueue(tx:DB,kind:string,payload:any,dedupe:string){await tx.query('INSERT INTO outbox(id,kind,payload,dedupe_key) VALUES($1,$2,$3,$4) ON CONFLICT(dedupe_key) DO NOTHING',[randomUUID(),kind,payload,dedupe]);}
