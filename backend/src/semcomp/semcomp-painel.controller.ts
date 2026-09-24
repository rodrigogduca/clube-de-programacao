import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Redirect,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Cargo } from '@prisma/client';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session-request';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { addFlash } from '../common/flash';
import type { FormBody } from '../common/form';
import { optionalText, parseRouteId, requiredText } from '../common/form';
import { PageContextService } from '../pages/page-context.service';
import { Even3Service } from './even3.service';
import { deCampos, paraCampos } from './horario';
import { SemcompService } from './semcomp.service';

/**
 * O PAINEL DA SEMCOMP, dentro do painel do clube.
 *
 * DUAS ALTURAS DE PERMISSÃO. Qualquer membro logado vê as listas e marca
 * presença, porque o credenciamento é feito por quem estiver na porta da
 * sala, voluntário ou não. Mexer na programação (criar, editar, apagar,
 * mudar vagas) e falar com o Even3 é da diretoria.
 */
const DIRETORIA: Cargo[] = [
  'presidente',
  'vice_presidente',
  'administrador',
  'diretor',
];

@Controller('painel/semcomp')
@UseGuards(AuthenticatedGuard)
export class SemcompPainelController {
  constructor(
    private readonly context: PageContextService,
    private readonly semcomp: SemcompService,
    private readonly even3: Even3Service,
  ) {}

  private exigirDiretoria(req: AuthenticatedRequest) {
    if (!DIRETORIA.includes(req.membro.cargo)) {
      throw new ForbiddenException(
        'Mudar a programação e falar com o Even3 é da diretoria.',
      );
    }
  }

  private dadosAtividade(body: FormBody) {
    const inicio = deCampos(
      requiredText(body, 'dia', 'Dia'),
      requiredText(body, 'hora_inicio', 'Começo'),
    );
    const fim = deCampos(
      requiredText(body, 'dia', 'Dia'),
      requiredText(body, 'hora_fim', 'Fim'),
    );
    if (!inicio || !fim) {
      throw new BadRequestException('Dia ou horário inválido.');
    }
    const numero = (campo: string, rotulo: string) => {
      const texto = optionalText(body, campo);
      if (texto === undefined) return null;
      const n = Number(texto);
      if (!Number.isInteger(n) || n < 0) {
        throw new BadRequestException(
          `"${rotulo}" tem de ser um número inteiro.`,
        );
      }
      return n;
    };
    return {
      tipo: requiredText(body, 'tipo', 'Tipo'),
      titulo: requiredText(body, 'titulo', 'Título'),
      quem: optionalText(body, 'quem') ?? null,
      local: optionalText(body, 'local') ?? null,
      inicio,
      fim,
      vagas: numero('vagas', 'Vagas'),
      aberta: body.aberta === 'sim',
      even3SessionId:
        numero('even3_session_id', 'Id da sessão no Even3') || null,
    };
  }

  @Get()
  @Render('core/semcomp_painel')
  async inicio(@Req() req: AuthenticatedRequest) {
    const [ctx, resumo] = await Promise.all([
      this.context.base(req),
      this.semcomp.resumo(),
    ]);
    let entradas: Array<{
      titulo: string;
      idTicketPrice: number;
      preco: number;
    }> = [];
    const even3Erro = this.even3.ativo
      ? await this.even3.conferirEvento()
      : null;
    if (this.even3.ativo && !even3Erro) {
      entradas = await this.even3.listarEntradas().catch(() => []);
    }
    return {
      ...ctx,
      resumo,
      even3_ativo: this.even3.ativo,
      even3_pode_criar: this.even3.podeCriarParticipante,
      even3_entradas: entradas,
      even3_erro: even3Erro,
      pode_editar: DIRETORIA.includes(req.membro.cargo),
    };
  }

  @Get('inscritos')
  @Render('core/semcomp_inscritos')
  async inscritos(@Req() req: AuthenticatedRequest) {
    const [ctx, inscritos] = await Promise.all([
      this.context.base(req),
      this.semcomp.inscritos(),
    ]);
    return { ...ctx, inscritos };
  }

