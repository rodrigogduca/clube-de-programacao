/**
 * Leitura e escrita de CSV seguindo a RFC 4180, sem dependencia externa.
 *
 * O importador precisa aceitar o arquivo que o usuario realmente tem em maos,
 * e nao um formato canonico: planilha exportada do Excel em pt-BR usa `;`,
 * ferramentas em ingles usam `,`, e as duas coisas aparecem com e sem BOM.
 * Por isso o delimitador e detectado do cabecalho em vez de ser fixo.
 */

const BOM = '\ufeff';

/** Primeira linha logica: quebras dentro de aspas nao terminam a linha. */
function primeiraLinha(texto: string): string {
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];

    if (ch === '"') {
      if (dentroDeAspas && texto[i + 1] === '"') {
        i++;
        continue;
      }
      dentroDeAspas = !dentroDeAspas;
      continue;
    }

    if (!dentroDeAspas && (ch === '\n' || ch === '\r')) {
      return texto.slice(0, i);
    }
  }

  return texto;
}

function contarFora(linha: string, delimitador: string): number {
  let dentroDeAspas = false;
  let total = 0;

  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];

    if (ch === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        i++;
        continue;
      }
      dentroDeAspas = !dentroDeAspas;
      continue;
    }

    if (!dentroDeAspas && ch === delimitador) {
      total++;
    }
  }

  return total;
}

/** Vence quem mais aparece no cabecalho; empate em zero cai no padrao `;`. */
function detectarDelimitador(cabecalho: string): string {
  const candidatos = [';', ',', '\t'];
  let melhor = ';';
  let maior = 0;

  for (const candidato of candidatos) {
    const total = contarFora(cabecalho, candidato);
    if (total > maior) {
      maior = total;
      melhor = candidato;
    }
  }

  return melhor;
}

/** Delimitador usado na exportacao: Excel em pt-BR abre `;` em colunas separadas. */
export const CSV_DELIMITADOR_SAIDA = ';';

export function parseCsv(entrada: string): string[][] {
  const texto = entrada.startsWith(BOM) ? entrada.slice(1) : entrada;
  if (texto.trim() === '') {
    return [];
  }

  const delimitador = detectarDelimitador(primeiraLinha(texto));

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let dentroDeAspas = false;
  let campoIniciado = false;

  const fecharCampo = () => {
    linha.push(campo);
    campo = '';
    campoIniciado = false;
  };

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];

    if (dentroDeAspas) {
      if (ch === '"') {
        // `""` dentro de um campo entre aspas representa uma aspa literal.
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }

    // Aspas so abrem campo citado se vierem antes de qualquer caractere dele.
    if (ch === '"' && !campoIniciado) {
      dentroDeAspas = true;
      campoIniciado = true;
      continue;
    }

    if (ch === delimitador) {
      fecharCampo();
      continue;
    }

    // CRLF: o \r e ignorado e o \n fecha a linha.
    if (ch === '\r') {
      continue;
    }

    if (ch === '\n') {
      fecharCampo();
      linhas.push(linha);
      linha = [];
      continue;
    }

    campo += ch;
    campoIniciado = true;
  }

  if (campoIniciado || campo !== '' || linha.length > 0) {
    fecharCampo();
    linhas.push(linha);
  }

  // Planilhas costumam deixar linhas em branco no fim do arquivo.
  return linhas.filter((atual) => atual.some((celula) => celula.trim() !== ''));
}

export type CelulaCsv = string | number | null | undefined;

export function toCsv(
  linhas: CelulaCsv[][],
  delimitador = CSV_DELIMITADOR_SAIDA,
): string {
  const escapar = (valor: CelulaCsv) => {
    const texto = valor == null ? '' : String(valor);
    const precisaAspas =
      texto.includes(delimitador) ||
      texto.includes('"') ||
      texto.includes('\n') ||
      texto.includes('\r') ||
      texto !== texto.trim();

    return precisaAspas ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const corpo = linhas
    .map((linha) => linha.map(escapar).join(delimitador))
    .join('\r\n');

  // O BOM faz o Excel reconhecer UTF-8 e nao estragar os acentos.
  return `${BOM}${corpo}\r\n`;
}

/**
 * Reduz um texto a uma chave comparavel: sem acento, minusculo, com `_` no
 * lugar dos espacos. Faz "Em Andamento", "em andamento" e "em_andamento"
 * virarem a mesma coisa, o que e o que permite aceitar tanto o valor do enum
 * quanto o rotulo exibido na tela.
 */
export function normalizarChave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}
