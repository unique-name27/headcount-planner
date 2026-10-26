// What the dev server (`npm run dev`, vite.config.ts) refuses to serve, kept here so a test can
// check it (src/ship/devServer.test.ts). Setting `server.fs.deny` replaces Vite's own list, so this
// is Vite 8's list plus workspace files (*.hcplan.json), which hold plan state and can hold pay.
export const DEV_SERVER_DENY = [
  // Vite 8's own list.
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
  // Workspace files, in any folder.
  '*.hcplan.json',
]
