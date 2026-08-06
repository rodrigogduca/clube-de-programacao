import { CSV_DELIMITADOR_SAIDA, normalizarChave, parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('le um arquivo simples separado por virgula', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('detecta o ponto-e-virgula do Excel em pt-BR', () => {
    expect(parseCsv('titulo;status\nEstudar;pendente')).toEqual([
      ['titulo', 'status'],
      ['Estudar', 'pendente'],
    ]);
  });

  it('detecta tabulacao', () => {
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('nao quebra o campo no delimitador que esta entre aspas', () => {
    expect(parseCsv('titulo;descricao\n"Ler;revisar";ok')).toEqual([
      ['titulo', 'descricao'],
      ['Ler;revisar', 'ok'],
    ]);
  });

  it('preserva quebra de linha dentro de aspas', () => {
    expect(parseCsv('a;b\n"linha 1\nlinha 2";x')).toEqual([
      ['a', 'b'],
      ['linha 1\nlinha 2', 'x'],
    ]);
  });

  it('converte "" em uma aspa literal', () => {
    expect(parseCsv('a\n"diz ""oi"""')).toEqual([['a'], ['diz "oi"']]);
  });

  it('aceita CRLF', () => {
    expect(parseCsv('a;b\r\n1;2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('descarta o BOM do Excel', () => {
    expect(parseCsv('﻿a;b\n1;2')[0]).toEqual(['a', 'b']);
  });

  it('ignora linhas em branco no fim do arquivo', () => {
    expect(parseCsv('a;b\n1;2\n\n;\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('mantem campos vazios no meio da linha', () => {
    expect(parseCsv('a;b;c\n1;;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('devolve lista vazia para entrada em branco', () => {
    expect(parseCsv('   ')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('escreve com BOM e CRLF', () => {
    expect(toCsv([['a', 'b']])).toBe('﻿a;b\r\n');
  });

  it('poe aspas quando o valor contem o delimitador', () => {
    expect(toCsv([['x;y']])).toBe('﻿"x;y"\r\n');
  });

  it('duplica as aspas internas', () => {
    expect(toCsv([['diz "oi"']])).toBe('﻿"diz ""oi"""\r\n');
  });

  it('trata null e undefined como campo vazio', () => {
    expect(toCsv([[null, undefined, 0]])).toBe('﻿;;0\r\n');
  });

  it('sobrevive ao ciclo escrever -> ler', () => {
    const original = [
      ['titulo', 'descricao', 'prazo'],
      ['Ler;revisar', 'diz "oi"\nem duas linhas', '2026-08-01'],
      ['Sem descricao', '', ''],
    ];

    const lido = parseCsv(toCsv(original, CSV_DELIMITADOR_SAIDA));

    expect(lido).toEqual(original);
  });
});

describe('normalizarChave', () => {
  it('iguala rotulo exibido e valor do enum', () => {
    expect(normalizarChave('Em Andamento')).toBe('em_andamento');
    expect(normalizarChave('em_andamento')).toBe('em_andamento');
    expect(normalizarChave('  EM   ANDAMENTO ')).toBe('em_andamento');
  });

  it('remove acentos', () => {
    expect(normalizarChave('Gestão')).toBe('gestao');
    expect(normalizarChave('Média')).toBe('media');
    expect(normalizarChave('Título')).toBe('titulo');
  });
});
