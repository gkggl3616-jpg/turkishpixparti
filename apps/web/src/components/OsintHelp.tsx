'use client';
import {useId,useRef,useState,useEffect} from 'react';
export type HelpContent={title:string;description:string;example?:string;limits?:string};
export default function OsintHelp({content}:{content:HelpContent}){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false);
 useEffect(()=>{if(open)dialog.current?.showModal();else if(dialog.current?.open)dialog.current.close();},[open]);
 function close(){setOpen(false);trigger.current?.focus();}
 return <><button ref={trigger} type="button" className="os-help-button" aria-label={content.title+' açıklaması'} aria-haspopup="dialog" aria-controls={id} title={content.title+' · Nasıl kullanılır?'} onClick={e=>{e.stopPropagation();setOpen(true);}}>?</button><dialog ref={dialog} id={id} className="os-help-dialog" aria-labelledby={id+'-title'} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}><div className="ow-heading"><h2 id={id+'-title'}>{content.title}</h2><button type="button" onClick={close} aria-label="Açıklamayı kapat">×</button></div><p>{content.description}</p>{content.example&&<p><strong>Örnek / kullanım</strong><br/>{content.example}</p>}{content.limits&&<p><strong>Sonuçları değerlendirirken</strong><br/>{content.limits}</p>}<button type="button" className="os-primary-action" onClick={close}>Anladım</button></dialog></>;
}
