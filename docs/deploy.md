# Deploy

O alvo é a Vercel, em modo serverless.

## Antes de publicar pela primeira vez

Quatro coisas precisam existir fora do repositório. Nenhuma delas o código cria
sozinho.

1. **Um banco Postgres com pooler.** O mesmo Supabase que o projeto já usa, mas
   com a URL **do pooler** (porta 6543), não a da conexão direta. Veja
   [Banco de dados](#banco-de-dados).
2. **As variáveis de ambiente** no projeto da Vercel. Veja
   [a tabela](#variáveis-de-ambiente).
3. **O schema aplicado no banco.** Não há passo de migration no deploy, então o
   banco precisa estar atualizado antes de publicar.
4. **O primeiro administrador.** Veja
   [Criando o primeiro administrador](#criando-o-primeiro-administrador).

## Como o deploy funciona

O `vercel.json` na raiz manda todo o tráfego para uma função só:

```json
{
  "builds": [{ "src": "backend/api/index.js", "use": "@vercel/node", "config": { ... } }],
  "routes": [{ "src": "/(.*)", "dest": "backend/api/index.js" }]
}
```

Três detalhes desse arquivo não são óbvios, e cada um vale um deploy quebrado:

**O entrypoint é `.js`, não `.ts`.** O `@vercel/node` compila TypeScript com
`ts.transpileModule`, que traduz um arquivo por vez, sem verificador de tipos.
Nesse modo ele não distingue tipo de valor num construtor e, com
`isolatedModules: true` (que está no `tsconfig.json` deste projeto), emite
`design:paramtypes` como `[Object, Object]`. É desse metadado que o Nest tira o
que injetar — o deploy sobe e morre na primeira requisição com "Nest can't
resolve dependencies". Por isso quem compila é o `nest build`, com o `tsc` de
verdade, e a Vercel só carrega JavaScript pronto.

**`includeFiles` é obrigatório.** O empacotador segue `require`, e nada no
código faz `require` de um `.njk` ou de um `.css` — eles são lidos por caminho,
em tempo de execução. Sem `includeFiles` a função sobe sem template nenhum e
toda página responde 500.

**O build acontece no `postinstall`.** No modo `builds` a Vercel não executa
`buildCommand`; o único gancho que roda é o `postinstall` do `package.json` mais
próximo do entrypoint. Ele faz duas coisas (ver
`backend/scripts/build-no-vercel.js`):

```
prisma generate   →  gera o Prisma Client e baixa o engine de Linux
nest build        →  gera o dist/ que api/index.js carrega  (só quando VERCEL=1)
```

O `binaryTargets` no `schema.prisma` inclui `rhel-openssl-3.0.x`, que é o Amazon
Linux em que a Vercel roda as funções. Sem ele o `prisma generate` do build
baixaria apenas o engine da máquina de build.

## Configuração do projeto na Vercel

Ao importar o repositório:

| Campo | Valor |
| --- | --- |
| Framework Preset | **Other** |
| Root Directory | **a raiz** (`./`), não `backend/` |
| Build / Output / Install Command | **em branco** — quem manda é o `vercel.json` |

Root Directory na raiz porque é lá que está o `vercel.json`, e os caminhos do
`includeFiles` são relativos a ele.

## Variáveis de ambiente

Em Settings → Environment Variables, marcadas para **Production** (e Preview, se
for usar previews).

| Variável | Obrigatória | Observação |
| --- | --- | --- |
| `DATABASE_URL` | sim | O **pooler**, porta 6543, com `?pgbouncer=true&connection_limit=1` |
| `SESSION_SECRET` | sim | Mínimo 32 caracteres. Sem ela o app não sobe |
| `NODE_ENV` | sim | `production` |
| `SITE_URL` | sim | A URL pública, sem barra no fim |
| `CORS_ORIGIN` | sim | A mesma URL pública |
| `SESSION_COOKIE_NAME` | não | Padrão `club_session` |
| `SESSION_TTL_HOURS` | não | Padrão 12 |
| `BCRYPT_ROUNDS` | não | Padrão 12 |
| `CLOUDINARY_CLOUD_NAME`<br>`CLOUDINARY_API_KEY`<br>`CLOUDINARY_API_SECRET` | não | Sem elas, anexo só do tipo link |
| `EMAIL_*` | não | Reservado; nenhum código envia e-mail hoje |

Gere o segredo com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`NODE_ENV=production` **não é opcional**: é ele que liga o `secure` no cookie de
sessão. Sem ele o navegador recusa o cookie no HTTPS, e o sintoma é um login que
"não pega" — a página volta ao formulário, sem mensagem de erro.

`VERCEL` e `VERCEL_GIT_COMMIT_SHA` são preenchidas pela plataforma; não as
configure. A segunda vira o `?v=` dos arquivos estáticos.

## Banco de dados

**Use a URL do pooler.** No Supabase: Project Settings → Database → Connection
string → **Transaction pooler**. Acrescente os dois parâmetros:

```
postgresql://postgres.REF:SENHA@aws-0-REGIAO.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

Cada invocação serverless é um processo isolado que abre a própria conexão e a
segura enquanto o contêiner viver. Contra a conexão direta (porta 5432) o banco
satura em minutos de tráfego normal, e o sintoma engana: o site funciona, passa
a devolver 500 intermitente e depois volta sozinho. No Supabase há um agravante
— a conexão direta de projetos novos só atende em IPv6, e as funções da Vercel
saem por IPv4, então nem chega a conectar.

`pgbouncer=true` desliga os prepared statements, que o PgBouncer em modo
transaction não reaproveita. Sem ele o Prisma quebra com "prepared statement s0
already exists", também de forma intermitente.

O `PrismaService` avisa no log de boot se detectar qualquer um dos dois casos.

**O deploy não aplica migrations.** O projeto não tem `prisma/migrations/`: o
schema é aplicado à mão com `db push`. Antes de publicar uma mudança de schema:

```bash
cd backend
DATABASE_URL="<url direta, porta 5432>" npx prisma db push
```

Use a URL **direta** aqui, não a do pooler — DDL não passa bem por PgBouncer em
modo transaction.

## Mudando de projeto Supabase

Se o banco de produção for um projeto novo e os dados estiverem em outro,
`backend/scripts/copiar-banco.js` copia tudo. Primeiro crie o schema no destino:

```bash
cd backend
DATABASE_URL="<url direta do DESTINO>" npx prisma db push
```

Depois a cópia — simule antes, grave depois:

```bash
export ORIGEM="postgresql://postgres:SENHA@db.REF_ANTIGO.supabase.co:5432/postgres"
export DESTINO="postgresql://postgres:SENHA@db.REF_NOVO.supabase.co:5432/postgres"

node scripts/copiar-banco.js              # simula: mostra os números dos dois lados
node scripts/copiar-banco.js --executar   # grava, depois de você conferir
```

As duas URLs são as **diretas** (5432) — o script recusa a do pooler, porque
lote grande e DDL não passam bem por PgBouncer em modo transaction.

Três coisas que ele resolve e que costumam passar batido numa cópia manual:

- **Ordem das chaves estrangeiras.** Setor antes de membro, membro antes de
  tarefa, tarefa antes de anexo. Fora dessa ordem o Postgres recusa a linha.
- **Sequências.** Inserir id explícito não move o contador do Postgres. Sem o
  `setval` que o script faz no fim, o primeiro cadastro feito pela interface
  tentaria o id 1 e morreria com "duplicate key value violates unique
  constraint".
- **Destino sujo.** Ele para antes de escrever se houver qualquer linha do outro
  lado — a cópia preserva os ids originais e só funciona em banco limpo.

Se depois disso o clube inteiro já veio junto, você **não** precisa rodar o
`criar-admin.js`: os administradores vieram na cópia.

## Criando o primeiro administrador

**Nenhum caminho da interface cria o primeiro administrador.** `MembersService.create`
recusa sem um ator autenticado com permissão, e a solicitação de cadastro nasce
pendente esperando aprovação de um membro da diretoria. Num banco vazio isso é
um impasse: o site sobe e ninguém entra.

`backend/scripts/criar-admin.js` resolve, e roda uma vez só:

```bash
cd backend
DATABASE_URL="postgresql://postgres:SENHA@db.REF.supabase.co:5432/postgres" node scripts/criar-admin.js
```

Use a conexão **direta** (5432), não a do pooler. O script pergunta usuário,
e-mail, nome, cargo e senha — a senha é lida sem eco, então não fica no
histórico do shell. Para automatizar, as variáveis `ADMIN_USERNAME`,
`ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_NOME`, `ADMIN_SOBRENOME` e `ADMIN_CARGO`
substituem as perguntas.

O cargo tem de ser `presidente` ou `administrador` — são os dois que passam em
`is_admin`. O script recusa qualquer outro, recusa senha com menos de 8
caracteres e recusa se já existir usuário com aquele nome ou e-mail (não
sobrescreve conta nenhuma). O hash é bcrypt com o mesmo custo do app, então a
senha funciona no login direto.

Depois disso, o resto do clube entra pelo diretório ou pela fila de
solicitações, como deve.

## Publicando

Pelo Git (recomendado): um push na branch de produção dispara o deploy.

Pela CLI, da raiz do repositório:

```bash
npx vercel --prod
```

O `.vercelignore` controla o que sobe. Ele exclui `dist/` de propósito — quem o
gera é o `postinstall`, já no Linux da Vercel; subir o `dist/` da máquina de
quem desenvolve levaria junto o engine do Prisma do Windows.

## Depois de publicar, confira nesta ordem

Cada item isola uma camada, e a ordem importa: o primeiro que falhar explica os
seguintes.

1. **`GET /health` responde 200** — a função sobe e a DI do Nest resolveu.
   Se falhar, o log está em Deployments → Functions. `Cannot find module
   '../dist/src/bootstrap'` é o `postinstall` que não rodou; "Nest can't resolve
   dependencies" é TypeScript compilado pela Vercel.
2. **`GET /` carrega com o CSS aplicado** — os assets vieram no `includeFiles`.
   Se vier sem estilo, o log traz a lista de caminhos que o `resolveAssetDir`
   tentou.
3. **Login funciona** — `NODE_ENV`, `SESSION_SECRET` e o banco. Se voltar ao
   formulário sem erro nenhum, é `NODE_ENV` faltando.
4. **Criar uma tarefa e movê-la no kanban** — banco em escrita, CSRF e sessão.
5. **Abrir os anexos de uma tarefa e adicionar um link** — o caminho que não
   depende do Cloudinary.

## Limites que vale conhecer

**Cold start.** Cada contêiner novo monta o container de injeção de dependência
inteiro do Nest: de 1 a 3 segundos na primeira requisição. Num site de clube,
com tráfego intermitente, isso acontece com frequência. É o custo de rodar em
serverless um framework feito para processo longo — se incomodar, o mesmo código
sobe sem alteração num servidor comum (veja a última seção).

**Upload de arquivo: 4,5 MB.** É o teto de corpo de requisição da Vercel, e ele
vem antes do código: arquivo maior recebe 413 sem chegar ao Cloudinary. O
importador de CSV já limita em 2 MB por conta própria.

**30 segundos por requisição**, definidos em `maxDuration`. Só o importador de
CSV chega perto disso.

**Arquivos estáticos passam pela função** na primeira vez e depois ficam no CDN:
o `Cache-Control` que o app emite tem `s-maxage`, e o `?v=` com o hash do commit
garante que uma publicação nova não sirva CSS velho.

## Verificando o build antes de publicar

```bash
cd backend
npm run typecheck
npm run build
npx jest
node render-check.cjs      # renderiza todas as telas com dados de mentira
```

Para exercitar o mesmo caminho da Vercel na sua máquina — o `api/index.js`
carregando o `dist/`, com `NODE_ENV=production`:

```bash
cd backend
npm run build
NODE_ENV=production PORT=3100 node dist/src/main
```

## Rodando fora da Vercel

Não há nada específico da Vercel dentro de `src/`. Para um servidor comum:

```bash
cd backend
npm ci
npm run build
NODE_ENV=production node dist/src/main
```

Ponha um proxy reverso na frente terminando o TLS. O app já usa
`trust proxy = 1`, então `req.protocol` e o IP de origem funcionam atrás dele.
Nesse modo a conexão direta do Postgres é a escolha certa — o pool do Prisma é
reaproveitado pelo processo, que não morre entre requisições.
