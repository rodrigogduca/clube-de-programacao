export const routes: Record<string, string> = {
  home: '/',
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
