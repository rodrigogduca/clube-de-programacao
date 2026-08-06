import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Render,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type {
  AuthenticatedRequest,
  SessionMember,
} from '../auth/session-request';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { assertCsrf } from '../common/csrf.middleware';
import { addFlash } from '../common/flash';
import type { FormBody } from '../common/form';
import {
  optionalChoice,
  optionalDate,
  optionalId,
  optionalText,
  optionalTextArea,
  parseRouteId,
  requiredId,
  requiredText,
} from '../common/form';
import type { UploadedFileLike } from '../attachments/attachments.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { MembersService } from '../members/members.service';
import { SectorsService } from '../sectors/sectors.service';
import { TasksCsvService } from '../tasks/tasks-csv.service';
import { TasksService } from '../tasks/tasks.service';
import {
  PageContextService,
  PODE_GERIR_SETORES,
  escopoDeSetor,
} from './page-context.service';

const CARGOS_MEMBRO = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
  'antiga_gestao',
  'membro',
] as const;
const STATUS_TAREFA = ['pendente', 'em_andamento', 'concluida'] as const;
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'] as const;
const FUNCOES = [
  'design',
  'desenvolvimento',
  'marketing',
  'gestao',
  'pesquisa',
  'outro',
] as const;

@Controller()
@UseGuards(AuthenticatedGuard)
export class PanelController {
  constructor(
    private readonly context: PageContextService,
    private readonly membersService: MembersService,
    private readonly sectorsService: SectorsService,
    private readonly tasksService: TasksService,
    private readonly tasksCsvService: TasksCsvService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  // ---------------------------------------------------------------- paineis

  // GET /menu foi removido junto com a tela: era um mostruario de cartoes com
  // os mesmos destinos da navbar (Painel, Solicitacoes, Pagina Inicial), numa
  // rota em que ninguem cai — o login vai direto para /painel e o unico
  // caminho ate ela era um item do menu da conta.

  /** Admin, diretor e antiga gestao veem o painel completo; membro ve o proprio. */
  @Get('painel')
  async painel(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const ctx = await this.context.base(req);
    const membro = req.membro;
    const vePainelCompleto =
      membro.is_admin ||
      membro.is_diretor ||
      membro.is_antiga_gestao ||
      membro.cargo === 'vice_presidente';

    if (!vePainelCompleto) {
      res.render('core/painel_membro', {
        ...ctx,
        ...(await this.dadosPainelMembro(membro)),
      });
      return;
    }

    res.render('core/painel_admin', {
      ...ctx,
      ...(await this.dadosPainelCompleto(membro)),
    });
  }

  private async dadosPainelMembro(membro: SessionMember) {
    const [colegas, tarefas] = await Promise.all([
      membro.setorId ? this.membersService.getBySector(membro.setorId) : [],
      this.tasksService.getByResponsavel(membro.id),
    ]);

    return {
      colegas_setor: colegas.filter((c: any) => c.id !== membro.id),
      tarefas_pendente: tarefas.filter((t: any) => t.status === 'pendente'),
      tarefas_em_andamento: tarefas.filter(
        (t: any) => t.status === 'em_andamento',
      ),
      tarefas_concluida: tarefas.filter((t: any) => t.status === 'concluida'),
      total_minhas: tarefas.length,
      /*
       * Calculado aqui e nao no template de proposito.
       *
       * A linha que fazia isso era
       *   {% set atrasadas = (tarefas_pendente + tarefas_em_andamento)|selectattr("atrasada") %}
       * e derrubava a pagina inteira: em Nunjucks o `+` entre dois arrays nao
       * concatena, faz coercao para string ("[object Object]..."), e o
       * `selectattr` seguinte estourava com "arr.filter is not a function".
       * Ou seja, o painel do membro comum respondia 500.
       */
      total_atrasadas: tarefas.filter((t: any) => t.atrasada).length,
    };
  }

  private async dadosPainelCompleto(membro: SessionMember) {
    const [todosMembros, todosSetores, todasTarefas] = await Promise.all([
      this.membersService.list(),
      this.sectorsService.list(),
      this.tasksService.list(),
    ]);

    /*
     * O DIRETOR VE O PROPRIO SETOR, E SO ELE.
     *
     * O corte acontece aqui, sobre as listas ja carregadas, e nao numa query
     * separada: o painel do diretor e o do presidente compartilham o mesmo
     * template e o mesmo caminho de dados, entao duas consultas diferentes
     * abririam espaco para as duas telas divergirem.
     *
     * O `where` no banco seria mais barato; na escala do clube a diferenca e
     * ruido, e a garantia de que as duas telas sao a mesma tela vale mais.
     */
    const escopo = escopoDeSetor(membro);
    const noEscopo = (setorId: number | null | undefined) =>
      escopo === null || (setorId ?? null) === escopo.setorId;

    const membros = escopo
      ? todosMembros.filter((m: any) => noEscopo(m.setorId))
      : todosMembros;
    const setores = escopo
      ? todosSetores.filter((s: any) => s.id === escopo.setorId)
      : todosSetores;
    const tarefas = escopo
      ? todasTarefas.filter((t: any) => noEscopo(t.setorId))
      : todasTarefas;

    const porStatus = (lista: any[], status: string) =>
      lista.filter((t) => t.status === status);
    const semSetor = tarefas.filter((t: any) => !t.setorId);

    const podeGerirSetores = PODE_GERIR_SETORES.includes(membro.cargo);
    const setoresGerenciaveis = podeGerirSetores
      ? setores.map((s: any) => s.id)
      : [];

    return {
      /*
       * O template usa isto para calar o que nao faz sentido num painel de um
       * setor so: a aba "Sem Setor" (que seria o balde de outra gente) e o
       * rotulo "todas as tarefas", que passaria uma ideia errada de alcance.
       */
      escopo_restrito: escopo !== null,
      escopo_setor: escopo ? (membro.setor ?? null) : null,
      // `membros` continua no contexto porque o <select> de responsavel da
      // barra de filtros precisa dele. O que saiu do painel foi a renderizacao
      // dos cartoes de membro, nao a consulta — ela agora vive no diretorio.
      membros,
      setores,
      tarefas,
      total_membros: membros.length,
      todas_tarefas_pendente: porStatus(tarefas, 'pendente'),
      todas_tarefas_em_andamento: porStatus(tarefas, 'em_andamento'),
      todas_tarefas_concluida: porStatus(tarefas, 'concluida'),
      tarefas_sem_setor_pendente: porStatus(semSetor, 'pendente'),
      tarefas_sem_setor_em_andamento: porStatus(semSetor, 'em_andamento'),
      tarefas_sem_setor_concluida: porStatus(semSetor, 'concluida'),
      tarefas_por_setor: this.agruparPorSetor(setores, tarefas),
      setores_gerenciaveis: setoresGerenciaveis,
      setor_ativo: membro.setor ?? null,
      // A linha de situacao mostra so o que esta fora do lugar.
      total_atrasadas: tarefas.filter((t: any) => t.atrasada).length,
      total_sem_prazo: tarefas.filter(
        (t: any) => t.prazo == null && t.status !== 'concluida',
      ).length,
    };
  }

  // ------------------------------------------------------- diretorio de membros

  /**
   * Diretorio de membros — tela propria, aberta em outra aba a partir do painel.
   *
   * Existe separada porque membros e tarefas disputavam a mesma tela: o
   * painel_admin renderizava a lista de pessoas tres vezes (aba "Todos", cada
   * aba de setor e "Sem Setor"), e o acordeao abria recolhido justamente para o
   * kanban nao sair da dobra.
   *
   * Membro comum ve apenas os colegas do proprio setor, espelhando o que o
   * painel_membro ja mostrava.
   */
  @Get('painel/membros')
  @Render('core/membros')
  async membros(
    @Req() req: AuthenticatedRequest,
    @Query('setor') setorFiltro?: string,
  ) {
    const membro = req.membro;

    const [ctx, todos, setoresTodos] = await Promise.all([
      this.context.base(req),
      this.membersService.listComResumo(),
      this.sectorsService.listSimple(),
    ]);

    /*
     * Um so criterio para as tres telas: painel, diretorio e detalhe de tarefa.
     *
     * Antes o diretor caia no ramo "ve tudo" junto com o presidente, e o
     * diretorio dele listava o clube inteiro. Agora e a mesma regra do painel
     * — quem dirige um setor consulta o setor que dirige.
     */
    const escopo = escopoDeSetor(membro);
    const visiveis = escopo
      ? todos.filter((m: any) => (m.setorId ?? null) === escopo.setorId)
      : todos;
    // O filtro de setor da barra so faz sentido com mais de um setor na lista.
    const setores = escopo
      ? setoresTodos.filter((s: any) => s.id === escopo.setorId)
      : setoresTodos;

    /*
     * ORDENA POR CARGA, DECRESCENTE — nao por data de entrada.
     *
     * Se a tela existe para achar sobrecarga, ela deve comecar pela sobrecarga.
     * O desempate e por atrasadas e depois pelo nome, para a ordem ser estavel
     * entre duas visitas: com `aberto` empatado, `sort` sem criterio final
     * deixaria a grade dancando a cada recarga.
     */
    const nomeDe = (m: any) =>
      (m.usuario?.get_full_name || m.usuario?.username || '').toLowerCase();

    visiveis.sort((a: any, b: any) => {
      const carga = (b.carga?.aberto ?? 0) - (a.carga?.aberto ?? 0);
      if (carga !== 0) return carga;
      const atraso = (b.carga?.atrasada ?? 0) - (a.carga?.atrasada ?? 0);
      if (atraso !== 0) return atraso;
      return nomeDe(a).localeCompare(nomeDe(b), 'pt-BR');
    });

    return {
      ...ctx,
      membros: visiveis,
      setores,
      membros_por_cargo: this.context.groupByCargo(visiveis),
      total_membros: visiveis.length,
      total_sem_setor: visiveis.filter((m: any) => !m.setorId).length,
      setor_filtro: setorFiltro ?? '',
      // Diz na tela que a lista nao e o clube inteiro. Vale para o diretor
      // (ve o proprio setor) e para o membro comum (ve os colegas).
      escopo_reduzido: escopo !== null,
      escopo_setor: escopo ? (membro.setor ?? null) : null,
    };
  }

  /**
   * Quem pode aparecer no <select> de responsavel.
   *
   * O setor da tarefa e o do responsavel, entao escolher alguem de outro setor
   * e criar tarefa de outro setor — coisa que o TasksService recusa. Oferecer o
   * clube inteiro na lista seria oferecer opcoes que terminam em 403: o
   * formulario mostra so o que da para salvar.
   */
  private noEscopoDoMembro(membro: SessionMember, membros: any[]) {
    const escopo = escopoDeSetor(membro);
    if (escopo === null) return membros;
    return membros.filter((m: any) => (m.setorId ?? null) === escopo.setorId);
  }

  /**
   * Recusa a tarefa que esta fora do setor de quem pede.
   *
   * Membro comum e caso a parte: ele nao dirige setor nenhum, mas e dono das
   * proprias tarefas, entao a dele passa mesmo estando em outro setor. E a
   * mesma logica que o `updateStatus` do TasksService ja aplica para deixa-lo
   * mover o proprio cartao.
   */
  private assertTarefaNoEscopo(membro: SessionMember, tarefa: any) {
    const escopo = escopoDeSetor(membro);
    if (escopo === null) return;
    if ((tarefa.setorId ?? null) === escopo.setorId) return;
    if (tarefa.responsavel?.id === membro.id) return;

    throw new ForbiddenException('Esta tarefa é de outro setor.');
  }

  /**
   * As abas de setor usam estas listas em vez de `setor.tarefas`.
   *
   * O SectorsService formata tarefa por conta propria e nao calcula `atrasada`
   * nem `prazo_proximo`, entao o mesmo cartao sairia diferente na aba "Todos" e
   * na aba do setor. Reaproveitar o que o TasksService ja formatou mantem as
   * duas iguais e evita a segunda consulta.
   */
  private agruparPorSetor(setores: any[], tarefas: any[]) {
    const vazio = () => ({
      pendente: [] as any[],
      em_andamento: [] as any[],
      concluida: [] as any[],
    });

    const grupos: Record<string, ReturnType<typeof vazio>> = {};
    for (const setor of setores) {
      grupos[String(setor.id)] = vazio();
    }

    for (const tarefa of tarefas) {
      if (tarefa.setorId == null) continue;
      const grupo = (grupos[String(tarefa.setorId)] ??= vazio());
      const lista = grupo[tarefa.status as keyof ReturnType<typeof vazio>];
      if (lista) {
        lista.push(tarefa);
      }
    }

    return grupos;
  }

  // ---------------------------------------------------------------- membros

  @Get('painel/adicionar-membro')
  @Render('core/adicionar_membro')
  async novoMembroForm(@Req() req: AuthenticatedRequest) {
    const [ctx, setores] = await Promise.all([
      this.context.base(req),
      this.sectorsService.listSimple(),
    ]);

    /* O diretor cria dentro do setor dele e apenas membros. A tela reflete
       isso — setor fixo, sem escolha de cargo — e o serviço confere de novo:
       o formulário é conveniência, a regra vive no servidor. */
    const escopo = escopoDeSetor(req.membro);
    return {
      ...ctx,
      setores: escopo === null
        ? setores
        : setores.filter((s: { id: number }) => s.id === escopo.setorId),
      restrito_ao_setor: escopo !== null,
    };
  }

  @Post('painel/adicionar-membro')
  @Redirect('/painel', 303)
  async novoMembro(@Req() req: AuthenticatedRequest, @Body() body: FormBody) {
    await this.membersService.createWithUser(
      {
        firstName: requiredText(body, 'first_name', 'Nome'),
        lastName: optionalText(body, 'last_name'),
        username: requiredText(body, 'username', 'Nome de usuário'),
        email: requiredText(body, 'email', 'E-mail'),
        senha: requiredText(body, 'senha', 'Senha'),
        cargo: optionalChoice(body, 'cargo', CARGOS_MEMBRO, 'Cargo'),
        setorId: optionalId(body, 'setorId', 'Setor') ?? null,
      },
      // O membro inteiro, não só o cargo: o serviço precisa do setor para
      // prender o diretor ao setor dele.
      req.membro,
    );

    await addFlash(req, 'success', 'Membro adicionado.');
    return { url: '/painel' };
  }

  @Get('painel/membro/:membro_id/editar')
  @Render('core/editar_membro')
  async editarMembroForm(
    @Req() req: AuthenticatedRequest,
    @Param('membro_id') membroId: string,
  ) {
    const [ctx, membroAlvo, setores] = await Promise.all([
      this.context.base(req),
      this.membersService.getById(parseRouteId(membroId, 'membro')),
      this.sectorsService.listSimple(),
    ]);
    return { ...ctx, membro_alvo: membroAlvo, setores };
  }

  @Post('painel/membro/:membro_id/editar')
  @Redirect('/painel', 303)
  async editarMembro(
    @Req() req: AuthenticatedRequest,
    @Param('membro_id') membroId: string,
    @Body() body: FormBody,
  ) {
    await this.membersService.updateWithUser(
      parseRouteId(membroId, 'membro'),
      {
        firstName: optionalText(body, 'first_name'),
        lastName: optionalTextArea(body, 'last_name'),
        username: optionalText(body, 'username'),
        cargo: optionalChoice(body, 'cargo', CARGOS_MEMBRO, 'Cargo'),
        setorId: optionalId(body, 'setorId', 'Setor'),
        bio: optionalTextArea(body, 'bio'),
      },
      req.membro.cargo,
    );

    await addFlash(req, 'success', 'Membro atualizado.');
    return { url: '/painel' };
  }

  @Get('painel/membro/:membro_id/excluir')
  @Render('core/excluir_membro')
  async excluirMembroForm(
    @Req() req: AuthenticatedRequest,
    @Param('membro_id') membroId: string,
  ) {
    const [ctx, membroAlvo] = await Promise.all([
      this.context.base(req),
      this.membersService.getById(parseRouteId(membroId, 'membro')),
    ]);
    return { ...ctx, membro_alvo: membroAlvo };
  }

  @Post('painel/membro/:membro_id/excluir')
  @Redirect('/painel', 303)
  async excluirMembro(
    @Req() req: AuthenticatedRequest,
    @Param('membro_id') membroId: string,
  ) {
    const id = parseRouteId(membroId, 'membro');
    if (id === req.membro.id) {
      await addFlash(req, 'error', 'Você não pode excluir o próprio perfil.');
      return { url: '/painel' };
    }

    await this.membersService.delete(id, req.membro.cargo);
    await addFlash(req, 'success', 'Membro removido.');
    return { url: '/painel' };
  }

  // ---------------------------------------------------------------- setores

  @Get('painel/criar-setor')
  @Render('core/criar_setor')
  async novoSetorForm(@Req() req: AuthenticatedRequest) {
    return this.context.base(req);
  }

  @Post('painel/criar-setor')
  @Redirect('/painel', 303)
  async novoSetor(@Req() req: AuthenticatedRequest, @Body() body: FormBody) {
    await this.sectorsService.create(
      {
        nome: requiredText(body, 'nome', 'Nome do Setor'),
        descricao: optionalTextArea(body, 'descricao'),
      },
      req.membro.cargo,
    );

    await addFlash(req, 'success', 'Setor criado.');
    return { url: '/painel' };
  }

  @Get('painel/setor/:setor_id/editar')
  @Render('core/editar_setor')
  async editarSetorForm(
    @Req() req: AuthenticatedRequest,
    @Param('setor_id') setorId: string,
  ) {
    const [ctx, setor] = await Promise.all([
      this.context.base(req),
      this.sectorsService.getById(parseRouteId(setorId, 'setor')),
    ]);
    return { ...ctx, setor };
  }

  @Post('painel/setor/:setor_id/editar')
  @Redirect('/painel', 303)
  async editarSetor(
    @Req() req: AuthenticatedRequest,
    @Param('setor_id') setorId: string,
    @Body() body: FormBody,
  ) {
    await this.sectorsService.update(
      parseRouteId(setorId, 'setor'),
      {
        nome: optionalText(body, 'nome'),
        descricao: optionalTextArea(body, 'descricao'),
      },
      req.membro.cargo,
    );

    await addFlash(req, 'success', 'Setor atualizado.');
    return { url: '/painel' };
  }

  @Get('painel/setor/:setor_id/excluir')
  @Render('core/excluir_setor')
  async excluirSetorForm(
    @Req() req: AuthenticatedRequest,
    @Param('setor_id') setorId: string,
  ) {
    const [ctx, setor] = await Promise.all([
      this.context.base(req),
      this.sectorsService.getById(parseRouteId(setorId, 'setor')),
    ]);
    return { ...ctx, setor };
  }

  @Post('painel/setor/:setor_id/excluir')
  @Redirect('/painel', 303)
  async excluirSetor(
    @Req() req: AuthenticatedRequest,
    @Param('setor_id') setorId: string,
  ) {
    await this.sectorsService.delete(
      parseRouteId(setorId, 'setor'),
      req.membro.cargo,
    );
    await addFlash(req, 'success', 'Setor removido.');
    return { url: '/painel' };
  }

  // ---------------------------------------------------------------- tarefas

  /**
   * Detalhe da tarefa — a pagina por tras do pop-up.
   *
   * `?parcial=1` devolve so o miolo, que e o que o pop-up injeta. Sem o
   * parametro devolve a pagina inteira, que e o que o navegador recebe quando
   * o link e colado na barra de enderecos ou quando o JavaScript esta
   * desligado. O partial e o mesmo nos dois casos, entao o `date_utc` do prazo
   * continua sendo aplicado pelo Nunjucks em vez de reimplementado no JS.
   */
  @Get('painel/tarefa/:tarefa_id')
  async verTarefa(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('tarefa_id') tarefaId: string,
    @Query('parcial') parcial?: string,
  ) {
    const id = parseRouteId(tarefaId, 'tarefa');
    const [ctx, tarefa, anexos] = await Promise.all([
      this.context.base(req),
      this.tasksService.getById(id),
      this.attachmentsService.listByTask(id),
    ]);

    // Esconder o cartao no quadro nao e proteger a tarefa: estas URLs sao
    // adivinhaveis, e sem esta linha o diretor leria qualquer tarefa do clube
    // trocando o numero na barra de enderecos.
    this.assertTarefaNoEscopo(req.membro, tarefa);

    const dados = {
      ...ctx,
      tarefa,
      anexos,
      // A aba de anexos mostra o campo de arquivo so quando ha Cloudinary; sem
      // credencial o upload esta desligado e apenas links funcionam.
      upload_habilitado: this.attachmentsService.isUploadEnabled,
    };

    if (parcial === '1') {
      res.render('partials/detalhe_tarefa', dados);
      return;
    }
    res.render('core/tarefa', dados);
  }

  @Get('painel/criar-tarefa')
  async novaTarefaForm(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Query('parcial') parcial?: string,
    @Query('status') status?: string,
  ) {
    const [ctx, todosMembros, setores] = await Promise.all([
      this.context.base(req),
      this.membersService.list(),
      this.sectorsService.listSimple(),
    ]);
    const membros = this.noEscopoDoMembro(req.membro, todosMembros);

    // O `+` de cada coluna do kanban manda o status daquela coluna, para a
    // tarefa nascer onde o usuario clicou.
    const statusInicial = STATUS_TAREFA.includes(status as any)
      ? status
      : 'pendente';

    const dados = { ...ctx, membros, setores, status_inicial: statusInicial };

    if (parcial === '1') {
      res.render('partials/form_tarefa', dados);
      return;
    }
    res.render('core/criar_tarefa', dados);
  }

  @Post('painel/criar-tarefa')
  @Redirect('/painel', 303)
  async novaTarefa(@Req() req: AuthenticatedRequest, @Body() body: FormBody) {
    await this.tasksService.create(
      {
        titulo: requiredText(body, 'titulo', 'Título'),
        descricao: optionalTextArea(body, 'descricao'),
        responsavelId: requiredId(body, 'responsavelId', 'Responsável'),
        criadoPorId: req.membro.id,
        // Sem `setorId`: o setor da tarefa e o do responsavel, resolvido pelo
        // TasksService. O formulario nem manda mais o campo.
        prazo: optionalDate(body, 'prazo', 'Prazo') ?? undefined,
        prioridade: optionalChoice(
          body,
          'prioridade',
          PRIORIDADES,
          'Prioridade',
        ),
        funcao: optionalChoice(body, 'funcao', FUNCOES, 'Função'),
        projeto: optionalText(body, 'projeto'),
      },
      req.membro,
    );

    await addFlash(req, 'success', 'Tarefa criada.');
    return { url: '/painel' };
  }

  @Get('painel/tarefa/:tarefa_id/editar')
  async editarTarefaForm(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('tarefa_id') tarefaId: string,
    @Query('parcial') parcial?: string,
  ) {
    const [ctx, tarefa, membros, setores] = await Promise.all([
      this.context.base(req),
      this.tasksService.getById(parseRouteId(tarefaId, 'tarefa')),
      this.membersService.list(),
      this.sectorsService.listSimple(),
    ]);

    this.assertTarefaNoEscopo(req.membro, tarefa);

    const dados = {
      ...ctx,
      tarefa,
      membros: this.noEscopoDoMembro(req.membro, membros),
      setores,
    };

    if (parcial === '1') {
      res.render('partials/form_tarefa', dados);
      return;
    }
    res.render('core/editar_tarefa', dados);
  }

  @Post('painel/tarefa/:tarefa_id/editar')
  @Redirect('/painel', 303)
  async editarTarefa(
    @Req() req: AuthenticatedRequest,
    @Param('tarefa_id') tarefaId: string,
    @Body() body: FormBody,
  ) {
    await this.tasksService.update(
      parseRouteId(tarefaId, 'tarefa'),
      {
        titulo: optionalText(body, 'titulo'),
        descricao: optionalTextArea(body, 'descricao'),
        responsavelId:
          optionalId(body, 'responsavelId', 'Responsável') ?? undefined,
        // Idem: reatribuir move o setor junto, e quem faz isso e o service.
        prazo: optionalDate(body, 'prazo', 'Prazo'),
        prioridade: optionalChoice(
          body,
          'prioridade',
          PRIORIDADES,
          'Prioridade',
        ),
        funcao: optionalChoice(body, 'funcao', FUNCOES, 'Função'),
        projeto: optionalTextArea(body, 'projeto'),
        status: optionalChoice(body, 'status', STATUS_TAREFA, 'Status'),
      },
      req.membro,
    );

    await addFlash(req, 'success', 'Tarefa atualizada.');
    return { url: '/painel' };
  }

  /** Usado pelo `<select>` de status direto no kanban. */
  @Post('painel/tarefa/:tarefa_id/atualizar')
  @Redirect('/painel', 303)
  async atualizarStatusTarefa(
    @Req() req: AuthenticatedRequest,
    @Param('tarefa_id') tarefaId: string,
    @Body() body: FormBody,
  ) {
    const status = optionalChoice(body, 'status', STATUS_TAREFA, 'Status');
    if (!status) {
      await addFlash(req, 'error', 'Selecione um status válido.');
      return { url: '/painel' };
    }

    await this.tasksService.updateStatus(
      parseRouteId(tarefaId, 'tarefa'),
      status,
      req.membro,
    );
    return { url: '/painel' };
  }

  @Get('painel/tarefa/:tarefa_id/excluir')
  @Render('core/excluir_tarefa')
  async excluirTarefaForm(
    @Req() req: AuthenticatedRequest,
    @Param('tarefa_id') tarefaId: string,
  ) {
    const [ctx, tarefa] = await Promise.all([
      this.context.base(req),
      this.tasksService.getById(parseRouteId(tarefaId, 'tarefa')),
    ]);
    this.assertTarefaNoEscopo(req.membro, tarefa);
    return { ...ctx, tarefa };
  }

  @Post('painel/tarefa/:tarefa_id/excluir')
  @Redirect('/painel', 303)
  async excluirTarefa(
    @Req() req: AuthenticatedRequest,
    @Param('tarefa_id') tarefaId: string,
  ) {
    await this.tasksService.delete(
      parseRouteId(tarefaId, 'tarefa'),
      req.membro,
    );
    await addFlash(req, 'success', 'Tarefa removida.');
    return { url: '/painel' };
  }

  // ------------------------------------------------------------ tarefas CSV

  /**
   * O arquivo baixado tem as mesmas colunas que a importacao le, entao pode ser
   * editado na planilha e devolvido. A coluna `id` e o que faz o reenvio
   * atualizar em vez de duplicar.
   */
  @Get('painel/tarefas/exportar.csv')
  async exportarTarefas(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const csv = await this.tasksCsvService.exportar(req.membro.cargo);
    const data = new Date().toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tarefas-${data}.csv"`,
    );
    res.send(csv);
  }

