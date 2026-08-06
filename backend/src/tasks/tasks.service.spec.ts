import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

/**
 * As duas regras novas de tarefa, com o Prisma dublado.
 *
 * 1. O setor da tarefa e o do responsavel — sempre, inclusive ao reatribuir.
 * 2. O diretor so mexe no proprio setor.
 *
 * Testadas no service e nao no controller de proposito: e o service que a
 * camada de paginas E a API JSON chamam, entao e aqui que a regra precisa
 * valer. Um teste de rota provaria um caminho so.
 */

type Membro = { id: number; setorId: number | null };

function comPrisma(opcoes: {
  membros?: Membro[];
  tarefa?: { id: number; setorId: number | null };
}) {
  const membros = opcoes.membros ?? [];
  const criadas: any[] = [];
  const atualizadas: any[] = [];

  const tarefaFormatada = (dados: any) => ({
    ...dados,
    id: dados.id ?? 1,
    status: dados.status ?? 'pendente',
    prioridade: dados.prioridade ?? 'media',
    prazo: dados.prazo ?? null,
    funcao: dados.funcao ?? null,
    dataCriacao: new Date('2026-01-01T00:00:00Z'),
    responsavel: null,
    criadoPor: null,
    setor: null,
    anexos: [],
    _count: { anexos: 0 },
  });

  const prisma = {
    member: {
      findUnique: ({ where }: any) =>
        Promise.resolve(membros.find((m) => m.id === where.id) ?? null),
    },
    task: {
      findUnique: () => Promise.resolve(opcoes.tarefa ?? null),
      create: ({ data }: any) => {
        criadas.push(data);
        return Promise.resolve(tarefaFormatada(data));
      },
      update: ({ data }: any) => {
        atualizadas.push(data);
        return Promise.resolve(tarefaFormatada({ ...opcoes.tarefa, ...data }));
      },
      delete: () => Promise.resolve({}),
    },
  };

  return {
    servico: new TasksService(prisma as any),
    criadas,
    atualizadas,
  };
}

const PRESIDENTE = { cargo: 'presidente' as const, setorId: null };
const DIRETOR_DESIGN = { cargo: 'diretor' as const, setorId: 2 };

describe('TasksService — o setor segue o responsável', () => {
  it('grava o setor do responsável ao criar', async () => {
    const { servico, criadas } = comPrisma({
      membros: [{ id: 10, setorId: 2 }],
    });

    await servico.create(
      { titulo: 'Cartaz', responsavelId: 10 },
      PRESIDENTE,
    );

    expect(criadas[0].setorId).toBe(2);
  });

  /* O ponto da regra: mesmo que alguem force outro setor, quem manda e o
     responsavel. O campo nem chega mais do formulario, mas a API e publica. */
  it('ignora um setor divergente vindo de fora', async () => {
    const { servico, criadas } = comPrisma({
      membros: [{ id: 10, setorId: 2 }],
    });

    await servico.create(
      { titulo: 'Cartaz', responsavelId: 10, setorId: 99 } as any,
      PRESIDENTE,
    );

    expect(criadas[0].setorId).toBe(2);
  });

  it('responsável sem setor deixa a tarefa sem setor', async () => {
    const { servico, criadas } = comPrisma({
      membros: [{ id: 11, setorId: null }],
    });

    await servico.create({ titulo: 'Solta', responsavelId: 11 }, PRESIDENTE);

    expect(criadas[0].setorId).toBeNull();
  });

  it('reatribuir move o setor junto', async () => {
    const { servico, atualizadas } = comPrisma({
      membros: [{ id: 20, setorId: 5 }],
      tarefa: { id: 1, setorId: 2 },
    });

    await servico.update(1, { responsavelId: 20 }, PRESIDENTE);

    expect(atualizadas[0].setorId).toBe(5);
  });

  /* Editar so o titulo nao pode mexer no setor: `undefined` faz o Prisma
     deixar a coluna como esta. */
  it('editar sem trocar o responsável não mexe no setor', async () => {
    const { servico, atualizadas } = comPrisma({
      tarefa: { id: 1, setorId: 2 },
    });

    await servico.update(1, { titulo: 'Outro nome' }, PRESIDENTE);

    expect(atualizadas[0].setorId).toBeUndefined();
  });

  it('recusa responsável inexistente', async () => {
    const { servico } = comPrisma({ membros: [] });

    await expect(
      servico.create({ titulo: 'X', responsavelId: 404 }, PRESIDENTE),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TasksService — o diretor só mexe no próprio setor', () => {
  it('cria para alguém do próprio setor', async () => {
    const { servico, criadas } = comPrisma({
      membros: [{ id: 10, setorId: 2 }],
    });

    await servico.create(
      { titulo: 'Cartaz', responsavelId: 10 },
      DIRETOR_DESIGN,
    );

    expect(criadas[0].setorId).toBe(2);
  });

  /* Como o setor da tarefa e o do responsavel, escolher alguem de outro setor
     E criar tarefa de outro setor — um pedido so, recusado uma vez. */
  it('recusa criar para alguém de outro setor', async () => {
    const { servico } = comPrisma({ membros: [{ id: 30, setorId: 7 }] });

    await expect(
      servico.create({ titulo: 'Invasão', responsavelId: 30 }, DIRETOR_DESIGN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('recusa editar tarefa de outro setor', async () => {
    const { servico } = comPrisma({ tarefa: { id: 1, setorId: 7 } });

    await expect(
      servico.update(1, { titulo: 'Novo' }, DIRETOR_DESIGN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('recusa excluir tarefa de outro setor', async () => {
    const { servico } = comPrisma({ tarefa: { id: 1, setorId: 7 } });

    await expect(servico.delete(1, DIRETOR_DESIGN)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('deixa excluir a tarefa do próprio setor', async () => {
    const { servico } = comPrisma({ tarefa: { id: 1, setorId: 2 } });

    await expect(servico.delete(1, DIRETOR_DESIGN)).resolves.toEqual({
      ok: true,
    });
  });

  /* Reatribuir para fora do setor tiraria a tarefa das maos do diretor — e a
     plantaria no setor alheio. Barrado pela fronteira de destino. */
  it('recusa empurrar a própria tarefa para outro setor', async () => {
    const { servico } = comPrisma({
      membros: [{ id: 40, setorId: 7 }],
      tarefa: { id: 1, setorId: 2 },
    });

    await expect(
      servico.update(1, { responsavelId: 40 }, DIRETOR_DESIGN),
    ).rejects.toThrow(ForbiddenException);
  });

  it('o presidente não é barrado por setor nenhum', async () => {
    const { servico } = comPrisma({ tarefa: { id: 1, setorId: 7 } });

    await expect(servico.delete(1, PRESIDENTE)).resolves.toEqual({ ok: true });
  });
});
