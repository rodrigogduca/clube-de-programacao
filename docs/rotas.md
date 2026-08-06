# Rotas

75 rotas no total. A lista abaixo confere com a que o Nest registra em tempo de
execução.

Legenda de acesso: **pública** · **logado** (qualquer membro) · **cargo** (o
service recusa quem não tem permissão — veja
[Autenticação e permissões](autenticacao-e-permissoes.md)).

## Páginas públicas

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/` | Página inicial |
| `GET` | `/accounts/login` | Tela de login (redireciona para `/painel` se já logado) |
| `POST` | `/accounts/login` | Autentica; alias: `POST /auth/login` |
| `POST` | `/accounts/logout` | Encerra a sessão; alias: `POST /auth/logout` |
| `GET` | `/solicitar-cadastro` | Formulário de solicitação de acesso |
| `POST` | `/solicitar-cadastro` | Envia a solicitação |
| `GET` | `/robots.txt` | Bloqueia `/painel/`, `/accounts/` e `/api/` |
| `GET` | `/sitemap.xml` | Sitemap com as páginas públicas |
| `GET` | `/health` | Verificação de saúde |
| `GET` | `/auth/me` | Sessão atual em JSON (`null` se anônimo) |

## Painel

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/painel` | Kanban. Renderiza `painel_admin` ou `painel_membro` conforme o cargo |

### Membros

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/painel/membros` | Diretório de membros, com carga de trabalho. Aceita `?setor=:id` |
| `GET` | `/painel/adicionar-membro` | Formulário |
| `POST` | `/painel/adicionar-membro` | Cria usuário + membro numa transação |
| `GET` | `/painel/membro/:membro_id/editar` | Formulário preenchido |
| `POST` | `/painel/membro/:membro_id/editar` | Atualiza dados do usuário e do membro |
| `GET` | `/painel/membro/:membro_id/excluir` | Confirmação |
| `POST` | `/painel/membro/:membro_id/excluir` | Exclui (recusa o próprio perfil) |

### Setores

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/painel/criar-setor` | Formulário |
| `POST` | `/painel/criar-setor` | Cria |
| `GET` | `/painel/setor/:setor_id/editar` | Formulário preenchido |
| `POST` | `/painel/setor/:setor_id/editar` | Atualiza |
| `GET` | `/painel/setor/:setor_id/excluir` | Confirmação |
| `POST` | `/painel/setor/:setor_id/excluir` | Exclui; membros ficam sem setor |

### Tarefas

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/painel/tarefa/:tarefa_id` | Detalhe em leitura. `?parcial=1` devolve só o miolo, que é o que o pop-up injeta |
| `GET` | `/painel/criar-tarefa` | Formulário. `?parcial=1` devolve só o formulário; `?status=` define a coluna de nascimento |
| `POST` | `/painel/criar-tarefa` | Cria |
| `GET` | `/painel/tarefa/:tarefa_id/editar` | Formulário preenchido. `?parcial=1` devolve só o formulário |
| `POST` | `/painel/tarefa/:tarefa_id/editar` | Atualiza |
| `POST` | `/painel/tarefa/:tarefa_id/atualizar` | Só o status — é o `<select>` do kanban |
| `GET` | `/painel/tarefa/:tarefa_id/excluir` | Confirmação |
| `POST` | `/painel/tarefa/:tarefa_id/excluir` | Exclui |
| `GET` | `/painel/tarefas/exportar.csv` | Exporta as tarefas visíveis em CSV |
| `GET` | `/painel/tarefas/modelo.csv` | Baixa o modelo de importação |
| `POST` | `/painel/tarefas/importar` | Importa tarefas de um CSV (multipart) |
| `POST` | `/painel/tarefas/limpar` | Remove tarefas em lote |

### Anexos

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/painel/tarefa/:tarefa_id/anexos` | Lista e formulários de envio |
| `POST` | `/painel/tarefa/:tarefa_id/anexos` | Envia arquivo ou adiciona link (campo `action`). `?parcial=1` devolve a lista renderizada, que é o que a aba do pop-up injeta. **Multipart: o handler chama `assertCsrf(req)` na primeira linha** |
| `GET` | `/painel/anexo/:anexo_id/editar` | Formulário |
| `POST` | `/painel/anexo/:anexo_id/editar` | Atualiza nome e URL |
| `GET` | `/painel/anexo/:anexo_id/excluir` | Confirmação |
| `POST` | `/painel/anexo/:anexo_id/excluir` | Exclui (também remove do Cloudinary) |

