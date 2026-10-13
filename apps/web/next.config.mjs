import path from 'node:path';
export default {
  output: 'standalone', outputFileTracingRoot: path.resolve('../..'),
  serverExternalPackages: ['pg'], poweredByHeader: false,
  async headers() { return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
    {key:'Content-Security-Policy',value:`default-src 'self'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net https://i.ytimg.com ${process.env.OSINT_ONLY==='true'?'https://avatars.githubusercontent.com https://gitlab.com https://assets.gitlab-static.net https://secure.gravatar.com https://www.gravatar.com https://gravatar.com https://codeberg.org https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net https://cdn.bsky.app https://images.chesscomfiles.com https://huggingface.co https://cdn-avatars.huggingface.co https://media2.dev.to https://res.cloudinary.com':''}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`}
  ]}]; }
};
