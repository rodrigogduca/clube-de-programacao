import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cargo, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { VE_TODOS_OS_SETORES } from '../common/escopo';

/** Quem pode criar, editar e excluir tarefas de qualquer membro. */
const PODE_GERIR_TAREFAS: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
  'antiga_gestao',
];

const PrioridadeLabel: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

const FuncaoLabel: Record<string, string> = {
  design: 'Design',
  desenvolvimento: 'Desenvolvimento',
  marketing: 'Marketing',
  gestao: 'Gestão',
  pesquisa: 'Pesquisa',
  outro: 'Outro',
};

const StatusLabel: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluida: 'Concluída',
};

const statusChoices = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'concluida', label: 'Concluída' },
];

/**
 * Os templates iteram com `{% for value, label in tarefa.STATUS_CHOICES %}`,
 * o que exige pares, nao objetos.
 */
const statusChoicePairs: Array<[string, string]> = statusChoices.map((c) => [
  c.value,
  c.label,
]);

const prioridadeChoices = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
];

const funcaoChoices = [
  { value: 'design', label: 'Design' },
  { value: 'desenvolvimento', label: 'Desenvolvimento' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'gestao', label: 'Gestão' },
  { value: 'pesquisa', label: 'Pesquisa' },
  { value: 'outro', label: 'Outro' },
];

