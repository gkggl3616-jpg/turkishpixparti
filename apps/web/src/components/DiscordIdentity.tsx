export default function DiscordIdentity({id,username}:{id?:string|null;username?:string|null}){
 if(!id||id==='SYSTEM')return <span className="discord-identity system">⚙️ Sistem</span>;
 if(!/^\d{17,20}$/.test(id))return <span className="discord-identity">👤 {username||'Üye'}</span>;
 return <a className="discord-identity" href={'https://discord.com/users/'+id} target="_blank" rel="noreferrer">👤 {username?'@'+username:'Discord üyesi'}</a>;
}
