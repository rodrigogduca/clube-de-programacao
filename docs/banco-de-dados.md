# Banco de dados

PostgreSQL acessado via Prisma. O schema está em `backend/prisma/schema.prisma`.

## Modelos

| Modelo | Tabela | Papel |
| --- | --- | --- |
| `User` | `users` | Credenciais e identidade |
| `Member` | `members` | Perfil no clube: cargo, setor, bio. 1‑para‑1 com `User` |
| `Sector` | `sectors` | Setor (área) do clube |
| `Task` | `tasks` | Tarefa do kanban |
| `TaskAttachment` | `task_attachments` | Anexo de tarefa (arquivo ou link) |
| `SignupRequest` | `signup_requests` | Pedido de cadastro aguardando aprovação |

Os nomes das tabelas estão em inglês; os campos misturam inglês (`firstName`,
`passwordHash`) e português (`cargo`, `dataEntrada`, `prazo`), herança da
migração do Django.

## Enums

| Enum | Valores |
| --- | --- |
| `Cargo` | `presidente`, `vice_presidente`, `administrador`, `diretor`, `antiga_gestao`, `membro` |
| `TarefaStatus` | `pendente`, `em_andamento`, `concluida` |
| `TarefaPrioridade` | `baixa`, `media`, `alta`, `urgente` |
| `TarefaFuncao` | `design`, `desenvolvimento`, `marketing`, `gestao`, `pesquisa`, `outro` |
| `AnexoTipo` | `arquivo`, `link` |
| `SolicitacaoStatus` | `pendente`, `aprovada`, `rejeitada` |

## Comportamento ao excluir

| Exclusão | Efeito |
| --- | --- |
| `User` | Exclui o `Member` em cascata |
| `Member` | Exclui em cascata as tarefas em que é **responsável** |
| `Sector` | Membros e tarefas ficam com `setorId = null` |
| `Task` | Exclui os anexos em cascata |

O ponto que costuma surpreender: **excluir um membro apaga as tarefas atribuídas
a ele**. Tarefas que ele apenas criou sobrevivem (`criadoPorId` vira `null`). A
tela de confirmação avisa sobre isso.

## Aplicando o schema

**Não existe pasta `prisma/migrations` neste repositório.** Consequência:
`npm run prisma:deploy` (`prisma migrate deploy`) não tem o que aplicar.

Para um banco de desenvolvimento ou novo:

```bash
npm run prisma:generate
npm run prisma:push        # prisma db push
```

Se quiser passar a versionar mudanças de schema daqui em diante, crie a primeira
migration com `npm run prisma:migrate`. A partir daí `prisma:deploy` passa a
funcionar e é o caminho recomendado para produção.

## Migração de dados do sistema Django

O banco de produção já recebeu a carga do sistema antigo. Para refazer:

1. Gere um dump do banco de origem com `pg_dump` 18 ou superior.
2. Restaure no banco de destino.
3. Copie os dados das tabelas do Django (`auth_user`, `core_membro`,
   `core_setor`, `core_tarefa`, ...) para as tabelas do schema Prisma.
4. Confira as contagens de `users`, `members`, `sectors`, `tasks`,
   `task_attachments` e `signup_requests`.

As senhas não precisam de conversão: o `PasswordService` lê hashes
`pbkdf2_sha256` do Django e os converte para bcrypt no primeiro login válido.
Detalhes em [Autenticação](autenticacao-e-permissoes.md#senhas-vindas-do-django).

## Notas de desempenho

- `sectorsService.list()` carrega, para cada setor, os membros e as tarefas com
  seus responsáveis e anexos. É pesado e serve só para o painel completo. Para
  preencher `<select>`, use **`listSimple()`**, que busca apenas `id`, `nome` e
  `descricao`.
- Use sempre o **pooler** do Supabase (porta 6543, com `?pgbouncer=true`) em
  ambiente serverless. Cada invocação abre conexão, e a conexão direta satura
  rápido.
