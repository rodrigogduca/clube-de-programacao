# Backend

Aplicação NestJS. A documentação técnica está em [`../docs/`](../docs/) e o
README raiz, com a estrutura do repositório, fica [aqui](../README.md).

## Começando

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run prisma:generate
npm run prisma:push           # não há pasta prisma/migrations
npm run start:dev
```

Obrigatórias no `.env`: `DATABASE_URL` e `SESSION_SECRET` (mínimo 32 caracteres).
As demais variáveis são opcionais — veja
[docs/configuracao.md](../docs/configuracao.md) para o que fica desativado sem
cada uma.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run start:dev` | Desenvolvimento com recarga automática |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda o build (`node dist/src/main`) |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | ESLint com correção automática |
| `npm run test` / `test:e2e` | Testes |
| `npm run prisma:push` | Aplica o schema sem criar migration |
| `npm run prisma:migrate` | Cria uma migration de desenvolvimento |
| `npm run prisma:studio` | Navegador de dados |

## Mapa do código

```
api/index.js        Handler serverless da Vercel
prisma/             schema.prisma
scripts/            Manutenção: imagens, criação de admin, build
src/
├── bootstrap.ts    Monta o app: Nunjucks, helmet, pipes, filtro de erros
├── app.module.ts   Módulo raiz e ordem dos middlewares
├── common/         Guard de autenticação, CSRF, flash, helpers de formulário
├── pages/          Controllers que renderizam HTML (é o que o navegador usa)
├── views/          Templates .njk + routes.ts
├── public/         CSS, JS e imagens servidos em /static
├── auth/           Login, sessão, hash de senha
└── members/ sectors/ tasks/ attachments/ signup-requests/
```

Existem **duas camadas HTTP**: a de páginas (`src/pages/`), usada pelo navegador,
e uma API REST em JSON nos módulos de domínio, que nenhuma tela consome hoje.
Ambas compartilham os mesmos services, então as regras de permissão valem para as
duas. Detalhes em [docs/arquitetura.md](../docs/arquitetura.md).

## Antes de mexer nos templates

Os `.njk` foram convertidos do Django e o Nunjucks **não** aceita tudo o que o
Django aceita — `{% with %}`, por exemplo, derruba a página inteira. Leia
[docs/templates-e-frontend.md](../docs/templates-e-frontend.md#herança-do-django-leia-antes-de-mexer)
antes.

## Verificação

```bash
npm run typecheck && npm run lint && npm run build
```
