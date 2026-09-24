import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SemcompAtividade } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { toCsv } from '../common/csv';
import { PrismaService } from '../database/prisma.service';
import { Even3Erro, Even3Service } from './even3.service';
import { chaveDia, hora, rotuloDia } from './horario';

/** As instituições que a semana convida, na ordem da página. */
export const INSTITUICOES = [
  'SENAI CIMATEC',
  'UFBA',
  'UESB',
  'UNEB',
  'UCSAL',
  'UNIFACS',
  'UNIJORGE',
] as const;

type Tx = Prisma.TransactionClient;

export type DadosInscricao = {
  nome: string;
  nomeCracha?: string;
  email: string;
  instituicao: string;
};

export type AtividadeVista = {
  id: number;
  tipo: string;
  titulo: string;
  quem: string | null;
  local: string | null;
  hora: string;
  horaFim: string;
  inicioIso: string;
  fimIso: string;
  vagas: number | null;
  ocupadas: number;
  restantes: number | null;
  lotada: boolean;
  aberta: boolean;
  comecou: boolean;
  escolhida: boolean;
  /** Pode marcar/desmarcar agora? */
  editavel: boolean;
};

export type DiaVisto = {
  chave: string;
  rotulo: string;
  atividades: AtividadeVista[];
};

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function novoToken() {
  return randomBytes(24).toString('base64url');
}

export function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Intervalos [a, b) que se tocam só na borda (09:00–09:50 e 09:50–10:40) não chocam. */
function chocam(
  a: Pick<SemcompAtividade, 'inicio' | 'fim'>,
  b: Pick<SemcompAtividade, 'inicio' | 'fim'>,
) {
  return a.inicio < b.fim && b.inicio < a.fim;
}

@Injectable()
export class SemcompService {
  private readonly logger = new Logger('SEMCOMP');

  constructor(
    private readonly prisma: PrismaService,
    private readonly even3: Even3Service,
  ) {}

  // -------------------------------------------------------------------------
  // Leitura para o formulário público
  // -------------------------------------------------------------------------

  /**
   * As atividades agrupadas por dia, com as vagas que sobram. `escolhidas` é
   * o conjunto de quem está editando a própria inscrição: a vaga dela não
   * conta como "ocupada por outra pessoa".
   */
  async programacao(escolhidas: Set<number> = new Set()): Promise<DiaVisto[]> {
    const agora = new Date();
    const atividades = await this.prisma.semcompAtividade.findMany({
      orderBy: [{ inicio: 'asc' }, { titulo: 'asc' }],
      include: { _count: { select: { escolhas: true } } },
    });

    const dias = new Map<string, DiaVisto>();
    for (const a of atividades) {
      const escolhida = escolhidas.has(a.id);
      // Atividade fechada some do formulário, a não ser para quem já a tem.
      if (!a.aberta && !escolhida) continue;

      const ocupadas = a._count.escolhas;
      const restantes =
        a.vagas == null ? null : Math.max(0, a.vagas - ocupadas);
      const lotada = restantes !== null && restantes <= 0 && !escolhida;
      const comecou = a.inicio <= agora;

      const chave = chaveDia(a.inicio);
      if (!dias.has(chave)) {
        dias.set(chave, { chave, rotulo: rotuloDia(a.inicio), atividades: [] });
      }
      dias.get(chave)!.atividades.push({
        id: a.id,
        tipo: a.tipo,
        titulo: a.titulo,
        quem: a.quem,
        local: a.local,
        hora: hora(a.inicio),
        horaFim: hora(a.fim),
        inicioIso: a.inicio.toISOString(),
        fimIso: a.fim.toISOString(),
        vagas: a.vagas,
        ocupadas,
        restantes,
        lotada,
        aberta: a.aberta,
        comecou,
        escolhida,
        editavel: !comecou && (escolhida || (a.aberta && !lotada)),
      });
    }
    return [...dias.values()];
  }

