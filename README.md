# Documentação — Sistema Administrativo do Clube de Programação

Documentação técnica do sistema. Comece por [Instalação](docs/instalacao.md) se
você só quer rodar o projeto.

## Especificação

| Documento | Para quê |
| --- | --- |
| [Especificação do sistema](specs/sistema.md) | Visão completa: escopo, arquitetura, cargos, dados e rotas |

## Índice

| Documento | Para quê |
| --- | --- |
| [Instalação](docs/instalacao.md) | Subir o projeto localmente do zero |
| [Configuração](docs/configuracao.md) | Todas as variáveis de ambiente e o que acontece sem cada uma |
| [Arquitetura](docs/arquitetura.md) | Como o código está organizado e por quê |
| [Rotas](docs/rotas.md) | Mapa completo das rotas HTTP |
| [Autenticação e permissões](docs/autenticacao-e-permissoes.md) | Sessão, CSRF e o que cada cargo pode fazer |
| [Banco de dados](docs/banco-de-dados.md) | Modelos, enums e como aplicar o schema |
| [Templates e front-end](docs/templates-e-frontend.md) | Nunjucks, filtros herdados do Django, CSS e JS |
| [Imagens e fontes](docs/imagens-e-fontes.md) | Assets do site público |
| [Deploy](docs/deploy.md) | Publicação na Vercel |
| [Correções aplicadas](docs/correcoes.md) | O que estava quebrado e o que foi feito |
| [Solução de problemas](docs/solucao-de-problemas.md) | Erros comuns e como resolver |

## Visão geral em 30 segundos

Aplicação web administrativa de um clube de programação: membros, setores,
tarefas em kanban, anexos e um fluxo de solicitação de cadastro com aprovação.

- **Renderização no servidor.** Não é uma SPA. O NestJS renderiza HTML com
  Nunjucks e os formulários fazem `POST` tradicional com redirect.
- **Stack:** NestJS (Express) + Prisma + PostgreSQL (Supabase), sessão em cookie
  via `iron-session` e Cloudinary para anexos.
- **Origem:** é a reescrita de um sistema Django. Vários nomes de rota, campos de
  formulário e filtros de template foram mantidos por compatibilidade — isso está
  sinalizado ao longo dos documentos.