const taskInclude = {
  responsavel: {
    include: { user: true },
  },
  criadoPor: {
    include: { user: true },
  },
  setor: true,
  anexos: true,
  _count: {
    select: { anexos: true },
  },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

function formatTaskUser(user: {
  firstName: string;
  lastName: string | null;
  username: string;
  [key: string]: unknown;
}) {
  return {
    ...user,
    first_name: user.firstName ?? '',
    last_name: user.lastName ?? '',
    get_full_name:
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.username,
  };
}

/**
 * Meia-noite de hoje em UTC, para comparar com `prazo` — que e uma data sem
 * hora, gravada como meia-noite UTC. Comparar com `Date.now()` marcaria como
 * atrasada uma tarefa que vence hoje.
 */
function inicioDeHojeUtc(): number {
  const agora = new Date();
  return Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/** Janela em que o prazo ja merece destaque sem ainda estar vencido. */
const DIAS_DE_ALERTA = 3;
const UM_DIA = 24 * 60 * 60 * 1000;

function formatTask(t: TaskWithRelations) {
  const responsavel = t.responsavel
    ? {
        ...t.responsavel,
        usuario: t.responsavel.user ? formatTaskUser(t.responsavel.user) : null,
        user: undefined,
        data_entrada: t.responsavel.dataEntrada,
      }
    : null;
  const criadoPor = t.criadoPor
    ? {
        ...t.criadoPor,
        usuario: t.criadoPor.user ? formatTaskUser(t.criadoPor.user) : null,
        user: undefined,
        data_entrada: t.criadoPor.dataEntrada,
      }
    : null;

  // Estado do prazo calculado no servidor para o cartao ja chegar marcado,
  // sem depender de JS.
  const hoje = inicioDeHojeUtc();
  const prazoEm = t.prazo ? t.prazo.getTime() : null;
  const concluida = t.status === 'concluida';
  const diasRestantes =
    prazoEm === null ? null : Math.round((prazoEm - hoje) / UM_DIA);

  return {
    ...t,
    responsavel,
    criado_por: criadoPor,
    criadoPor: undefined,
    data_criacao: t.dataCriacao,
    dias_restantes: diasRestantes,
    atrasada: diasRestantes !== null && diasRestantes < 0 && !concluida,
    prazo_proximo:
      diasRestantes !== null &&
      diasRestantes >= 0 &&
      diasRestantes <= DIAS_DE_ALERTA &&
      !concluida,
    get_prioridade_display: PrioridadeLabel[t.prioridade] ?? t.prioridade,
    get_funcao_display: t.funcao ? (FuncaoLabel[t.funcao] ?? t.funcao) : null,
    prioridade_label: PrioridadeLabel[t.prioridade] ?? t.prioridade,
    funcao_label: t.funcao ? (FuncaoLabel[t.funcao] ?? t.funcao) : null,
    status_label: StatusLabel[t.status] ?? t.status,
    get_status_display: StatusLabel[t.status] ?? t.status,
    STATUS_CHOICES: statusChoicePairs,
    anexos_count: t._count?.anexos ?? t.anexos.length,
  };
}

/**
 * Quem esta agindo. Antes os metodos recebiam so o cargo; o setor passou a ser
 * necessario quando o diretor deixou de enxergar o clube inteiro.
 */
/**
 * Quem esta agindo — o membro inteiro, nao so o cargo.
 *
 * A forma antiga aceitava `Cargo` solto. Ela foi retirada de proposito: um
 * chamador que passasse so o cargo passaria por `assertPodeGerir` e sairia
 * ileso de `assertSetorPermitido`, porque sem `setorId` nao ha fronteira a
 * comparar. Seria um bypass silencioso de uma checagem de permissao, e o
 * compilador nao diria nada. Agora o tipo obriga a decisao.
 */
type Ator = { cargo?: Cargo | null; setorId?: number | null };

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPodeGerir(actorCargo?: Cargo | null) {
    if (!actorCargo || !PODE_GERIR_TAREFAS.includes(actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para gerenciar tarefas.',
      );
    }
  }

  /**
   * O diretor mexe no proprio setor, e so nele.
   *
   * Aqui e nao no controller porque a camada de paginas e a API JSON chamam
   * este mesmo metodo: uma trava so no controller deixaria `PATCH /tasks/:id`
   * aberto, e um diretor reatribuiria tarefa de outro setor pela API enquanto
   * a tela dele jurava que aquele setor nao existe.
   *
   * `ator` sem `cargo` de gestao ja parou em `assertPodeGerir`; o que resta
   * aqui e a fronteira de setor.
   */
  private assertSetorPermitido(
    ator: { cargo?: Cargo | null; setorId?: number | null } | null | undefined,
    setorId: number | null,
  ) {
    if (!ator?.cargo || VE_TODOS_OS_SETORES.includes(ator.cargo)) {
      return;
    }
    if ((setorId ?? null) === (ator.setorId ?? null)) {
      return;
    }
    throw new ForbiddenException(
      'Você só pode gerenciar tarefas do seu setor.',
    );
  }

  async getByResponsavel(memberId: number) {
    const tasks = await this.prisma.task.findMany({
      where: { responsavelId: memberId },
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  async list() {
    const tasks = await this.prisma.task.findMany({
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  async getById(id: number) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: taskInclude,
    });
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    return formatTask(task);
  }

  async getByStatus(status: string) {
    const tasks = await this.prisma.task.findMany({
      where: { status: status as any },
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  async getBySector(setorId: number) {
    const tasks = await this.prisma.task.findMany({
      where: { setorId },
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  async getBySectorAndStatus(setorId: number, status: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        setorId,
        status: status as any,
      },
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  async getWithoutSector() {
    const tasks = await this.prisma.task.findMany({
      where: { setorId: null },
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  async getWithoutSectorByStatus(status: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        setorId: null,
        status: status as any,
      },
      include: taskInclude,
      orderBy: { dataCriacao: 'desc' },
    });
    return tasks.map(formatTask);
  }

  /**
   * O SETOR DE UMA TAREFA E O SETOR DE QUEM A ASSUME.
   *
   * Nao e um padrao que o formulario preenche e o usuario pode trocar: e a
   * regra. O setor deixou de ser um campo escolhido e passou a ser uma
   * consequencia do responsavel, aqui no service — que e a autoridade
   * compartilhada pela camada de paginas, pela API JSON e pela importacao de
   * CSV. Fosse no controller, cada um dos tres caminhos teria a sua copia e o
   * terceiro esqueceria.
   *
   * Responsavel sem setor devolve `null`, e a tarefa cai na aba "Sem Setor".
   */
  private async setorDoResponsavel(responsavelId: number) {
    const responsavel = await this.prisma.member.findUnique({
      where: { id: responsavelId },
      select: { setorId: true },
    });
    if (!responsavel) {
      throw new NotFoundException('Responsável não encontrado.');
    }
    return responsavel.setorId;
  }

  async create(
    data: {
      titulo: string;
      descricao?: string;
      responsavelId: number;
      criadoPorId?: number;
      setorId?: number | null;
      prazo?: Date;
      prioridade?: string;
      funcao?: string;
      projeto?: string;
      status?: string;
    },
    ator: Ator,
  ) {
    const quem = ator;
    this.assertPodeGerir(quem.cargo);

    const responsavel = await this.prisma.member.findUnique({
      where: { id: data.responsavelId },
    });
    if (!responsavel) {
      throw new NotFoundException('Responsável não encontrado.');
    }

    // O setor da tarefa e o do responsavel, entao criar para alguem de outro
    // setor E criar tarefa de outro setor. Um pedido so, recusado uma vez.
    this.assertSetorPermitido(quem, responsavel.setorId);

    const task = await this.prisma.task.create({
      data: {
        titulo: data.titulo,
        descricao: data.descricao,
        responsavelId: data.responsavelId,
        criadoPorId: data.criadoPorId,
        // O SETOR SEGUE O RESPONSAVEL, sempre — ver a nota em `setorDoResponsavel`.
        setorId: responsavel.setorId,
        prazo: data.prazo,
        prioridade: (data.prioridade as any) ?? 'media',
        funcao:
          (data.funcao as Prisma.NullableEnumTarefaFuncaoFieldUpdateOperationsInput['set']) ??
          null,
        projeto: data.projeto,
        status: (data.status as any) ?? 'pendente',
      },
      include: taskInclude,
    });
    return formatTask(task);
  }

  async update(
    id: number,
    data: {
      titulo?: string;
      descricao?: string;
      responsavelId?: number;
      setorId?: number | null;
      prazo?: Date | null;
      prioridade?: string;
      funcao?: string;
      projeto?: string;
      status?: string;
    },
    ator: Ator,
  ) {
    const quem = ator;
    this.assertPodeGerir(quem.cargo);

    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    // Fronteira de ORIGEM: a tarefa que esta sendo editada e minha?
    this.assertSetorPermitido(quem, task.setorId);

    /*
     * Reatribuir move o setor junto. Se a tarefa passa da Ana (Design) para o
     * Bruno (Desenvolvimento), ela deixa de ser uma tarefa de Design — senao
     * apareceria na aba de Design com um responsavel que nao e de la, e as
     * abas por setor do painel deixariam de dizer a verdade.
     */
    const setorId =
      data.responsavelId !== undefined
        ? await this.setorDoResponsavel(data.responsavelId)
        : undefined;

    /*
     * Fronteira de DESTINO: e para onde ela vai, tambem e minha?
     *
     * Sao duas checagens porque sao duas perguntas. Com so a de origem, um
     * diretor pegava a propria tarefa, reatribuia para alguem de outro setor e
     * — como o setor segue o responsavel — a plantava no setor alheio, saindo
     * do proprio campo de visao no mesmo movimento. O teste que pegou isso
     * esta em `tasks.service.spec.ts`.
     */
    if (setorId !== undefined) {
      this.assertSetorPermitido(quem, setorId);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        titulo: data.titulo,
        descricao: data.descricao,
        responsavelId: data.responsavelId,
        setorId,
        prazo: data.prazo,
        prioridade: data.prioridade as any,
        funcao:
          data.funcao as Prisma.NullableEnumTarefaFuncaoFieldUpdateOperationsInput['set'],
        projeto: data.projeto,
        status: data.status as any,
      },
      include: taskInclude,
    });
    return formatTask(updated);
  }

  /**
   * Mover o cartao no kanban e permitido para quem gerencia tarefas e tambem
   * para o proprio responsavel pela tarefa.
   */
  async updateStatus(
    id: number,
    status: string,
    actor?: { id: number; cargo: Cargo } | null,
  ) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }

    const podeGerir = actor?.cargo
      ? PODE_GERIR_TAREFAS.includes(actor.cargo)
      : false;
    const ehResponsavel = actor?.id === task.responsavelId;

    if (!podeGerir && !ehResponsavel) {
      throw new ForbiddenException(
        'Você so pode alterar o status das suas próprias tarefas.',
      );
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: status as any },
      include: taskInclude,
    });
    return formatTask(updated);
  }

  async delete(id: number, ator: Ator) {
    const quem = ator;
    this.assertPodeGerir(quem.cargo);

    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Tarefa não encontrada.');
    }
    this.assertSetorPermitido(quem, task.setorId);

    await this.prisma.task.delete({ where: { id } });
    return { ok: true };
  }

  getStatusChoices() {
    return statusChoices;
  }

  getPrioridadeChoices() {
    return prioridadeChoices;
  }

  getFuncaoChoices() {
    return funcaoChoices;
  }
}

export {
  PODE_GERIR_TAREFAS,
  PrioridadeLabel,
  FuncaoLabel,
  StatusLabel,
  statusChoices,
  statusChoicePairs,
  prioridadeChoices,
  funcaoChoices,
};
