import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cargo, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StatusLabel, statusChoicePairs } from '../tasks/tasks.service';

const CargoLabel: Record<Cargo, string> = {
  presidente: 'Presidente',
  vice_presidente: 'Vice-Presidente',
  administrador: 'Administrador',
  diretor: 'Diretor',
  antiga_gestao: 'Antiga Gestão',
  membro: 'Membro',
};

const canManageSectors: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
];

const sectorInclude = {
  membros: {
    include: {
      user: true,
    },
  },
  tarefas: {
    include: {
      responsavel: {
        include: { user: true },
      },
      criadoPor: {
        include: { user: true },
      },
      anexos: true,
    },
  },
  _count: {
    select: {
      tarefas: true,
    },
  },
} satisfies Prisma.SectorInclude;

type SectorWithRelations = Prisma.SectorGetPayload<{
  include: typeof sectorInclude;
}>;

function formatSectorUser(user: {
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

function formatSector(s: SectorWithRelations) {
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

  return {
    ...s,
    membros: s.membros.map((m) => ({
      ...m,
      usuario: m.user
        ? formatSectorUser(m.user as any)
        : { first_name: '', last_name: '', username: '?', get_full_name: '?' },
      user: undefined,
      data_entrada: m.dataEntrada,
      cargo_label: CargoLabel[m.cargo] ?? m.cargo,
      is_admin: ['presidente', 'administrador'].includes(m.cargo),
      is_diretor: m.cargo === 'diretor',
      is_antiga_gestao: m.cargo === 'antiga_gestao',
    })),
    tarefas: s.tarefas.map((t) => ({
      ...t,
      data_criacao: t.dataCriacao,
      get_prioridade_display: PrioridadeLabel[t.prioridade] ?? t.prioridade,
      get_funcao_display: t.funcao ? (FuncaoLabel[t.funcao] ?? t.funcao) : null,
      status_label: StatusLabel[t.status] ?? t.status,
      get_status_display: StatusLabel[t.status] ?? t.status,
      prioridade_label: PrioridadeLabel[t.prioridade] ?? t.prioridade,
      funcao_label: t.funcao ? (FuncaoLabel[t.funcao] ?? t.funcao) : null,
      STATUS_CHOICES: statusChoicePairs,
      anexos_count: t.anexos?.length ?? 0,
      responsavel: t.responsavel
        ? {
            ...t.responsavel,
            usuario: t.responsavel.user
              ? formatSectorUser(t.responsavel.user as any)
              : {
                  first_name: '',
                  last_name: '',
                  username: '?',
                  get_full_name: '?',
                },
            user: undefined,
            data_entrada: t.responsavel.dataEntrada,
          }
        : null,
      criado_por: t.criadoPor
        ? {
            ...t.criadoPor,
            usuario: t.criadoPor.user
              ? formatSectorUser(t.criadoPor.user as any)
              : {
                  first_name: '',
                  last_name: '',
                  username: '?',
                  get_full_name: '?',
                },
            user: undefined,
            data_entrada: t.criadoPor.dataEntrada,
          }
        : null,
      criadoPor: undefined,
    })),
  };
}

@Injectable()
export class SectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const sectors = await this.prisma.sector.findMany({
      include: sectorInclude,
      orderBy: { nome: 'asc' },
    });
    return sectors.map(formatSector);
  }

  /**
   * Versao enxuta para preencher `<select>`: sem carregar membros e tarefas
   * de cada setor, que e o que torna `list()` caro.
   */
  async listSimple() {
    return this.prisma.sector.findMany({
      select: { id: true, nome: true, descricao: true },
      orderBy: { nome: 'asc' },
    });
  }

  async getById(id: number) {
    const sector = await this.prisma.sector.findUnique({
      where: { id },
      include: sectorInclude,
    });
    if (!sector) {
      throw new NotFoundException('Setor não encontrado.');
    }
    return formatSector(sector);
  }

  async create(
    data: { nome: string; descricao?: string },
    actorCargo?: Cargo | null,
  ) {
    if (!actorCargo || !canManageSectors.includes(actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para criar setores.',
      );
    }

    const existing = await this.prisma.sector.findUnique({
      where: { nome: data.nome },
    });
    if (existing) {
      throw new BadRequestException('Já existe um setor com este nome.');
    }

    const sector = await this.prisma.sector.create({
      data,
      include: sectorInclude,
    });
    return formatSector(sector);
  }

  async update(
    id: number,
    data: { nome?: string; descricao?: string },
    actorCargo?: Cargo | null,
  ) {
    if (!actorCargo || !canManageSectors.includes(actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para editar setores.',
      );
    }

    const sector = await this.prisma.sector.findUnique({ where: { id } });
    if (!sector) {
      throw new NotFoundException('Setor não encontrado.');
    }

    if (data.nome) {
      const conflict = await this.prisma.sector.findFirst({
        where: { nome: data.nome, id: { not: id } },
      });
      if (conflict) {
        throw new BadRequestException('Já existe um setor com este nome.');
      }
    }

    const updated = await this.prisma.sector.update({
      where: { id },
      data,
      include: sectorInclude,
    });
    return formatSector(updated);
  }

  async delete(id: number, actorCargo?: Cargo | null) {
    if (!actorCargo || !canManageSectors.includes(actorCargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para excluir setores.',
      );
    }

    const sector = await this.prisma.sector.findUnique({ where: { id } });
    if (!sector) {
      throw new NotFoundException('Setor não encontrado.');
    }

    await this.prisma.sector.delete({ where: { id } });
    return { ok: true };
  }
}

export { CargoLabel as CargoLabelForExport };
