import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Cargo } from '@prisma/client';
import { normalizarChave, parseCsv, toCsv } from '../common/csv';
import { PrismaService } from '../database/prisma.service';
import {
  FuncaoLabel,
  PODE_GERIR_TAREFAS,
  PrioridadeLabel,
  StatusLabel,
} from './tasks.service';

/**
 * Importacao e exportacao de tarefas em CSV.
 *
 * A exportacao escreve exatamente as colunas que a importacao le, entao o
 * arquivo baixado pode ser editado na planilha e devolvido sem tratamento.
 * A coluna `id` e o que diferencia atualizar de criar no reenvio.
 */

/** Ordem das colunas no arquivo exportado. */
const COLUNAS = [
  'id',
  'titulo',
  'descricao',
  'responsavel',
  'setor',
  'status',
  'prioridade',
  'funcao',
  'projeto',
  'prazo',
] as const;

/**
 * Nomes alternativos de cabecalho aceitos na importacao. A chave e o cabecalho
 * ja normalizado; acentos e maiusculas nao precisam entrar aqui porque
 * `normalizarChave` cuida deles ("Título" ja chega como "titulo").
 */
const ALIASES: Record<string, string> = {
  tarefa: 'titulo',
  nome: 'titulo',
  title: 'titulo',
  description: 'descricao',
  detalhes: 'descricao',
  membro: 'responsavel',
  responsavel_username: 'responsavel',
  usuario: 'responsavel',
  assignee: 'responsavel',
  area: 'setor',
  sector: 'setor',
  situacao: 'status',
  priority: 'prioridade',
  role: 'funcao',
  project: 'projeto',
  data_limite: 'prazo',
  deadline: 'prazo',
  vencimento: 'prazo',
};

/** Teto para nao deixar um arquivo gigante ocupar o processo inteiro. */
const MAX_LINHAS = 2000;

type ResultadoImportacao = {
  criadas: number;
  atualizadas: number;
  erros: Array<{ linha: number; motivo: string }>;
};

/**
 * Aceita tanto o valor do enum quanto o rotulo mostrado na tela, porque o
 * usuario edita a planilha vendo "Em Andamento" e nao "em_andamento".
 */
function mapaDeRotulos(labels: Record<string, string>): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [valor, label] of Object.entries(labels)) {
    mapa.set(normalizarChave(valor), valor);
    mapa.set(normalizarChave(label), valor);
  }
  return mapa;
}

const MAPA_STATUS = mapaDeRotulos(StatusLabel);
const MAPA_PRIORIDADE = mapaDeRotulos(PrioridadeLabel);
const MAPA_FUNCAO = mapaDeRotulos(FuncaoLabel);

function nomeCompleto(user: {
  firstName: string;
  lastName: string | null;
  username: string;
}) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username
  );
}

