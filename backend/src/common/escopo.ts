import { Cargo } from '@prisma/client';

/**
 * ESCOPO DE SETOR — quem enxerga o clube inteiro e quem enxerga um setor.
 *
 * Mora em `common/` de proposito. A regra e consultada por tres lugares —
 * `pages/panel.controller.ts` (o que a tela mostra), `tasks.service.ts` (o que
 * a pessoa pode alterar) e `members.service.ts` (quem ela pode gerenciar) — e
 * `pages/` nao pode ser importado por `tasks/` sem inverter a dependencia
 * entre os modulos.
 *
 * Uma lista de permissao duplicada e uma lista que diverge: o dia em que um
 * cargo novo entrar numa copia e nao na outra, a tela vai jurar uma coisa e a
 * API vai fazer outra. Por isso ha uma copia so, e e esta.
 */

/**
 * Quem enxerga o clube inteiro.
 *
 * O DIRETOR NAO ESTA AQUI: ele dirige um setor, e enxerga o setor que dirige.
 * Antes via tudo — todas as tarefas, todos os membros, todas as abas —, o que
 * fazia o painel dele ser identico ao do presidente e o "Diretor" do titulo
 * ser so uma palavra.
 *
 * Antiga gestao continua vendo tudo, em leitura: e memoria institucional, nao
 * operacao de um setor.
 *
 * `membro` tambem esta de fora, mas chega la por outro caminho: ele cai em
 * `painel_membro.njk`, que ja mostra apenas as proprias tarefas.
 */
export const VE_TODOS_OS_SETORES: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'antiga_gestao',
];

/**
 * Quem abre a tela de solicitacoes de cadastro e responde por elas.
 *
 * O DIRETOR ESTA AQUI, e e o unico da lista que nao ve tudo: como ele nao
 * aparece em `VE_TODOS_OS_SETORES`, `escopoDeSetor` o prende ao proprio setor e
 * ele so enxerga — e so aprova — quem pediu para entrar no setor que dirige.
 * As duas listas trabalham juntas: esta diz SE a pessoa entra, a outra diz
 * QUANTO ela ve depois de entrar.
 *
 * `antiga_gestao` fica de fora de proposito: ve tudo, mas em leitura, e aprovar
 * cadastro e ato de gestao atual.
 */
export const PODE_APROVAR_CADASTRO: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
];

export type Escopo = { setorId: number | null } | null;

/**
 * A que setor uma pessoa esta presa ao olhar o sistema.
 *
 * `null` significa "nenhuma restricao". Qualquer outro valor — inclusive
 * `{ setorId: null }` — restringe.
 *
 * Diretor sem setor cai em `{ setorId: null }` e ve o balde "sem setor". E
 * coerente (o setor dele E nenhum) e evita a tela morta que "nao ve nada"
 * produziria; na pratica e sinal de cadastro incompleto.
 */
export function escopoDeSetor(membro: {
  cargo?: Cargo | null;
  setorId?: number | null;
}): Escopo {
  if (!membro.cargo || VE_TODOS_OS_SETORES.includes(membro.cargo)) {
    return null;
  }
  return { setorId: membro.setorId ?? null };
}

/** `true` quando o setor alvo cai dentro do que a pessoa pode ver ou mexer. */
export function dentroDoEscopo(escopo: Escopo, setorId?: number | null) {
  return escopo === null || (setorId ?? null) === escopo.setorId;
}
