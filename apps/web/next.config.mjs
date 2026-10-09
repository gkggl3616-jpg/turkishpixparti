import path from 'node:path';
export default {
  output: 'standalone', outputFileTracingRoot: path.resolve('../..'),
  serverExternalPackages: ['pg'], poweredByHeader: false,
  async headers() { return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
    {key:'Content-Security-Policy',value:"default-src 'self'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net https://i.ytimg.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"}
  ]}]; }
};