function formatarData(valor: Date | null): string {
  if (!valor) return '';
  const dia = String(valor.getUTCDate()).padStart(2, '0');
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${valor.getUTCFullYear()}`;
}

/**
 * Aceita `dd/mm/aaaa` (o que a planilha em pt-BR produz) e `aaaa-mm-dd`.
 * Usa UTC para a data nao andar um dia por causa do fuso.
 */
function lerData(bruto: string): Date {
  const texto = bruto.trim();

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]);
    const ano = Number(br[3]);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    // Rejeita 31/02: o Date rolaria para marco em silencio.
    if (
      data.getUTCDate() === dia &&
      data.getUTCMonth() === mes - 1 &&
      data.getUTCFullYear() === ano
    ) {
      return data;
    }
    throw new Error(`prazo "${texto}" não existe no calendario`);
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) {
    const data = new Date(`${texto}T00:00:00.000Z`);
    if (!Number.isNaN(data.getTime())) {
      return data;
    }
  }

  throw new Error(`prazo "${texto}" inválido (use dd/mm/aaaa ou aaaa-mm-dd)`);
}

function lerEscolha(
  bruto: string,
  mapa: Map<string, string>,
  campo: string,
): string {
  const valor = mapa.get(normalizarChave(bruto));
  if (!valor) {
    const aceitos = [...new Set(mapa.values())].join(', ');
    throw new Error(`${campo} "${bruto.trim()}" inválido (aceita: ${aceitos})`);
  }
  return valor;
}

@Injectable()
export class TasksCsvService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPodeGerir(cargo?: Cargo | null) {
    if (!cargo || !PODE_GERIR_TAREFAS.includes(cargo)) {
      throw new ForbiddenException(
        'Você não tem permissão para importar ou exportar tarefas.',
      );
    }
  }

  // ------------------------------------------------------------- exportacao

  async exportar(cargo?: Cargo | null): Promise<string> {
    this.assertPodeGerir(cargo);

    const tarefas = await this.prisma.task.findMany({
      include: {
        responsavel: { include: { user: true } },
        setor: true,
      },
      orderBy: { id: 'asc' },
    });

    const linhas: Array<Array<string | number | null>> = [[...COLUNAS]];

    for (const tarefa of tarefas) {
      linhas.push([
        tarefa.id,
        tarefa.titulo,
        tarefa.descricao ?? '',
        tarefa.responsavel?.user?.username ?? '',
        tarefa.setor?.nome ?? '',
        StatusLabel[tarefa.status] ?? tarefa.status,
        PrioridadeLabel[tarefa.prioridade] ?? tarefa.prioridade,
        tarefa.funcao ? (FuncaoLabel[tarefa.funcao] ?? tarefa.funcao) : '',
        tarefa.projeto ?? '',
        formatarData(tarefa.prazo),
      ]);
    }

    return toCsv(linhas);
  }

  /** Arquivo de exemplo para quem nunca exportou e quer o formato certo. */
  modelo(cargo?: Cargo | null): string {
    this.assertPodeGerir(cargo);

    return toCsv([
      [...COLUNAS],
      [
        '',
        'Revisar o layout da home',
        'Ajustar espacamento do cabecalho',
        'joao.silva',
        'Design',
        'Pendente',
        'Alta',
        'Design',
        'Site 2026',
        '15/08/2026',
      ],
    ]);
  }

  // ------------------------------------------------------------- importacao

  async importar(
    conteudo: string,
    actor: { id: number; cargo: Cargo },
  ): Promise<ResultadoImportacao> {
    this.assertPodeGerir(actor.cargo);

    const linhas = parseCsv(conteudo);
    if (linhas.length === 0) {
      throw new BadRequestException('O arquivo CSV está vazio.');
    }
    if (linhas.length - 1 > MAX_LINHAS) {
      throw new BadRequestException(
        `O arquivo tem ${linhas.length - 1} tarefas; o limite por importação é ${MAX_LINHAS}.`,
      );
    }

    const cabecalho = linhas[0].map((celula) => {
      const chave = normalizarChave(celula);
      return ALIASES[chave] ?? chave;
    });

    const coluna = (nome: string) => cabecalho.indexOf(nome);
    const indices = {
      id: coluna('id'),
      titulo: coluna('titulo'),
      descricao: coluna('descricao'),
      responsavel: coluna('responsavel'),
      setor: coluna('setor'),
      status: coluna('status'),
      prioridade: coluna('prioridade'),
      funcao: coluna('funcao'),
      projeto: coluna('projeto'),
      prazo: coluna('prazo'),
    };

    if (indices.titulo < 0 || indices.responsavel < 0) {
      throw new BadRequestException(
        'O CSV precisa ter as colunas "titulo" e "responsável". ' +
          `Cabecalho encontrado: ${cabecalho.join(', ') || '(vazio)'}.`,
      );
    }

    const [membros, setores] = await Promise.all([
      this.prisma.member.findMany({ include: { user: true } }),
      this.prisma.sector.findMany(),
    ]);

    // Um membro pode ser referenciado por username, e-mail ou nome completo.
    // Nome completo pode repetir, entao guarda-se o conflito para avisar em
    // vez de escolher um dos dois em silencio.
    const porMembro = new Map<string, number | 'ambiguo'>();
    const registrar = (chave: string, id: number) => {
      const normalizado = normalizarChave(chave);
      if (!normalizado) return;
      const atual = porMembro.get(normalizado);
      if (atual === undefined) {
        porMembro.set(normalizado, id);
      } else if (atual !== id) {
        porMembro.set(normalizado, 'ambiguo');
      }
    };

    for (const membro of membros) {
      if (!membro.user) continue;
      registrar(membro.user.username, membro.id);
      registrar(membro.user.email, membro.id);
      registrar(nomeCompleto(membro.user), membro.id);
    }

    const porSetor = new Map<string, number>();
    for (const setor of setores) {
      porSetor.set(normalizarChave(setor.nome), setor.id);
      porSetor.set(String(setor.id), setor.id);
    }

    // De onde sai o setor de cada tarefa importada: o do responsavel.
    const setorPorMembro = new Map<number, number | null>();
    for (const membro of membros) {
      setorPorMembro.set(membro.id, membro.setorId);
    }

    const celula = (linha: string[], indice: number) =>
      indice >= 0 ? (linha[indice] ?? '').trim() : '';

    const resultado: ResultadoImportacao = {
      criadas: 0,
      atualizadas: 0,
      erros: [],
    };

    for (let i = 1; i < linhas.length; i++) {
      // +1 porque a planilha conta a partir de 1 e a primeira linha e o cabecalho.
      const numeroLinha = i + 1;
      const linha = linhas[i];

      try {
        const titulo = celula(linha, indices.titulo);
        if (!titulo) {
          throw new Error('titulo vazio');
        }

        const responsavelBruto = celula(linha, indices.responsavel);
        if (!responsavelBruto) {
          throw new Error('responsável vazio');
        }
        const responsavel = porMembro.get(normalizarChave(responsavelBruto));
        if (responsavel === undefined) {
          throw new Error(
            `responsável "${responsavelBruto}" não encontrado (use o username, e-mail ou nome completo de um membro)`,
          );
        }
        if (responsavel === 'ambiguo') {
          throw new Error(
            `responsável "${responsavelBruto}" corresponde a mais de um membro; use o username`,
          );
        }

        /*
         * O SETOR SEGUE O RESPONSAVEL, igual ao TasksService.
         *
         * A coluna `setor` do CSV continua sendo lida e VALIDADA — um setor
         * inexistente ainda e erro de linha, senao o arquivo exportado voltaria
         * com typos passando batido. Mas o valor gravado e o setor de quem
         * assume: importar nao pode ser a porta dos fundos para uma regra que
         * o formulario aplica.
         */
        const setorBruto = celula(linha, indices.setor);
        if (setorBruto && porSetor.get(normalizarChave(setorBruto)) === undefined) {
          throw new Error(`setor "${setorBruto}" não existe`);
        }
        const setorId = setorPorMembro.get(responsavel) ?? null;

        const statusBruto = celula(linha, indices.status);
        const prioridadeBruta = celula(linha, indices.prioridade);
        const funcaoBruta = celula(linha, indices.funcao);
        const prazoBruto = celula(linha, indices.prazo);

        const dados = {
          titulo,
          descricao: celula(linha, indices.descricao) || null,
          responsavelId: responsavel,
          setorId,
          projeto: celula(linha, indices.projeto) || null,
          status: statusBruto
            ? (lerEscolha(statusBruto, MAPA_STATUS, 'status') as never)
            : ('pendente' as never),
          prioridade: prioridadeBruta
            ? (lerEscolha(
                prioridadeBruta,
                MAPA_PRIORIDADE,
                'prioridade',
              ) as never)
            : ('media' as never),
          funcao: funcaoBruta
            ? (lerEscolha(funcaoBruta, MAPA_FUNCAO, 'funcao') as never)
            : null,
          prazo: prazoBruto ? lerData(prazoBruto) : null,
        };

        // `id` preenchido e apontando para tarefa existente atualiza; qualquer
        // outra coisa cria. Assim o arquivo exportado volta sem duplicar nada.
        const idBruto = celula(linha, indices.id);
        if (idBruto) {
          const id = Number(idBruto);
          if (!Number.isInteger(id) || id <= 0) {
            throw new Error(`id "${idBruto}" inválido`);
          }
          const existente = await this.prisma.task.findUnique({
            where: { id },
            select: { id: true },
          });
          if (existente) {
            await this.prisma.task.update({ where: { id }, data: dados });
            resultado.atualizadas++;
            continue;
          }
        }

        await this.prisma.task.create({
          data: { ...dados, criadoPorId: actor.id },
        });
        resultado.criadas++;
      } catch (error) {
        resultado.erros.push({
          linha: numeroLinha,
          motivo: error instanceof Error ? error.message : 'erro desconhecido',
        });
      }
    }

    if (
      resultado.criadas === 0 &&
      resultado.atualizadas === 0 &&
      resultado.erros.length > 0
    ) {
      const detalhe = resultado.erros
        .slice(0, 5)
        .map((erro) => `linha ${erro.linha}: ${erro.motivo}`)
        .join('; ');
      const resto =
        resultado.erros.length > 5
          ? ` (e mais ${resultado.erros.length - 5})`
          : '';
      throw new BadRequestException(
        `Nenhuma tarefa foi importada. ${detalhe}${resto}`,
      );
    }

    return resultado;
  }

  // ------------------------------------------------------------------ limpar

  /** Apaga todas as tarefas. Os anexos caem por cascade do schema. */
  async limparTudo(cargo?: Cargo | null): Promise<number> {
    if (
      !cargo ||
      !(['presidente', 'vice_presidente', 'administrador'] as Cargo[]).includes(
        cargo,
      )
    ) {
      throw new ForbiddenException(
        'Apenas presidencia e administracao podem limpar todas as tarefas.',
      );
    }

    const { count } = await this.prisma.task.deleteMany({});
    return count;
  }
}
