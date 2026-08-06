/* Renderiza os templates do painel com dados plausíveis, usando os MESMOS
   filtros que o bootstrap.ts registra. Compilar só prova sintaxe; renderizar
   prova que os caminhos de dado existem. */
const nunjucks = require('nunjucks');
const path = require('path');

const VIEWS = path.join(process.cwd(), 'src', 'views');
const env = nunjucks.configure(VIEWS, { autoescape: true, noCache: true });

// --- filtros copiados de bootstrap.ts ---
env.addGlobal('static', (p) => '/static/' + String(p).replace(/^\//, ''));
env.addGlobal('url', (name, ...params) => '/' + name + params.map((p) => '/' + p).join(''));
env.addGlobal('csrf_token', () => '<input type="hidden" name="csrfmiddlewaretoken" value="t">');
env.addFilter('make_list', (v) => (v == null ? [] : String(v).split('')));
env.addFilter('first', (v) => {
  if (Array.isArray(v)) return v[0] ?? null;
  if (v == null) return null;
  const s = String(v);
  return s.length ? s.charAt(0) : null;
});
env.addFilter('pluralize', (count, suffix = 's') => {
  const isOne = Number(count) === 1;
  if (!suffix) return isOne ? '' : 's';
  const parts = suffix.split(',');
  if (parts.length === 1) return isOne ? '' : parts[0];
  return isOne ? parts[0] : parts[1];
});
const fmt = (value, format, utc) => {
  if (value == null) return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const ano = utc ? d.getUTCFullYear() : d.getFullYear();
  const map = {
    d: pad(utc ? d.getUTCDate() : d.getDate()),
    m: pad((utc ? d.getUTCMonth() : d.getMonth()) + 1),
    Y: String(ano), y: String(ano).slice(-2),
    H: pad(utc ? d.getUTCHours() : d.getHours()),
    i: pad(utc ? d.getUTCMinutes() : d.getMinutes()),
    s: pad(utc ? d.getUTCSeconds() : d.getSeconds()),
  };
  return format.replace(/[dYmMyHis]/g, (m) => map[m] ?? m);
};
env.addFilter('date', (v, f) => fmt(v, f, false));
env.addFilter('date_utc', (v, f) => fmt(v, f, true));
env.addFilter('truncatewords', (v, c) => {
  if (v == null) return '';
  const w = String(v).split(/\s+/);
  return w.length <= c ? String(v) : w.slice(0, c).join(' ') + '...';
});

// --- dados ---
const usuario = (f, l, u) => ({ first_name: f, last_name: l, username: u, get_full_name: `${f} ${l}`.trim() || u });
const setorDev = { id: 1, nome: 'Desenvolvimento', descricao: 'Código do clube' };
const setorDesign = { id: 2, nome: 'Design', descricao: null };

const membro = (id, f, l, u, cargo, cargo_label, setor, carga) => ({
  id, cargo, cargo_label, setorId: setor ? setor.id : null, setor,
  bio: id === 1 ? 'Gosto de compiladores e de pato de borracha.' : null,
  usuario: usuario(f, l, u), data_entrada: new Date('2025-03-01T00:00:00Z'),
  is_admin: cargo === 'presidente', is_diretor: cargo === 'diretor', is_antiga_gestao: false,
  carga, carga_maxima: 9,
});

// `pendente_no_prazo` e `andamento_no_prazo` são o que sobra depois de tirar as
// atrasadas: os três segmentos da régua têm de somar exatamente `aberto`.
const membros = [
  membro(1, 'Rodrigo', 'Duca', 'rodrigo', 'presidente', 'Presidente', setorDev,
    { pendente: 5, em_andamento: 4, concluida: 12, atrasada: 2, aberto: 9,
      pendente_no_prazo: 4, andamento_no_prazo: 3 }),
  membro(2, 'Ana', 'Souza', 'ana', 'diretor', 'Diretor', setorDesign,
    { pendente: 4, em_andamento: 2, concluida: 3, atrasada: 0, aberto: 6,
      pendente_no_prazo: 4, andamento_no_prazo: 2 }),
  // sem sobrenome, sem setor, carga zero — os três casos de borda juntos
  membro(3, 'Bruno', '', 'bruno', 'membro', 'Membro', null,
    { pendente: 0, em_andamento: 0, concluida: 0, atrasada: 0, aberto: 0,
      pendente_no_prazo: 0, andamento_no_prazo: 0 }),
];

const tarefa = (id, titulo, status, extras = {}) => ({
  id, titulo, status,
  descricao: extras.descricao !== undefined ? extras.descricao : 'Uma descrição razoavelmente longa que o cartão cortaria em quinze palavras mas o detalhe mostra inteira, com quebras.',
  responsavel: membros[0], criado_por: membros[1], setor: extras.setor !== undefined ? extras.setor : setorDev,
  prazo: extras.prazo !== undefined ? extras.prazo : new Date('2026-08-12T00:00:00Z'),
  dias_restantes: extras.dias_restantes !== undefined ? extras.dias_restantes : 13,
  atrasada: !!extras.atrasada, prazo_proximo: false,
  prioridade: 'alta', prioridade_label: 'Alta', get_prioridade_display: 'Alta',
  funcao: extras.funcao !== undefined ? extras.funcao : 'desenvolvimento',
  funcao_label: 'Desenvolvimento', get_funcao_display: 'Desenvolvimento',
  projeto: extras.projeto !== undefined ? extras.projeto : 'SEMCOMP',
  status_label: { pendente: 'Pendente', em_andamento: 'Em Andamento', concluida: 'Concluída' }[status],
  get_status_display: 'Em Andamento',
  STATUS_CHOICES: [['pendente', 'Pendente'], ['em_andamento', 'Em Andamento'], ['concluida', 'Concluída']],
  anexos_count: 3, data_criacao: new Date('2026-07-14T10:00:00Z'),
});

const tarefas = [
  tarefa(42, 'Refatorar o formulário de inscrição', 'em_andamento'),
  tarefa(43, 'Cartaz da SEMCOMP', 'pendente', { setor: setorDesign, atrasada: true, dias_restantes: -4 }),
  // Tarefa mínima: sem descrição, sem prazo, sem setor, sem função, sem projeto
  tarefa(44, 'Tarefa pelada', 'concluida', { descricao: null, prazo: null, setor: null, funcao: null, projeto: null, dias_restantes: null }),
];

const base = {
  site_url: 'http://localhost:3000', canonical_url: '/painel',
  csrf_token: () => '<input type="hidden" name="csrfmiddlewaretoken" value="t">',
  messages: null, old: {}, user: { is_authenticated: true },
  membro: membros[0], cargo_label: 'Presidente', solicitacoes_pendentes: 2,
  can_manage_tasks: true, can_create_member: true, can_edit_member: true,
  can_delete_member: true, can_manage_setores: true,
};

const porStatus = (s) => tarefas.filter((t) => t.status === s);
const setores = [setorDev, setorDesign];

const casos = [
  ['core/membros.njk', { ...base, membros, setores,
    membros_por_cargo: [['Presidente', [membros[0]]], ['Diretor', [membros[1]]], ['Membro', [membros[2]]]],
    total_membros: 3, total_sem_setor: 1, setor_filtro: '', escopo_reduzido: false, escopo_setor: null }],
  // Diretório de um diretor: escopo reduzido, com o setor nomeado no aviso.
  ['core/membros.njk (escopo de setor)', { ...base, membros: [membros[1]], setores: [setorDesign],
    membros_por_cargo: [['Diretor', [membros[1]]]],
    total_membros: 1, total_sem_setor: 0, setor_filtro: '',
    escopo_reduzido: true, escopo_setor: setorDesign }, 'core/membros.njk'],
  ['core/membros.njk (vazio)', { ...base, membros: [], setores: [], membros_por_cargo: [],
    total_membros: 0, total_sem_setor: 0, setor_filtro: '', escopo_reduzido: true, escopo_setor: null }, 'core/membros.njk'],
  ['core/tarefa.njk', { ...base, tarefa: tarefas[0], upload_habilitado: true,
    anexos: [{ id: 1, nome: 'brief.pdf', tipo: 'arquivo', url: 'http://x/y.pdf' }] }],
  ['core/tarefa.njk (atrasada, sem anexo)', { ...base, tarefa: tarefas[1], anexos: [], upload_habilitado: true }, 'core/tarefa.njk'],
  ['core/tarefa.njk (mínima)', { ...base, tarefa: tarefas[2], anexos: [], upload_habilitado: true }, 'core/tarefa.njk'],
  // Sem Cloudinary o campo de arquivo some e a tela avisa que só links funcionam.
  ['core/tarefa.njk (upload desligado)', { ...base, tarefa: tarefas[0], anexos: [], upload_habilitado: false }, 'core/tarefa.njk'],
  ['core/painel_admin.njk', { ...base, membros, setores: [{ ...setorDev, membros: [membros[0]] }, { ...setorDesign, membros: [membros[1]] }],
    tarefas, total_membros: 3,
    todas_tarefas_pendente: porStatus('pendente'), todas_tarefas_em_andamento: porStatus('em_andamento'),
    todas_tarefas_concluida: porStatus('concluida'),
    tarefas_sem_setor_pendente: [], tarefas_sem_setor_em_andamento: [], tarefas_sem_setor_concluida: [tarefas[2]],
    tarefas_por_setor: { 1: { pendente: [], em_andamento: [tarefas[0]], concluida: [] }, 2: { pendente: [tarefas[1]], em_andamento: [], concluida: [] } },
    setores_gerenciaveis: [1, 2], setor_ativo: setorDev, total_atrasadas: 1, total_sem_prazo: 1,
    escopo_restrito: false, escopo_setor: null }],
  // Painel do diretor: um setor só, sem abas e sem o balde "sem setor".
  ['core/painel_admin.njk (diretor, escopo restrito)', { ...base, membro: membros[1], membros: [membros[1]],
    setores: [setorDesign], tarefas: [tarefas[1]], total_membros: 1,
    todas_tarefas_pendente: [tarefas[1]], todas_tarefas_em_andamento: [], todas_tarefas_concluida: [],
    tarefas_sem_setor_pendente: [], tarefas_sem_setor_em_andamento: [], tarefas_sem_setor_concluida: [],
    tarefas_por_setor: {}, setores_gerenciaveis: [], setor_ativo: setorDesign,
    total_atrasadas: 1, total_sem_prazo: 0,
    escopo_restrito: true, escopo_setor: setorDesign }, 'core/painel_admin.njk'],
  ['core/painel_admin.njk (tudo em dia)', { ...base, membros, setores: [], tarefas: [], total_membros: 3,
    todas_tarefas_pendente: [], todas_tarefas_em_andamento: [], todas_tarefas_concluida: [],
    tarefas_sem_setor_pendente: [], tarefas_sem_setor_em_andamento: [], tarefas_sem_setor_concluida: [],
    tarefas_por_setor: {}, setores_gerenciaveis: [], setor_ativo: null,
    total_atrasadas: 0, total_sem_prazo: 0,
    escopo_restrito: false, escopo_setor: null }, 'core/painel_admin.njk'],
  ['core/painel_membro.njk', { ...base, can_manage_tasks: false, membro: membros[2],
    colegas_setor: [membros[1]], total_minhas: 3, total_atrasadas: 1, tarefas_pendente: porStatus('pendente'),
    tarefas_em_andamento: porStatus('em_andamento'), tarefas_concluida: porStatus('concluida') }],
  ['core/criar_tarefa.njk', { ...base, membros, setores, status_inicial: 'em_andamento' }],
  ['core/editar_tarefa.njk', { ...base, membros, setores, tarefa: tarefas[0] }],
  ['partials/form_tarefa.njk (criar)', { ...base, membros, setores, status_inicial: 'pendente' }, 'partials/form_tarefa.njk'],
  ['partials/form_tarefa.njk (editar)', { ...base, membros, setores, tarefa: tarefas[0] }, 'partials/form_tarefa.njk'],
  ['partials/form_tarefa.njk (old após erro)', { ...base, membros, setores,
    old: { titulo: 'Digitado', responsavelId: '2', setorId: '1', prioridade: 'urgente', funcao: 'design', projeto: 'X', prazo: '2026-09-01' } }, 'partials/form_tarefa.njk'],
  ['partials/detalhe_tarefa.njk', { ...base, tarefa: tarefas[0], upload_habilitado: true,
    anexos: [{ id: 1, nome: 'link', tipo: 'link', url: 'http://x' }] }, 'partials/detalhe_tarefa.njk'],
  ['partials/lista_anexos.njk', { anexos: [{ id: 1, nome: 'brief.pdf', tipo: 'arquivo', url: 'http://x/y.pdf' }] }, 'partials/lista_anexos.njk'],
  // Um <p> só: o piso padrão de 80 bytes não vale para este caso.
  ['partials/lista_anexos.njk (vazia)', { anexos: [] }, 'partials/lista_anexos.njk', 40],

  // Telas de formulário e confirmação. Entraram aqui quando passaram a usar o
  // cabeçalho do painel: elas leem `setor.tarefas`, `tarefa.anexos` e
  // `membro_alvo.setor`, e compilar não prova que esses caminhos existem.
  ['core/criar_setor.njk', { ...base }],
  ['core/editar_setor.njk', { ...base, setor: setores[0] }],
  ['core/excluir_setor.njk', { ...base, setor: setores[0] }],
  ['core/adicionar_membro.njk', { ...base, restrito_ao_setor: false }],
  ['core/adicionar_membro.njk (diretor)', { ...base, restrito_ao_setor: true }, 'core/adicionar_membro.njk'],
  ['core/editar_membro.njk', { ...base, membro_alvo: membros[0] }],
  ['core/excluir_membro.njk', { ...base, membro_alvo: membros[0] }],
  ['core/excluir_tarefa.njk', { ...base, tarefa: tarefas[0] }],
  ['core/gerenciar_anexos.njk', { ...base, tarefa: tarefas[0], upload_habilitado: true,
    anexos: [{ id: 1, nome: 'brief.pdf', tipo: 'arquivo', url: 'http://x/y.pdf', download_url: '/y.pdf',
      data_upload: new Date(), enviado_por: membros[0] }] }],
  ['core/gerenciar_anexos.njk (sem upload, sem anexo)', { ...base, tarefa: tarefas[0],
    upload_habilitado: false, anexos: [] }, 'core/gerenciar_anexos.njk'],
  ['core/editar_anexo.njk', { ...base, tarefa: tarefas[0],
    anexo: { id: 1, nome: 'brief.pdf', tipo: 'arquivo', url: '' } }],
  ['core/editar_anexo.njk (link)', { ...base, tarefa: tarefas[0],
    anexo: { id: 2, nome: 'figma', tipo: 'link', url: 'http://x' } }, 'core/editar_anexo.njk'],
  ['core/excluir_anexo.njk', { ...base, tarefa: tarefas[0],
    anexo: { id: 1, nome: 'brief.pdf', tipo: 'arquivo', url: '', data_upload: new Date(),
      enviado_por: membros[0] } }],
  ['core/excluir_anexo.njk (link)', { ...base, tarefa: tarefas[0],
    anexo: { id: 2, nome: 'figma', tipo: 'link', url: 'http://x', data_upload: new Date(),
      enviado_por: membros[0] } }, 'core/excluir_anexo.njk'],
];

let falhas = 0;
for (const [rotulo, ctx, arquivo, minimo] of casos) {
  const alvo = arquivo || rotulo;
  const piso = minimo || 80;
  try {
    const html = env.render(alvo, ctx);
    if (!html || html.length < piso) throw new Error('saída suspeita: ' + html.length + ' bytes');
    if (html.includes('undefined')) {
      console.log('  AVISO ' + rotulo + ' -> "undefined" no HTML');
    }
    console.log('  ok    ' + rotulo + '  (' + html.length + ' bytes)');
  } catch (e) {
    falhas++;
    console.log('  FALHA ' + rotulo + ' -> ' + String(e.message).split('\n').slice(0, 3).join(' | '));
  }
}
console.log(falhas ? '\n' + falhas + ' falha(s)' : '\nTodos renderizaram.');
if (process.argv[2] !== '--inspecionar') process.exit(falhas ? 1 : 0);

// Inspeção da saída, ativada por argumento
if (process.argv[2] === '--inspecionar') {
  const html = env.render('core/membros.njk', casos[0][1]);
  const linhas = html.split('\n').map((l) => l.trim()).filter(Boolean);
  const mostrar = (rotulo, teste, n) => {
    console.log('\n--- ' + rotulo + ' ---');
    linhas.filter(teste).slice(0, n || 6).forEach((l) => console.log(l));
  };
  mostrar('régua de Rodrigo (5 pend, 4 andam, de máx 9)', (l) => l.includes('ocupacao') || l.includes('regua-parte'), 5);
  mostrar('régua vazia (Bruno, carga zero)', (l) => l.includes('regua-vazia') || l.includes('regua-livre'));
  mostrar('eyebrow //', (l) => l.includes('eyebrow'), 4);
  mostrar('avatar (âmbar só para o próprio)', (l) => l.includes('card-avatar'));
  mostrar('selo de cargo', (l) => l.includes('badge badge-'), 3);
}