  async porToken(token: string) {
    if (!token || token.length > 100) {
      throw new NotFoundException(
        'Este link de inscrição não existe ou foi trocado por um mais novo.',
      );
    }
    const inscricao = await this.prisma.semcompInscricao.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        escolhas: {
          include: { atividade: true },
          orderBy: { atividade: { inicio: 'asc' } },
        },
      },
    });
    if (!inscricao) {
      throw new NotFoundException(
        'Este link de inscrição não existe ou foi trocado por um mais novo. Peça um link novo com o seu e-mail.',
      );
    }
    return inscricao;
  }

  // -------------------------------------------------------------------------
  // Escrita
  // -------------------------------------------------------------------------

  validarDados(dados: DadosInscricao): DadosInscricao {
    const nome = dados.nome.replace(/\s+/g, ' ').trim();
    if (nome.length < 3 || nome.length > 120) {
      throw new BadRequestException(
        'Escreva o seu nome completo (de 3 a 120 caracteres).',
      );
    }
    const email = normalizarEmail(dados.email);
    if (!EMAIL_VALIDO.test(email) || email.length > 160) {
      throw new BadRequestException(
        'Este e-mail não parece válido. Confira se não faltou nada.',
      );
    }
    const instituicao = dados.instituicao.trim();
    if (instituicao.length < 2 || instituicao.length > 120) {
      throw new BadRequestException('Diga de qual instituição você vem.');
    }
    const nomeCracha = dados.nomeCracha?.replace(/\s+/g, ' ').trim();
    if (nomeCracha && nomeCracha.length > 40) {
      throw new BadRequestException(
        'O nome do crachá tem de caber em 40 caracteres.',
      );
    }
    return { nome, email, instituicao, nomeCracha: nomeCracha || undefined };
  }

  /**
   * Cria a inscrição e as escolhas numa transação só. Devolve o token do
   * link (a única vez em que ele existe em claro) ou `null` se o e-mail já
   * estava inscrito — nesse caso quem chama manda um link novo por e-mail,
   * e NÃO mostra nada na tela: senão bastaria digitar o e-mail de alguém
   * para entrar na inscrição dele.
   */
  async criar(
    dados: DadosInscricao,
    atividadeIds: number[],
  ): Promise<{ token: string; inscricaoId: number } | null> {
    const limpos = this.validarDados(dados);

    const existente = await this.prisma.semcompInscricao.findUnique({
      where: { email: limpos.email },
      select: { id: true },
    });
    if (existente) return null;

    const token = novoToken();
    try {
      const inscricao = await this.prisma.$transaction(
        async (tx) => {
          const criada = await tx.semcompInscricao.create({
            data: {
              nome: limpos.nome,
              nomeCracha: limpos.nomeCracha,
              email: limpos.email,
              instituicao: limpos.instituicao,
              tokenHash: hashToken(token),
              consentimentoEm: new Date(),
              linkEnviadoEm: new Date(),
            },
          });
          await this.aplicarEscolhas(tx, criada.id, atividadeIds);
          return criada;
        },
        { timeout: 15_000 },
      );
      return { token, inscricaoId: inscricao.id };
    } catch (erro) {
      // Duas abas enviando o mesmo e-mail ao mesmo tempo: a segunda cai aqui.
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002'
      ) {
        return null;
      }
      throw erro;
    }
  }

  async atualizarEscolhas(inscricaoId: number, atividadeIds: number[]) {
    await this.prisma.$transaction(
      (tx) => this.aplicarEscolhas(tx, inscricaoId, atividadeIds),
      { timeout: 15_000 },
    );
  }

  /**
   * O coração da inscrição: troca o conjunto de atividades de uma pessoa
   * pelo novo, respeitando quatro regras.
   *
   *  1. VAGA. As linhas das atividades novas são travadas (`FOR UPDATE`)
   *     antes da contagem, então duas pessoas disputando a última vaga não
   *     passam as duas: a segunda espera a primeira terminar e já conta com
   *     ela.
   *  2. HORÁRIO. Duas atividades que se sobrepõem não entram juntas.
   *  3. O QUE JÁ COMEÇOU NÃO MUDA. Não dá para entrar numa palestra em
   *     andamento pelo site, nem sair de uma a que se assistiu — a presença
   *     dela é o certificado. As que já começaram ficam como estavam, mesmo
   *     que o formulário (onde elas vêm desabilitadas) não as mande.
   *  4. FECHADA NÃO RECEBE GENTE NOVA, mas quem já estava continua.
   */
  private async aplicarEscolhas(
    tx: Tx,
    inscricaoId: number,
    pedidas: number[],
  ) {
    const agora = new Date();
    const pedidasUnicas = [...new Set(pedidas)].slice(0, 60);

    const atuais = await tx.semcompEscolha.findMany({
      where: { inscricaoId },
      include: { atividade: true },
    });
    const atuaisIds = new Set(atuais.map((e) => e.atividadeId));

    const novasIds = pedidasUnicas.filter((id) => !atuaisIds.has(id));
    if (novasIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM semcomp_atividades WHERE id = ANY(${novasIds}::int[]) FOR UPDATE`;
    }

    const novas = await tx.semcompAtividade.findMany({
      where: { id: { in: novasIds } },
      include: { _count: { select: { escolhas: true } } },
    });
    if (novas.length !== novasIds.length) {
      throw new BadRequestException(
        'Uma das atividades escolhidas não existe mais. Recarregue a página e escolha de novo.',
      );
    }

    for (const a of novas) {
      if (a.inicio <= agora) {
        throw new BadRequestException(
          `"${a.titulo}" já começou, e não dá mais para entrar nela pelo site.`,
        );
      }
      if (!a.aberta) {
        throw new BadRequestException(
          `As inscrições para "${a.titulo}" estão fechadas.`,
        );
      }
      if (a.vagas != null && a._count.escolhas >= a.vagas) {
        throw new BadRequestException(
          `As vagas de "${a.titulo}" acabaram enquanto você escolhia. As outras escolhas não foram salvas; tire esta e envie de novo.`,
        );
      }
    }

    // Quem já começou fica, pedido ou não (regra 3).
    const mantidas = atuais.filter(
      (e) =>
        pedidasUnicas.includes(e.atividadeId) || e.atividade.inicio <= agora,
    );
    const removidas = atuais.filter((e) => !mantidas.includes(e));

    const final = [...mantidas.map((e) => e.atividade), ...novas];
    for (let i = 0; i < final.length; i++) {
      for (let j = i + 1; j < final.length; j++) {
        if (chocam(final[i], final[j])) {
          throw new BadRequestException(
            `"${final[i].titulo}" e "${final[j].titulo}" acontecem no mesmo horário. Escolha uma das duas.`,
          );
        }
      }
    }

    if (removidas.length > 0) {
      await tx.semcompEscolha.deleteMany({
        where: { id: { in: removidas.map((e) => e.id) } },
      });
    }
    if (novas.length > 0) {
      await tx.semcompEscolha.createMany({
        data: novas.map((a) => ({ inscricaoId, atividadeId: a.id })),
      });
    }
  }

  /**
   * Troca o token de uma inscrição e devolve o novo. O link anterior para de
   * funcionar: só o último enviado vale.
   *
   * Um link por 2 minutos por pessoa, para o formulário "reenviar link" não
   * virar um jeito de encher a caixa de alguém.
   */
  async novoLink(
    email: string,
  ): Promise<{ token: string; nome: string } | null> {
    const inscricao = await this.prisma.semcompInscricao.findUnique({
      where: { email: normalizarEmail(email) },
    });
    if (!inscricao) return null;
    if (
      inscricao.linkEnviadoEm &&
      Date.now() - inscricao.linkEnviadoEm.getTime() < 2 * 60 * 1000
    ) {
      return null;
    }
    const token = novoToken();
    await this.prisma.semcompInscricao.update({
      where: { id: inscricao.id },
      data: { tokenHash: hashToken(token), linkEnviadoEm: new Date() },
    });
    return { token, nome: inscricao.nome };
  }

  // -------------------------------------------------------------------------
  // Even3
  // -------------------------------------------------------------------------

  /**
   * Leva uma inscrição ao Even3. Nunca lança: a inscrição no site já está
   * feita, e um Even3 fora do ar não pode desfazê-la. O resultado fica em
   * `even3Status`/`even3Erro`, e o painel reenvia quem ficou para trás.
   *
   * QUEM JÁ ESTAVA NO EVEN3 (se inscreveu lá antes de o site ter formulário)
   * é reconhecido pelo e-mail e só ganha o vínculo — criar de novo duplicaria
   * a pessoa na lista de lá.
   */
  async enviarAoEven3(inscricaoId: number, mapa?: Map<string, number>) {
    if (!this.even3.ativo) return;
    const inscricao = await this.prisma.semcompInscricao.findUnique({
      where: { id: inscricaoId },
    });
    if (!inscricao || inscricao.even3Status === 'vinculado') return;

    try {
      const porEmail = mapa ?? (await this.even3.mapaPorEmail());
      let id = porEmail.get(inscricao.email);

      if (!id && inscricao.even3Status !== 'enviado') {
        await this.even3.criarParticipante({
          nome: inscricao.nome,
          nomeCracha: inscricao.nomeCracha || inscricao.nome.split(' ')[0],
          email: inscricao.email,
          instituicao: inscricao.instituicao,
        });
        // A criação não devolve o id; uma leitura a mais e ele vem.
        if (!mapa) id = (await this.even3.mapaPorEmail()).get(inscricao.email);
      }

      await this.prisma.semcompInscricao.update({
        where: { id: inscricao.id },
        data: id
          ? { even3Status: 'vinculado', even3Id: id, even3Erro: null }
          : { even3Status: 'enviado', even3Erro: null },
      });
    } catch (erro) {
      const mensagem =
        erro instanceof Even3Erro || erro instanceof Error
          ? erro.message
          : String(erro);
      this.logger.error(`Inscrição ${inscricao.id}: ${mensagem}`);
      await this.prisma.semcompInscricao.update({
        where: { id: inscricao.id },
        data: { even3Status: 'erro', even3Erro: mensagem.slice(0, 500) },
      });
    }
  }

  /** "Enviar pendentes" do painel: uma leitura da lista e todos os que faltam. */
  async enviarPendentesAoEven3() {
    if (!this.even3.ativo) {
      throw new BadRequestException('Configure EVEN3_TOKEN antes de enviar.');
    }
    const pendentes = await this.prisma.semcompInscricao.findMany({
      where: { even3Status: { not: 'vinculado' } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 200,
    });
    let mapa = await this.even3.mapaPorEmail();
    for (const p of pendentes) {
      await this.enviarAoEven3(p.id, mapa);
    }
    // Os recém-criados só têm id numa leitura depois da criação.
    mapa = await this.even3.mapaPorEmail();
    for (const p of pendentes) {
      await this.enviarAoEven3(p.id, mapa);
    }
    const [vinculados, restantes] = await Promise.all([
      this.prisma.semcompInscricao.count({
        where: { even3Status: 'vinculado' },
      }),
      this.prisma.semcompInscricao.count({
        where: { even3Status: { not: 'vinculado' } },
      }),
    ]);
    return { processados: pendentes.length, vinculados, restantes };
  }

  /**
   * Liga cada atividade à sessão do Even3 de mesmo dia e horário. Havendo
   * duas sessões no mesmo horário, desempata pelo título. Só preenche quem
   * está sem id: um id posto à mão no painel não é sobrescrito.
   */
  async vincularSessoesEven3() {
    const sessoes = await this.even3.listarSessoes();
    const atividades = await this.prisma.semcompAtividade.findMany({
      where: { even3SessionId: null },
    });
    const simples = (t: string) =>
      t
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    let ligadas = 0;
    for (const a of atividades) {
      const [ano, mes, dia] = chaveDia(a.inicio).split('-');
      const data = `${dia}/${mes}/${ano}`;
      const candidatas = sessoes.filter(
        (s) => s.date === data && s.start_time === hora(a.inicio),
      );
      const titulo = simples(a.titulo);
      const escolhida =
        candidatas.length === 1
          ? candidatas[0]
          : candidatas.find((s) => {
              const t = simples(s.title);
              return t.includes(titulo) || titulo.includes(t);
            });
      if (escolhida) {
        await this.prisma.semcompAtividade.update({
          where: { id: a.id },
          data: { even3SessionId: escolhida.id_session },
        });
        ligadas++;
      }
    }
    return {
      ligadas,
      semPar: atividades.length - ligadas,
      sessoes: sessoes.length,
    };
  }

  /** Manda ao Even3 todas as presenças marcadas que ainda não foram. */
  async enviarPresencasAoEven3() {
    if (!this.even3.ativo) {
      throw new BadRequestException('Configure EVEN3_TOKEN antes de enviar.');
    }
    const faltando = await this.prisma.semcompEscolha.findMany({
      where: { presente: true, even3Checkin: false },
      include: { inscricao: true, atividade: true },
    });
    const semId = faltando.filter((e) => !e.inscricao.even3Id);
    if (semId.length > 0) {
      const mapa = await this.even3.mapaPorEmail();
      for (const e of semId) {
        const id = mapa.get(e.inscricao.email);
        if (id) {
          await this.prisma.semcompInscricao.update({
            where: { id: e.inscricaoId },
            data: { even3Id: id, even3Status: 'vinculado', even3Erro: null },
          });
          e.inscricao.even3Id = id;
        }
      }
    }

    const prontas = faltando.filter(
      (e) => e.inscricao.even3Id && e.atividade.even3SessionId,
    );
    if (prontas.length > 0) {
      await this.even3.registrarPresencas(
        prontas.map((e) => ({
          idParticipante: e.inscricao.even3Id!,
          idSessao: e.atividade.even3SessionId!,
          em: e.presencaEm ?? new Date(),
        })),
      );
      await this.prisma.semcompEscolha.updateMany({
        where: { id: { in: prontas.map((e) => e.id) } },
        data: { even3Checkin: true },
      });
    }
    return {
      enviadas: prontas.length,
      semParticipante: faltando.filter((e) => !e.inscricao.even3Id).length,
      semSessao: faltando.filter(
        (e) => e.inscricao.even3Id && !e.atividade.even3SessionId,
      ).length,
    };
  }

  // -------------------------------------------------------------------------
  // Painel
  // -------------------------------------------------------------------------

  async resumo() {
    const [total, porStatus, atividades, presencasPendentes] =
      await Promise.all([
        this.prisma.semcompInscricao.count(),
        this.prisma.semcompInscricao.groupBy({
          by: ['even3Status'],
          _count: { _all: true },
        }),
        this.prisma.semcompAtividade.findMany({
          orderBy: [{ inicio: 'asc' }, { titulo: 'asc' }],
          include: {
            _count: { select: { escolhas: true } },
            escolhas: { where: { presente: true }, select: { id: true } },
          },
        }),
        this.prisma.semcompEscolha.count({
          where: { presente: true, even3Checkin: false },
        }),
      ]);

    const status = Object.fromEntries(
      porStatus.map((s) => [s.even3Status, s._count._all]),
    ) as Record<string, number>;

    const dias: Array<{ rotulo: string; atividades: unknown[] }> = [];
    for (const a of atividades) {
      const rotulo = rotuloDia(a.inicio);
      let dia = dias.find((d) => d.rotulo === rotulo);
      if (!dia) {
        dia = { rotulo, atividades: [] };
        dias.push(dia);
      }
      dia.atividades.push({
        id: a.id,
        tipo: a.tipo,
        titulo: a.titulo,
        quem: a.quem,
        hora: hora(a.inicio),
        horaFim: hora(a.fim),
        vagas: a.vagas,
        ocupadas: a._count.escolhas,
        presentes: a.escolhas.length,
        aberta: a.aberta,
        even3SessionId: a.even3SessionId,
      });
    }

    return {
      total,
      status: {
        vinculado: status.vinculado ?? 0,
        enviado: status.enviado ?? 0,
        pendente: status.pendente ?? 0,
        erro: status.erro ?? 0,
      },
      dias,
      presencasPendentes,
      semSessao: atividades.filter((a) => !a.even3SessionId).length,
    };
  }

  async atividadeComInscritos(id: number) {
    const atividade = await this.prisma.semcompAtividade.findUnique({
      where: { id },
      include: {
        escolhas: {
          include: { inscricao: true },
          orderBy: { inscricao: { nome: 'asc' } },
        },
      },
    });
    if (!atividade) throw new NotFoundException('Atividade não encontrada.');
    return {
      ...atividade,
      rotuloDia: rotuloDia(atividade.inicio),
      hora: hora(atividade.inicio),
      horaFim: hora(atividade.fim),
    };
  }

  async atividade(id: number) {
    const a = await this.prisma.semcompAtividade.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Atividade não encontrada.');
    return a;
  }

  async salvarAtividade(
    id: number | null,
    dados: Omit<SemcompAtividade, 'id' | 'criadoEm'>,
  ) {
    if (dados.fim <= dados.inicio) {
      throw new BadRequestException('O fim tem de ser depois do começo.');
    }
    if (dados.vagas != null && id != null) {
      const ocupadas = await this.prisma.semcompEscolha.count({
        where: { atividadeId: id },
      });
      if (dados.vagas < ocupadas) {
        throw new BadRequestException(
          `Já há ${ocupadas} pessoas inscritas; o limite não pode ficar abaixo disso.`,
        );
      }
    }
    return id == null
      ? this.prisma.semcompAtividade.create({ data: dados })
      : this.prisma.semcompAtividade.update({ where: { id }, data: dados });
  }

  async excluirAtividade(id: number) {
    await this.prisma.semcompAtividade.delete({ where: { id } });
  }

  async marcarPresenca(escolhaId: number, presente: boolean) {
    const escolha = await this.prisma.semcompEscolha.update({
      where: { id: escolhaId },
      data: presente
        ? { presente: true, presencaEm: new Date() }
        : { presente: false, presencaEm: null },
      include: { inscricao: true, atividade: true },
    });

    // A presença vai ao Even3 na hora, quando já dá; senão fica para o
    // "Enviar presenças" do painel. Tirar a presença não desfaz lá: a API
    // não tem esse caminho, e o painel avisa.
    if (
      presente &&
      !escolha.even3Checkin &&
      this.even3.ativo &&
      escolha.inscricao.even3Id &&
      escolha.atividade.even3SessionId
    ) {
      try {
        await this.even3.registrarPresencas([
          {
            idParticipante: escolha.inscricao.even3Id,
            idSessao: escolha.atividade.even3SessionId,
            em: new Date(),
          },
        ]);
        await this.prisma.semcompEscolha.update({
          where: { id: escolha.id },
          data: { even3Checkin: true },
        });
      } catch (erro) {
        this.logger.warn(
          `Presença ${escolha.id} não foi ao Even3 agora: ${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
    return escolha;
  }

  async inscritos() {
    return this.prisma.semcompInscricao.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        escolhas: {
          include: { atividade: true },
          orderBy: { atividade: { inicio: 'asc' } },
        },
      },
    });
  }

  async csvInscritos() {
    const lista = await this.inscritos();
    return toCsv([
      [
        'Nome',
        'Crachá',
        'E-mail',
        'Instituição',
        'Inscrito em',
        'Even3',
        'Atividades',
      ],
      ...lista.map((i) => [
        i.nome,
        i.nomeCracha ?? '',
        i.email,
        i.instituicao,
        i.criadoEm.toISOString(),
        i.even3Status,
        i.escolhas
          .map(
            (e) =>
              `${rotuloDia(e.atividade.inicio)} ${hora(e.atividade.inicio)} ${e.atividade.titulo}`,
          )
          .join(' | '),
      ]),
    ]);
  }

  async csvAtividade(id: number) {
    const a = await this.atividadeComInscritos(id);
    return {
      nome: a.titulo,
      csv: toCsv([
        ['Nome', 'Crachá', 'E-mail', 'Instituição', 'Presente'],
        ...a.escolhas.map((e) => [
          e.inscricao.nome,
          e.inscricao.nomeCracha ?? '',
          e.inscricao.email,
          e.inscricao.instituicao,
          e.presente ? 'sim' : '',
        ]),
      ]),
    };
  }
}
