import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Redirect,
  Render,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { SessionRequest } from '../auth/session-request';
import { addFlash } from '../common/flash';
import type { FormBody } from '../common/form';
import { optionalText, requiredText } from '../common/form';
import { PageContextService } from '../pages/page-context.service';
import { EmailService } from './email.service';
import { INSTITUICOES, SemcompService } from './semcomp.service';

/**
 * A INSCRIÇÃO NA SEMCOMP PELO SITE.
 *
 *   GET  /semcomp/inscricao                 formulário
 *   POST /semcomp/inscricao                 cria (e manda ao Even3)
 *   GET  /semcomp/inscricao/gerenciar/:tk   a inscrição de quem tem o link
 *   POST /semcomp/inscricao/gerenciar/:tk   troca as atividades
 *   POST /semcomp/inscricao/link            manda um link novo por e-mail
 *
 * SEM CONTA E SEM SENHA. Quem se inscreve recebe um link próprio, e o link é
 * a chave: o banco guarda só o hash dele. A página de gerenciamento é também
 * a de confirmação — logo depois de se inscrever a pessoa cai nela, com o
 * endereço já na barra do navegador, o que resolve o caso em que o e-mail
 * não chega.
 */
/**
 * O banco está fora do ar (projeto pausado, DNS sumido, conexão recusada) ou
 * ainda sem as tabelas da SEMCOMP (`prisma db push` não rodou). Nos dois
 * casos a pessoa não tem o que fazer aqui — e o que ela veio fazer, se
 * inscrever, ainda é possível pelo Even3.
 */
function bancoIndisponivel(erro: unknown) {
  return (
    erro instanceof Prisma.PrismaClientInitializationError ||
    (erro instanceof Prisma.PrismaClientKnownRequestError &&
      ['P1001', 'P1002', 'P1008', 'P1017', 'P2021', 'P2022'].includes(
        erro.code,
      ))
  );
}

@Controller('semcomp/inscricao')
export class SemcompPublicoController {
  constructor(
    private readonly context: PageContextService,
    private readonly semcomp: SemcompService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private base(req: SessionRequest) {
    const host = req.get('host');
    return host
      ? `${req.protocol}://${host}`
      : this.config.get<string>('SITE_URL') || '';
  }

  private link(req: SessionRequest, token: string) {
    return `${this.base(req)}/semcomp/inscricao/gerenciar/${token}`;
  }

  /** Os `atividade_<id>` marcados. Um campo por atividade, e não um array,
   *  para o formulário voltar marcado quando o servidor recusa o envio
   *  (o `guardarFormulario` só guarda valores de texto). */
  private atividadesDoCorpo(body: FormBody): number[] {
    return Object.keys(body)
      .map((chave) => /^atividade_(\d+)$/.exec(chave)?.[1])
      .filter((id): id is string => Boolean(id))
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);
  }

  private async mandarLink(para: string, nome: string, link: string) {
    const primeiro = nome.split(' ')[0];
    const texto = [
      `Oi, ${primeiro}!`,
      '',
      'Sua inscrição na SEMCOMP 2026 está feita. Por este link você vê e muda as atividades que escolheu:',
      link,
      '',
      'Guarde este e-mail: o link é a chave da sua inscrição. Se pedir um link novo, este deixa de funcionar.',
      '',
      'SEMCOMP 2026 · 29/09 a 03/10 · Universidade SENAI CIMATEC',
    ].join('\n');
    const html = `
      <p>Oi, ${primeiro.replace(/[<>&"]/g, '')}!</p>
      <p>Sua inscrição na <strong>SEMCOMP 2026</strong> está feita. Por este link você vê e muda as atividades que escolheu:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#f28a1f;color:#08080b;border-radius:10px;text-decoration:none;font-weight:700">Ver minha inscrição</a></p>
      <p style="color:#666;font-size:13px">Guarde este e-mail: o link é a chave da sua inscrição. Se pedir um link novo, este deixa de funcionar.</p>
      <p style="color:#666;font-size:13px">SEMCOMP 2026 · 29/09 a 03/10 · Universidade SENAI CIMATEC</p>`;
    return this.email.enviar(
      para,
      'Sua inscrição na SEMCOMP 2026',
      texto,
      html,
    );
  }

  @Get()
  @Render('core/semcomp_inscricao')
  @Header('Cache-Control', 'no-store')
  async formulario(@Req() req: SessionRequest) {
    const ctx = await this.context.base(req);
    try {
      const dias = await this.semcomp.programacao();
      return { ...ctx, modo: 'novo', dias, instituicoes: INSTITUICOES };
    } catch (erro) {
      if (!bancoIndisponivel(erro)) throw erro;
      // Em vez da página de erro genérica: o aviso e a saída pelo Even3.
      return {
        ...ctx,
        modo: 'indisponivel',
        dias: [],
        instituicoes: INSTITUICOES,
      };
    }
  }

