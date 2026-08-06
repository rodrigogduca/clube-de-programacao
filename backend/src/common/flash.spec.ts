import type { SessionRequest } from '../auth/session-request';
import { consumirFormulario, guardarFormulario } from './flash';

/** Sessao de mentira: guarda em memoria e conta os saves. */
function fakeReq(body: unknown, path = '/painel/criar-tarefa') {
  const session: Record<string, unknown> & { save: () => Promise<void> } = {
    save: jest.fn().mockResolvedValue(undefined),
  };
  return { body, path, session } as unknown as SessionRequest;
}

describe('guardarFormulario', () => {
  it('guarda os campos de texto enviados', async () => {
    const req = fakeReq({ titulo: 'Revisar layout', projeto: 'Site 2026' });
    await guardarFormulario(req, '/painel/criar-tarefa');

    expect(req.session.formOld).toEqual({
      path: '/painel/criar-tarefa',
      values: { titulo: 'Revisar layout', projeto: 'Site 2026' },
    });
  });

  it('nunca devolve senha para o HTML', async () => {
    const req = fakeReq({
      username: 'joao',
      senha: 'segredo123',
      confirmar_senha: 'segredo123',
      password: 'outro',
      senha_antiga: 'antiga',
    });
    await guardarFormulario(req, '/painel/adicionar-membro');

    expect(Object.keys(req.session.formOld!.values)).toEqual(['username']);
  });

  it('descarta tokens e o campo de confirmacao', async () => {
    const req = fakeReq({
      nome: 'Design',
      csrfmiddlewaretoken: 'abc',
      confirmacao: 'LIMPAR',
      access_token: 'xyz',
    });
    await guardarFormulario(req, '/painel/criar-setor');

    expect(req.session.formOld!.values).toEqual({ nome: 'Design' });
  });

  it('corta valores muito longos para nao estourar o cookie', async () => {
    const req = fakeReq({ descricao: 'a'.repeat(5000) });
    await guardarFormulario(req, '/x');

    expect(req.session.formOld!.values.descricao).toHaveLength(2000);
  });

  it('ignora valores que nao sao string', async () => {
    const req = fakeReq({ titulo: 'ok', anexos: ['a', 'b'], n: 3 });
    await guardarFormulario(req, '/x');

    expect(req.session.formOld!.values).toEqual({ titulo: 'ok' });
  });

  it('nao grava nada quando sobra zero campo', async () => {
    const req = fakeReq({ senha: 'x', csrfmiddlewaretoken: 'y' });
    await guardarFormulario(req, '/x');

    expect(req.session.formOld).toBeUndefined();
    expect(req.session.save).not.toHaveBeenCalled();
  });

  it('aguenta corpo ausente', async () => {
    const req = fakeReq(undefined);
    await expect(guardarFormulario(req, '/x')).resolves.toBeUndefined();
    expect(req.session.formOld).toBeUndefined();
  });
});

describe('consumirFormulario', () => {
  it('devolve os valores do formulario que esta sendo renderizado', async () => {
    const req = fakeReq({}, '/painel/criar-tarefa');
    req.session.formOld = {
      path: '/painel/criar-tarefa',
      values: { titulo: 'Rascunho' },
    };

    await expect(consumirFormulario(req)).resolves.toEqual({
      titulo: 'Rascunho',
    });
  });

  it('limpa depois de ler, para nao reaparecer na visita seguinte', async () => {
    const req = fakeReq({}, '/painel/criar-tarefa');
    req.session.formOld = {
      path: '/painel/criar-tarefa',
      values: { titulo: 'Rascunho' },
    };

    await consumirFormulario(req);

    expect(req.session.formOld).toBeUndefined();
    await expect(consumirFormulario(req)).resolves.toEqual({});
  });

  it('nao vaza os valores para outra tela', async () => {
    const req = fakeReq({}, '/painel/criar-setor');
    req.session.formOld = {
      path: '/painel/criar-tarefa',
      values: { titulo: 'Rascunho' },
    };

    await expect(consumirFormulario(req)).resolves.toEqual({});
    // Continua guardado: o formulario de origem ainda pode ser aberto.
    expect(req.session.formOld).toBeDefined();
  });

  it('devolve objeto vazio quando nao ha nada guardado', async () => {
    await expect(consumirFormulario(fakeReq({}))).resolves.toEqual({});
  });
});
