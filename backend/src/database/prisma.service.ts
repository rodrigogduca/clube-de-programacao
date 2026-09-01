import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Avisa quando a URL do banco nao serve para o ambiente serverless.
 *
 * Em serverless cada conteiner frio abre a propria conexao e a segura ate o
 * conteiner morrer. Contra a conexao DIRETA do Postgres (porta 5432) isso
 * esgota o limite do banco em minutos de trafego normal, e o sintoma e pessimo
 * de diagnosticar: o site funciona, depois devolve 500 intermitente, depois
 * volta sozinho. Nada no erro aponta para a string de conexao.
 *
 * No Supabase ha um agravante: a conexao direta de projetos novos so atende em
 * IPv6, e as funcoes da Vercel saem por IPv4 — ai nao conecta nunca.
 *
 * O certo e o pooler (porta 6543) com `?pgbouncer=true&connection_limit=1`.
 * `pgbouncer=true` desliga os prepared statements, que o PgBouncer em modo
 * transaction nao sabe reaproveitar; sem isso o Prisma quebra de forma
 * intermitente com "prepared statement s0 already exists".
 *
 * So avisa, nao derruba o app: uma instalacao em servidor comum (um processo
 * so, com pool proprio) usa a conexao direta e esta certa em usa-la. Por isso a
 * checagem so vale quando ha indicio de serverless.
 */
function conferirUrlDoBanco(logger: Logger) {
  const url = process.env.DATABASE_URL;
  const emServerless = Boolean(process.env.VERCEL ?? process.env.AWS_REGION);
  if (!url || !emServerless) {
    return;
  }

  if (url.includes(':5432/')) {
    logger.warn(
      'DATABASE_URL aponta para a porta 5432 (conexao direta) num ambiente ' +
        'serverless. Use o pooler: porta 6543 com ' +
        '?pgbouncer=true&connection_limit=1. Sem isso o banco satura de ' +
        'conexoes e, no Supabase, a conexao direta so responde em IPv6 — que ' +
        'a Vercel nao alcanca.',
    );
    return;
  }

  if (url.includes(':6543/') && !url.includes('pgbouncer=true')) {
    logger.warn(
      'DATABASE_URL usa o pooler (6543) mas nao tem ?pgbouncer=true. O Prisma ' +
        'vai tentar prepared statements que o PgBouncer nao reaproveita, e as ' +
        'consultas passam a falhar de forma intermitente com "prepared ' +
        'statement already exists".',
    );
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  /**
   * NAO PROPAGA A FALHA DE CONEXAO — de proposito.
   *
   * O `onModuleInit` roda dentro do `app.init()` que o `api/index.js` chama
   * antes de entregar a PRIMEIRA requisicao ao Express. Com o `await
   * this.$connect()` solto, um banco fora do ar (projeto do Supabase pausado,
   * senha trocada, DNS que sumiu) fazia o boot inteiro rejeitar — e a Vercel
   * respondia FUNCTION_INVOCATION_FAILED em TODA rota, inclusive nas paginas
   * publicas que nao tocam o banco: home, Seja Membro, SEMCOMP, a tela de
   * login e ate os arquivos de `/static`, porque o catch-all do vercel.json
   * manda tudo para a mesma funcao.
   *
   * Ou seja: o banco cair derrubava o site inteiro, quando so o painel depende
   * dele.
   *
   * Deixar de derrubar o boot nao adia problema nenhum: o Prisma conecta
   * sozinho, preguicosamente, na primeira consulta. O `$connect()` daqui e
   * so o aquecimento — vale a pena tentar, para o primeiro acesso do conteiner
   * nao pagar o handshake, mas nao vale o site.
   *
   * Quem depende do banco continua falhando, agora onde deve: na rota que
   * consulta, com o erro do Prisma passando pelo WebExceptionFilter.
   */
  async onModuleInit(): Promise<void> {
    conferirUrlDoBanco(this.logger);
    try {
      await this.$connect();
    } catch (erro) {
      this.logger.error(
        'Nao consegui conectar ao banco no boot. As paginas publicas continuam ' +
          'no ar; as que consultam o banco vao falhar ate a conexao voltar. ' +
          'Confira DATABASE_URL e se o projeto do banco esta ativo.',
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }
}
