import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Redirect,
  Render,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { SessionRequest } from '../auth/session-request';
import { addFlash, guardarFormulario } from '../common/flash';
import type { FormBody } from '../common/form';
import { optionalChoice, optionalId, requiredText } from '../common/form';
import { SectorsService } from '../sectors/sectors.service';
import { SignupRequestsService } from '../signup-requests/signup-requests.service';
import { PageContextService } from './page-context.service';

@Controller()
export class PublicPagesController {
  constructor(
    private readonly context: PageContextService,
    private readonly sectorsService: SectorsService,
    private readonly signupRequestsService: SignupRequestsService,
  ) {}

  @Get()
  @Render('core/home')
  async home(@Req() req: SessionRequest) {
    return this.context.base(req);
  }

  /**
   * Comunidade, clubes temáticos e PROSEL.
   *
   * Não precisa de nada além do contexto base: a página é estática e os
   * destinos externos já chegam nele como `links`.
   */
  @Get('seja-membro')
  @Render('core/seja_membro')
  async sejaMembro(@Req() req: SessionRequest) {
    return this.context.base(req);
  }

  /** Página do maior evento do clube. Estática: só o contexto base. */
  @Get('semcomp')
  @Render('core/semcomp')
  async semcomp(@Req() req: SessionRequest) {
    return this.context.base(req);
  }

  @Get('accounts/login')
  async login(
    @Req() req: SessionRequest,
    @Res() res: Response,
    @Query('next') next?: string,
  ) {
    if (req.session?.userId) {
      res.redirect(302, '/painel');
      return;
    }

    const ctx = await this.context.base(req);
    res.render('registration/login', {
      ...ctx,
      next: next && next.startsWith('/') && !next.startsWith('//') ? next : '',
    });
  }

  @Get('solicitar-cadastro')
  @Render('core/solicitar_cadastro')
  async solicitarCadastro(@Req() req: SessionRequest) {
    const [ctx, setores] = await Promise.all([
      this.context.base(req),
      this.sectorsService.listSimple(),
    ]);
    return { ...ctx, setores };
  }

  @Post('solicitar-cadastro')
  @Redirect('/solicitar-cadastro', 303)
  async enviarSolicitacao(@Req() req: SessionRequest, @Body() body: FormBody) {
    const senha = requiredText(body, 'senha', 'Senha');
    const confirmacao = requiredText(
      body,
      'confirmar_senha',
      'Confirmar senha',
    );

    // Estes dois casos nao lancam excecao, entao o WebExceptionFilter nao passa
    // por aqui — sem guardar na mao o usuario perderia o formulario inteiro por
    // causa de um erro de digitacao na senha.
    if (senha !== confirmacao) {
      await addFlash(req, 'error', 'As senhas não conferem.');
      await guardarFormulario(req, '/solicitar-cadastro');
      return { url: '/solicitar-cadastro' };
    }
    if (senha.length < 8) {
      await addFlash(req, 'error', 'A senha deve ter ao menos 8 caracteres.');
      await guardarFormulario(req, '/solicitar-cadastro');
      return { url: '/solicitar-cadastro' };
    }

    await this.signupRequestsService.create({
      username: requiredText(body, 'username', 'Nome de usuário'),
      firstName: requiredText(body, 'first_name', 'Nome'),
      lastName: (body.last_name as string | undefined)?.trim() || undefined,
      email: requiredText(body, 'email', 'E-mail'),
      setorId: optionalId(body, 'setorId', 'Setor') ?? null,
      cargo: optionalChoice(
        body,
        'cargo',
        ['membro', 'diretor'] as const,
        'Cargo',
      ),
      senha,
    });

    await addFlash(
      req,
      'success',
      'Solicitacao enviada! A diretoria vai analisar e responder em breve.',
    );
    return { url: '/accounts/login' };
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robots(@Req() req: SessionRequest) {
    const host = req.get('host');
    const base = host ? `${req.protocol}://${host}` : '';
    return [
      'User-agent: *',
      'Disallow: /painel/',
      'Disallow: /accounts/',
      'Disallow: /api/',
      'Allow: /',
      base ? `Sitemap: ${base}/sitemap.xml` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  sitemap(@Req() req: SessionRequest) {
    const host = req.get('host');
    const base = host ? `${req.protocol}://${host}` : '';
    const paths = ['/', '/seja-membro', '/semcomp', '/solicitar-cadastro'];
    const urls = paths
      .map((path) => `  <url><loc>${base}${path}</loc></url>`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  }
}
