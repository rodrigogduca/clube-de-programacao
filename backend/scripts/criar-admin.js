/**
 * Cria o PRIMEIRO administrador — o único que não dá para criar pela interface.
 *
 * Por que precisa existir: todo caminho de cadastro do sistema exige alguém já
 * autenticado. `MembersService.create` recusa sem um ator com permissão, e a
 * solicitação de cadastro nasce pendente esperando aprovação de um membro da
 * diretoria. Num banco vazio isso é um impasse: o site sobe e ninguém entra.
 *
 * Roda uma vez, na implantação. Depois disso os membros entram pelo diretório
 * ou pela fila de solicitações, como devem.
 *
 * USO — pergunta o que falta:
 *
 *     cd backend
 *     node scripts/criar-admin.js
 *
 * Contra o banco de produção, passe a URL na frente (use a conexão DIRETA,
 * porta 5432 — não a do pooler):
 *
 *     DATABASE_URL="postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres" \
 *       node scripts/criar-admin.js
 *
 * A senha é lida sem eco e nunca vai para o histórico do shell. Se preferir
 * automatizar, as variáveis ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_SENHA,
 * ADMIN_NOME, ADMIN_SOBRENOME e ADMIN_CARGO substituem as perguntas.
 *
 * O hash é bcrypt com o mesmo custo que o app usa (BCRYPT_ROUNDS, padrão 12),
 * então a senha criada aqui funciona no login sem nenhum passo de conversão.
 */
const readline = require('node:readline');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// So estes dois passam em `is_admin` (ver members.service.ts).
const CARGOS_ADMIN = ['presidente', 'administrador'];

function perguntar(rl, texto, padrao) {
  return new Promise((resolve) => {
    const rotulo = padrao ? `${texto} [${padrao}]: ` : `${texto}: `;
    rl.question(rotulo, (resposta) => resolve(resposta.trim() || padrao || ''));
  });
}

/**
 * Lê sem eco. O `_writeToOutput` vazio é o jeito de calar o readline sem
 * depender de pacote externo — sem isso a senha fica na tela e, dependendo do
 * terminal, no scrollback.
 */
function perguntarSenha(rl, texto) {
  return new Promise((resolve) => {
    const escreverOriginal = rl._writeToOutput;
    rl._writeToOutput = () => {};
    rl.question(`${texto}: `, (resposta) => {
      rl._writeToOutput = escreverOriginal;
      rl.output.write('\n');
      resolve(resposta);
    });
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL nao esta definida. Rode de dentro de backend/ (o .env e lido)\n' +
        'ou passe a URL na frente do comando.',
    );
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const username = process.env.ADMIN_USERNAME || (await perguntar(rl, 'Usuario'));
  const email = process.env.ADMIN_EMAIL || (await perguntar(rl, 'E-mail'));
  const firstName = process.env.ADMIN_NOME || (await perguntar(rl, 'Nome'));
  const lastName =
    process.env.ADMIN_SOBRENOME ?? (await perguntar(rl, 'Sobrenome (opcional)'));
  const cargo =
    process.env.ADMIN_CARGO || (await perguntar(rl, 'Cargo', 'presidente'));
  const senha = process.env.ADMIN_SENHA || (await perguntarSenha(rl, 'Senha'));

  rl.close();

  if (!username || !email || !firstName || !senha) {
    console.error('\nUsuario, e-mail, nome e senha sao obrigatorios.');
    process.exit(1);
  }
  if (senha.length < 8) {
    console.error('\nA senha precisa de pelo menos 8 caracteres.');
    process.exit(1);
  }
  if (!CARGOS_ADMIN.includes(cargo)) {
    console.error(
      `\nCargo "${cargo}" nao da acesso administrativo. Use: ${CARGOS_ADMIN.join(' ou ')}.`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const jaExiste = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (jaExiste) {
      // Nao sobrescreve: um script de bootstrap que troca a senha de uma conta
      // existente e uma porta dos fundos, nao uma conveniencia.
      console.error(
        `\nJa existe usuario com esse ${jaExiste.username === username ? 'usuario' : 'e-mail'}. ` +
          'Nada foi alterado.',
      );
      process.exit(1);
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const passwordHash = await bcrypt.hash(
      senha,
      Number.isFinite(rounds) && rounds > 3 ? rounds : 12,
    );

    // Numa transacao: um `User` sem `Member` passa no login e quebra em toda
    // tela do painel, porque o contexto das paginas espera o membro.
    const membro = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username, email, firstName, lastName: lastName || null, passwordHash },
      });
      return tx.member.create({ data: { userId: user.id, cargo } });
    });

    const total = await prisma.member.count();
    console.log(
      `\nCriado: ${username} (${cargo}), membro #${membro.id}.\n` +
        `O banco tem ${total} membro${total === 1 ? '' : 's'}.\n` +
        'Entre em /accounts/login e cadastre o resto do clube pelo diretorio.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error('\nFalhou:', erro.message);
  process.exit(1);
});