  /** Planilha de exemplo para quem ainda nao tem nenhuma tarefa para exportar. */
  @Get('painel/tarefas/modelo.csv')
  modeloTarefas(@Req() req: AuthenticatedRequest, @Res() res: Response) {
    const csv = this.tasksCsvService.modelo(req.membro.cargo);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="modelo-tarefas.csv"',
    );
    res.send(csv);
  }

  @Post('painel/tarefas/importar')
  // 2 MB cobre com folga alguns milhares de tarefas e evita upload abusivo.
  @UseInterceptors(
    FileInterceptor('arquivo', { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  @Redirect('/painel', 303)
  async importarTarefas(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() arquivo?: UploadedFileLike,
  ) {
    // Corpo multipart so existe depois do interceptor, igual aos anexos.
    assertCsrf(req);

    if (!arquivo?.buffer?.length) {
      await addFlash(req, 'error', 'Escolha um arquivo CSV para importar.');
      return { url: '/painel' };
    }

    const resultado = await this.tasksCsvService.importar(
      arquivo.buffer.toString('utf8'),
      req.membro,
    );

    const partes: string[] = [];
    if (resultado.criadas) {
      partes.push(`${resultado.criadas} criada(s)`);
    }
    if (resultado.atualizadas) {
      partes.push(`${resultado.atualizadas} atualizada(s)`);
    }
    await addFlash(
      req,
      'success',
      `Importação concluída: ${partes.join(', ')}.`,
    );

    // As linhas recusadas viram um aviso separado para o usuario saber o que
    // corrigir na planilha em vez de descobrir pela contagem que faltou algo.
    if (resultado.erros.length) {
      const detalhe = resultado.erros
        .slice(0, 5)
        .map((erro) => `linha ${erro.linha}: ${erro.motivo}`)
        .join(' | ');
      const resto =
        resultado.erros.length > 5
          ? ` e mais ${resultado.erros.length - 5}`
          : '';
      await addFlash(
        req,
        'error',
        `${resultado.erros.length} linha(s) ignorada(s) — ${detalhe}${resto}.`,
      );
    }

    return { url: '/painel' };
  }

  @Post('painel/tarefas/limpar')
  @Redirect('/painel', 303)
  async limparTarefas(
    @Req() req: AuthenticatedRequest,
    @Body() body: FormBody,
  ) {
    // Palavra digitada na confirmacao: evita que um clique errado apague tudo.
    if (optionalText(body, 'confirmacao') !== 'LIMPAR') {
      await addFlash(
        req,
        'error',
        'Digite LIMPAR para confirmar a exclusão de todas as tarefas.',
      );
      return { url: '/painel' };
    }

    const total = await this.tasksCsvService.limparTudo(req.membro.cargo);
    await addFlash(req, 'success', `${total} tarefa(s) removida(s).`);
    return { url: '/painel' };
  }

  // ----------------------------------------------------------------- anexos

  @Get('painel/tarefa/:tarefa_id/anexos')
  @Render('core/gerenciar_anexos')
  async anexosForm(
    @Req() req: AuthenticatedRequest,
    @Param('tarefa_id') tarefaId: string,
  ) {
    const id = parseRouteId(tarefaId, 'tarefa');
    const [ctx, tarefa, anexos] = await Promise.all([
      this.context.base(req),
      this.tasksService.getById(id),
      this.attachmentsService.listByTask(id),
    ]);

    // Esconder o cartao no quadro nao e proteger a tarefa: estas URLs sao
    // adivinhaveis, e sem esta linha o diretor leria qualquer tarefa do clube
    // trocando o numero na barra de enderecos.
    this.assertTarefaNoEscopo(req.membro, tarefa);
    return {
      ...ctx,
      tarefa,
      anexos,
      upload_habilitado: this.attachmentsService.isUploadEnabled,
    };
  }

  /**
   * Anexar arquivo ou link.
   *
   * `?parcial=1` devolve a lista de anexos ja renderizada, que e o que a aba do
   * pop-up injeta no lugar da antiga — sem recarregar e sem remontar o trecho
   * no JavaScript. Sem o parametro, redireciona como sempre, que e o caminho
   * do formulario comum e o de quem esta sem JavaScript.
   */
  @Post('painel/tarefa/:tarefa_id/anexos')
  @UseInterceptors(FileInterceptor('arquivo'))
  async criarAnexo(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('tarefa_id') tarefaId: string,
    @Body() body: FormBody,
    @Query('parcial') parcial?: string,
    @UploadedFile() arquivo?: UploadedFileLike,
  ) {
    // O corpo multipart so existe apos o FileInterceptor, por isso a checagem
    // de CSRF acontece aqui e nao no middleware.
    assertCsrf(req);

    const id = parseRouteId(tarefaId, 'tarefa');
    const destino = `/painel/tarefa/${id}/anexos`;
    const acao = optionalText(body, 'action');

    if (acao === 'add_link') {
      await this.attachmentsService.addLink(
        id,
        requiredText(body, 'nome', 'Nome'),
        requiredText(body, 'url', 'URL'),
        req.membro.id,
      );
    } else {
      await this.attachmentsService.addFile(
        id,
        requiredText(body, 'nome', 'Nome do arquivo'),
        arquivo,
        req.membro.id,
      );
    }

    if (parcial === '1') {
      const anexos = await this.attachmentsService.listByTask(id);
      res.render('partials/lista_anexos', { anexos });
      return;
    }

    await addFlash(
      req,
      'success',
      acao === 'add_link' ? 'Link adicionado.' : 'Arquivo enviado.',
    );
    res.redirect(303, destino);
  }

  @Get('painel/anexo/:anexo_id/editar')
  @Render('core/editar_anexo')
  async editarAnexoForm(
    @Req() req: AuthenticatedRequest,
    @Param('anexo_id') anexoId: string,
  ) {
    const [ctx, anexo] = await Promise.all([
      this.context.base(req),
      this.attachmentsService.getById(parseRouteId(anexoId, 'anexo')),
    ]);
    return { ...ctx, anexo, tarefa: anexo.tarefa };
  }

  @Post('painel/anexo/:anexo_id/editar')
  @UseInterceptors(FileInterceptor('arquivo'))
  @Redirect('/painel', 303)
  async editarAnexo(
    @Req() req: AuthenticatedRequest,
    @Param('anexo_id') anexoId: string,
    @Body() body: FormBody,
  ) {
    assertCsrf(req);

    const anexo = await this.attachmentsService.update(
      parseRouteId(anexoId, 'anexo'),
      {
        nome: optionalText(body, 'nome'),
        url: optionalText(body, 'url'),
      },
    );

    await addFlash(req, 'success', 'Anexo atualizado.');
    return { url: `/painel/tarefa/${anexo.tarefaId}/anexos` };
  }

  @Get('painel/anexo/:anexo_id/excluir')
  @Render('core/excluir_anexo')
  async excluirAnexoForm(
    @Req() req: AuthenticatedRequest,
    @Param('anexo_id') anexoId: string,
  ) {
    const [ctx, anexo] = await Promise.all([
      this.context.base(req),
      this.attachmentsService.getById(parseRouteId(anexoId, 'anexo')),
    ]);
    return { ...ctx, anexo, tarefa: anexo.tarefa };
  }

  @Post('painel/anexo/:anexo_id/excluir')
  @Redirect('/painel', 303)
  async excluirAnexo(
    @Req() req: AuthenticatedRequest,
    @Param('anexo_id') anexoId: string,
  ) {
    const { tarefaId } = await this.attachmentsService.delete(
      parseRouteId(anexoId, 'anexo'),
    );
    await addFlash(req, 'success', 'Anexo removido.');
    return { url: `/painel/tarefa/${tarefaId}/anexos` };
  }
}
