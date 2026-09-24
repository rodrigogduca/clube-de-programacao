import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SITE_LINKS } from '../pages/site-links';

/**
 * CLIENTE DA API DO EVEN3 (https://docs.even3.com.br/).
 *
 * O que a API permite, e portanto o que o site faz com ela:
 *
 *   · criar participante (`attendees/create`)  -> toda inscrição feita aqui
 *   · listar participantes (`attendees`)       -> achar o id pelo e-mail
 *   · ler a programação (`session/getschedule`) -> ligar atividade a sessão
 *   · registrar presença (`checkin/sessions`)   -> vira certificado lá
 *
 * O que ela NÃO permite: inscrever alguém numa atividade. Por isso a escolha
 * de atividades mora no banco do site (ver o schema).
 *
 * DESLIGADA SEM TOKEN. Sem `EVEN3_TOKEN` o site continua inscrevendo, só não
 * manda nada ao Even3; as inscrições ficam `pendente` e sobem pelo botão
 * "Enviar pendentes" do painel quando o token for configurado.
 *
 * `EVEN3_TICKET_PRICE_ID` é a entrada em que o participante é inscrito: a
 * lista sai de `GET /event` (campo `tickets[].prices[].id_ticket_price`), e o
 * painel mostra as entradas disponíveis quando falta o valor.
 */
const BASE = 'https://www.even3.com.br/api/v1';
// `EVEN3_API_URL` só existe para testar contra um Even3 de mentira; em
// produção fica vazio e vale o endereço oficial.
const TEMPO_LIMITE_MS = 12_000;

export type Even3Participante = {
  id_attendees: number;
  name: string;
  email: string;
};

export type Even3Sessao = {
  id_session: number;
  title: string;
  date: string; // "29/09/2026"
  start_time: string; // "09:00"
};

export type Even3Entrada = {
  titulo: string;
  idTicketPrice: number;
  preco: number;
  inicio: Date | null;
  fim: Date | null;
};

