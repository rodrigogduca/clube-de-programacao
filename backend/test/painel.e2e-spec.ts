import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/bootstrap';
import { PrismaService } from '../src/database/prisma.service';

/**
 * O PRIMEIRO TESTE DE ROTA DE PÁGINA DO PROJETO.
 *
 * Cobre o contrato que qualquer tela nova do painel tem de cumprir antes de
 * qualquer outra coisa: sem sessão, ninguém entra, e o destino pretendido
 * sobrevive ao desvio para o login.
 *
 * SEM BANCO. O PrismaService é trocado por um dublê porque nenhum destes
 * caminhos chega a consultar coisa alguma — o AuthenticatedGuard recusa antes.
 * Um teste de redirecionamento que exige Postgres no ar não roda em CI e, na
 * prática, não roda nunca.
 */
describe('Painel — rotas protegidas (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // Sem isto o iron-session recusa a subir, e a falha aparece como um erro
    // de boot sem relação aparente com o teste.
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? 'segredo-de-teste-com-mais-de-32-caracteres';

    const modulo: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile();

    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * O `next` é o motivo de o teste existir. Sem ele, quem clica num link do
   * diretório e cai no login volta para /painel e tem de refazer o caminho.
   */
  it('manda o diretório de membros para o login, preservando o destino', async () => {
    const resposta = await request(app.getHttpServer()).get('/painel/membros');

    expect(resposta.status).toBe(302);
    expect(resposta.headers.location).toBe(
      '/accounts/login?next=%2Fpainel%2Fmembros',
    );
  });

  it('preserva também a query string do destino', async () => {
    const resposta = await request(app.getHttpServer()).get(
      '/painel/membros?setor=3',
    );

    expect(resposta.status).toBe(302);
    expect(resposta.headers.location).toBe(
      '/accounts/login?next=%2Fpainel%2Fmembros%3Fsetor%3D3',
    );
  });

  it('protege o detalhe da tarefa, inclusive o fragmento do pop-up', async () => {
    for (const caminho of ['/painel/tarefa/42', '/painel/tarefa/42?parcial=1']) {
      const resposta = await request(app.getHttpServer()).get(caminho);
      expect(resposta.status).toBe(302);
      expect(resposta.headers.location).toContain('/accounts/login?next=');
    }
  });

  /*
   * A API JSON compartilha os services com a camada de páginas, então ela
   * responde 401 em JSON em vez de redirecionar — é o que o `Accept` decide no
   * WebExceptionFilter.
   */
  it('recusa a API de anexos sem sessão', async () => {
    const resposta = await request(app.getHttpServer())
      .get('/tasks/42/anexos')
      .set('Accept', 'application/json');

    expect(resposta.status).toBe(401);
    expect(resposta.body.statusCode).toBe(401);
  });
});
