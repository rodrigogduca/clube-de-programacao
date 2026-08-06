# Solução de problemas

## A aplicação não sobe

### `SESSION_SECRET is required`

Falta a variável no `.env`, ou o arquivo não está em `backend/.env`.

### Erro do `iron-session` sobre tamanho da chave

`SESSION_SECRET` tem menos de 32 caracteres. Gere um novo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### `Cannot find module '@prisma/client'`

```bash
npm run prisma:generate
```

Necessário após clonar o projeto e sempre que o `schema.prisma` mudar.

### `Can't reach database server`

`DATABASE_URL` errada ou banco fora do ar. Em Supabase, confira se está usando o
host do pooler e se o IP está liberado.

## Problemas de login

### "Usuario ou senha incorretos" com credenciais certas

Verifique, nessa ordem:

1. O usuário existe em `users` (o login aceita username **ou** e-mail).
2. `isActive` está `true`.
3. O `passwordHash` está num formato reconhecido: bcrypt (`$2a$`, `$2b$`, `$2y$`)
   ou Django (`pbkdf2_sha256$...`). Qualquer outro formato é rejeitado sem
   tentativa.

### Login parece funcionar, mas volta para a tela de login

O cookie não está sendo aceito. Em produção sob HTTPS, confirme
`NODE_ENV=production` — sem isso o cookie sai sem `secure` e o navegador o
descarta.

### Logado, mas toda página redireciona para o login

O `AuthenticatedGuard` está invalidando a sessão. Causas possíveis:

- O `sessionVersion` do usuário foi alterado no banco (isso é o mecanismo de
  revogação funcionando).
- `isActive` virou `false`.
- O usuário não tem registro em `members`. Nesse caso a mensagem é diferente:
  *"Sua conta ainda nao possui um perfil de membro"*.

## "Token de seguranca invalido ou expirado"

Erro de CSRF. Situações normais:

- A página ficou aberta além do TTL da sessão (12h por padrão). Recarregar
  resolve.
- O `SESSION_SECRET` mudou desde que a página foi carregada.

Se acontecer sempre numa rota específica que você acabou de criar:

- O template esqueceu de `{{ csrf_token() | safe }}` dentro do `<form>`.
- Ou a rota recebe `multipart/form-data` e o handler não chamou `assertCsrf(req)`
  — nesses casos o middleware deixa passar de propósito, porque o corpo ainda não
  foi lido. Veja
  [Autenticação](autenticacao-e-permissoes.md#proteção-contra-csrf).

## Páginas

### Uma página quebra inteira, com erro de template

Quase sempre é sintaxe do Django que o Nunjucks não entende. A campeã é
`{% with %}`, que não existe — use `{% set %}`. A lista de diferenças está em
[Templates e front-end](templates-e-frontend.md#herança-do-django-leia-antes-de-mexer).

Para checar todos os templates de uma vez sem subir a aplicação, renderize-os com
um contexto de teste — foi assim que os problemas atuais foram encontrados.

### Um link virou `#`

O nome não existe em `src/views/routes.ts`. O `buildUrl` devolve `#` em vez de
lançar erro, então a falha é silenciosa. Adicione o nome ao mapa.

### CSS não carrega

Os estáticos vêm de `dist/src/public`. Confirme que existem depois do build:

```bash
ls backend/dist/src/public/css
```

Se estiverem faltando, o `assets` do `nest-cli.json` não cobre o diretório.

## Kanban e tarefas

### O `<select>` de status aparece vazio

`STATUS_CHOICES` precisa ser lista de **pares** (`statusChoicePairs`), não de
objetos. O template usa `{% for value, label in ... %}`.

### "Voce so pode alterar o status das suas proprias tarefas"

Comportamento esperado: membro comum só move as tarefas em que é responsável.
Cargos de gestão movem qualquer uma.

## Anexos

### "O upload de arquivos nao esta configurado neste ambiente"

Faltam as credenciais do Cloudinary. Anexos por link continuam funcionando. Veja
[Configuração](configuracao.md#anexos-cloudinary).

## Banco de dados

### `prisma migrate deploy` não faz nada

Não existe pasta `prisma/migrations` no repositório. Use `npm run prisma:push`,
ou crie a primeira migration com `npm run prisma:migrate`.

### Excluí um membro e tarefas sumiram

Comportamento do schema: tarefas em que a pessoa era **responsável** são apagadas
em cascata. Tarefas que ela apenas criou permanecem, com `criadoPorId` nulo.

## Produção

### Erros de conexão sob carga

Use o pooler do Supabase (porta 6543, `?pgbouncer=true`). A conexão direta não
aguenta o padrão de conexões do serverless.

### Erro 500 sem detalhes na tela

É intencional: erros 5xx mostram apenas *"Tente novamente em instantes"*. O
detalhe com stack vai para o log, sob o contexto `HTTP`. Consulte os logs da
Vercel.
