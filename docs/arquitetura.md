# Arquitetura

## Formato da aplicação

Aplicação **renderizada no servidor**, não uma SPA. O NestJS monta o HTML com
Nunjucks e devolve páginas prontas. Os formulários usam `POST` comum e o servidor
responde com um redirect (padrão *Post/Redirect/Get*), evitando reenvio ao
atualizar a página.

Isso importa porque existem **duas camadas HTTP paralelas** no projeto:

1. **Camada de páginas** (`src/pages/`) — o que o navegador realmente usa.
   Recebe formulários, responde com redirect e mensagens flash.
2. **API REST JSON** (`src/members/`, `src/tasks/`, `src/sectors/`,
   `src/signup-requests/`) — endpoints como `POST /tasks`,
   `PATCH /members/:id`. Nenhuma tela do sistema consome esses endpoints hoje;
   eles existem para integrações externas.

As duas camadas compartilham os mesmos *services*, então as regras de permissão
valem para ambas.

## Estrutura de diretórios

```
backend/
├── api/index.ts              # Handler serverless da Vercel
├── prisma/schema.prisma      # Modelo de dados
└── src/
    ├── main.ts               # Entrada local (app.listen)
    ├── bootstrap.ts          # Monta o app: Nunjucks, helmet, pipes, filtros
    ├── app.module.ts         # Módulo raiz e ordem dos middlewares
    │
    ├── common/               # Infraestrutura transversal
    │   ├── authenticated.guard.ts   # Exige login; carrega req.membro
    │   ├── csrf.middleware.ts       # Emissão e validação do token CSRF
    │   ├── web-exception.filter.ts  # Erro -> redirect+flash ou página de erro
    │   ├── flash.ts                 # Mensagens de uma requisição para a outra
    │   ├── form.ts                  # Conversão de campos de formulário
    │   └── common.module.ts         # Módulo global que expõe o guard
    │
    ├── auth/                 # Login, logout, sessão, hash de senha
    ├── database/             # PrismaService (módulo global)
    │
    ├── members/              # Membros e cargos
    ├── sectors/              # Setores
    ├── tasks/                # Tarefas (kanban)
    ├── attachments/          # Anexos de tarefa (arquivo ou link)
    ├── signup-requests/      # Solicitações de cadastro
    │
    ├── pages/                # Camada de páginas HTML
    │   ├── page-context.service.ts  # Contexto comum a toda página
    │   ├── public-pages.controller.ts
    │   ├── panel.controller.ts
    │   └── signup-pages.controller.ts
    │
    ├── views/                # Templates .njk + routes.ts
    └── public/               # CSS, JS e imagens servidos em /static
```

## Fluxo de uma requisição

```
Requisição
   ↓
ironSessionMiddleware      descriptografa o cookie -> req.session
   ↓
csrfMiddleware             emite token em GET; valida em POST/PATCH/DELETE
   ↓
AuthenticatedGuard         exige login, confere sessionVersion, carrega req.membro
   ↓
Controller                 valida o formulário, chama o service
   ↓
Service                    aplica permissões e fala com o Prisma
   ↓
Resposta                   render de template ou redirect
   ↓
WebExceptionFilter         se algo lançou: vira redirect+flash ou página de erro
```

A ordem sessão → CSRF é obrigatória: o token fica guardado dentro da sessão.

## Camada de páginas

### `PageContextService`

Monta o contexto que **toda** página precisa: usuário logado, permissões, token
CSRF e mensagens flash.

O ponto importante é o que ele **não** faz: não carrega membros, setores nem
tarefas. Cada rota busca só o que a sua tela usa. A home pública e a tela de
login não fazem nenhuma consulta ao banco quando o visitante não está logado.

### Divisão dos controllers

| Controller | Prefixo | Autenticação |
| --- | --- | --- |
| `PublicPagesController` | `/`, `/accounts/login`, `/solicitar-cadastro`, `/robots.txt`, `/sitemap.xml` | Pública |
| `PanelController` | `/painel/*` (membros, setores, tarefas, anexos) | Exigida |
| `SignupPagesController` | `/painel/solicitacoes/*` | Exigida |

`/painel` escolhe o template em tempo de execução: `painel_admin.njk` para
presidente, vice, administrador, diretor e antiga gestão; `painel_membro.njk`
para membro comum, que vê apenas as próprias tarefas e os colegas de setor.

## Tratamento de erros

O `WebExceptionFilter` é global e traduz exceções conforme o tipo de cliente:

| Situação | Resposta |
| --- | --- |
| Caminho `/api/*` ou `Accept: application/json` | JSON `{ statusCode, message }` |
| Qualquer erro 401 | Redirect para `/accounts/login?next=<url>` |
| `POST` com erro < 500 | Flash de erro + redirect de volta (`Referer` da mesma origem, ou `/painel`) |
| `GET` com erro | Renderiza `core/erro.njk` |
| Erro 5xx | Registrado no log com stack; a mensagem crua não vai para o usuário |

Consequência prática: um `ForbiddenException` lançado lá no fundo de um service
vira uma mensagem em português na tela, não um JSON de erro.

## Conversão de dados de formulário

Formulários HTML mandam tudo como string, e `<select>` vazio vira `""`. Os
helpers em `src/common/form.ts` normalizam isso com mensagens em português:

| Helper | Comportamento |
| --- | --- |
| `requiredText` | Erro 400 se vazio |
| `optionalText` | `""` vira `undefined` (campo não informado) |
| `optionalTextArea` | `""` continua `""` (permite limpar o campo de propósito) |
| `optionalId` | `""` vira `null` (desvincular); `"3"` vira `3`; lixo vira erro 400 |
| `optionalDate` | Valida a data antes de chegar no banco |
| `optionalChoice` | Restringe a uma lista de valores aceitos |
| `parseRouteId` | Rejeita `/painel/tarefa/abc/editar` antes da consulta |

Por isso os controllers de página recebem `@Body() body: FormBody` (um
`Record<string, unknown>`) em vez de DTOs com `class-validator`: os decoradores
`@IsInt()` falhariam contra a string `"3"` que o navegador envia. A API REST, que
recebe JSON, continua usando DTOs normalmente.
