import type { Cargo } from '@prisma/client';
import type { Request } from 'express';

export type FlashLevel = 'success' | 'error' | 'warning' | 'info';

/** Formato do membro logado, como devolvido por `MembersService.getByUserId`. */
export type SessionMember = {
  id: number;
  userId: number;
  cargo: Cargo;
  cargo_label: string;
  setorId: number | null;
  setor: { id: number; nome: string } | null;
  bio: string | null;
  is_admin: boolean;
  is_diretor: boolean;
  is_antiga_gestao: boolean;
  usuario: {
    username: string;
    first_name: string;
    last_name: string;
    get_full_name: string;
  };
};

export type FlashMessage = {
  tags: FlashLevel;
  text: string;
};

/**
 * O que o usuario digitou num formulario que o servidor recusou, guardado para
 * a tela ser repovoada depois do redirect em vez de voltar em branco.
 * `path` amarra os valores ao formulario de origem, para nao vazarem para outra
 * tela caso o usuario navegue antes.
 */
export type FormOld = {
  path: string;
  values: Record<string, string>;
};

export type ClubSession = {
  userId?: number;
  role?: string;
  sessionVersion?: number;
  issuedAt?: string;
  csrfToken?: string;
  flash?: FlashMessage[];
  formOld?: FormOld;
  save: () => Promise<void>;
  destroy: () => void;
};

export type SessionRequest = Request & {
  session: ClubSession;
  /** Preenchido pelo AuthenticatedGuard para evitar recarregar o membro a cada uso. */
  membro?: SessionMember | null;
};

/**
 * Dentro de rotas protegidas pelo AuthenticatedGuard o membro sempre existe,
 * o que evita `!` espalhado pelos controllers.
 */
export type AuthenticatedRequest = SessionRequest & {
  membro: SessionMember;
};
