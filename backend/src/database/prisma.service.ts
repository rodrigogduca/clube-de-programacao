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

  async onModuleInit(): Promise<void> {
    conferirUrlDoBanco(this.logger);
    await this.$connect();
  }
}
