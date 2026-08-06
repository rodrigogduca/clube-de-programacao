/**
 * Roda `nest build` durante o `postinstall`, mas SÓ no build da Vercel.
 *
 * Por que no postinstall: o `vercel.json` usa `builds`, e nesse modo a Vercel
 * não executa `buildCommand` nenhum — o único gancho que roda é o
 * `postinstall` do package.json mais próximo do entrypoint. É lá que o
 * `dist/` precisa nascer, porque `api/index.js` faz `require('../dist/...')`.
 *
 * Por que só na Vercel: quem clona o repositório e roda `npm install` não
 * deveria esperar um build completo do Nest, e quem roda `npm ci` num CI de
 * teste também não. Em desenvolvimento o `nest start --watch` compila em
 * memória e nunca olha para o `dist/`.
 *
 * `VERCEL=1` é definido pela própria plataforma em todos os builds.
 * Ver https://vercel.com/docs/environment-variables/system-environment-variables
 *
 * Em Node e não em shell porque a máquina de quem desenvolve é Windows: um
 * `if [ "$VERCEL" = "1" ]` no package.json quebraria no cmd.exe.
 */
const { execSync } = require('node:child_process');

if (!process.env.VERCEL) {
  process.exit(0);
}

console.log('[build-no-vercel] VERCEL detectado — compilando com nest build');
execSync('npm run build', { stdio: 'inherit' });
