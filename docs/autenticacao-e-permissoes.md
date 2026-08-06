# Autenticação e permissões

## Sessão

A sessão vive num cookie criptografado (`iron-session`), sem estado no servidor —
o que é necessário para o deploy serverless.

Conteúdo do cookie:

| Campo | Uso |
| --- | --- |
| `userId` | Identifica o usuário |
| `role` | Cargo no momento do login (apenas informativo) |
| `sessionVersion` | Cópia do `sessionVersion` do usuário; ver revogação abaixo |
| `issuedAt` | Quando a sessão foi criada |
| `csrfToken` | Token de CSRF da sessão |
| `flash` | Mensagens pendentes para a próxima página |

Atributos do cookie: `httpOnly`, `sameSite=lax`, `path=/` e `secure` quando
`NODE_ENV=production`. Validade padrão de 12 horas (`SESSION_TTL_HOURS`).

## Login

`POST /accounts/login` (o alias `POST /auth/login` também funciona).

Campos: `identifier` (usuário **ou** e-mail, sem diferenciar maiúsculas) e
`password`. O campo opcional `next` permite voltar para a página que exigiu o
login — só caminhos internos são aceitos, para evitar *open redirect*.

Credenciais erradas geram uma mensagem flash e devolvem para a tela de login. No
login bem-sucedido o token CSRF é regenerado, o que fecha a brecha de fixação de
token.

### Senhas vindas do Django

O `PasswordService` reconhece dois formatos:

- **bcrypt** (`$2a$`, `$2b$`, `$2y$`) — formato atual
- **`pbkdf2_sha256$...`** — formato do Django

Quando um usuário migrado acerta a senha, o hash é convertido para bcrypt e
gravado naquele mesmo login. A migração acontece sozinha, um usuário por vez.

## Revogação de sessão

Cada `User` tem um `sessionVersion` (padrão `1`). O `AuthenticatedGuard` compara,
**a cada requisição**, o valor do cookie com o do banco. Se diferirem, a sessão é
destruída.

Para desconectar alguém imediatamente, incremente o `sessionVersion` daquele
usuário. Desativar a conta (`isActive = false`) tem o mesmo efeito.

## Proteção contra CSRF

Como a autenticação é por cookie, toda requisição que altera dados precisa de
token — sem isso, um site externo conseguiria enviar formulários em nome de quem
está logado.

- O token é gerado na primeira requisição `GET` e guardado na sessão.
- Templates o injetam com `{{ csrf_token() | safe }}`, que produz
  `<input type="hidden" name="csrfmiddlewaretoken" value="...">`.
- O nome do campo foi mantido igual ao do Django por compatibilidade com os
  templates herdados. O middleware também aceita o token no cabeçalho
  `X-CSRFToken`, para requisições feitas por JavaScript.
- Métodos `POST`, `PATCH`, `PUT` e `DELETE` são validados; `GET`, `HEAD` e
  `OPTIONS` não.
- A comparação usa `timingSafeEqual`.

**Caso especial do multipart.** No upload de arquivo o corpo só é lido pelo
`multer`, que roda *depois* dos middlewares. Nessas requisições o middleware
deixa passar e o próprio handler chama `assertCsrf(req)` logo na primeira linha.
Se você criar uma nova rota que recebe `multipart/form-data`, **precisa fazer o
mesmo** — caso contrário ela fica sem proteção.

## Cargos

```
presidente > vice_presidente > administrador > diretor > antiga_gestao > membro
```

### Quem pode o quê

| Ação | presidente | vice | admin | diretor | antiga gestão | membro |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Ver painel completo | ✅ | ✅ | ✅ | só o setor³ | ✅ | ❌ |
| Criar membro | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar membro | ✅ | ✅ | ✅ | parcial¹ | ❌ | ❌ |
| Excluir membro | ✅ | ✅² | ✅ | ❌ | ❌ | ❌ |
| Criar/editar/excluir tarefa | ✅ | ✅ | ✅ | só do setor³ | ✅ | ❌ |
| Mover tarefa no kanban | ✅ | ✅ | ✅ | ✅ | ✅ | só as suas |
| Gerenciar setores | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aprovar/rejeitar cadastro | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

¹ Diretor edita membros, mas não quem é presidente, vice ou administrador.
² Vice-presidente não exclui presidente nem administrador.
³ Ver “Escopo por setor” abaixo.

### Escopo por setor

Cargo diz **o que** a pessoa pode fazer; escopo diz **sobre quem**. São duas
perguntas, e o sistema as responde em lugares diferentes.

```ts
// src/common/escopo.ts
VE_TODOS_OS_SETORES = [presidente, vice_presidente, administrador, antiga_gestao]
escopoDeSetor(membro)  // null = vê tudo; { setorId } = preso a um setor
```

O **diretor não está na lista**: ele dirige um setor e enxerga o setor que
dirige — no painel, no diretório de membros e no detalhe da tarefa —, e só
gerencia tarefas dele. Antiga gestão continua vendo tudo, em leitura: é
memória institucional, não operação de um setor. Diretor sem setor cai em
`{ setorId: null }` e vê o balde “sem setor”.

A regra mora em `common/` e não em `pages/` porque `tasks/` e `members/` também
a consultam, e `tasks/` não pode importar de `pages/` sem inverter a
dependência entre os módulos. **Uma lista de permissão duplicada é uma lista
que diverge.**

> **Escopo se aplica no *service*, não só no controller.** `TasksService`
> chama `assertSetorPermitido` em `create`, `update` e `delete`, então a
> fronteira vale igual para a camada de páginas e para `PATCH /tasks/:id`.
> Filtrar só o que a tela mostra não é restringir: as URLs do painel são
> adivinháveis.

Em `update` são **duas** checagens, não uma — o setor de origem da tarefa e o
de destino. Como o setor segue o responsável, sem a segunda um diretor
reatribuiria a própria tarefa para alguém de outro setor e a plantaria no setor
alheio, saindo do próprio campo de visão no mesmo movimento.

### Regras adicionais sobre cargos

- Presidente e administrador atribuem qualquer cargo.
- Vice-presidente atribui qualquer cargo **exceto** presidente e administrador.
- Ninguém consegue excluir o próprio perfil (bloqueio explícito no controller).

### Onde cada regra mora

As permissões são aplicadas **nos services**, não nos controllers. Isso garante
que valem tanto para as páginas HTML quanto para a API REST.

| Arquivo | Regras |
| --- | --- |
| `members.service.ts` | `canManageMember`, `canEditMemberCargo`, `canChangeToCargo`, `canDeleteMember` |
| `tasks.service.ts` | `PODE_GERIR_TAREFAS` e a exceção do responsável em `updateStatus` |
| `sectors.service.ts` | `canManageSectors` |
| `signup-requests.service.ts` | `canApprove` |
| `page-context.service.ts` | As flags `can_*` que os templates leem para esconder botões |

As flags `can_*` controlam **apenas o que aparece na tela**. Elas não substituem
a checagem do service — esconder um botão não protege nada.

## Um detalhe sobre senhas em texto puro

O modelo `SignupRequest` tem um campo `senhaPlain` e o template
`solicitacoes.njk` consegue exibi-lo. O código **nunca preenche esse campo**: a
senha de uma solicitação é gravada apenas como hash bcrypt.

A exibição está protegida por `membro.is_superadmin`, uma flag que também nunca é
definida — ou seja, o bloco nunca renderiza. É resquício do sistema antigo. Se
alguém quiser reativar isso, vale lembrar que guardar senha em texto puro é uma
péssima ideia.
