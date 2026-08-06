# Correções aplicadas

Registro do diagnóstico e das mudanças feitas para colocar o sistema em
funcionamento.

## Resumo

O backend havia sido reescrito de Django para NestJS, mas a reescrita parou na
metade: existia uma API REST em JSON e existiam os templates HTML, e **as duas
metades não se encaixavam**. O `PagesController` tinha apenas handlers `GET`.
Nenhum formulário do sistema tinha destino no servidor.

Na prática: dava para navegar e visualizar telas, mas **nenhum botão que grava
dados funcionava**. Todo `POST` respondia 404.

---

## 1. Nenhum formulário tinha handler — a causa principal

**Sintoma.** Criar tarefa, adicionar membro, mover cartão no kanban, aprovar
cadastro, sair da conta: todos 404.

**Causa.** Os templates enviam para caminhos no estilo Django
(`/painel/criar-tarefa`, `/painel/tarefa/:id/atualizar`, `/accounts/logout`). O
backend só tinha `POST /tasks`, `POST /members` etc., em JSON e com nomes de
campo diferentes (`responsavelId` em camelCase contra o que o formulário
mandava). E o `PagesController` não declarava nenhum `POST`.

**Correção.** Implementada a camada de páginas completa, com 30 handlers `POST`
divididos em quatro controllers (`panel`, `chat-pages`, `signup-pages`,
`public-pages`). Todos seguem *Post/Redirect/Get*: gravam, deixam uma mensagem
flash e redirecionam.

## 2. `/accounts/logout` não existia

**Sintoma.** O botão "Sair" da navbar dava 404.

**Causa.** O `AuthController` só respondia em `/auth/logout` e devolvia JSON, mas
`views/routes.ts` e os templates apontavam para `/accounts/logout`.

**Correção.** O `AuthController` agora atende `/accounts/login` e
`/accounts/logout` (mantendo `/auth/*` como alias) e responde com redirect em vez
de JSON. Erro de senha vira mensagem na tela de login, não um 401 cru.

## 3. O painel do administrador não renderizava

**Sintoma.** `/painel` quebrava para quem via o painel completo.

**Causa.** `painel_admin.njk` usava `{% with %}...{% endwith %}`. Essa tag existe
no Django e no Jinja2, **mas não no Nunjucks** — e uma tag desconhecida derruba o
template inteiro.

**Correção.** Trocado por `{% set %}`.

Na mesma linha: `chat_lista.njk` usava o filtro `escapejs`, que também não existe
no Nunjucks. O filtro foi implementado em `bootstrap.ts`.

## 4. O seletor de status do kanban vinha vazio

**Causa.** O template itera `{% for value, label in tarefa.STATUS_CHOICES %}`,
que exige uma lista de **pares**. O serviço entregava uma lista de objetos
`{value, label}`.

**Correção.** Criado `statusChoicePairs` em `tasks.service.ts`, usado onde os
templates consomem `STATUS_CHOICES`.

## 5. O painel era público

**Sintoma.** Qualquer visitante anônimo abria `/painel` e via a lista completa de
membros, e-mails, setores e tarefas.

**Causa.** Nenhuma rota de página tinha verificação de autenticação, e o
construtor de contexto carregava e entregava todos os dados independentemente de
quem estava pedindo. Os endpoints REST `GET /members` e `GET /tasks` também eram
abertos.

**Correção.** Criado o `AuthenticatedGuard`, aplicado a todas as rotas de painel
e a todos os controllers REST (a única exceção é `POST /signup-requests`, que
precisa ser pública). Quem não está logado é redirecionado para o login com
`?next=`.

## 6. Sessão revogada continuava válida

**Causa.** O `sessionVersion` era gravado no cookie no login e nunca mais
conferido. Incrementá-lo no banco não expulsava ninguém.

**Correção.** O guard compara, a cada requisição, o `sessionVersion` do cookie
com o do banco, e também verifica `isActive`. Divergiu, a sessão é destruída.

## 7. Nenhuma proteção contra CSRF

**Causa.** `csrf_token()` retornava string vazia. Com autenticação por cookie e
sem token, qualquer site externo conseguiria enviar formulários em nome de quem
estivesse logado.

**Correção.** Implementado token por sessão, com comparação em tempo constante,
validado em todos os métodos que alteram estado. O nome do campo
(`csrfmiddlewaretoken`) foi mantido igual ao do Django porque o `chat.js`
dependia dele. Uploads `multipart` validam dentro do handler, já que o corpo só
existe depois do `multer`.

