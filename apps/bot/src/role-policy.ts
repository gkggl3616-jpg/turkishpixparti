import {PermissionFlagsBits} from 'discord.js';
import {AUTOMATIC_ROLE_DANGER_MASK,config,DomainError,roleMappings} from '@turkishpix/core';

/** Every public/automatic role feature uses the same assignability rules. */
export async function assignableRole(guild:any,id:string,executor?:any){
 const role=await guild.roles.fetch(id);
 if(!role)throw new DomainError('ROLE_NOT_FOUND','Seçilen rol artık sunucuda yok. Rol listesini yenile.');
 if(role.id===guild.id)throw new DomainError('ROLE_EVERYONE','@everyone tüm üyelerde zaten bulunur. Yeni üyeye verilecek Üye gibi ayrı bir rol seç.');
 if(role.managed)throw new DomainError('ROLE_MANAGED','Bu rolü Discord veya bağlı uygulaması yönetiyor. Sunucu ayarlarından oluşturduğun normal bir rol seç.');
 if(role.permissions.bitfield&AUTOMATIC_ROLE_DANGER_MASK)throw new DomainError('ROLE_PRIVILEGED','Bu rol yönetim veya moderasyon yetkisi taşıyor; otomatik verilemez. Üye ve rütbe rollerinde bu yetkileri kapat.');
 if(Object.values(await roleMappings()).includes(id))throw new DomainError('ROLE_PROTECTED','Meclis ve siyasi görev rolleri kendi görev sisteminden verilir.',403);
 const me=await guild.members.fetchMe();
 if(!me.permissions.has(PermissionFlagsBits.ManageRoles))throw new DomainError('ROLE_PERMISSION','TurkishPix botuna Rolleri Yönet izni ver.');
 if(me.roles.highest.comparePositionTo(role)<=0)throw new DomainError('ROLE_HIERARCHY','Sunucu Ayarları → Roller bölümünde TurkishPix rolünü '+role.name+' rolünün üstüne taşı.');
 if(executor&&executor.id!==guild.ownerId&&!config().owners.includes(executor.id)&&(!executor.permissions.has(PermissionFlagsBits.ManageRoles)||executor.roles.highest.comparePositionTo(role)<=0))throw new DomainError('ROLE_PERMISSION','Rolleri Yönet iznin bulunmalı; seçilen rol kendi en yüksek rolünün altında olmalı.',403);
 const channels=await guild.channels.fetch();
 if(channels.some((ch:any)=>ch?.permissionOverwrites?.cache?.some((o:any)=>o.id===id&&(o.allow.bitfield&AUTOMATIC_ROLE_DANGER_MASK))))throw new DomainError('ROLE_CHANNEL_PRIVILEGED','Bu role kanal izinlerinde yönetim veya moderasyon yetkisi verilmiş. Kanal izinlerini düzenle.');
 return role;
}