  @Get('inscritos.csv')
  async csvInscritos(@Res() res: Response) {
    const csv = await this.semcomp.csvInscritos();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="semcomp-inscritos-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }

  @Get('atividade/nova')
  @Render('core/semcomp_atividade_form')
  async novaForm(@Req() req: AuthenticatedRequest) {
    this.exigirDiretoria(req);
    const ctx = await this.context.base(req);
    return {
      ...ctx,
      atividade: null,
      campos: { dia: '2026-09-29', hora: '09:00' },
      campos_fim: { hora: '09:50' },
    };
  }

  @Post('atividade/nova')
  @Redirect('/painel/semcomp', 303)
  async criar(@Req() req: AuthenticatedRequest, @Body() body: FormBody) {
    this.exigirDiretoria(req);
    await this.semcomp.salvarAtividade(null, this.dadosAtividade(body));
    await addFlash(req, 'success', 'Atividade criada.');
    return { url: '/painel/semcomp' };
  }

  @Get('atividade/:id')
  @Render('core/semcomp_atividade')
  async ver(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const [ctx, atividade] = await Promise.all([
      this.context.base(req),
      this.semcomp.atividadeComInscritos(parseRouteId(id, 'atividade')),
    ]);
    return {
      ...ctx,
      atividade,
      presentes: atividade.escolhas.filter((e) => e.presente).length,
      pode_editar: DIRETORIA.includes(req.membro.cargo),
    };
  }

  @Get('atividade/:id/lista.csv')
  async csvAtividade(@Param('id') id: string, @Res() res: Response) {
    const { nome, csv } = await this.semcomp.csvAtividade(
      parseRouteId(id, 'atividade'),
    );
    const arquivo = nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .slice(0, 50)
      .toLowerCase();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="semcomp-${arquivo}.csv"`,
    );
    res.send(csv);
  }

  @Get('atividade/:id/editar')
  @Render('core/semcomp_atividade_form')
  async editarForm(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    this.exigirDiretoria(req);
    const [ctx, atividade] = await Promise.all([
      this.context.base(req),
      this.semcomp.atividade(parseRouteId(id, 'atividade')),
    ]);
    return {
      ...ctx,
      atividade,
      campos: paraCampos(atividade.inicio),
      campos_fim: paraCampos(atividade.fim),
    };
  }

  @Post('atividade/:id/editar')
  @Redirect('/painel/semcomp', 303)
  async editar(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: FormBody,
  ) {
    this.exigirDiretoria(req);
    await this.semcomp.salvarAtividade(
      parseRouteId(id, 'atividade'),
      this.dadosAtividade(body),
    );
    await addFlash(req, 'success', 'Atividade salva.');
    return { url: '/painel/semcomp' };
  }

  @Post('atividade/:id/excluir')
  @Redirect('/painel/semcomp', 303)
  async excluir(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    this.exigirDiretoria(req);
    await this.semcomp.excluirAtividade(parseRouteId(id, 'atividade'));
    await addFlash(
      req,
      'success',
      'Atividade apagada, junto com as escolhas dela.',
    );
    return { url: '/painel/semcomp' };
  }

  @Post('presenca/:escolhaId')
  @Redirect('/painel/semcomp', 303)
  async presenca(
    @Req() req: AuthenticatedRequest,
    @Param('escolhaId') escolhaId: string,
    @Body() body: FormBody,
  ) {
    const escolha = await this.semcomp.marcarPresenca(
      parseRouteId(escolhaId, 'presença'),
      body.presente === 'sim',
    );
    return {
      url: `/painel/semcomp/atividade/${escolha.atividadeId}#p${escolha.id}`,
    };
  }

  @Post('even3/enviar-inscricoes')
  @Redirect('/painel/semcomp', 303)
  async enviarInscricoes(@Req() req: AuthenticatedRequest) {
    this.exigirDiretoria(req);
    const r = await this.semcomp.enviarPendentesAoEven3();
    await addFlash(
      req,
      r.restantes ? 'warning' : 'success',
      `${r.processados} inscrição(ões) processada(s). ${r.vinculados} vinculada(s) ao Even3${r.restantes ? `, ${r.restantes} ainda sem vínculo (veja o motivo na lista de inscritos)` : ''}.`,
    );
    return { url: '/painel/semcomp' };
  }

  @Post('even3/vincular-sessoes')
  @Redirect('/painel/semcomp', 303)
  async vincularSessoes(@Req() req: AuthenticatedRequest) {
    this.exigirDiretoria(req);
    const r = await this.semcomp.vincularSessoesEven3();
    await addFlash(
      req,
      r.semPar ? 'warning' : 'success',
      `${r.ligadas} atividade(s) ligada(s) a uma sessão do Even3 (de ${r.sessoes} lá).${r.semPar ? ` ${r.semPar} sem par: confira dia, hora e título no Even3, ou ponha o id à mão na atividade.` : ''}`,
    );
    return { url: '/painel/semcomp' };
  }

  @Post('even3/enviar-presencas')
  @Redirect('/painel/semcomp', 303)
  async enviarPresencas(@Req() req: AuthenticatedRequest) {
    this.exigirDiretoria(req);
    const r = await this.semcomp.enviarPresencasAoEven3();
    const faltas = [
      r.semParticipante
        ? `${r.semParticipante} de quem ainda não está no Even3`
        : '',
      r.semSessao ? `${r.semSessao} de atividade sem sessão no Even3` : '',
    ].filter(Boolean);
    await addFlash(
      req,
      faltas.length ? 'warning' : 'success',
      `${r.enviadas} presença(s) enviada(s) ao Even3.${faltas.length ? ` Ficaram: ${faltas.join('; ')}.` : ''}`,
    );
    return { url: '/painel/semcomp' };
  }
}
