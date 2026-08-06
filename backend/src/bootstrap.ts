import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import type { Application } from 'express';
import { existsSync } from 'fs';
import helmet from 'helmet';
import nunjucks from 'nunjucks';
import { join } from 'path';
import { AppModule } from './app.module';
import { WebExceptionFilter } from './common/web-exception.filter';
import { buildUrl } from './views/routes';

/**
 * Onde estão os templates e os arquivos estáticos.
 *
 * Em desenvolvimento são lidos direto de `src/`, o que faz alterações em `.njk`
 * e `.css` aparecerem sem rebuild. A alternativa seria `watchAssets` no
 * nest-cli, mas o watcher dele tenta copiar os arquivos temporários das
 * gravações atômicas e derruba o servidor com ENOENT. Ler da origem resolve o
 * mesmo problema sem watcher nenhum.
 *
 * Em produção existem TRÊS layouts possíveis, e é por isso que aqui há uma
 * lista e não um caminho:
 *
 *   servidor comum   `node dist/src/main` → assets em `dist/src/{views,public}`,
 *                    copiados pelo `assets` do nest-cli.json.
 *   Vercel           A função é compilada de `backend/api/index.ts` e o
 *                    `@vercel/node` preserva a árvore do repositório dentro do
 *                    lambda: o `bootstrap.js` cai em
 *                    `/var/task/backend/src/`, e os assets chegam pelo
 *                    `includeFiles` do vercel.json, na mesma árvore.
 *   fallback         Ancorado no `process.cwd()`, para o caso de o empacotador
 *                    achatar a estrutura e o `__dirname` deixar de bater.
 *
 * Um `join(__dirname, ...)` sozinho — que era o que existia — acerta o primeiro
 * caso e falha calado nos outros: o Nunjucks só descobre que não há template na
 * primeira requisição, e o erro que chega é "template not found", que não diz
 * nada sobre caminho errado.
 */
function resolveAssetDir(nome: 'views' | 'public') {
  const emDesenvolvimento = process.env.NODE_ENV !== 'production';

  const candidatos = [
    // Desenvolvimento primeiro, para editar .njk e .css sem rebuild.
    ...(emDesenvolvimento ? [join(__dirname, '..', '..', 'src', nome)] : []),
    join(__dirname, nome),
    join(process.cwd(), 'backend', 'src', nome),
    join(process.cwd(), 'dist', 'src', nome),
    join(process.cwd(), 'src', nome),
  ];

  const encontrado = candidatos.find((caminho) => existsSync(caminho));
  if (encontrado) {
    return encontrado;
  }

  // Falhar aqui, no boot, e dizendo onde procurou. É a diferença entre um
  // deploy que morre com a lista de caminhos no log e um que responde 500 em
  // toda página até alguém adivinhar que o `includeFiles` está errado.
  throw new Error(
    `Não encontrei a pasta "${nome}". Procurei em:\n` +
      candidatos.map((c) => `  ${c}`).join('\n') +
      `\n__dirname=${__dirname}\ncwd=${process.cwd()}\n` +
      `Na Vercel isto costuma ser o "includeFiles" do vercel.json.`,
  );
}

export async function createApp(expressApp?: Application) {
  const app = expressApp
    ? await NestFactory.create<NestExpressApplication>(
        AppModule,
        new ExpressAdapter(expressApp),
      )
    : await NestFactory.create<NestExpressApplication>(AppModule);

  return configurarApp(app);
}

/**
 * Nunjucks, helmet, pipes e filtros — tudo o que transforma um app cru no app
 * de verdade.
 *
 * Separado do `createApp` para que os testes de rota possam montar o app por um
 * TestingModule (que permite trocar o PrismaService por um dublê) e ainda assim
 * receber exatamente a mesma configuracao. Testar contra um app configurado
 * pela metade e testar outra aplicacao.
 */