/** "SENAI CIMATEC" e "CIMATEC" viram a mesma coisa para comparar. */
function simples(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export class Even3Erro extends Error {}

/** "semcomp2026-701106", o fim do link público do evento. */
function slugDoLink(link: string) {
  return (link.split('even3.com.br/')[1] ?? '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

@Injectable()
export class Even3Service {
  private readonly logger = new Logger('Even3');

  constructor(private readonly config: ConfigService) {}

  /** `EVEN3_API_KEY` é aceito como sinônimo: é o nome que a tela do Even3
   *  sugere ("chave de API"), e foi o que a comissão escreveu no `.env`. */
  private get token() {
    return (
      this.config.get<string>('EVEN3_TOKEN')?.trim() ||
      this.config.get<string>('EVEN3_API_KEY')?.trim() ||
      ''
    );
  }

  private get idEntrada() {
    const bruto = this.config.get<string>('EVEN3_TICKET_PRICE_ID')?.trim();
    const id = Number(bruto);
    return bruto && Number.isInteger(id) && id > 0 ? id : null;
  }

  get ativo() {
    return Boolean(this.token);
  }

  /**
   * O ingresso sai da instituição da pessoa (ver `ingressoPara`), então basta
   * a chave. `EVEN3_TICKET_PRICE_ID` virou só a reserva para quem marca
   * "Outra" — sem ela, essa pessoa fica sem vínculo e o painel mostra por quê.
   */
  get podeCriarParticipante() {
    return this.ativo;
  }

  private entradasCache: { ate: number; lista: Even3Entrada[] } | null = null;

  private async entradas(): Promise<Even3Entrada[]> {
    if (this.entradasCache && this.entradasCache.ate > Date.now()) {
      return this.entradasCache.lista;
    }
    const lista = await this.listarEntradas();
    this.entradasCache = { ate: Date.now() + 10 * 60_000, lista };
    return lista;
  }

  /**
   * UM INGRESSO POR INSTITUIÇÃO. O evento da SEMCOMP no Even3 tem um ingresso
   * para cada universidade convidada (CIMATEC, UFBA, UESB, UNEB, UCSAL,
   * UNIFACS, UNIJORGE) — as mesmas opções do formulário do site —, e é por
   * ele que a comissão conta quem vem de onde. O casamento é pelo nome
   * ("SENAI CIMATEC" acha "CIMATEC"), e entre dois do mesmo nome vale o que
   * está vendendo hoje.
   */
  async ingressoPara(instituicao: string): Promise<number> {
    const alvo = simples(instituicao);
    const lista = await this.entradas();
    const mesmas = lista.filter((e) => {
      const t = simples(e.titulo);
      return t && (alvo.includes(t) || t.includes(alvo));
    });
    const agora = Date.now();
    const vigente = mesmas.find(
      (e) =>
        (!e.inicio || e.inicio.getTime() <= agora) &&
        (!e.fim || e.fim.getTime() + 24 * 3600_000 > agora),
    );
    if (vigente) return vigente.idTicketPrice;
    if (mesmas.length > 0) {
      const fim = mesmas[0].fim;
      throw new Even3Erro(
        `O ingresso "${mesmas[0].titulo}" do Even3 está fora do prazo de venda${fim ? ` (terminou em ${fim.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' })})` : ''}. Estenda o prazo no Even3 e use "Enviar inscrições pendentes".`,
      );
    }
    if (this.idEntrada !== null) return this.idEntrada;
    throw new Even3Erro(
      `Não há ingresso no Even3 para a instituição "${instituicao}". Crie um ingresso para ela (ou um geral, em EVEN3_TICKET_PRICE_ID) e use "Enviar inscrições pendentes".`,
    );
  }

  /**
   * A CHAVE É DO EVENTO CERTO? Cada chave do Even3 abre um evento só, e a
   * primeira que chegou ao `.env` era a do AWS DAY: com ela, uma inscrição da
   * SEMCOMP de quem também estivesse no AWS Day seria vinculada ao evento
   * errado, e a presença iria para lá. Antes de qualquer chamada, o
   * `url` do evento que a chave abre tem de ser o do link de inscrição da
   * SEMCOMP (`SITE_LINKS.semcomp`, ou `EVEN3_EVENTO` se um dia divergirem).
   *
   * O resultado fica guardado por alguns minutos (o de erro, por menos), para
   * não custar uma chamada a mais em cada inscrição.
   */
  private conferido: { ate: number; erro: string | null } | null = null;

  async conferirEvento(): Promise<string | null> {
    if (this.conferido && this.conferido.ate > Date.now()) {
      return this.conferido.erro;
    }
    const esperado =
      this.config.get<string>('EVEN3_EVENTO')?.trim().toLowerCase() ||
      slugDoLink(SITE_LINKS.semcomp);
    let erro: string | null = null;
    try {
      const resposta = await this.chamarSemConferir<{
        data?: Array<{ title?: string; url?: string }>;
      }>('GET', '/event');
      const evento = Array.isArray(resposta?.data)
        ? resposta.data[0]
        : undefined;
      const url = (evento?.url ?? '').toLowerCase();
      if (!esperado || url !== esperado) {
        erro = `A chave do Even3 configurada é do evento "${evento?.title ?? '?'}" (${url || 'sem url'}), e não da SEMCOMP (${esperado}). Nada é enviado ao Even3 até a chave ser trocada pela do evento certo.`;
      }
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e);
    }
    this.conferido = {
      ate: Date.now() + (erro ? 60_000 : 10 * 60_000),
      erro,
    };
    if (erro) this.logger.warn(erro);
    return erro;
  }

  private async chamar<T>(
    metodo: 'GET' | 'POST',
    caminho: string,
    corpo?: unknown,
  ): Promise<T> {
    const erro = await this.conferirEvento();
    if (erro) throw new Even3Erro(erro);
    return this.chamarSemConferir<T>(metodo, caminho, corpo);
  }

  private async chamarSemConferir<T>(
    metodo: 'GET' | 'POST',
    caminho: string,
    corpo?: unknown,
  ): Promise<T> {
    if (!this.ativo) {
      throw new Even3Erro(
        'Integração com o Even3 desligada (sem EVEN3_TOKEN).',
      );
    }

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);

    try {
      const base = this.config.get<string>('EVEN3_API_URL')?.trim() || BASE;
      const resposta = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: {
          'Authorization-Token': this.token,
          Accept: 'application/json',
          ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: controle.signal,
      });

      const texto = await resposta.text();
      if (!resposta.ok) {
        throw new Even3Erro(
          `Even3 respondeu ${resposta.status} em ${caminho}: ${texto.slice(0, 300)}`,
        );
      }

      try {
        return JSON.parse(texto) as T;
      } catch {
        // `attendees/create` e `checkin/*` respondem uma string solta.
        return texto as unknown as T;
      }
    } catch (erro) {
      if (erro instanceof Even3Erro) throw erro;
      const motivo =
        erro instanceof Error && erro.name === 'AbortError'
          ? `sem resposta em ${TEMPO_LIMITE_MS / 1000}s`
          : erro instanceof Error
            ? erro.message
            : String(erro);
      throw new Even3Erro(`Falha ao falar com o Even3 (${caminho}): ${motivo}`);
    } finally {
      clearTimeout(relogio);
    }
  }

  async listarParticipantes(): Promise<Even3Participante[]> {
    const resposta = await this.chamar<{ data?: Even3Participante[] }>(
      'GET',
      '/attendees/',
    );
    return Array.isArray(resposta?.data) ? resposta.data : [];
  }

  /** Mapa e-mail (minúsculo) -> id_attendees. */
  async mapaPorEmail(): Promise<Map<string, number>> {
    const lista = await this.listarParticipantes();
    const mapa = new Map<string, number>();
    for (const p of lista) {
      if (p?.email && p.id_attendees) {
        mapa.set(p.email.trim().toLowerCase(), p.id_attendees);
      }
    }
    return mapa;
  }

  async criarParticipante(dados: {
    nome: string;
    nomeCracha: string;
    email: string;
    instituicao: string;
  }): Promise<void> {
    const idEntrada = await this.ingressoPara(dados.instituicao);

    await this.chamar('POST', '/attendees/create', {
      attendee: {
        name: dados.nome,
        // Sic: é assim que a API do Even3 escreve o campo.
        bagde_name: dados.nomeCracha,
        email: dados.email,
        registration_confirmed: true,
        registration: { id_ticket_price: idEntrada, price: 0 },
      },
    });
  }

  async listarSessoes(): Promise<Even3Sessao[]> {
    const resposta = await this.chamar<{
      data?: Array<{ sessions?: Even3Sessao[] }>;
    }>('GET', '/session/getschedule');
    const dias = Array.isArray(resposta?.data) ? resposta.data : [];
    return dias.flatMap((d) => (Array.isArray(d.sessions) ? d.sessions : []));
  }

  async listarEntradas(): Promise<Even3Entrada[]> {
    const resposta = await this.chamar<{
      data?: Array<{
        tickets?: Array<{
          title: string;
          prices?: Array<{
            id_ticket_price: number;
            price: number;
            start_date?: string;
            due_date?: string;
          }>;
        }>;
      }>;
    }>('GET', '/event');
    const evento = Array.isArray(resposta?.data) ? resposta.data[0] : undefined;
    return (evento?.tickets ?? []).flatMap((t) =>
      (t.prices ?? []).map((p) => ({
        titulo: t.title,
        idTicketPrice: p.id_ticket_price,
        preco: p.price,
        inicio: p.start_date
          ? new Date(`${p.start_date.slice(0, 19)}-03:00`)
          : null,
        fim: p.due_date ? new Date(`${p.due_date.slice(0, 19)}-03:00`) : null,
      })),
    );
  }

  async registrarPresencas(
    presencas: Array<{ idParticipante: number; idSessao: number; em: Date }>,
  ): Promise<void> {
    if (presencas.length === 0) return;
    await this.chamar('POST', '/checkin/sessions', {
      sessions: presencas.map((p) => ({
        id_attendees: p.idParticipante,
        id_session: p.idSessao,
        checkin: 1,
        checkin_date: p.em.toISOString(),
      })),
    });
    this.logger.log(`${presencas.length} presença(s) enviada(s) ao Even3.`);
  }
}
