import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cargo, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from '../auth/password.service';
import { escopoDeSetor } from '../common/escopo';

/**
 * Quem esta agindo. O cargo diz o que pode; o setor diz onde pode — e o
 * diretor precisa dos dois, porque ele cria membro apenas dentro do setor que
 * dirige.
 */
export type Ator = { cargo?: Cargo | null; setorId?: number | null };

const CargoLabel: Record<Cargo, string> = {
  presidente: 'Presidente',
  vice_presidente: 'Vice-Presidente',
  administrador: 'Administrador',
  diretor: 'Diretor',
  antiga_gestao: 'Antiga Gestão',
  membro: 'Membro',
};

const canManageAll: Cargo[] = ['presidente', 'administrador'];
const canEditMembers: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
];
const protectedRoles: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
];

function canManageMember(
  actorCargo: Cargo | null,
  targetCargo: Cargo,
): boolean {
  if (!actorCargo) return false;
  if (canManageAll.includes(actorCargo)) return true;
  if (actorCargo === 'diretor') return !protectedRoles.includes(targetCargo);
  return false;
}

function canEditMemberCargo(
  actorCargo: Cargo | null,
  targetCargo: Cargo,
): boolean {
  if (!actorCargo) return false;
  if (actorCargo === 'presidente' || actorCargo === 'administrador')
    return true;
  if (actorCargo === 'vice_presidente')
    return !['presidente', 'administrador'].includes(targetCargo);
  return false;
}

function canChangeToCargo(actorCargo: Cargo | null, newCargo: Cargo): boolean {
  if (!actorCargo) return false;
  if (actorCargo === 'presidente' || actorCargo === 'administrador')
    return true;
  if (actorCargo === 'vice_presidente')
    return !['presidente', 'administrador'].includes(newCargo);
  /* O diretor monta a propria equipe, e so ela: cria membro, nao cria
     diretoria. Sem esta linha ele aparecia em `canCreateMember` mas levava
     "Você não pode atribuir este cargo" em qualquer cargo que escolhesse —
     inclusive "membro" —, ou seja, o botao existia e nunca funcionava.
     No `update` isto nao o solta: la o `canEditMemberCargo` ja o barra antes. */
  if (actorCargo === 'diretor') return newCargo === 'membro';
  return false;
}

/**
 * Meia-noite de hoje em UTC. `Task.prazo` e data sem hora gravada como
 * meia-noite UTC, entao comparar com `new Date()` marcaria como atrasada uma
 * tarefa que vence hoje. Mesma regra do TasksService.
 */
