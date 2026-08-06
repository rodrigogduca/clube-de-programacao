import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { SessionRequest } from '../auth/session-request';
import { addFlash, guardarFormulario } from './flash';

const STATUS_TITLES: Record<number, string> = {
  400: 'Dados inválidos',
  401: 'Acesso restrito',
  403: 'Sem permissão',
  404: 'Página não encontrada',
  500: 'Erro interno',
};

function extractMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const message = (response as Record<string, unknown>).message;
      if (Array.isArray(message)) {
        return message.join(' ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }
    return exception.message;
  }
  return 'Ocorreu um erro inesperado.';
}

/**
 * Mensagens escritas para quem le, no lugar das do framework.
 *
 * A rota inexistente chega aqui como "Cannot GET /qualquer-coisa" — texto do
 * Express, em ingles, com o metodo HTTP no meio. Era o que a pagina de erro
 * mais vista do site mostrava ao visitante. As permissoes idem: "Forbidden
 * resource" nao diz o que fazer em seguida.
 *
 * So substitui quando a mensagem veio do framework; erro que o proprio sistema
 * escreveu ("Voce nao tem permissao para criar setores.") ja diz o que
 * aconteceu e passa direto.
 */
const MENSAGENS_PADRAO: Record<number, string> = {
  403: 'Esta página existe, mas o seu cargo no clube não alcança ela.',
  404: 'Este endereço não existe. Talvez o link esteja velho ou tenha vindo com um erro de digitação.',
};

function isMensagemDoFramework(mensagem: string) {
  return (
    /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i.test(mensagem) ||
    mensagem === 'Forbidden resource' ||
    mensagem === 'Not Found' ||
    mensagem === 'Bad Request' ||
    mensagem === 'Unauthorized'
  );
}

function mensagemParaLeitor(status: number, mensagem: string): string {
  if (status >= 500) {
    return 'Tente novamente em instantes.';
  }
  if (isMensagemDoFramework(mensagem)) {
    return MENSAGENS_PADRAO[status] ?? 'Não foi possível abrir esta página.';
  }
  return mensagem;
}

/** Requisicoes de API recebem JSON; navegacao normal recebe redirect ou pagina de erro. */
function wantsJson(req: SessionRequest) {
  if (req.path.startsWith('/api/')) {
    return true;
  }
  const accept = req.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

function safeRedirectTarget(req: SessionRequest) {
  const referer = req.get('referer');
  if (referer) {
    try {
      const url = new URL(referer);
      const host = req.get('host');
      if (host && url.host === host) {
        return `${url.pathname}${url.search}`;
      }
    } catch {
      // referer malformado: cai no fallback
    }
  }
  // Sem referer confiavel: manda o visitante para a home e quem esta logado
  // para o painel, evitando um redirect que so bate no login.
  return req.session?.userId ? '/painel' : '/';
}

@Catch()
export class WebExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<SessionRequest>();
    const res = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = extractMessage(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (wantsJson(req)) {
      res.status(status).json({ statusCode: status, message });
      return;
    }

    try {
      if (status === Number(HttpStatus.UNAUTHORIZED)) {
        const next = encodeURIComponent(req.originalUrl);
        res.redirect(302, `/accounts/login?next=${next}`);
        return;
      }

      // Submissao de formulario: volta para a pagina anterior com a mensagem e
      // com o que foi digitado, para o usuario corrigir um campo em vez de
      // preencher tudo de novo.
      if (req.method !== 'GET' && status < 500) {
        const destino = safeRedirectTarget(req);
        await addFlash(req, 'error', message);
        await guardarFormulario(req, destino.split('?')[0]);
        res.redirect(303, destino);
        return;
      }

      // `logado` decide para onde a pagina de erro oferece voltar: quem tem
      // sessao ganha um caminho para o painel, quem nao tem ganha o login.
      // Sem isto a tela so sabia dizer "volte para a pagina inicial", que quase
      // nunca era o lugar de onde a pessoa veio.
      res.status(status).render('core/erro', {
        status,
        titulo: STATUS_TITLES[status] ?? 'Erro',
        mensagem: mensagemParaLeitor(status, message),
        logado: Boolean(req.session?.userId),
      });
    } catch (renderError) {
      this.logger.error('Falha ao renderizar a página de erro', renderError);
      res.status(status).type('text/plain').send(message);
    }
  }
}
