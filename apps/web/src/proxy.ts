import {NextRequest,NextResponse} from 'next/server';
// The dedicated Turkish Osint Railway service only publishes the OSINT app.
// Other TurkishPix pages and private APIs are not exposed through this host.
export function proxy(request:NextRequest){
 if(process.env.OSINT_ONLY!=='true')return NextResponse.next();
 const p=request.nextUrl.pathname;
 if(p==='/'){const target=new URL('/osint',request.url);target.search=request.nextUrl.search;return NextResponse.redirect(target);}
 const allowed=p==='/osint'||p.startsWith('/osint/')||p==='/api/osint'||p.startsWith('/api/osint/')||p==='/guncellemeler'||p==='/privacy'||p==='/terms'||p==='/api/updates'||p==='/api/health'||p==='/api/auth/login'||p==='/api/auth/callback'||p==='/api/auth/bridge/callback'||p==='/api/auth/logout'||p.startsWith('/_next/')||p.startsWith('/brand/')||p.startsWith('/osint-assets/')||p==='/favicon.ico'||p==='/robots.txt';
 if(allowed)return NextResponse.next();
 return new NextResponse('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
}
export const config={matcher:['/((?!_next/static|_next/image).*)']};
