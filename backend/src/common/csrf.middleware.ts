import { ForbiddenException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { SessionRequest } from '../auth/session-request';

/** Nome do campo mantido igual ao do Django para nao quebrar os templates herdados. */
export const CSRF_FIELD = 'csrfmiddlewaretoken';
export const CSRF_HEADER = 'x-csrftoken';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfInput(token: string) {
  return `<input type="hidden" name="${CSRF_FIELD}" value="${token}">`;
}

function safeCompare(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

function extractToken(req: SessionRequest) {
  const header = req.headers[CSRF_HEADER];
  if (typeof header === 'string' && header) {
    return header;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const fromBody = body?.[CSRF_FIELD];
  return typeof fromBody === 'string' ? fromBody : '';
}

/**
 * Valida o token e o remove do corpo. Exportado porque uploads `multipart`
 * so tem o corpo disponivel depois do multer, ou seja, depois deste middleware.
 */
export function assertCsrf(req: SessionRequest) {
  const expected = req.session.csrfToken;
  const received = extractToken(req);

  if (!expected || !received || !safeCompare(expected, received)) {
    throw new ForbiddenException(
      'Token de segurança inválido ou expirado. Recarregue a página e tente novamente.',
    );
  }

  // Remove o campo para o ValidationPipe nao trata-lo como propriedade extra.
  if (req.body && typeof req.body === 'object') {
    delete (req.body as Record<string, unknown>)[CSRF_FIELD];
  }
}

/**
 * Garante um token de CSRF na sessao e valida requisicoes que alteram estado.
 * A sessao usa cookie, entao sem isso qualquer site externo consegue postar
 * formularios autenticados em nome do usuario.
 */
export function csrfMiddleware() {
  return (req: SessionRequest, _res: Response, next: NextFunction) => {
    const issue = async () => {
      if (!req.session.csrfToken) {
        req.session.csrfToken = randomBytes(32).toString('hex');
        await req.session.save();
      }
    };

    if (SAFE_METHODS.has(req.method)) {
      issue().then(() => next(), next);
      return;
    }

    // Corpo multipart ainda nao foi lido aqui; o handler chama assertCsrf().
    if (req.is('multipart/form-data')) {
      next();
      return;
    }

    try {
      assertCsrf(req);
    } catch (error) {
      next(error);
      return;
    }

    next();
  };
}
