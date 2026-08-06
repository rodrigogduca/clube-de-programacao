import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Render,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SolicitacaoStatus } from '@prisma/client';
import type { AuthenticatedRequest } from '../auth/session-request';
import { AuthenticatedGuard } from '../common/authenticated.guard';
import { addFlash } from '../common/flash';
import type { FormBody } from '../common/form';
import {
  optionalChoice,
  optionalId,
  optionalText,
  parseRouteId,
} from '../common/form';
import { SectorsService } from '../sectors/sectors.service';
import { SignupRequestsService } from '../signup-requests/signup-requests.service';
import { PageContextService } from './page-context.service';

const STATUS_VALIDOS: SolicitacaoStatus[] = [
  'pendente',
  'aprovada',
  'rejeitada',
];

@Controller('painel/solicitacoes')
@UseGuards(AuthenticatedGuard)
export class SignupPagesController {
  constructor(
    private readonly context: PageContextService,
    private readonly signupRequestsService: SignupRequestsService,
    private readonly sectorsService: SectorsService,
  ) {}

  @Get()
  @Render('core/solicitacoes')
  async lista(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    const filtro: SolicitacaoStatus = STATUS_VALIDOS.includes(
      status as SolicitacaoStatus,
    )
      ? (status as SolicitacaoStatus)
      : 'pendente';

    const [ctx, solicitacoes] = await Promise.all([
      this.context.base(req),
      this.signupRequestsService.listByStatus(filtro, req.membro),
    ]);

    return { ...ctx, solicitacoes, filtro_atual: filtro };
  }

  @Get(':solicitacao_id/editar')
  @Render('core/editar_solicitacao')
  async editarForm(
    @Req() req: AuthenticatedRequest,
    @Param('solicitacao_id') solicitacaoId: string,
  ) {
    const [ctx, solicitacao, setores] = await Promise.all([
      this.context.base(req),
      this.signupRequestsService.getById(
        parseRouteId(solicitacaoId, 'solicitacao'),
        req.membro,
      ),
      this.sectorsService.listSimple(),
    ]);
    return { ...ctx, solicitacao, setores };
  }

  @Post(':solicitacao_id/editar')
  @Redirect('/painel/solicitacoes', 303)
  async editar(
    @Req() req: AuthenticatedRequest,
    @Param('solicitacao_id') solicitacaoId: string,
    @Body() body: FormBody,
  ) {
    await this.signupRequestsService.update(
      parseRouteId(solicitacaoId, 'solicitacao'),
      {
        username: optionalText(body, 'username'),
        firstName: optionalText(body, 'firstName'),
        lastName: optionalText(body, 'lastName') ?? '',
        email: optionalText(body, 'email'),
        setorId: optionalId(body, 'setorId', 'Setor'),
        cargo: optionalChoice(
          body,
          'cargo',
          ['membro', 'diretor'] as const,
          'Cargo',
        ),
      },
      req.membro,
    );

    await addFlash(req, 'success', 'Solicitação atualizada.');
    return { url: '/painel/solicitacoes' };
  }

  @Post(':solicitacao_id/aprovar')
  @Redirect('/painel/solicitacoes', 303)
  async aprovar(
    @Req() req: AuthenticatedRequest,
    @Param('solicitacao_id') solicitacaoId: string,
  ) {
    await this.signupRequestsService.approve(
      parseRouteId(solicitacaoId, 'solicitacao'),
      req.session.userId!,
      req.membro,
    );
    await addFlash(req, 'success', 'Solicitação aprovada. Membro criado.');
    return { url: '/painel/solicitacoes' };
  }

  @Post(':solicitacao_id/rejeitar')
  @Redirect('/painel/solicitacoes', 303)
  async rejeitar(
    @Req() req: AuthenticatedRequest,
    @Param('solicitacao_id') solicitacaoId: string,
  ) {
    await this.signupRequestsService.reject(
      parseRouteId(solicitacaoId, 'solicitacao'),
      req.session.userId!,
      req.membro,
    );
    await addFlash(req, 'success', 'Solicitação rejeitada.');
    return { url: '/painel/solicitacoes?status=rejeitada' };
  }

  @Post(':solicitacao_id/excluir')
  @Redirect('/painel/solicitacoes', 303)
  async excluir(
    @Req() req: AuthenticatedRequest,
    @Param('solicitacao_id') solicitacaoId: string,
  ) {
    await this.signupRequestsService.delete(
      parseRouteId(solicitacaoId, 'solicitacao'),
      req.membro,
    );
    await addFlash(req, 'success', 'Solicitação removida do histórico.');
    return { url: '/painel/solicitacoes' };
  }
}