export function configurarApp(app: NestExpressApplication) {
  const viewsPath = resolveAssetDir('views');
  const publicPath = resolveAssetDir('public');
  const isProduction = process.env.NODE_ENV === 'production';

  /**
   * A VERSÃO DOS ARQUIVOS ESTÁTICOS.
   *
   * Os nomes não têm hash (`layout.css`, não `layout.a3f9.css`), então sem
   * marca de versão não dá para cachear com segurança: ou o cache é curto e
   * todo carregamento paga a viagem, ou é longo e a pessoa fica com o CSS
   * velho depois do deploy.
   *
   * O commit resolve os dois: `?v=` muda a cada publicação, então o cache pode
   * ser eterno. `VERCEL_GIT_COMMIT_SHA` vem de graça no ambiente da Vercel; em
   * servidor comum cai no instante em que o processo subiu, que muda a cada
   * reinício — que é quando o código pode ter mudado.
   *
   * Vazio em desenvolvimento de propósito: o `?v=` fixo faria o navegador
   * segurar o CSS que se acabou de editar.
   */
  const versaoAssets = isProduction
    ? (process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
      Date.now().toString(36))
    : '';

  app.useStaticAssets(publicPath, {
    prefix: '/static',
    /**
     * `immutable` só quando a URL carrega a versão — e ela carrega, porque o
     * global `static()` abaixo a coloca. Sem `?v=` o cache é de dez minutos:
     * é o caso de quem digitou o endereço na mão ou de um HTML antigo, e aí
     * cachear por um ano deixaria o arquivo preso no navegador.
     *
     * `s-maxage` é o que faz o CDN da Vercel responder no lugar da função. Sem
     * ele, cada CSS, cada fonte e cada foto da diretoria acorda um lambda.
     */
    setHeaders: (res) => {
      if (!isProduction) {
        return;
      }
      const temVersao = Boolean((res.req as { query?: Record<string, unknown> })?.query?.v);
      res.setHeader(
        'Cache-Control',
        temVersao
          ? 'public, max-age=31536000, s-maxage=31536000, immutable'
          : 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800',
      );
    },
  });
  app.setBaseViewsDir(viewsPath);
  app.setViewEngine('njk');

  const env = nunjucks.configure(viewsPath, {
    autoescape: true,
    express: app.getHttpAdapter().getInstance(),
    // Sem cache em desenvolvimento, senão a edição do template não aparece.
    noCache: !isProduction,
  });

  env.addGlobal('static', (assetPath: string) => {
    const normalized = assetPath.replace(/^\//, '');
    const url = `/static/${normalized}`;
    return versaoAssets ? `${url}?v=${versaoAssets}` : url;
  });
  env.addGlobal('url', (name: string, ...params: Array<string | number>) => {
    return buildUrl(name, ...params);
  });

  /**
   * Código de verificação do Google Search Console.
   *
   * O Search Console precisa provar que o site é seu antes de aceitar o
   * sitemap, e para um subdomínio `.vercel.app` o único método viável é a meta
   * tag (não dá para editar DNS de um domínio da Vercel, e o método do arquivo
   * HTML exigiria uma rota nova a cada verificação).
   *
   * Vem de variável de ambiente para não versionar um código que é só desta
   * instalação — e para trocar sem deploy de código, só mexendo na Vercel.
   * Vazio em desenvolvimento, e aí a tag simplesmente não sai.
   */
  env.addGlobal(
    'google_site_verification',
    process.env.GOOGLE_SITE_VERIFICATION ?? '',
  );
  // Fallback: cada rota injeta o `csrf_token` real no contexto da pagina.
  env.addGlobal('csrf_token', () => '');
  env.addFilter('make_list', (value: unknown) => {
    if (value == null) {
      return [];
    }
    return String(value).split('');
  });
  env.addFilter('first', (value: unknown) => {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    if (value == null) {
      return null;
    }
    const stringValue = String(value);
    return stringValue.length > 0 ? stringValue.charAt(0) : null;
  });
  env.addFilter('pluralize', (count: unknown, suffix = 's') => {
    const numberValue = Number(count);
    const isOne = numberValue === 1;
    if (!suffix) {
      return isOne ? '' : 's';
    }

    const parts = suffix.split(',');
    if (parts.length === 1) {
      return isOne ? '' : parts[0];
    }

    return isOne ? parts[0] : parts[1];
  });

  /**
   * Formata no estilo do Django, que e o que os templates herdados usam.
   *
   * `utc` decide o fuso da leitura, e a escolha importa: `prazo` e uma data sem
   * hora, gravada como meia-noite UTC, entao lida no fuso de Sao Paulo (UTC-3)
   * ela cai as 21h do dia anterior e o prazo aparece um dia adiantado. Ja
   * `dataCriacao` e `dataUpload` sao instantes de verdade e devem sair na hora
   * local de quem esta olhando.
   */
  const formatarData = (value: unknown, format: string, utc: boolean) => {
    if (value == null) return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';

    const pad = (n: number) => String(n).padStart(2, '0');
    const ano = utc ? date.getUTCFullYear() : date.getFullYear();
    const map: Record<string, string> = {
      d: pad(utc ? date.getUTCDate() : date.getDate()),
      m: pad((utc ? date.getUTCMonth() : date.getMonth()) + 1),
      Y: String(ano),
      y: String(ano).slice(-2),
      H: pad(utc ? date.getUTCHours() : date.getHours()),
      i: pad(utc ? date.getUTCMinutes() : date.getMinutes()),
      s: pad(utc ? date.getUTCSeconds() : date.getSeconds()),
    };

    return format.replace(/[dYmMyHis]/g, (match) => map[match] ?? match);
  };

  env.addFilter('date', (value: unknown, format: string) =>
    formatarData(value, format, false),
  );

  /** Para campos de data sem hora (`prazo`). Use `date` para instantes. */
  env.addFilter('date_utc', (value: unknown, format: string) =>
    formatarData(value, format, true),
  );

  env.addFilter('truncatewords', (value: unknown, count: number) => {
    if (value == null) return '';
    const str = String(value);
    const words = str.split(/\s+/);
    if (words.length <= count) return str;
    return words.slice(0, count).join(' ') + '...';
  });

  app.set('trust proxy', 1);

  /**
   * CADA DEPLOY DA VERCEL GANHA UMA URL PRÓPRIA — e todas servem este mesmo
   * site.
   *
   * `site-clube-o7vv49ubf-rodrigos-projects.vercel.app`,
   * `site-clube-7q73qm7mr-...`, uma por publicação, todas públicas e todas com
   * o conteúdo idêntico ao do domínio de verdade. Para um buscador isso é
   * conteúdo duplicado espalhado por dezenas de endereços, e o risco é ele
   * escolher indexar a URL de um deploy antigo em vez da oficial.
   *
   * O `<link rel="canonical">` já aponta para a certa e costuma resolver, mas
   * é uma dica — o cabeçalho é uma instrução. Com os dois, o buscador só tem
   * um endereço a considerar.
   *
   * Sem `SITE_URL` configurada não faz nada: melhor não marcar nada do que
   * marcar o site inteiro como não-indexável por engano.
   */
  const canonico = (() => {
    try {
      return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : '';
    } catch {
      return '';
    }
  })();

  if (isProduction && canonico) {
    app.use((req, res, next) => {
      if (req.headers.host && req.headers.host !== canonico) {
        res.setHeader('X-Robots-Tag', 'noindex');
      }
      next();
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
      /**
       * O padrao do helmet e `no-referrer`, e com ele o navegador nao manda
       * `Referer` nem na propria origem. O WebExceptionFilter usa esse cabecalho
       * para devolver o usuario ao formulario que falhou; sem ele todo erro de
       * validacao caia em /painel e a tela preenchida era perdida.
       *
       * `same-origin` resolve isso e continua nao vazando a URL para fora.
       */
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  // `forbidNonWhitelisted` rejeitava formularios HTML por causa de campos extras
  // (csrf, botoes). `whitelist` ja descarta o que nao esta no DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new WebExceptionFilter());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  return app;
}
