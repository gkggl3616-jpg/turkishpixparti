export const WELCOME_ROLES={notify:'1557495902514581605',lady:'1557754894109249567',gentleman:'1558132162807464036'} as const;
export function roleWelcomeText(memberId:string,roleIds:string[],roles:{notify:string;lady:string;gentleman:string}=WELCOME_ROLES){
 const label=roleIds.includes(roles.lady)?'Lady’mize hoş geldin deyin':roleIds.includes(roles.gentleman)?'Centilmene hoş geldin deyin':'Yeni gelen üyemize hoş geldin deyin';
 return '<@&'+roles.notify+'> · '+label+'! 👋 <@'+memberId+'>';
}