## 8. O chat quebrava logo na primeira linha

**Causa.** `chat.js` fazia
`chatRoom.querySelector('[name=csrfmiddlewaretoken]').value`. Como o token não
era mais renderizado, o `querySelector` devolvia `null` e o `TypeError` matava o
script inteiro — inclusive o envio de mensagens e o auto-scroll.

**Correções no chat:**

| Problema | Correção |
| --- | --- |
| `TypeError` no token ausente | O token voltou a ser renderizado; o JS também tolera a ausência |
| Canal `private-conversation-{id}` no servidor contra `private-conversa-{id}` no cliente | Unificado em `conversationChannel()` |
| Evento `new-message` contra `nova-mensagem` | Unificado em `NEW_MESSAGE_EVENT` |
| `/api/pusher/auth` não existia | Endpoint criado, com verificação de participação na conversa |
| `/api/chat/:id/enviar` e `/mensagens` não existiam | `ChatApiController` criado |
| Polling esperava `{mensagens: [...]}` com `autor_id`; a API devolvia array cru | Formato ajustado nos dois lados |
| Bolhas renderizadas no servidor não tinham `data-message-id`, então o polling duplicava mensagens | Atributo adicionado no template |

## 9. Telas de edição vinham em branco

**Causa.** As rotas de edição recebiam apenas o id na URL e passavam esse id
adiante como string. O objeto (`tarefa`, `membro_alvo`, `setor`, `anexo`,
`solicitacao`) nunca era carregado, então todo `value="{{ ... }}"` saía vazio.

**Correção.** Cada rota agora carrega o registro que a sua tela usa.

## 10. Anexos não existiam no backend

**Causa.** Havia quatro telas de anexo, mas nenhum módulo, service ou rota — e o
contexto entregava `anexos: []` fixo.

**Correção.** Criado o módulo `attachments` com upload para o Cloudinary
(`multipart`), anexos por link, edição e exclusão (removendo também o arquivo
remoto). Sem credenciais do Cloudinary, o upload é desativado com aviso na tela e
os links continuam funcionando.

## 11. `painel_membro.njk` nunca era usado

**Causa.** `/painel` renderizava `painel_admin` para todo mundo.

**Correção.** A escolha do template passou a depender do cargo. Membro comum vê
`painel_membro` com as próprias tarefas e os colegas de setor.

## 12. Toda página carregava o banco inteiro

**Causa.** O `buildContext` original executava quatro consultas pesadas (todos os
membros, todos os setores com membros e tarefas aninhados, todas as tarefas e a
contagem de solicitações) em **qualquer** requisição — inclusive na home pública
e na tela de login.

**Correção.** O `PageContextService` monta só o contexto comum, e cada rota busca
o que a sua tela precisa. Criado `sectorsService.listSimple()` para preencher
`<select>` sem arrastar membros e tarefas junto. A home anônima agora não faz
nenhuma consulta.

## 13. `forbidNonWhitelisted` rejeitava formulários

**Causa.** O `ValidationPipe` global recusava qualquer campo fora do DTO. Como
formulários HTML mandam campos extras (token de CSRF, o `remember` do login), a
resposta era 400.

**Correção.** Mantido `whitelist: true` (que descarta o excedente) e removido
`forbidNonWhitelisted`.

## 14. `npm run start:prod` apontava para o lugar errado

**Causa.** O script era `node dist/main`, mas como o `tsconfig` compila também
`api/index.ts`, a saída real é `dist/src/main.js`.

**Correção.** Script corrigido para `node dist/src/main`.

## 15. `npm run prisma:deploy` não tinha o que aplicar

**Causa.** O README mandava rodar `prisma migrate deploy`, mas o repositório não
tem `prisma/migrations`.

**Correção.** Adicionado `npm run prisma:push` e a documentação passou a explicar
a diferença.

## 16. Nome vazio no card de solicitação

**Sintoma.** Na lista de solicitações de cadastro, o nome da pessoa aparecia em
branco (`<h3> </h3>`).

**Causa.** `formatSignup` espalhava o registro do Prisma, que traz `firstName` e
`lastName` em camelCase, mas `solicitacoes.njk` lê `sol.first_name` e
`sol.last_name`. Passou despercebido porque a tela de *editar solicitação* usa
`{{ solicitacao.firstName|default(solicitacao.first_name) }}`, com fallback, e
por isso funcionava.

