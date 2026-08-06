import type {
  FlashLevel,
  FlashMessage,
  SessionRequest,
} from '../auth/session-request';

/** Enfileira uma mensagem para ser exibida na proxima pagina renderizada. */
export async function addFlash(
  req: SessionRequest,
  tags: FlashLevel,
  text: string,
) {
  const current = req.session.flash ?? [];
  current.push({ tags, text });
  req.session.flash = current;
  await req.session.save();
}

/** Le e limpa as mensagens pendentes. */
export async function consumeFlash(
  req: SessionRequest,
): Promise<FlashMessage[]> {
  const messages = req.session.flash ?? [];
  if (messages.length > 0) {
    req.session.flash = [];
    await req.session.save();
  }
  return messages;
}

/** Tokens e confirmacoes: regerados a cada requisicao, nao faz sentido devolver. */
const CAMPOS_NAO_PRESERVADOS = new Set(['confirmacao', 'csrfmiddlewaretoken']);

/**
 * Nenhuma senha volta para o HTML.
 *
 * Um Set com nomes exatos nao serve: o formulario de cadastro usa
 * `confirmar_senha`, e qualquer campo novo com outro nome escaparia da lista
 * em silencio. Testar o nome cobre os que ainda nao existem.
 */
function ehSegredo(campo: string): boolean {
  const nome = campo.toLowerCase();
  return (
    nome.includes('senha') ||
    nome.includes('password') ||
    nome.includes('token')
  );
}

/** Teto por campo, para um POST grande nao estourar o cookie de sessao. */
const MAX_CARACTERES = 2000;

/**
 * Guarda o que foi enviado para o formulario poder ser repovoado depois do
 * redirect. Sem isso o usuario perde tudo o que digitou quando erra um campo.
 */
export async function guardarFormulario(
  req: SessionRequest,
  path: string,
): Promise<void> {
  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object') {
    return;
  }

  const values: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(body)) {
    if (CAMPOS_NAO_PRESERVADOS.has(chave) || ehSegredo(chave)) continue;
    if (typeof valor !== 'string') continue;
    values[chave] = valor.slice(0, MAX_CARACTERES);
  }

  if (Object.keys(values).length === 0) {
    return;
  }

  req.session.formOld = { path, values };
  await req.session.save();
}

/** Le e limpa os valores, mas so os do formulario que esta sendo renderizado. */
export async function consumirFormulario(
  req: SessionRequest,
): Promise<Record<string, string>> {
  const guardado = req.session.formOld;
  if (!guardado || guardado.path !== req.path) {
    return {};
  }

  req.session.formOld = undefined;
  await req.session.save();
  return guardado.values;
}
