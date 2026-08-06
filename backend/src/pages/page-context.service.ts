import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cargo } from '@prisma/client';
import type { SessionRequest } from '../auth/session-request';
import { csrfInput } from '../common/csrf.middleware';
import { consumeFlash, consumirFormulario } from '../common/flash';
import { MembersService } from '../members/members.service';
import { SignupRequestsService } from '../signup-requests/signup-requests.service';
import { PODE_APROVAR_CADASTRO as PODE_APROVAR } from '../common/escopo';

export const CargoLabel: Record<string, string> = {
  presidente: 'Presidente',
  vice_presidente: 'Vice-Presidente',
  administrador: 'Administrador',
  diretor: 'Diretor',
  antiga_gestao: 'Antiga Gestão',
  membro: 'Membro',
};

export const CARGO_ORDER: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
  'antiga_gestao',
  'membro',
];

export const PODE_GERIR_MEMBROS: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
];
export const PODE_CRIAR_MEMBROS: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
];
export const PODE_EXCLUIR_MEMBROS: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
];
export const PODE_GERIR_TAREFAS: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
  'antiga_gestao',
];
export const PODE_GERIR_SETORES: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
];
/*
 * A regra de escopo mora em `common/escopo.ts`, porque `tasks/` e `members/`
 * tambem a consultam e nao podem importar de `pages/` sem inverter a
 * dependencia entre os modulos. Reexportada aqui para quem ja importava daqui.
 *
 * PODE_APROVAR_CADASTRO ERA UMA COPIA LOCAL, e sem `diretor` — exatamente a
 * divergencia contra a qual o comentario de `escopo.ts` avisa. O diretor ficava
 * sem a aba de solicitacoes na tela enquanto a lista de la dizia que ele
 * responde por elas. Agora ha uma lista so.
 */
export {
  VE_TODOS_OS_SETORES,
  PODE_APROVAR_CADASTRO,
  escopoDeSetor,
  dentroDoEscopo,
} from '../common/escopo';

const VISITANTE = {
  id: 0,
  cargo: null,
  cargo_label: 'Visitante',
  is_admin: false,
  is_diretor: false,
  is_antiga_gestao: false,
  setor: null,
  usuario: {
    first_name: '',
    last_name: '',
    username: 'visitante',
    get_full_name: 'Visitante',
  },
};

/**
 * Monta o contexto comum a todas as paginas.
 *
 * Antes o contexto carregava membros, setores e tarefas em TODA pagina —
 * inclusive na home publica e no login. Agora cada rota carrega apenas o que
 * a sua propria tela usa.
 */
@Injectable()
export class PageContextService {
  constructor(
    private readonly configService: ConfigService,
    private readonly signupRequestsService: SignupRequestsService,
    private readonly membersService: MembersService,
  ) {}

  async base(req: SessionRequest) {
    const configuredSiteUrl = this.configService.get<string>('SITE_URL') ?? '';
    const host = req.get('host');
    const baseUrl =
      configuredSiteUrl || (host ? `${req.protocol}://${host}` : '');

    // Em paginas publicas o guard nao roda, mas a navbar ainda precisa saber
    // quem esta logado.
    if (!req.membro && req.session?.userId) {
      req.membro = await this.membersService.getByUserId(req.session.userId);
    }
    const membro = req.membro ?? null;
    const cargo: Cargo | null = membro?.cargo ?? null;
    const podeAprovar = cargo ? PODE_APROVAR.includes(cargo) : false;

    const [messages, solicitacoesPendentes, old] = await Promise.all([
      consumeFlash(req),
      // O proprio servico recorta por setor: o diretor conta so o setor dele.
      this.signupRequestsService.countPending(membro),
      consumirFormulario(req),
    ]);

    const token = req.session?.csrfToken ?? '';

    return {
      site_url: baseUrl,
      canonical_url: baseUrl ? `${baseUrl}${req.path}` : req.path,
      csrf_token: () => csrfInput(token),
      // `[]` e truthy em JS, entao um array vazio renderizaria a caixa de avisos.
      messages: messages.length > 0 ? messages : null,
      // Valores recusados na tentativa anterior. Os templates usam como
      // `value="{{ old.titulo | default(tarefa.titulo) }}"`, entao um objeto
      // vazio simplesmente deixa o padrao vencer.
      old,
      user: { is_authenticated: Boolean(req.session?.userId) },
      membro: membro ?? VISITANTE,
      cargo_label: cargo ? (CargoLabel[cargo] ?? cargo) : 'Visitante',
      solicitacoes_pendentes: solicitacoesPendentes,
      can_manage_tasks: cargo ? PODE_GERIR_TAREFAS.includes(cargo) : false,
      can_create_member: cargo ? PODE_CRIAR_MEMBROS.includes(cargo) : false,
      can_edit_member: cargo ? PODE_GERIR_MEMBROS.includes(cargo) : false,
      can_delete_member: cargo ? PODE_EXCLUIR_MEMBROS.includes(cargo) : false,
      can_manage_setores: cargo ? PODE_GERIR_SETORES.includes(cargo) : false,
      // A navbar e o menu perguntam isto para decidir se mostram Solicitações.
      can_approve_signup: podeAprovar,
    };
  }

  /** Agrupa membros por cargo no formato `[[label, membros], ...]` que os templates iteram. */
  groupByCargo(membros: any[]): Array<[string, any[]]> {
    const grouped = new Map<string, any[]>();
    for (const cargo of CARGO_ORDER) {
      grouped.set(cargo, []);
    }
    for (const membro of membros) {
      grouped.get(membro.cargo)?.push(membro);
    }
    return CARGO_ORDER.filter(
      (cargo) => (grouped.get(cargo)?.length ?? 0) > 0,
    ).map(
      (cargo) =>
        [CargoLabel[cargo] ?? cargo, grouped.get(cargo) ?? []] as [
          string,
          any[],
        ],
    );
  }
}
