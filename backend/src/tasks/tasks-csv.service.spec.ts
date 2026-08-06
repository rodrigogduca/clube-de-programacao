import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Cargo } from '@prisma/client';
import type { PrismaService } from '../database/prisma.service';
import { TasksCsvService } from './tasks-csv.service';

/**
 * Prisma de mentira. Cada teste sobrescreve so o que usa; o resto devolve
 * vazio, que e o suficiente para as checagens de permissao e de cabecalho.
 */
function fakePrisma(overrides: Record<string, unknown> = {}) {
  return {
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 7 }),
    },
    member: { findMany: jest.fn().mockResolvedValue([]) },
    sector: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  } as unknown as PrismaService;
}

const CABECALHO = 'titulo;responsavel';

describe('TasksCsvService — permissoes', () => {
  const semPermissao: Array<Cargo | null | undefined> = [
    'membro',
    null,
    undefined,
  ];

  it.each(semPermissao)('exportar recusa cargo %s', async (cargo) => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(svc.exportar(cargo)).rejects.toThrow(ForbiddenException);
  });

  it.each(semPermissao)('modelo recusa cargo %s', (cargo) => {
    const svc = new TasksCsvService(fakePrisma());
    expect(() => svc.modelo(cargo)).toThrow(ForbiddenException);
  });

  it('importar recusa membro comum', async () => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(
      svc.importar(CABECALHO, { id: 1, cargo: 'membro' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('exportar aceita quem gerencia tarefas', async () => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(svc.exportar('diretor')).resolves.toContain('titulo');
  });

  describe('limparTudo', () => {
    it.each(['presidente', 'vice_presidente', 'administrador'] as Cargo[])(
      'aceita %s',
      async (cargo) => {
        const svc = new TasksCsvService(fakePrisma());
        await expect(svc.limparTudo(cargo)).resolves.toBe(7);
      },
    );

    // Diretor cria e edita tarefas, mas apagar todas e outra ordem de estrago.
    it.each(['diretor', 'antiga_gestao', 'membro'] as Cargo[])(
      'recusa %s',
      async (cargo) => {
        const svc = new TasksCsvService(fakePrisma());
        await expect(svc.limparTudo(cargo)).rejects.toThrow(ForbiddenException);
      },
    );
  });
});

describe('TasksCsvService — importar', () => {
  const ator = { id: 1, cargo: 'presidente' as Cargo };

  it('recusa arquivo vazio', async () => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(svc.importar('   ', ator)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('recusa CSV sem as colunas obrigatorias', async () => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(svc.importar('foo;bar\n1;2', ator)).rejects.toThrow(
      /precisa ter as colunas/,
    );
  });

  it('nomeia o cabecalho encontrado no erro, para o usuario saber o que mandou', async () => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(
      svc.importar('nome_da_coluna;outra\n1;2', ator),
    ).rejects.toThrow(/nome_da_coluna, outra/);
  });

  it('recusa arquivo acima do limite de linhas', async () => {
    const svc = new TasksCsvService(fakePrisma());
    const linhas = Array.from(
      { length: 2001 },
      (_, i) => `Tarefa ${i};alguem`,
    ).join('\n');

    await expect(svc.importar(`${CABECALHO}\n${linhas}`, ator)).rejects.toThrow(
      /limite por importação é 2000/,
    );
  });

  it('aceita o cabecalho com acento e maiuscula', async () => {
    const prisma = fakePrisma({
      member: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            user: {
              username: 'joao.silva',
              email: 'joao@x.com',
              firstName: 'João',
              lastName: 'Silva',
            },
          },
        ]),
      },
    });
    const svc = new TasksCsvService(prisma);

    const r = await svc.importar(
      'Título;Responsável\nEstudar;joao.silva',
      ator,
    );

    expect(r).toEqual({ criadas: 1, atualizadas: 0, erros: [] });
  });

  it('quando toda linha falha, lanca em vez de relatar sucesso vazio', async () => {
    const svc = new TasksCsvService(fakePrisma());
    await expect(
      svc.importar(`${CABECALHO}\n;ninguem\n;ninguem`, ator),
    ).rejects.toThrow(/Nenhuma tarefa foi importada/);
  });

  it('reporta a linha da planilha, contando o cabecalho', async () => {
    const prisma = fakePrisma({
      member: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            user: {
              username: 'ok',
              email: 'ok@x.com',
              firstName: 'Ok',
              lastName: null,
            },
          },
        ]),
      },
    });
    const svc = new TasksCsvService(prisma);

    // linha 1 = cabecalho, linha 2 = valida, linha 3 = sem titulo
    const r = await svc.importar(`${CABECALHO}\nValida;ok\n;ok`, ator);

    expect(r.criadas).toBe(1);
    expect(r.erros).toEqual([{ linha: 3, motivo: 'titulo vazio' }]);
  });

  it('avisa quando o nome completo aponta para dois membros', async () => {
    const prisma = fakePrisma({
      member: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            user: {
              username: 'ana.a',
              email: 'a@x.com',
              firstName: 'Ana',
              lastName: 'Souza',
            },
          },
          {
            id: 2,
            user: {
              username: 'ana.b',
              email: 'b@x.com',
              firstName: 'Ana',
              lastName: 'Souza',
            },
          },
        ]),
      },
    });
    const svc = new TasksCsvService(prisma);

    await expect(
      svc.importar(`${CABECALHO}\nTarefa;Ana Souza`, ator),
    ).rejects.toThrow(/mais de um membro/);
  });
});