function inicioDeHojeUtc(): number {
  const agora = new Date();
  return Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

const memberInclude = {
  user: true,
  setor: true,
} satisfies Prisma.MemberInclude;

type MemberWithRelations = Prisma.MemberGetPayload<{
  include: typeof memberInclude;
}>;

function formatUser(user: {
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

function formatMember(m: MemberWithRelations) {
  return {
    ...m,
    usuario: m.user
      ? formatUser(m.user)
      : { first_name: '', last_name: '', username: '?', get_full_name: '?' },
    user: undefined,
    cargo_label: CargoLabel[m.cargo] ?? m.cargo,
    data_entrada: m.dataEntrada,
    is_admin: canManageAll.includes(m.cargo),
    is_diretor: m.cargo === 'diretor',
    is_antiga_gestao: m.cargo === 'antiga_gestao',
  };
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  /**
   * Cria usuario + perfil de membro numa unica transacao.
   * A tela "adicionar membro" envia os dados da pessoa, nao um userId pronto.
   */
  async createWithUser(
    data: {
      firstName: string;
      lastName?: string;
      username: string;
      email: string;
      senha: string;
      cargo?: Cargo;
      setorId?: number | null;
    },
    ator?: Ator | null,
  ) {
    const actorCargo = ator?.cargo ?? null;
    if (!canCreateMember(actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para adicionar membros.',
      );
    }

    const cargo = data.cargo ?? 'membro';
    if (!canChangeToCargo(actorCargo, cargo)) {
      throw new ForbiddenException('Você não pode atribuir este cargo.');
    }

    const setorId = this.setorPermitido(ator, data.setorId ?? null);

    const username = data.username.trim();
    const email = data.email.trim();

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          { email: { equals: email, mode: 'insensitive' } },
        ],
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Já existe um usuário com este nome de usuário ou e-mail.',
      );
    }

    if (data.senha.length < 8) {
      throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    }

    const passwordHash = await this.passwordService.hash(data.senha);

    const member = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash,
          firstName: data.firstName.trim(),
          lastName: data.lastName?.trim() || null,
        },
      });

      return tx.member.create({
        data: {
          userId: user.id,
          cargo,
          setorId,
        },
        include: memberInclude,
      });
    });

    return formatMember(member);
  }

  /**
   * O setor com que o membro novo pode nascer.
   *
   * Quem ve o clube inteiro escolhe o setor que quiser. Quem esta preso a um
   * setor — o diretor — so cria dentro dele: o valor do formulario e conferido
   * em vez de aceito, porque o `<select>` travado da tela e conveniencia, nao
   * defesa; um POST direto continua chegando aqui.
   */
  private setorPermitido(
    ator: Ator | null | undefined,
    pedido: number | null,
  ): number | null {
    const escopo = escopoDeSetor({
      cargo: ator?.cargo ?? null,
      setorId: ator?.setorId ?? null,
    });
    if (escopo === null) return pedido;

    if (escopo.setorId === null) {
      throw new ForbiddenException(
        'Você precisa estar em um setor para adicionar membros. Fale com a presidência.',
      );
    }
    if (pedido !== null && pedido !== escopo.setorId) {
      throw new ForbiddenException(
        'Você só pode adicionar membros ao seu próprio setor.',
      );
    }
    return escopo.setorId;
  }

  /** Atualiza os dados do usuario e do membro juntos (tela "editar membro"). */
  async updateWithUser(
    id: number,
    data: {
      firstName?: string;
      lastName?: string;
      username?: string;
      cargo?: Cargo;
      setorId?: number | null;
      bio?: string;
    },
    actorCargo?: Cargo | null,
  ) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: memberInclude,
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    const actor = actorCargo ?? null;
    if (!canManageMember(actor, member.cargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este membro.',
      );
    }

    if (data.cargo !== undefined && data.cargo !== member.cargo) {
      if (!canEditMemberCargo(actor, member.cargo)) {
        throw new ForbiddenException(
          'Você não pode alterar o cargo deste membro.',
        );
      }
      if (!canChangeToCargo(actor, data.cargo)) {
        throw new ForbiddenException('Você não pode atribuir este cargo.');
      }
    }

    const username = data.username?.trim();
    if (username && username !== member.user.username) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          username: { equals: username, mode: 'insensitive' },
          id: { not: member.userId },
        },
      });
      if (conflict) {
        throw new BadRequestException('Este nome de usuário já esta em uso.');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: member.userId },
        data: {
          firstName: data.firstName?.trim(),
          lastName:
            data.lastName === undefined ? undefined : data.lastName.trim(),
          username,
        },
      });

      return tx.member.update({
        where: { id },
        data: {
          cargo: data.cargo,
          setorId: data.setorId,
          bio: data.bio,
        },
        include: memberInclude,
      });
    });

    return formatMember(updated);
  }

  async list() {
    const members = await this.prisma.member.findMany({
      include: memberInclude,
      orderBy: { dataEntrada: 'desc' },
    });
    return members.map(formatMember);
  }

  /**
   * A lista com a carga de trabalho de cada um, para o diretorio de membros.
   *
   * A contagem vem de UMA consulta agregada, nao de uma por cartao: com 24
   * membros na tela, o N+1 obvio seriam 24 idas ao banco para exibir um numero.
   *
   * `carga` conta so o que esta aberto (pendente + em andamento). Concluida
   * fica de fora de proposito: a regua mede quanto a pessoa tem na mao agora,
   * nao o historico dela.
   */
  async listComResumo() {
    const [members, porResponsavel, atrasadas] = await Promise.all([
      this.prisma.member.findMany({
        include: memberInclude,
        orderBy: { dataEntrada: 'desc' },
      }),
      this.prisma.task.groupBy({
        by: ['responsavelId', 'status'],
        _count: { _all: true },
      }),
      // Atrasada e prazo < hoje e status != concluida. O corte usa meia-noite
      // UTC porque `prazo` e data sem hora gravada assim — comparar com o
      // instante atual marcaria como atrasada uma tarefa que vence hoje.
      //
      // Agrupa TAMBEM por status de proposito: a regua desenha atrasada como um
      // terceiro segmento, e uma tarefa atrasada tambem e pendente ou em
      // andamento. Sem separar por status, ela seria contada duas vezes e a
      // barra passaria do total aberto da pessoa.
      this.prisma.task.groupBy({
        by: ['responsavelId', 'status'],
        where: {
          status: { not: 'concluida' },
          prazo: { lt: new Date(inicioDeHojeUtc()) },
        },
        _count: { _all: true },
      }),
    ]);

    const vazio = () => ({
      pendente: 0,
      em_andamento: 0,
      concluida: 0,
      atrasada: 0,
      aberto: 0,
      // O que sobra depois de tirar as atrasadas — sao estes os dois primeiros
      // segmentos da regua, para os tres somarem exatamente `aberto`.
      pendente_no_prazo: 0,
      andamento_no_prazo: 0,
    });

    const resumos = new Map<number, ReturnType<typeof vazio>>();
    for (const linha of porResponsavel) {
      if (linha.responsavelId == null) continue;
      const resumo = resumos.get(linha.responsavelId) ?? vazio();
      resumo[linha.status as 'pendente' | 'em_andamento' | 'concluida'] =
        linha._count._all;
      resumos.set(linha.responsavelId, resumo);
    }
    const atrasadaPorStatus = new Map<number, { pendente: number; em_andamento: number }>();
    for (const linha of atrasadas) {
      if (linha.responsavelId == null) continue;
      const resumo = resumos.get(linha.responsavelId) ?? vazio();
      resumo.atrasada += linha._count._all;
      resumos.set(linha.responsavelId, resumo);

      const detalhe = atrasadaPorStatus.get(linha.responsavelId) ?? {
        pendente: 0,
        em_andamento: 0,
      };
      if (linha.status === 'pendente' || linha.status === 'em_andamento') {
        detalhe[linha.status] = linha._count._all;
      }
      atrasadaPorStatus.set(linha.responsavelId, detalhe);
    }

    for (const [id, resumo] of resumos) {
      resumo.aberto = resumo.pendente + resumo.em_andamento;
      const atraso = atrasadaPorStatus.get(id);
      resumo.pendente_no_prazo = resumo.pendente - (atraso?.pendente ?? 0);
      resumo.andamento_no_prazo = resumo.em_andamento - (atraso?.em_andamento ?? 0);
    }

    // O maior aberto do clube e a escala da regua: a largura de cada barra e
    // relativa a ele, entao a comparacao na grade e entre pessoas.
    const maiorAberto = Math.max(
      0,
      ...Array.from(resumos.values(), (r) => r.aberto),
    );

    return members.map((m) => ({
      ...formatMember(m),
      carga: resumos.get(m.id) ?? vazio(),
      carga_maxima: maiorAberto,
    }));
  }

  /** As tarefas de um membro, para o pop-up de perfil. */
  async listTarefasDoMembro(id: number, limite = 5) {
    const membro = await this.prisma.member.findUnique({ where: { id } });
    if (!membro) {
      throw new NotFoundException('Membro não encontrado.');
    }

    const tarefas = await this.prisma.task.findMany({
      where: { responsavelId: id },
      orderBy: [{ status: 'asc' }, { prazo: { sort: 'asc', nulls: 'last' } }],
      take: limite,
      select: {
        id: true,
        titulo: true,
        status: true,
        prioridade: true,
        prazo: true,
      },
    });

    const contagem = await this.prisma.task.groupBy({
      by: ['status'],
      where: { responsavelId: id },
      _count: { _all: true },
    });

    const total = { pendente: 0, em_andamento: 0, concluida: 0 };
    for (const linha of contagem) {
      total[linha.status as keyof typeof total] = linha._count._all;
    }

    const hoje = inicioDeHojeUtc();
    return {
      total,
      tarefas: tarefas.map((t) => ({
        ...t,
        atrasada:
          t.prazo != null && t.prazo.getTime() < hoje && t.status !== 'concluida',
      })),
    };
  }

  async getById(id: number) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: memberInclude,
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }
    return formatMember(member);
  }

  async getByUserId(userId: number) {
    const member = await this.prisma.member.findUnique({
      where: { userId },
      include: memberInclude,
    });
    return member ? formatMember(member) : null;
  }

  async create(
    data: {
      userId: number;
      cargo?: Cargo;
      setorId?: number | null;
      bio?: string;
    },
    actorCargo?: Cargo | null,
  ) {
    if (!canCreateMember(actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para criar membros.',
      );
    }

    const existing = await this.prisma.member.findUnique({
      where: { userId: data.userId },
    });
    if (existing) {
      throw new BadRequestException(
        'Este usuário já possui um perfil de membro.',
      );
    }

    const member = await this.prisma.member.create({
      data: {
        userId: data.userId,
        cargo: data.cargo ?? 'membro',
        setorId: data.setorId ?? null,
        bio: data.bio,
      },
      include: memberInclude,
    });
    return formatMember(member);
  }

  async update(
    id: number,
    data: {
      cargo?: Cargo;
      setorId?: number | null;
      bio?: string;
    },
    actorCargo?: Cargo | null,
  ) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: memberInclude,
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    const actor = actorCargo ?? null;
    if (!canManageMember(actor, member.cargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este membro.',
      );
    }

    if (data.cargo !== undefined) {
      if (!canEditMemberCargo(actor, member.cargo)) {
        throw new ForbiddenException(
          'Você não pode alterar o cargo deste membro.',
        );
      }
      if (!canChangeToCargo(actor, data.cargo)) {
        throw new ForbiddenException('Você não pode atribuir este cargo.');
      }
    }

    const updated = await this.prisma.member.update({
      where: { id },
      data: {
        cargo: data.cargo,
        setorId: data.setorId,
        bio: data.bio,
      },
      include: memberInclude,
    });
    return formatMember(updated);
  }

  async delete(id: number, actorCargo?: Cargo | null) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: memberInclude,
    });
    if (!member) {
      throw new NotFoundException('Membro não encontrado.');
    }

    if (!canDeleteMember(member.cargo, actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir este membro.',
      );
    }

    await this.prisma.member.delete({ where: { id } });
    return { ok: true };
  }

  async getBySector(setorId: number) {
    const members = await this.prisma.member.findMany({
      where: { setorId },
      include: memberInclude,
      orderBy: { dataEntrada: 'desc' },
    });
    return members.map(formatMember);
  }

  async getByCargo() {
    const members = await this.prisma.member.findMany({
      include: memberInclude,
      orderBy: { dataEntrada: 'desc' },
    });

    const cargoOrder: Cargo[] = [
      'presidente',
      'vice_presidente',
      'administrador',
      'diretor',
      'antiga_gestao',
      'membro',
    ];

    const grouped = new Map<Cargo, ReturnType<typeof formatMember>[]>();
    for (const c of cargoOrder) {
      grouped.set(c, []);
    }
    for (const m of members) {
      const formatted = formatMember(m);
      const list = grouped.get(m.cargo) ?? [];
      list.push(formatted);
      if (!grouped.has(m.cargo)) {
        grouped.set(m.cargo, list);
      }
    }

    return cargoOrder
      .filter((c) => (grouped.get(c)?.length ?? 0) > 0)
      .map((c) => ({
        cargo: c,
        cargo_label: CargoLabel[c],
        members: grouped.get(c) ?? [],
      }));
  }

  async getWithoutSector() {
    const members = await this.prisma.member.findMany({
      where: {
        setorId: null,
        cargo: { notIn: ['presidente', 'vice_presidente'] },
      },
      include: memberInclude,
      orderBy: { dataEntrada: 'desc' },
    });
    return members.map(formatMember);
  }
}

function canCreateMember(actorCargo?: Cargo | null): boolean {
  if (!actorCargo) return false;
  return canEditMembers.includes(actorCargo) || actorCargo === 'diretor';
}

function canDeleteMember(
  targetCargo: Cargo,
  actorCargo?: Cargo | null,
): boolean {
  if (!actorCargo) return false;
  if (actorCargo === 'presidente' || actorCargo === 'administrador')
    return true;
  if (actorCargo === 'vice_presidente')
    return !['presidente', 'administrador'].includes(targetCargo);
  return false;
}
