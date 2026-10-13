import {DomainError} from '../../../packages/core/src/config';
const offset=3*3600000;
/** Month anchored windows in Europe/Istanbul: 1–3, 4–6, ...; month end is shortened. */
export function owoPeriod(value:Date|string=new Date()){
 let now:Date;if(typeof value==='string'){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new DomainError('OWO_DATE','Tarih YYYY-AA-GG biçiminde olmalı.',400);
  now=new Date(value+'T12:00:00+03:00');if(!Number.isFinite(now.getTime())||new Date(now.getTime()+offset).toISOString().slice(0,10)!==value)throw new DomainError('OWO_DATE','Geçerli bir tarih gir.',400);
 }else now=value;
 if(!Number.isFinite(now.getTime()))throw new DomainError('OWO_DATE','Tarih okunamadı.',400);
 const local=new Date(now.getTime()+offset),year=local.getUTCFullYear(),month=local.getUTCMonth(),day=local.getUTCDate(),startDay=1+3*Math.floor((day-1)/3),lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 const start=new Date(Date.UTC(year,month,startDay)-offset),end=new Date(Date.UTC(year,month,Math.min(startDay+3,lastDay+1))-offset),key=new Date(start.getTime()+offset).toISOString().slice(0,10);
 return {key,start,end,label:key+' → '+new Date(end.getTime()+offset-1).toISOString().slice(0,10),timezone:'Europe/Istanbul'};
}
