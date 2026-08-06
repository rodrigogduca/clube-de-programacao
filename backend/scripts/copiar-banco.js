/**
 * Copia todos os dados de um banco do projeto para outro.
 *
 * Escrito para a mudança de projeto Supabase: o banco novo (o do pooler que vai
 * para a Vercel) precisa nascer com os membros, setores e solicitações do
 * antigo.
 *
 * USO — as duas URLs, sempre as DIRETAS (porta 5432), nunca a do pooler:
 *
 *     cd backend
 *     ORIGEM="postgresql://postgres:SENHA@db.REF_ANTIGO.supabase.co:5432/postgres" \
 *     DESTINO="postgresql://postgres:SENHA@db.REF_NOVO.supabase.co:5432/postgres" \
 *       node scripts/copiar-banco.js
 *
 * Acrescente `--executar` para gravar. Sem ele o script só lê os dois lados e
 * mostra o que faria — que é como se confere uma cópia de banco antes de
 * confiar nela.
 *
 *
 * O QUE ELE GARANTE
 *
 * 1. ORDEM. As tabelas são copiadas na ordem das chaves estrangeiras: setor
 *    antes de membro, membro antes de tarefa, tarefa antes de anexo. Fora dessa
 *    ordem o Postgres recusa a linha e a cópia sai pela metade.
 *
 * 2. IDs PRESERVADOS. As linhas vão com o `id` original. É o que mantém os
 *    vínculos de pé sem tabela de tradução — e é por isso que o destino precisa
 *    estar vazio.
 *
 * 3. SEQUÊNCIAS CORRIGIDAS. Inserir id explícito não move o contador do
 *    Postgres. Sem o `setval` do fim, o primeiro cadastro feito pela interface
 *    tentaria o id 1 e morreria com "duplicate key value violates unique
 *    constraint" — o erro clássico de quem restaura banco e esquece disso.
 *
 * 4. DESTINO VAZIO. Se houver qualquer linha do outro lado, o script para antes
 *    de escrever. Mesclar dois bancos com ids que se sobrepõem não é algo que
 *    se faça sem olhar.
 *
 * Não copia o schema: rode `npx prisma db push` contra o destino antes.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

/**
 * Le `backend/.env` para dentro do process.env.
 *
 * Existe para nao obrigar ninguem a montar uma linha de comando com duas URLs
 * de banco e duas senhas dentro — que e onde erro de aspas e de escape
 * acontece, e onde senha vaza para o historico do shell. Com isto, basta ter
 * ORIGEM e DESTINO no .env (que ja e ignorado pelo git) e rodar o script sem
 * argumento nenhum.
 *
 * Variavel que ja exista no ambiente vence a do arquivo: quem passa na frente
 * do comando esta sendo explicito, e explicito ganha.
 *
 * Parser proprio, de proposito: sao tres regras (comentario, linha vazia,
 * chave=valor com aspas opcionais) e o projeto nao tem dotenv como dependencia
 * direta.
 */
function carregarEnv() {
  const arquivo = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(arquivo)) {
    return;
  }
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual < 1) continue;
    const chave = limpa.slice(0, igual).trim();
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = limpa
      .slice(igual + 1)
      .trim()
      .replace(/^["'](.*)["']$/, '$1');
  }
}

carregarEnv();

// Ordem de dependencia. Nao reordene sem olhar as FKs no schema.prisma.
const TABELAS = [
  { modelo: 'sector', tabela: 'sectors', rotulo: 'setores' },
  { modelo: 'user', tabela: 'users', rotulo: 'usuarios' },
  { modelo: 'member', tabela: 'members', rotulo: 'membros' },
  { modelo: 'task', tabela: 'tasks', rotulo: 'tarefas' },
  { modelo: 'taskAttachment', tabela: 'task_attachments', rotulo: 'anexos' },
  { modelo: 'signupRequest', tabela: 'signup_requests', rotulo: 'solicitacoes' },
];

const executar = process.argv.includes('--executar');

function exigir(nome, alternativa) {
  // DESTINO cai no DATABASE_URL: o banco novo ja e o que o .env aponta.
  const valor = process.env[nome] ?? (alternativa ? process.env[alternativa] : undefined);
  if (!valor) {
    console.error(
      `Falta a variavel ${nome}.\n` +
        `Acrescente uma linha assim no fim de backend/.env:\n\n` +
        `  ${nome}="postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres"\n`,
    );
    process.exit(1);
  }
  if (valor.includes(':6543')) {
    console.error(
      `${nome} aponta para o pooler (6543). Use a conexao DIRETA (5432): ` +
        'o pooler em modo transaction atrapalha lote grande e DDL.',
    );
    process.exit(1);
  }
  return valor;
}

async function main() {
  const origem = new PrismaClient({
    datasources: { db: { url: exigir('ORIGEM') } },
  });
  const destino = new PrismaClient({
    datasources: { db: { url: exigir('DESTINO', 'DATABASE_URL') } },
  });

  try {
    console.log(executar ? 'MODO GRAVACAO\n' : 'SIMULACAO (use --executar para gravar)\n');
    console.log('tabela          origem  destino');
    console.log('------------------------------');

    const dados = {};
    let destinoSujo = false;

    for (const { modelo, rotulo } of TABELAS) {
      const linhas = await origem[modelo].findMany();
      const jaTem = await destino[modelo].count();
      dados[modelo] = linhas;
      if (jaTem > 0) destinoSujo = true;
      console.log(
        `${rotulo.padEnd(14)} ${String(linhas.length).padStart(6)}  ${String(jaTem).padStart(7)}`,
      );
    }

    if (destinoSujo) {
      console.error(
        '\nO destino nao esta vazio. Este script copia com os ids originais e ' +
          'so funciona em banco limpo.\nApague os dados do destino ou use outro ' +
          'projeto. Nada foi escrito.',
      );
      process.exit(1);
    }

    if (!executar) {
      console.log('\nNada foi escrito. Repita com --executar para copiar.');
      return;
    }

    console.log('\ncopiando...');
    for (const { modelo, rotulo } of TABELAS) {
      const linhas = dados[modelo];
      if (!linhas.length) {
        console.log(`  ${rotulo}: nada a copiar`);
        continue;
      }
      // `skipDuplicates` nao: se houver duplicata aqui, algo esta errado e e
      // melhor estourar do que copiar pela metade em silencio.
      const { count } = await destino[modelo].createMany({ data: linhas });
      console.log(`  ${rotulo}: ${count}`);
    }

    // As sequencias nao andam com id explicito. Sem isto o proximo INSERT da
    // interface tenta o id 1.
    console.log('\nacertando as sequencias...');
    for (const { tabela } of TABELAS) {
      await destino.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${tabela}"', 'id'),
                       COALESCE((SELECT MAX(id) FROM "${tabela}"), 1),
                       (SELECT COUNT(*) FROM "${tabela}") > 0)`,
      );
    }

    console.log('\nconferindo o destino:');
    for (const { modelo, rotulo } of TABELAS) {
      const n = await destino[modelo].count();
      const esperado = dados[modelo].length;
      console.log(
        `  ${rotulo.padEnd(14)} ${String(n).padStart(4)} ` +
          (n === esperado ? 'ok' : `ESPERAVA ${esperado}`),
      );
    }
  } finally {
    await origem.$disconnect();
    await destino.$disconnect();
  }
}

main().catch((erro) => {
  console.error('\nFalhou:', erro.message);
  process.exit(1);
});
