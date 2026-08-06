import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cargo, Prisma, SolicitacaoStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from '../auth/password.service';
import type { Escopo } from '../common/escopo';
import {
  PODE_APROVAR_CADASTRO,
  dentroDoEscopo,
  escopoDeSetor,
} from '../common/escopo';

const CargoLabel: Record<Cargo, string> = {
  presidente: 'Presidente',
  vice_presidente: 'Vice-Presidente',
  administrador: 'Administrador',
  diretor: 'Diretor',
  antiga_gestao: 'Antiga Gestão',
  membro: 'Membro',
};

const SolicitacaoStatusLabel: Record<SolicitacaoStatus, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
};

/**
 * Quem esta pedindo, do ponto de vista da permissao: o cargo diz SE entra, o
 * setor diz QUANTO ve depois de entrar.
 *
 * Antes estes metodos recebiam so o cargo, e a lista de quem podia responder
 * era uma copia local que nao tinha `diretor` — o oposto do que
 * `PODE_APROVAR_CADASTRO` documenta. O diretor via a aba, clicava e levava 403.
 */
export type Ator = { cargo?: Cargo | null; setorId?: number | null };

/**
 * Recusa quem nao pode responder por cadastro e devolve o escopo de quem pode.
 *
 * `null` = clube inteiro. Qualquer outro valor prende a consulta a um setor,
 * que e o caso do diretor.
 */
function escopoDeQuemAprova(ator: Ator | null | undefined, acao: string): Escopo {
  const cargo = ator?.cargo ?? null;
  if (!cargo || !PODE_APROVAR_CADASTRO.includes(cargo)) {
    throw new ForbiddenException(`Você não tem permissão para ${acao}.`);
  }
  return escopoDeSetor({ cargo, setorId: ator?.setorId ?? null });
}

/** O `where` do Prisma que corresponde ao escopo. Sem escopo, sem filtro. */
function filtroDeSetor(escopo: Escopo): Prisma.SignupRequestWhereInput {
  return escopo === null ? {} : { setorId: escopo.setorId };
}

const signupInclude = {
  setor: true,
  respondidoPor: true,
} satisfies Prisma.SignupRequestInclude;

type SignupWithRelations = Prisma.SignupRequestGetPayload<{
  include: typeof signupInclude;
}>;

function formatSignup(s: SignupWithRelations) {
  return {
    ...s,
    // Os templates leem snake_case (heranca do Django); o Prisma entrega camelCase.
    first_name: s.firstName ?? '',
    last_name: s.lastName ?? '',
    nome_completo:
      [s.firstName, s.lastName].filter(Boolean).join(' ') || s.username,
    cargo_label: CargoLabel[s.cargo] ?? s.cargo,
    get_cargo_display: CargoLabel[s.cargo] ?? s.cargo,
    status_label: SolicitacaoStatusLabel[s.status] ?? s.status,
    data_solicitacao: s.dataSolicitacao,
    data_resposta: s.dataResposta,
    senha_plain: s.senhaPlain,
  };
}

@Injectable()
export class SignupRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async list(ator?: Ator | null) {
    const escopo = escopoDeQuemAprova(ator, 'ver solicitações de cadastro');

