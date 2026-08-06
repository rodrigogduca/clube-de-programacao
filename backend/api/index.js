/**
 * PONTO DE ENTRADA DA VERCEL.
 *
 * Todo o tráfego cai aqui (ver `routes` no vercel.json da raiz). O Nest é
 * montado sobre uma instância do Express na primeira invocação e reaproveitado
 * enquanto o contêiner continuar quente; um cold start paga a construção do
 * contêiner de injeção de dependência inteiro.
 *
 *
 * POR QUE ESTE ARQUIVO É .js E NÃO .ts
 *
 * Era `index.ts`, e isso colocava o compilador da Vercel no caminho crítico da
 * injeção de dependência do Nest.
 *
 * O `@vercel/node` compila TypeScript com `ts.transpileModule`, que traduz um
 * arquivo por vez, **sem verificador de tipos**. Nesse modo o compilador não
 * sabe se `PageContextService`, num construtor, é tipo ou valor — e com
 * `isolatedModules: true` (que está no tsconfig deste projeto) a importação é
 * descartada e o `design:paramtypes` sai como `[Object, Object]`.
 *
 * `design:paramtypes` é exatamente de onde o Nest tira o que injetar. Com
 * `Object` no lugar das classes, o container não resolve nada e o app quebra
 * em runtime, no deploy, com "Nest can't resolve dependencies of the
 * PanelController (?, ...)" — sem nenhum aviso no build.
 *
 * O `nest build` roda o `tsc` de verdade, com verificador, e emite as
 * referências às classes. Então o build acontece no `postinstall` (ver
 * package.json) e aqui só sobra um `require` de JavaScript já compilado. A
 * Vercel não compila TypeScript nenhum deste projeto.
 *
 * Consequência prática: este arquivo aponta para `dist/`. Se o `dist/` não
 * existir, o `require` abaixo falha na hora, com mensagem clara — que é
 * melhor que uma DI silenciosamente vazia.
 */
const express = require('express');
const { createApp } = require('../dist/src/bootstrap');

const expressApp = express();

/**
 * A PROMESSA, e não um booleano.
 *
 * Com `let isInitialized = false` — que era o que estava aqui — duas
 * requisições que chegam juntas num contêiner frio veem `false` as duas, porque
 * a bandeira só vira `true` depois do `await`. As duas então montam um Nest
 * sobre o MESMO `expressApp`, e o resultado é toda rota e todo middleware
 * registrados em dobro: a sessão é lida duas vezes, o CSRF é validado duas
 * vezes e o corpo do formulário chega consumido na segunda passada.
 *
 * Guardando a promessa, a segunda requisição espera na mesma inicialização.
 */
let inicializacao = null;

function initApp() {
  if (!inicializacao) {
    inicializacao = createApp(expressApp)
      .then(async (app) => {
        await app.init();
        return app;
      })
      .catch((erro) => {
        // Sem isto, um erro de boot (falta de SESSION_SECRET, banco fora do ar)
        // fica grudado na promessa e TODA invocação seguinte do mesmo contêiner
        // rejeita com o mesmo erro, mesmo depois de a causa ser corrigida.
        // Limpar deixa a próxima requisição tentar de novo.
        inicializacao = null;
        throw erro;
      });
  }
  return inicializacao;
}

module.exports = async function handler(req, res) {
  await initApp();
  return expressApp(req, res);
};
