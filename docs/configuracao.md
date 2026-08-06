# Configuração

Todas as variáveis ficam em `backend/.env`. O modelo está em
`backend/.env.example`. A leitura é feita pelo `@nestjs/config`, registrado como
módulo global em `src/app.module.ts`.

## Obrigatórias

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL. Em Supabase/Vercel use a porta do **pooler** (6543) com `?pgbouncer=true`, não a conexão direta. |
| `SESSION_SECRET` | Chave de criptografia do cookie de sessão. **Mínimo 32 caracteres.** Abaixo disso o `iron-session` lança erro no boot. |

Trocar o `SESSION_SECRET` invalida todas as sessões ativas — todo mundo é
deslogado. Isso é intencional e é a forma mais rápida de revogar acesso geral.

## Aplicação

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `NODE_ENV` | `development` | Em `production` o cookie de sessão passa a exigir HTTPS (`secure: true`). |
| `PORT` | `3000` | Porta do servidor. Ignorada no deploy serverless. |
| `SITE_URL` | vazio | URL pública canônica. Usada nas tags `canonical`/Open Graph e no `sitemap.xml`. Se vazia, é deduzida do cabeçalho `Host`. |
| `CORS_ORIGIN` | libera tudo | Lista separada por vírgulas. **Defina em produção** — o padrão (`origin: true`) reflete qualquer origem, e como a API usa `credentials: true`, isso é permissivo demais. |

## Sessão

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `SESSION_COOKIE_NAME` | `club_session` | Nome do cookie. |
| `SESSION_TTL_HOURS` | `12` | Validade da sessão em horas (mínimo de 1 hora é forçado no código). |
| `BCRYPT_ROUNDS` | `12` | Custo do bcrypt. Valores `<= 3` são ignorados e caem para 12. |

## Anexos (Cloudinary)

| Variável | Descrição |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Nome da conta |
| `CLOUDINARY_API_KEY` | Chave |
| `CLOUDINARY_API_SECRET` | Segredo |

**Sem as três, apenas o upload de arquivos fica desativado.** Anexos do tipo
*link* continuam funcionando normalmente. A tela de anexos mostra um aviso
explicando isso, e o serviço registra um `warn` no boot.

## E-mail (SMTP)

| Variável | Descrição |
| --- | --- |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, `DEFAULT_FROM_EMAIL` | Credenciais SMTP |

> **Nota:** o `nodemailer` está no `package.json` e as variáveis estão no
> `.env.example`, mas **nenhum código do sistema envia e-mail hoje**. Aprovação
> e rejeição de cadastro não notificam ninguém. Essas variáveis existem como
> preparação para um recurso ainda não implementado.

## Resumo do comportamento degradado

| Faltando | O que para de funcionar | O que continua |
| --- | --- | --- |
| Cloudinary | Upload de arquivos | Anexos por link |
| SMTP | Nada (não usado) | Tudo |
| `SITE_URL` | URLs canônicas absolutas confiáveis | Tudo, deduzido do `Host` |
| `CORS_ORIGIN` | Restrição de origem | Tudo, porém permissivo demais para produção |