**Correção.** `formatSignup` passou a expor `first_name`, `last_name` e
`nome_completo`, como os demais formatadores já faziam.

## 17. Mensagens de erro em inglês na tela

**Sintoma.** Abrir uma tarefa inexistente mostrava *"Task not found."* numa
página cujo resto está em português.

**Causa.** As exceções dos services vinham do esqueleto original em inglês. Antes
isso não aparecia (viravam JSON de API); com o `WebExceptionFilter` renderizando
o texto na tela, passaram a ficar visíveis.

**Correção.** Todas as mensagens de exceção que chegam ao usuário foram
traduzidas.

## 18. Navbar sem estilo em toda tela autenticada

**Sintoma.** Depois de entrar, o topo de **todas** as páginas aparecia quebrado:
logo em tamanho natural, links empilhados, "Sair" com cara de botão cru do
navegador.

**Causa.** `style_painel.css` estilizava uma marcação antiga — `.nav-right`,
`.nav-user`, `.nav-logout` — enquanto `partials/painel_nav.njk` já usava outra:
`.nav-container`, `.nav-brand`, `.nav-links`, `.nav-logo-link`, `.nav-title`,
`.nav-user-info`, `.nav-user-name`, `.nav-badge-cargo`, `.nav-link-logout`,
`.nav-logout-form`, `.nav-mobile-toggle`, `.nav-badge`, `.nav-link-alert`.
Nenhuma dessas treze classes tinha regra. Como a navbar é um `include` presente
em toda página do painel, o defeito aparecia em todas elas.

Também faltavam `.text-muted` e `.kanban-header-*`.