  @Post()
  @Redirect('/semcomp/inscricao', 303)
  async inscrever(@Req() req: SessionRequest, @Body() body: FormBody) {
    if (body.consentimento !== 'sim') {
      throw new BadRequestException(
        'Para se inscrever, marque que concorda com o uso dos seus dados pela organização.',
      );
    }
    const escolhaInstituicao = requiredText(body, 'instituicao', 'Instituição');
    const instituicao =
      escolhaInstituicao === 'Outra'
        ? requiredText(body, 'instituicao_outra', 'Qual instituição')
        : escolhaInstituicao;

    const dados = {
      nome: requiredText(body, 'nome', 'Nome completo'),
      nomeCracha: optionalText(body, 'nome_cracha'),
      email: requiredText(body, 'email', 'E-mail'),
      instituicao,
    };
    const resultado = await this.semcomp.criar(
      dados,
      this.atividadesDoCorpo(body),
    );

    if (!resultado) {
      // Já inscrito: link novo por e-mail, e nada na tela (ver `criar`).
      const novo = await this.semcomp.novoLink(dados.email);
      if (novo) {
        await this.mandarLink(
          dados.email.trim().toLowerCase(),
          novo.nome,
          this.link(req, novo.token),
        );
      }
      await addFlash(
        req,
        'info',
        'Este e-mail já tem inscrição na SEMCOMP. Mandamos para ele o link para ver e mudar as suas atividades.',
      );
      return { url: '/semcomp/inscricao#ja-inscrito' };
    }

    await this.semcomp.enviarAoEven3(resultado.inscricaoId);
    const enviado = await this.mandarLink(
      dados.email.trim().toLowerCase(),
      dados.nome,
      this.link(req, resultado.token),
    );
    await addFlash(
      req,
      'success',
      enviado
        ? 'Inscrição feita! Mandamos para o seu e-mail o link desta página, para você voltar e mudar as atividades.'
        : 'Inscrição feita! Salve o endereço desta página: é por ele que você volta para mudar as atividades.',
    );
    return { url: `/semcomp/inscricao/gerenciar/${resultado.token}` };
  }

  @Get('gerenciar/:token')
  @Render('core/semcomp_inscricao')
  @Header('Cache-Control', 'no-store')
  async gerenciar(@Req() req: SessionRequest, @Param('token') token: string) {
    const inscricao = await this.semcomp.porToken(token);
    const escolhidas = new Set(inscricao.escolhas.map((e) => e.atividadeId));
    const [ctx, dias] = await Promise.all([
      this.context.base(req),
      this.semcomp.programacao(escolhidas),
    ]);
    return {
      ...ctx,
      modo: 'gerenciar',
      token,
      inscricao,
      dias,
      total_escolhidas: escolhidas.size,
      link_inscricao: this.link(req, token),
    };
  }

  @Post('gerenciar/:token')
  @Redirect('/semcomp/inscricao', 303)
  async salvar(
    @Req() req: SessionRequest,
    @Param('token') token: string,
    @Body() body: FormBody,
  ) {
    const inscricao = await this.semcomp.porToken(token);
    await this.semcomp.atualizarEscolhas(
      inscricao.id,
      this.atividadesDoCorpo(body),
    );
    await addFlash(req, 'success', 'Atividades salvas.');
    return { url: `/semcomp/inscricao/gerenciar/${token}#atividades` };
  }

  @Post('link')
  @Redirect('/semcomp/inscricao', 303)
  async reenviar(@Req() req: SessionRequest, @Body() body: FormBody) {
    const email = requiredText(body, 'email', 'E-mail');
    const novo = await this.semcomp.novoLink(email);
    if (novo) {
      await this.mandarLink(
        email.trim().toLowerCase(),
        novo.nome,
        this.link(req, novo.token),
      );
    }
    // A mesma frase exista ou não a inscrição: a resposta não pode servir
    // para descobrir quem está inscrito.
    await addFlash(
      req,
      'info',
      'Se este e-mail tiver inscrição, o link chega nele em alguns minutos. Olhe também a caixa de spam.',
    );
    return { url: '/semcomp/inscricao#ja-inscrito' };
  }

  /** Atalho: `/semcomp/inscricao/gerenciar` sem token cai no formulário. */
  @Get('gerenciar')
  @Redirect('/semcomp/inscricao#ja-inscrito', 302)
  semToken() {
    return;
  }
}
