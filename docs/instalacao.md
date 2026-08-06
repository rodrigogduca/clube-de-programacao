# Instalação

## Pré-requisitos

- Node.js 20 LTS ou superior
- npm 10 ou superior
- Um banco PostgreSQL acessível (Supabase, Neon, Docker local, etc.)

## Passo a passo

Todos os comandos rodam dentro de `backend/`.

```bash
cd backend
npm install
```

### 1. Variáveis de ambiente

```bash
# Windows (PowerShell ou cmd)
copy .env.example .env

# Linux / macOS
cp .env.example .env
```

Só duas variáveis são obrigatórias para a aplicação subir:

- `DATABASE_URL` — string de conexão do PostgreSQL
- `SESSION_SECRET` — **mínimo de 32 caracteres**; com menos que isso o
  `iron-session` derruba a aplicação no boot

Gere um segredo forte:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Todo o resto é opcional. Veja [Configuração](configuracao.md) para o que fica
desativado sem cada variável.

### 2. Cliente do Prisma

```bash
npm run prisma:generate
```

### 3. Schema no banco

O repositório **não tem pasta `prisma/migrations`**. Portanto:

```bash
# Banco novo ou de desenvolvimento: aplica o schema direto
npm run prisma:push
```

Se o banco já tem os dados migrados do sistema Django antigo, o schema já está
aplicado e você pode pular este passo. Detalhes em
[Banco de dados](banco-de-dados.md).

### 4. Rodar

```bash
npm run start:dev
```

A aplicação sobe em `http://localhost:3000`.

## Verificação rápida

| Endereço | Esperado |
| --- | --- |
| `http://localhost:3000/health` | JSON de status |
| `http://localhost:3000/` | Página inicial pública |
| `http://localhost:3000/accounts/login` | Tela de login |
| `http://localhost:3000/painel` | Redireciona para o login se você não estiver autenticado |

## Comandos disponíveis

| Comando | O que faz |
| --- | --- |
| `npm run start:dev` | Desenvolvimento com recarga automática |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda o build (`node dist/src/main`) |
| `npm run typecheck` | Checagem de tipos sem gerar arquivos |
| `npm run lint` | ESLint com correção automática |
| `npm run test` | Testes unitários |
| `npm run test:e2e` | Testes end-to-end |
| `npm run prisma:generate` | Gera o cliente do Prisma |
| `npm run prisma:push` | Aplica o schema no banco sem criar migration |
| `npm run prisma:migrate` | Cria uma migration de desenvolvimento |
| `npm run prisma:deploy` | Aplica migrations existentes (só funciona se houver `prisma/migrations`) |
| `npm run prisma:studio` | Abre o navegador de dados do Prisma |

## Criando o primeiro usuário

Não existe comando de seed. Num banco vazio, ninguém consegue entrar — o login
exige um `User` e o painel exige um `Member` vinculado a ele.

Duas saídas:

**Opção A — Prisma Studio.** Rode `npm run prisma:studio`, crie um registro em
`users` e depois um em `members` apontando para ele com `cargo = presidente`. O
campo `passwordHash` precisa ser um hash bcrypt válido:

```bash
node -e "console.log(require('./node_modules/bcryptjs').hashSync('suaSenhaAqui', 12))"
```

**Opção B — solicitação de cadastro.** Envie o formulário em
`/solicitar-cadastro` e aprove o pedido pelo painel. Mas isso exige alguém já
logado com permissão para aprovar, então não resolve o caso do banco vazio.

Para bancos já migrados do Django, os usuários existentes funcionam
normalmente — veja [Autenticação](autenticacao-e-permissoes.md#senhas-vindas-do-django).