**Correção.** `style_painel.css` foi reescrito por inteiro sobre a mesma paleta,
cobrindo as 167 classes que os templates usam. Detalhes do sistema de tokens em
[Templates e front-end](templates-e-frontend.md#sistema-visual-do-painel).

## 19. Alterações em CSS e templates não apareciam em desenvolvimento

**Sintoma.** Editar um `.css` ou `.njk` e recarregar não mudava nada. O navegador
seguia recebendo a versão anterior.

**Causa.** `npm run start:dev` (`nest start --watch`) recompila TypeScript, mas
por padrão **não recopia assets** para `dist/`. Como os arquivos são servidos de
`dist/src/public` e os templates lidos de `dist/src/views`, a edição em `src/`
ficava invisível até um `npm run build`.

**Correção.** `watchAssets: true` no `nest-cli.json`.

## 20. Front-end sem estrutura: 23 templates repetindo o mesmo esqueleto

**Sintoma.** Difícil de encontrar as coisas e difícil de mexer sem quebrar.

**Causa.** Nenhum dos 23 templates usava `{% extends %}`. Todos repetiam
`<!DOCTYPE>`, `<head>`, os links de fonte, a grade de fundo, o include da
navbar e o `<script>` — cerca de 300 linhas de duplicação. Trocar uma fonte
significava editar 23 arquivos. O CSS do painel era um único arquivo de 2.500
linhas.

**Correção.**

- Três layouts: `base.njk` (esqueleto, único com `<!DOCTYPE>`), `painel.njk`
  (telas autenticadas) e `auth.njk` (login, cadastro, erro). Os 26 templates
  passaram a herdar.
- Bloco de mensagens flash movido para o layout — antes existia em 5 telas
  apenas, e um aviso gerado ao redirecionar para qualquer outra se perdia.
- CSS dividido em 15 módulos em `public/css/painel/`.
- O `<script>` de upload de arquivo, que era copiado inline em dois templates,
  foi para o `painel.js`. Ele tinha um defeito: criava um
  `.file-upload-wrapper` novo em volta de um input que já estava dentro de um,
  produzindo wrapper aninhado e botão duplicado.

## 21. Alterações em CSS e templates não apareciam em desenvolvimento

**Sintoma.** Editar um `.css` ou `.njk` e recarregar não mudava nada.

**Causa.** `nest start --watch` recompila TypeScript mas não recopia assets, e
os arquivos são servidos de `dist/`.

**Primeira tentativa, descartada.** `watchAssets: true` no `nest-cli.json`
resolve no papel, mas o watcher enxerga os temporários das gravações atômicas
(`arquivo.njk.tmp.1234.abcd`), tenta copiá-los depois que já sumiram e derruba
o servidor com `ENOENT`. Acrescentar `exclude` não adianta: o filtro não é
aplicado no watcher.

**Correção adotada.** `bootstrap.ts` resolve os diretórios de views e estáticos
conforme o ambiente: `src/` em desenvolvimento (com `noCache` no Nunjucks) e
`dist/` em produção. Sem watcher, sem cópia, sem crash.

---

## Melhorias que acompanharam as correções

- **Permissões em tarefas.** Antes, qualquer usuário autenticado criava, editava
  e excluía qualquer tarefa. Agora isso exige cargo de gestão; mover o próprio
  cartão no kanban continua liberado para o responsável.
- **Erros legíveis.** O `WebExceptionFilter` transforma exceções em mensagem
  flash com redirect (em `POST`) ou numa página de erro (em `GET`), em vez de
  JSON cru. Erros 5xx vão para o log com stack e não vazam detalhes na tela.
- **Ids de rota validados.** `parseRouteId` recusa `/painel/tarefa/abc/editar`
  antes de qualquer consulta.
- **`req.membro` tipado.** Criado o tipo `SessionMember` e o alias
  `AuthenticatedRequest`, eliminando o `any` que se espalhava pelos controllers.
- **`robots.txt` e `sitemap.xml`** implementados (estavam declarados em
  `routes.ts` mas não existiam).
- **Página de erro** (`core/erro.njk`) criada.

## Como isso foi verificado

### Verificação estática

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Sem erros |
| `npm run build` | Compila |
| `npm run lint` | 0 erros (restam avisos de `any` em código pré-existente) |
| Grafo de módulos do Nest (`app.init()`) | Todos os módulos resolvem; 84 rotas registradas |
| Renderização dos 23 templates com contexto de teste | Todos renderizam sem erro |

O último item é o que pega a classe de bug do `{% with %}` e do `escapejs`, que
só aparece em tempo de execução.

### Verificação contra o banco real

Feita com a aplicação rodando contra o banco de produção (28 usuários, 6
setores, 48 tarefas, 12 conversas, 23 solicitações).

Leitura — todas as telas responderam 200 com dados reais:

| Verificação | Resultado |
| --- | --- |
| Rotas públicas e `/static` | 200 |
| `/painel` e demais telas anônimas | 302 para o login com `?next=` |
| `GET /members`, `GET /tasks` anônimo | 401 |
| `POST` sem token CSRF | 403, sessão continua anônima |
| `/painel` renderizado | 353 KB, 6 abas de setor, 96 cards, 96 tokens CSRF |
| `STATUS_CHOICES` no kanban | 3 opções, com `selected` correto |
| Formulários de edição | Preenchidos com os valores do registro |
| Chat com mensagens | Autor, conteúdo, horário e `data-message-id` presentes |
| Isolamento de conversas | 404 ao abrir conversa de que não se participa |
| Página de erro 404 e id inválido | Renderiza `core/erro.njk`; id não numérico dá 400 |

Escrita — ciclo reversível, conferido no banco a cada passo:

| Operação | Resultado |
| --- | --- |
| Criar setor | 303 → `/painel`, flash *"Setor criado."*, registro no banco |
| Editar setor | Nome alterado no banco |
| Excluir setor | Registro removido |
| Mover tarefa no kanban | Status alterado e revertido |
| Criar setor sem nome | Rejeitado com mensagem; nada gravado |
| Status de tarefa inválido | Rejeitado com mensagem; status preservado |

Ao final, as contagens de todas as tabelas voltaram aos valores iniciais.

Sessão autenticada obtida selando um cookie `iron-session` com o
`SESSION_SECRET` do ambiente, sem usar a senha de ninguém.

## O que ainda não foi feito

Itens conhecidos, deixados de fora de propósito:

- **Sem testes automatizados** das novas rotas. Os arquivos de teste existentes
  (`app.controller.spec.ts`, `app.e2e-spec.ts`) continuam sendo o esqueleto
  padrão do Nest. A verificação acima foi manual; transformá-la num teste e2e
  seria o próximo passo mais útil.
- **Fluxos não exercitados contra o banco:** aprovação de solicitação de
  cadastro (cria usuário e membro), exclusão de membro e upload para o
  Cloudinary. Os dois primeiros são destrutivos ou geram dados permanentes; o
  último exige credenciais que não estão configuradas.
- **E-mail não implementado.** As variáveis SMTP existem, o `nodemailer` está
  instalado, mas nenhum código envia mensagem. Aprovar um cadastro não notifica a
  pessoa.
- **Sem paginação.** `/painel` carrega todas as tarefas e membros. Funciona bem
  na escala de um clube; com milhares de registros, não.
- **`CORS_ORIGIN` liberado por padrão.** Com `credentials: true`, isso é
  permissivo demais para produção. Defina a variável.

---

## Remoção do chat — 30/07/2026

O chat interno foi retirado por inteiro. As seções acima que descrevem correções
no chat (item 8 em diante) são **registro histórico** e não descrevem mais o
código atual.

**O que saiu:**

| Camada | Removido |
| --- | --- |
| Módulo | `src/chat/` (service, controller, module) |
| Páginas | `pages/chat-pages.controller.ts`, `pages/chat-api.controller.ts` |
| Templates | `views/core/chat_lista.njk`, `views/core/chat_conversa.njk` |
| Front-end | `public/js/chat.js`, `public/css/painel/chat.css`, regras `.chat-*` em `base.css`, `kanban.css` e `responsivo.css`, modal de renomear em `painel.js` |
| Navegação | Link "Chat" em `partials/painel_nav.njk` e card em `core/menu.njk` |
| Rotas nomeadas | As 8 entradas de chat em `views/routes.ts` |
| Filtros Nunjucks | `escapejs` e `display_name` em `bootstrap.ts` (só o chat os usava) |
| Contexto | `pusher_key` e `pusher_cluster` em `PageContextService`, que deixou de injetar `ChatService` |
| Dependência | `pusher` do `package.json` (e mais 10 pacotes transitivos) |
| Ambiente | `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` |
| Schema | Enum `ConversaTipo`, models `Conversation`, `MemberConversation` e `Message`, e as relações `Sector.conversa`, `Member.conversas` e `Member.mensagens` |

**Banco.** O `prisma db push` dropou `conversations` (12 linhas),
`conversation_participants` (32) e `messages` (2). Um backup em JSON foi gerado
antes da remoção.

**Efeito colateral importante.** O `db push` sincroniza o banco com o schema, e o
banco de produção ainda continha as tabelas legadas do Django, que nunca haviam
sido removidas depois da migração. Elas também foram dropadas: `core_tarefa`
(48 linhas), `core_solicitacaocadastro` (23), `core_setor` (6),
`django_content_type` (13), `django_migrations` (32), entre outras `core_*` /
`auth_*`.

As 48 tarefas em `core_tarefa` **nunca haviam sido migradas** para a tabela
`tasks` do Prisma, que estava vazia antes e continua vazia. Usuários, membros,
setores e solicitações não foram afetados, porque esses já viviam nas tabelas do
Prisma.

**Lição:** antes de rodar `prisma db push` contra um banco compartilhado ou
herdado, liste o que existe fora do schema:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

Tudo que não estiver no `schema.prisma` será dropado sem aviso individual.

---

## Diretório de membros e pop-ups de tarefa — 31/07/2026

Implementação das specs [`sistema-interno-melhorias.md`](../specs/sistema-interno-melhorias.md)
(comportamento) e [`ui-ux-sistema-interno.md`](../specs/ui-ux-sistema-interno.md)
(aparência). São dois eixos independentes, entregues juntos.

### O problema

O painel era uma tela só, empilhando quatro responsabilidades: números da
operação, abas por setor, kanban e listagem de membros. Isso produzia três
sintomas concretos:

1. **Membros e tarefas disputavam a mesma tela.** `painel_admin.njk` renderizava
   a lista de pessoas **três vezes** — na aba "Todos", em cada aba de setor e em
   "Sem Setor" — e a mesma pessoa aparecia em duas abas. O acordeão de cargos
   abria recolhido justamente porque, aberto, empurrava o kanban para fora da
   dobra. O sintoma era o diagnóstico.
2. **Não havia como ler uma tarefa.** O cartão corta a descrição em 15 palavras
   e o único caminho para o resto era o formulário de edição — ou seja, para
   *ler* era preciso entrar em modo de *escrita*, com risco de alterar algo sem
   querer.
3. **Toda ação de tarefa era uma navegação de página inteira.** No redirect de
   volta perdiam-se a aba de setor aberta, os filtros do kanban (que só existem
   no DOM), a posição da rolagem e o estado dos acordeões. Quem cadastrava cinco
   tarefas pagava esse custo cinco vezes.

O `Member.bio`, por sua vez, era gravado em `editar_membro` e **nunca lido em
lugar nenhum** do sistema.

### O que passou a existir

| Área | Mudança |
| --- | --- |
| Diretório | `GET /painel/membros`, tela própria aberta em outra aba. Busca, filtro por cargo e setor, agrupamento por cargo/setor/nenhum, grade ou tabela — tudo no cliente |
| Régua de carga | Barra de 4px no cartão de membro, segmentada em pendente (`--warn`), em andamento (`--info`) e atrasada (`--danger`), com largura relativa à maior carga do clube. Cada segmento leva ao quadro filtrado |
| Ver tarefa | `GET /painel/tarefa/:id`, página e pop-up, com a descrição inteira e duas abas (detalhes e anexos) |
| Criar e editar | Em pop-up, pela API JSON, com o cartão entrando ou sendo substituído no quadro sem recarregar |
| Anexar | Dentro da aba de anexos do pop-up |
| Perfil do membro | Pop-up com a bio — **finalmente visível** —, contadores por status e as tarefas mais recentes |

### Decisões que custaram algo

**O formulário vem do servidor, não do JavaScript.** Havia três caminhos:
montar os campos em JS (duplica o formulário e obriga a lembrar do segundo
lugar), embutir o HTML escondido na página (pesa o `/painel` com um formulário
por tarefa) ou buscar um fragmento (`?parcial=1`). O terceiro custa uma
requisição ao abrir e é o único com **uma definição só**.

**O pop-up é camada, não substituição.** As rotas de página continuam
existindo e funcionando; todo gatilho é um link de verdade. Sem JavaScript, ver,
criar, editar e excluir seguem pelas telas de sempre.

**A régua desconta as atrasadas dos outros dois segmentos.** Uma tarefa atrasada
também é pendente ou em andamento. O `groupBy` das atrasadas agrupa **por
responsável e por status** justamente para os três segmentos somarem exatamente
o total aberto — sem isso a barra passaria do próprio total.

**Um contador por consulta, não por cartão.** `MembersService.listComResumo()`
faz uma agregação para todos os membros. Com 24 pessoas na tela, o N+1 óbvio
seriam 24 idas ao banco para exibir um número.

### O que mudou na aparência

O painel usava outro sistema visual que o site público: Inter contra Instrument
Sans, `--ember` e `--ambar` sendo a mesma cor com nomes diferentes, seções em
`<h2>` puro contra o eyebrow `// quem somos`. Quem saía da home e entrava no
painel trocava de produto.

| Mudança | Motivo |
| --- | --- |
| Inter sai, **Instrument Sans** entra | É a fonte do site público. Uma família por outra — nenhuma a mais no `{% block fontes %}` |
| Eyebrow `// tarefas` nas seções | O melhor achado da identidade, em `--text-dim` e não âmbar, porque rótulo de seção não é clicável |
| **Cargo sai do âmbar** | Presidente, vice e admin se distinguem por peso e traço. Cargo é identidade, não ação nem estado — um selo de "Presidente" gritava mais que o botão "Criar tarefa" ao lado |
| Avatar perde o gradiente | 24 círculos laranja no diretório viravam uma parede. O âmbar fica para o avatar de quem está logado, o que é informação útil |
| Filtro sem âmbar no `hover` | O âmbar volta no foco e quando o filtro está **ativo** — aí sim é informação |
| Fila de cinco números → uma linha | Três daqueles números já estavam nos contadores das colunas, e a fila **mentia sob filtro**: as colunas reagiam aos filtros e ela não |
| Piso de 11,5px | `.badge` estava em `0.68rem` (10,9px) — abaixo do piso, e é justamente quem carrega cargo e prioridade |
| Placeholder `#6b665f` → `#8a847c` | 3,6:1 reprovava o AA de 4,5:1. Placeholder é texto e conta |
| "Excluir" sai do cartão de membro | Vai só para o pop-up de perfil, onde há contexto sobre o que a exclusão leva junto. Excluir alguém não é ação de passagem |
| O pato em **um** estado só | O quadro inteiramente vazio. Repetido em cada vazio, viraria papel de parede — mesma disciplina do `--brasa` |

### Armadilhas que isto encontrou

**`class-validator` recusa a string do formulário.** A camada de páginas recebe
strings e as normaliza com os helpers de `common/form.ts`; a API JSON usa DTOs,
onde `@IsInt()` rejeita `"3"` e `@IsDateString()` rejeita `""`. O JS do pop-up
converte os números e manda campo vazio como `undefined` — omitido do JSON —,
nunca como `""`.

**O `Accept` não é detalhe.** `wantsJson` só devolve JSON quando o cabeçalho tem
`application/json` **e não tem** `text/html`. Sem isso, um erro de validação
volta como redirect 303 e o `fetch` engole a mensagem.

**Multipart continua fora do middleware de CSRF.** A aba de anexos posta
`multipart/form-data`, e o corpo só existe depois do `FileInterceptor`. O
handler chama `assertCsrf(req)` na primeira linha — rota nova que receba
multipart e esqueça isso fica **sem proteção**.

**`date_utc`, nunca `date`.** O prazo é data sem hora gravada em meia-noite UTC;
o filtro local mostra o dia anterior no fuso de São Paulo. Servir o detalhe como
partial do Nunjucks, em vez de montá-lo em JavaScript, é o que mantém isso
resolvido num lugar só.

### Como foi verificado

- `node render-check.cjs` — 18 casos, incluindo as bordas: membro sem sobrenome,
  sem setor e com carga zero; tarefa sem descrição, sem prazo e sem projeto;
  quadro vazio; Cloudinary desligado.
- `npx jest` — 52 testes, incluindo os do CSV.
- `npx jest --config ./test/jest-e2e.json test/painel.e2e-spec.ts` — o **primeiro
  teste de rota de página do projeto**: sem sessão, `/painel/membros` e
  `/painel/tarefa/:id` redirecionam para o login preservando o destino, e
  `/tasks/:id/anexos` responde 401 em JSON. Roda sem banco, porque o
  `PrismaService` é trocado por um dublê — um teste que exige Postgres no ar não
  roda em CI e, na prática, não roda nunca.
- `npx tsc --noEmit`.

### O que continua fora de escopo

Paginação, edição em massa, arrastar membro entre setores, notificação por
e-mail e tempo real. Dois administradores no quadro ao mesmo tempo continuam sem
ver a mudança um do outro sem recarregar.

---

## Escopo por setor, setor derivado e limpeza do topo — 31/07/2026

Segunda leva de ajustes, pedidos depois da entrega do diretório e dos pop-ups.

### 1. O diretor passou a enxergar apenas o próprio setor

**Antes.** `diretor` caía no mesmo ramo `vePainelCompleto` que presidente, vice
e administrador: via todas as tarefas, todos os membros e todas as abas de
setor. O painel dele era idêntico ao do presidente, e "Painel do Diretor" no
título era só uma palavra.

**Agora.** A regra vive em `src/common/escopo.ts` e nada mais a duplica:

```ts
VE_TODOS_OS_SETORES = [presidente, vice_presidente, administrador, antiga_gestao]
escopoDeSetor(membro)  // null = vê tudo; { setorId } = preso a um setor
```

Ela mora em `common/` e não em `pages/` porque `tasks/` e `members/` também a
consultam, e `tasks/` não pode importar de `pages/` sem inverter a dependência
entre os módulos. Uma lista de permissão duplicada é uma lista que diverge.

| Onde | O que mudou |
| --- | --- |
| `/painel` | Membros, setores e tarefas filtrados. A barra de abas e o balde "Sem Setor" somem — a aba do próprio setor repetiria a aba "Todos" |
| `/painel/membros` | Lista só o setor, com aviso dizendo de quem é a lista |
| `/painel/tarefa/:id` e `.../editar`, `.../excluir`, `.../anexos` | `assertTarefaNoEscopo` recusa tarefa de outro setor |
| `<select>` de responsável | Só quem está no escopo — oferecer o clube inteiro seria oferecer opções que terminam em 403 |
| `TasksService.create/update/delete` | `assertSetorPermitido`, no *service*, então vale para a camada de páginas **e** para a API JSON |

**Antiga gestão continua vendo tudo**, em leitura: é memória institucional, não
operação de um setor.

**Diretor sem setor** cai em `{ setorId: null }` e vê o balde "sem setor" — é
coerente (o setor dele *é* nenhum) e evita a tela morta que "não vê nada"
produziria.

**Duas armadilhas que apareceram no caminho:**

*Um bypass de tipo.* A primeira versão aceitava `Cargo | Ator` nos métodos de
escrita, para não revisar os oito call sites de uma vez. Um chamador que
passasse só o cargo passaria por `assertPodeGerir` e sairia **ileso** de
`assertSetorPermitido`, porque sem `setorId` não há fronteira a comparar — um
bypass silencioso de checagem de permissão, e o compilador calado. O tipo passou
a exigir o membro inteiro.

*Uma fronteira faltando.* A checagem inicial olhava só o setor de **origem** da
tarefa. Como o setor segue o responsável, um diretor podia pegar a própria
tarefa, reatribuir para alguém de outro setor e plantá-la no setor alheio,
saindo do próprio campo de visão no mesmo movimento. Hoje `update` checa origem
**e** destino. Quem pegou isso foi o teste, não a leitura.

### 2. O setor da tarefa deixou de ser um campo

Era um `<select>` que podia contradizer o responsável: dava para criar uma
tarefa de Design atribuída a alguém de Desenvolvimento, e a aba de setor do
painel passava a mostrar uma pessoa que não era de lá.

Agora **o setor é sempre o do responsável**, e reatribuir move o setor junto. A
regra é aplicada no `TasksService`, autoridade compartilhada pelos três caminhos
de escrita — formulário, API JSON e importação de CSV. Fosse no controller, cada
caminho teria a sua cópia e o terceiro esqueceria.

O que saiu: o `<select>` do formulário, `setorId` dos DTOs da API e a leitura do
campo nos handlers de página. O que entrou no lugar: um espelho em mono que diz
em que setor a tarefa vai cair, atualizado ao trocar o responsável — para
ninguém descobrir o setor depois de salvar.

Na importação de CSV a coluna `setor` **continua sendo validada** (setor
inexistente ainda é erro de linha, senão typos passariam batidos no arquivo
exportado e reimportado), mas o valor gravado é o do responsável: importar não
pode ser a porta dos fundos para uma regra que o formulário aplica.

### 3. O diretório voltou para a mesma aba

O `target="_blank"` saiu dos links internos — navbar, cabeçalho do painel, "Ver
membros" de cada aba e os segmentos da régua de carga. Os links de **anexo**
continuam abrindo fora: apontam para arquivo no Cloudinary ou URL externa, e aí
outra aba é o certo.

O custo conhecido: ao voltar do diretório, o painel recarrega e os filtros e a
rolagem do quadro se perdem. Era exatamente o que o `_blank` evitava.

### 4. "+ Membro" e "+ Tarefa" saíram do topo

Da navbar e do cabeçalho do painel. A navbar é navegação — diz onde se pode ir,
não o que se pode criar. Criar passou a morar onde a coisa criada vive: a tarefa
no `+` de cada coluna do kanban, que já a faz nascer no status daquela coluna
(melhor que o botão do cabeçalho, que criava sempre pendente); o membro no
"+ Novo membro" do diretório.

### 5. Importar tarefas por CSV ficou achável

**A função já existia** — `POST /painel/tarefas/importar`, com validação linha a
linha, `id` preenchido atualizando em vez de duplicar, e `assertCsrf` na
primeira linha do handler por ser multipart. O problema era achar: as
ferramentas viviam dentro do cabeçalho da aba "Todos", visíveis só depois de
rolar até o quadro e só naquela aba.

Subiram para o cabeçalho da página, no espaço aberto pela remoção do "+ Nova
tarefa". O rótulo virou **"Importar tarefas"**, não "Importar CSV": quem quer
cadastrar trinta tarefas de uma vez procura por "tarefas", não pelo formato do
arquivo.

### 6. A imagem da SEMCOMP na home

A foto ao lado do logo (`evento.jpg`, 1400x2100, em pé) deu lugar a
`semcomp-2026.jpg` (1600x400) — a arte original, a mesma de que saiu o recorte
com alfa usado como título. Como é um banner de 4:1 num slot desenhado para um
retrato, `object-fit: cover` mostraria só uma tira do meio do letreiro; a
variante `.event-foto--arte` usa `contain` para a arte aparecer inteira.

### 7. O chat

Já havia sido removido em 30/07/2026, e a varredura confirmou: sem módulo, sem
templates, sem CSS/JS, sem rotas nomeadas, sem models no schema, sem `pusher` no
`package.json` e sem `PUSHER_*` no `.env.example`. Continua em disco apenas
`backend/backup-chat-1785452995146.json`, o backup gerado antes do `db push` —
mantido porque é o único registro das conversas dropadas.

### Como foi verificado

- `npx jest` — **73 testes**, incluindo `escopo.spec.ts` (quem vê o quê) e
  `tasks.service.spec.ts` (setor derivado e fronteira de setor, com o Prisma
  dublado). Testados no *service* de propósito: é ele que a camada de páginas e
  a API JSON chamam, então um teste de rota provaria um caminho só.
- `node render-check.cjs` — 20 casos, agora com painel e diretório em escopo
  restrito.
- `npx jest --config ./test/jest-e2e.json` e `npx tsc --noEmit`.