    const requests = await this.prisma.signupRequest.findMany({
      where: filtroDeSetor(escopo),
      include: signupInclude,
      orderBy: { dataSolicitacao: 'desc' },
    });
    return requests.map(formatSignup);
  }

  async listByStatus(status: SolicitacaoStatus, ator?: Ator | null) {
    const escopo = escopoDeQuemAprova(ator, 'ver solicitações de cadastro');

    const requests = await this.prisma.signupRequest.findMany({
      where: { status, ...filtroDeSetor(escopo) },
      include: signupInclude,
      orderBy: { dataSolicitacao: 'desc' },
    });
    return requests.map(formatSignup);
  }

  async update(
    id: number,
    data: {
      username?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      setorId?: number | null;
      cargo?: Cargo;
    },
    ator?: Ator | null,
  ) {
    const escopo = escopoDeQuemAprova(ator, 'editar solicitações');

    const request = await this.prisma.signupRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Solicitacao não encontrada.');
    }
    if (!dentroDoEscopo(escopo, request.setorId)) {
      throw new ForbiddenException(
        'Esta solicitação não é do seu setor.',
      );
    }
    if (request.status !== 'pendente') {
      throw new BadRequestException(
        'Apenas solicitacoes pendentes podem ser editadas.',
      );
    }

    /* Quem so enxerga um setor tambem so pode mandar a solicitacao para esse
       setor: sem isso o diretor "editaria" o setor de uma solicitacao e a
       empurraria para fora do proprio escopo — inclusive perdendo o acesso a
       ela no mesmo clique. */
    if (
      data.setorId !== undefined &&
      !dentroDoEscopo(escopo, data.setorId ?? null)
    ) {
      throw new ForbiddenException(
        'Você só pode mover solicitações dentro do seu setor.',
      );
    }

    const updated = await this.prisma.signupRequest.update({
      where: { id },
      data: {
        username: data.username?.trim(),
        firstName: data.firstName?.trim(),
        lastName:
          data.lastName === undefined ? undefined : data.lastName.trim(),
        email: data.email?.trim(),
        setorId: data.setorId,
        cargo: data.cargo,
      },
      include: signupInclude,
    });
    return formatSignup(updated);
  }

  async getById(id: number, ator?: Ator | null) {
    const escopo = escopoDeQuemAprova(ator, 'ver solicitações de cadastro');

    const request = await this.prisma.signupRequest.findUnique({
      where: { id },
      include: signupInclude,
    });
    if (!request) {
      throw new NotFoundException('Solicitacao não encontrada.');
    }
    /* Fora do escopo responde 404, nao 403: para o diretor de outro setor esta
       solicitacao simplesmente nao existe, e um 403 confirmaria que existe. */
    if (!dentroDoEscopo(escopo, request.setorId)) {
      throw new NotFoundException('Solicitacao não encontrada.');
    }
    return formatSignup(request);
  }

  async create(data: {
    username: string;
    firstName: string;
    lastName?: string;
    email: string;
    setorId?: number | null;
    cargo?: Cargo;
    senha: string;
  }) {
    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ username: data.username }, { email: data.email }] },
    });
    if (existingUser) {
      throw new BadRequestException(
        'Nome de usuário ou e-mail já esta em uso.',
      );
    }

    const existingRequest = await this.prisma.signupRequest.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
        status: 'pendente',
      },
    });
    if (existingRequest) {
      throw new BadRequestException(
        'Já existe uma solicitacao pendente com este usuário ou e-mail.',
      );
    }

    const passwordHash = await this.passwordService.hash(data.senha);

    const request = await this.prisma.signupRequest.create({
      data: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        setorId: data.setorId ?? null,
        cargo: data.cargo ?? 'membro',
        senhaHash: passwordHash,
      },
      include: signupInclude,
    });
    return formatSignup(request);
  }

  async approve(id: number, approvedById: number, ator?: Ator | null) {
    const escopo = escopoDeQuemAprova(ator, 'aprovar solicitações');

    const request = await this.prisma.signupRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Solicitacao não encontrada.');
    }
    if (!dentroDoEscopo(escopo, request.setorId)) {
      throw new ForbiddenException(
        'Você só pode aprovar solicitações do seu setor.',
      );
    }
    if (request.status !== 'pendente') {
      throw new BadRequestException('Esta solicitacao já foi respondida.');
    }

    /* O diretor dirige um setor, nao promove a diretoria: aprovar so cria
       quem ele ja poderia criar pela tela de membro. Sem esta linha, uma
       solicitacao com cargo "presidente" viraria presidente pela mao dele. */
    if (escopo !== null && !['membro', 'diretor'].includes(request.cargo)) {
      throw new ForbiddenException(
        'Esta solicitação pede um cargo que você não pode conceder. Peça à presidência.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: request.username,
          email: request.email,
          passwordHash: request.senhaHash,
          firstName: request.firstName,
          lastName: request.lastName,
        },
      });

      await tx.member.create({
        data: {
          userId: user.id,
          cargo: request.cargo,
          setorId: request.setorId,
        },
      });

      await tx.signupRequest.update({
        where: { id },
        data: {
          status: 'aprovada',
          dataResposta: new Date(),
          respondidoPorId: approvedById,
        },
      });
    });

    return this.getById(id, ator);
  }

  async reject(id: number, rejectedById: number, ator?: Ator | null) {
    const escopo = escopoDeQuemAprova(ator, 'rejeitar solicitações');

    const request = await this.prisma.signupRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Solicitacao não encontrada.');
    }
    if (!dentroDoEscopo(escopo, request.setorId)) {
      throw new ForbiddenException(
        'Você só pode rejeitar solicitações do seu setor.',
      );
    }
    if (request.status !== 'pendente') {
      throw new BadRequestException('Esta solicitacao já foi respondida.');
    }

    await this.prisma.signupRequest.update({
      where: { id },
      data: {
        status: 'rejeitada',
        dataResposta: new Date(),
        respondidoPorId: rejectedById,
      },
    });

    return this.getById(id, ator);
  }

  async delete(id: number, ator?: Ator | null) {
    const escopo = escopoDeQuemAprova(ator, 'excluir solicitações');

    const request = await this.prisma.signupRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Solicitacao não encontrada.');
    }
    if (!dentroDoEscopo(escopo, request.setorId)) {
      throw new ForbiddenException(
        'Você só pode excluir solicitações do seu setor.',
      );
    }

    await this.prisma.signupRequest.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * O numero do selo da navbar. Conta o mesmo que a tela vai listar — para o
   * diretor, so o setor dele —, senao o selo prometeria pendencias que a lista
   * nao mostra.
   */
  async countPending(ator?: Ator | null) {
    const cargo = ator?.cargo ?? null;
    if (!cargo || !PODE_APROVAR_CADASTRO.includes(cargo)) {
      return 0;
    }
    const escopo = escopoDeSetor({ cargo, setorId: ator?.setorId ?? null });
    return this.prisma.signupRequest.count({
      where: { status: 'pendente', ...filtroDeSetor(escopo) },
    });
  }
}

export { CargoLabel as SignupCargoLabel };