### Solicitações de cadastro

| Método | Caminho | Descrição |
| --- | --- | --- |
| `GET` | `/painel/solicitacoes` | Lista; filtro por `?status=pendente\|aprovada\|rejeitada` |
| `GET` | `/painel/solicitacoes/:solicitacao_id/editar` | Formulário |
| `POST` | `/painel/solicitacoes/:solicitacao_id/editar` | Atualiza (só se pendente) |
| `POST` | `/painel/solicitacoes/:solicitacao_id/aprovar` | Cria usuário + membro numa transação |
| `POST` | `/painel/solicitacoes/:solicitacao_id/rejeitar` | Marca como rejeitada |
| `POST` | `/painel/solicitacoes/:solicitacao_id/excluir` | Remove do histórico |

## API REST (JSON)

Todos exigem sessão autenticada, exceto `POST /signup-requests`.

**O painel consome parte desta API.** O pop-up de tarefa cria, edita e move por
`POST /tasks`, `PATCH /tasks/:id` e `PATCH /tasks/:id/status`; o pop-up de perfil
lê `GET /members/:id` e `GET /members/:id/tarefas`. Como a camada de páginas e a
API compartilham os mesmos *services*, as permissões valem igualmente nos dois
caminhos.

Uma diferença que morde: a API valida com `class-validator`, onde `@IsInt()`
**rejeita a string `"3"`** e `@IsDateString()` rejeita `""`. O JavaScript do
pop-up converte os números e omite campo vazio do JSON em vez de mandar `""`.

### `/members`

| Método | Caminho |
| --- | --- |
| `GET` | `/members` |
| `GET` | `/members/:id` |
| `GET` | `/members/:id/tarefas` (aceita `?limite=`; devolve contagem por status e as mais recentes) |
| `POST` | `/members` (vincula um `userId` já existente) |
| `PATCH` | `/members/:id` |
| `DELETE` | `/members/:id` |

### `/sectors`

| Método | Caminho |
| --- | --- |
| `GET` | `/sectors` |
| `GET` | `/sectors/:id` |
| `POST` | `/sectors` |
| `PATCH` | `/sectors/:id` |
| `DELETE` | `/sectors/:id` |

### `/tasks`

| Método | Caminho |
| --- | --- |
| `GET` | `/tasks` |
| `GET` | `/tasks/:id` |
| `GET` | `/tasks/:id/anexos` |
| `POST` | `/tasks` |
| `PATCH` | `/tasks/:id` |
| `PATCH` | `/tasks/:id/status` |
| `DELETE` | `/tasks/:id` |

### `/signup-requests`

| Método | Caminho | Acesso |
| --- | --- | --- |
| `GET` | `/signup-requests` | cargo |
| `GET` | `/signup-requests/:id` | cargo |
| `POST` | `/signup-requests` | **pública** |
| `POST` | `/signup-requests/:id/aprovar` | cargo |
| `POST` | `/signup-requests/:id/rejeitar` | cargo |
| `DELETE` | `/signup-requests/:id` | cargo |

## O gerador de URLs dos templates

`src/views/routes.ts` mapeia nomes para caminhos, no estilo do `{% url %}` do
Django. Os templates chamam:

```njk
<a href="{{ url('editar_tarefa', tarefa.id) }}">Editar</a>
```

`buildUrl` substitui cada `:param` na ordem em que os argumentos aparecem. Nome
desconhecido devolve `#` em vez de quebrar a página.

**Ao criar uma rota nova usada por template, adicione o nome nesse arquivo** —
senão o link vira `#` silenciosamente.
