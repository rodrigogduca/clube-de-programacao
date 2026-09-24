export const routes: Record<string, string> = {
  home: '/',
  // Página pública que reúne comunidade, clubes temáticos e o PROSEL. Saiu da
  // home para que a landing volte a ter uma leitura só: quem somos e quem faz.
  seja_membro: '/seja-membro',
  // A SEMCOMP saiu de um modal para uma página própria: o evento tem
  // programação, atividades e inscrição, e nada disso cabe num diálogo —
  // nem podia ser compartilhado por link, indexado ou aberto em nova aba.
  semcomp: '/semcomp',
  // Inscrição pelo próprio site (antes era só o link do Even3). Ver src/semcomp/.
  semcomp_inscricao: '/semcomp/inscricao',
  semcomp_inscricao_link: '/semcomp/inscricao/link',
  semcomp_gerenciar: '/semcomp/inscricao/gerenciar/:token',
  painel_semcomp: '/painel/semcomp',
  painel_semcomp_inscritos: '/painel/semcomp/inscritos',
  painel_semcomp_inscritos_csv: '/painel/semcomp/inscritos.csv',
  painel_semcomp_nova: '/painel/semcomp/atividade/nova',
  painel_semcomp_atividade: '/painel/semcomp/atividade/:id',
  painel_semcomp_atividade_csv: '/painel/semcomp/atividade/:id/lista.csv',
  painel_semcomp_editar: '/painel/semcomp/atividade/:id/editar',
  painel_semcomp_excluir: '/painel/semcomp/atividade/:id/excluir',
  painel_semcomp_presenca: '/painel/semcomp/presenca/:escolhaId',
  painel_semcomp_even3_inscricoes: '/painel/semcomp/even3/enviar-inscricoes',
  painel_semcomp_even3_sessoes: '/painel/semcomp/even3/vincular-sessoes',
  painel_semcomp_even3_presencas: '/painel/semcomp/even3/enviar-presencas',
  painel: '/painel',
  listar_membros: '/painel/membros',
  adicionar_membro: '/painel/adicionar-membro',
  editar_membro: '/painel/membro/:membro_id/editar',
  excluir_membro: '/painel/membro/:membro_id/excluir',
  criar_tarefa: '/painel/criar-tarefa',
  ver_tarefa: '/painel/tarefa/:tarefa_id',
  exportar_tarefas: '/painel/tarefas/exportar.csv',
  modelo_tarefas: '/painel/tarefas/modelo.csv',
  importar_tarefas: '/painel/tarefas/importar',
  limpar_tarefas: '/painel/tarefas/limpar',
  atualizar_tarefa: '/painel/tarefa/:tarefa_id/atualizar',
  editar_tarefa: '/painel/tarefa/:tarefa_id/editar',
  excluir_tarefa: '/painel/tarefa/:tarefa_id/excluir',
  gerenciar_anexos: '/painel/tarefa/:tarefa_id/anexos',
  editar_anexo: '/painel/anexo/:anexo_id/editar',
  excluir_anexo: '/painel/anexo/:anexo_id/excluir',
  criar_setor: '/painel/criar-setor',
  editar_setor: '/painel/setor/:setor_id/editar',
  excluir_setor: '/painel/setor/:setor_id/excluir',
  solicitar_cadastro: '/solicitar-cadastro',
  listar_solicitacoes: '/painel/solicitacoes',
  aprovar_solicitacao: '/painel/solicitacoes/:solicitacao_id/aprovar',
  rejeitar_solicitacao: '/painel/solicitacoes/:solicitacao_id/rejeitar',
  excluir_solicitacao: '/painel/solicitacoes/:solicitacao_id/excluir',
  editar_solicitacao: '/painel/solicitacoes/:solicitacao_id/editar',
  login: '/accounts/login',
  logout: '/accounts/logout',
  robots_txt: '/robots.txt',
  sitemap_xml: '/sitemap.xml',
};

export function buildUrl(
  name: string,
  ...params: Array<string | number>
): string {
  const pattern = routes[name];
  if (!pattern) {
    return '#';
  }

  let url = pattern;
  for (const param of params) {
    url = url.replace(/:\w+/, encodeURIComponent(String(param)));
  }

  return url;
}
