# Templates e front-end

## Onde fica o front-end

Não existe pasta `frontend/`. A aplicação é renderizada no servidor, então o
front-end está em três lugares dentro de `backend/src/`:

| O quê | Onde | Papel |
| --- | --- | --- |
| **HTML** | `views/**/*.njk` | As telas, em Nunjucks |
| **CSS, JS, imagens** | `public/` | O que o navegador baixa, servido em `/static` |
| **Os dados** | `pages/*.controller.ts` | Escolhe o template e monta as variáveis |

Para mudar **como uma tela parece**, vá em `views/` e `public/css/`. Para mudar
**o que ela mostra**, vá no controller correspondente em `pages/`.

## Nunjucks

```
views/
├── layouts/
│   ├── base.njk      Esqueleto HTML. O único arquivo com <!DOCTYPE>.
│   ├── painel.njk    Telas autenticadas: navbar, container, flash, painel.js
│   └── auth.njk      Login, cadastro e erro: fundo animado, sem navbar
├── partials/
│   ├── painel_nav.njk  Barra de navegação
│   └── mensagens.njk   Bloco de mensagens flash
├── core/             Telas do sistema
├── registration/     login.njk
└── routes.ts         Nomes de rota -> caminhos
```

### Herança

Nenhuma tela escreve `<html>`, `<head>` ou `<body>`: todas usam
`{% extends %}`. Antes isso não existia e os 23 templates repetiam o mesmo
cabeçalho — trocar uma fonte significava editar 23 arquivos.

Uma tela do painel completa fica assim:

```njk
{% extends "layouts/painel.njk" %}

{% block titulo %}Novo setor - Clube de Programação{% endblock %}

{% block conteudo %}
  <div class="painel-header">
    <div>
      <p class="eyebrow">setores</p>
      <h1>Novo setor</h1>
    </div>
  </div>
{% endblock %}
```

O bloco do cabeçalho é o mesmo em todas as telas — ver
[O cabeçalho de tela](#o-cabeçalho-de-tela).

Blocos de `layouts/painel.njk`:

| Bloco | Para quê |
| --- | --- |
| `titulo` | Texto do `<title>` |
| `meta` | Canonical, Open Graph, robots |
| `classe_main` | Classes do `<main>`. Padrão `painel-container`; o kanban usa `painel-container kanban-container` |
| `conteudo` | O miolo da tela — é o que quase toda tela preenche |
| `fundo_extra` | Elementos decorativos de fundo, além da grade padrão |
| `estilos_extra` | Folhas de estilo adicionais |
| `scripts_extra` | `<script>` além do `painel.js` |

`layouts/auth.njk` tem `cabecalho`, `conteudo` e `rodape`.

As mensagens flash ficam no layout, então valem para **todas** as telas
autenticadas. Antes o bloco era copiado em apenas 5 templates, e um aviso
gerado ao redirecionar para qualquer outra tela simplesmente não aparecia.

## Herança do Django (leia antes de mexer)

Os templates foram convertidos de Django e ainda usam a sintaxe e os filtros de
lá. O Nunjucks é parecido com o Jinja2, mas **não é igual** — e as diferenças
quebram a página inteira, não só um trecho.

### Diferenças que já causaram problema

| Django/Jinja2 | Nunjucks | Observação |
| --- | --- | --- |
| `{% with x=y %}...{% endwith %}` | **não existe** | Use `{% set x = y %}`. A tag desconhecida derruba o render inteiro. |
| `{{ dict.items }}` | não funciona | Não itere dicionários no estilo Django. |
| `{% for a, b in lista %}` | funciona com **pares** | Precisa ser `[[a, b], ...]`, não `[{a, b}, ...]`. |
| `[]` em `{% if %}` | **verdadeiro** | Array vazio é truthy em JS. Passe `null` quando quiser "vazio". |

Por causa da terceira linha, `STATUS_CHOICES` é exportado como pares
(`statusChoicePairs` em `tasks.service.ts`), e não como lista de objetos.

### Filtros registrados

Filtros do Django reimplementados em `bootstrap.ts`:

| Filtro | Uso |
| --- | --- |
| `date(formato)` | `d`, `m`, `Y`, `y`, `H`, `i`, `s` — ex.: `{{ data\|date("d/m/Y H:i") }}` |
| `pluralize` | `{{ n\|pluralize }}` → `s`; `{{ n\|pluralize("ão,ões") }}` escolhe entre os dois |
| `truncatewords(n)` | Corta o texto em `n` palavras |
| `make_list` | Transforma string em lista de caracteres (usado nas iniciais dos avatares) |
| `first` | Primeiro item de lista ou primeiro caractere de string |
| `date_utc(formato)` | Igual ao `date`, mas lê a data em UTC — use em campos sem hora, como `prazo` |

### Globais

| Global | Uso |
| --- | --- |
| `static('css/x.css')` | Gera `/static/css/x.css` |
| `url('nome', param)` | Resolve pelo `views/routes.ts` |
| `csrf_token()` | Campo oculto com o token; **sempre com `\| safe`** |

`csrf_token` existe como global vazio só para não quebrar caso alguma página
esqueça de passá-lo; o valor real vem do contexto injetado pelo
`PageContextService` a cada requisição.

## Mensagens flash

Toda página autenticada recebe `messages` no contexto:

```njk
{% if messages %}
  <div class="messages">
    {% for message in messages %}
      <div class="alert alert-{{ message.tags }}">{{ message.text }}</div>
    {% endfor %}
  </div>
{% endif %}
```

`tags` é `success`, `error`, `warning` ou `info`. Cada mensagem é exibida uma
única vez: o `PageContextService` a consome e limpa da sessão.

## Sistema visual do painel

O CSS da área autenticada está em `public/css/painel/`, em 13 módulos que o
`layouts/painel.njk` carrega **nesta ordem** (`tokens` primeiro porque define as
variáveis; `responsivo` por último porque sobrescreve):

```
tokens · base · nav · layout · botoes · selos · cards · kanban
formularios · validacao · avisos · solicitacoes · anexos
modal · responsivo
```

Eram 2.500 linhas num arquivo só. Ao acrescentar um módulo, lembre de adicionar
o `<link>` no layout — é o único lugar onde a ordem da cascata está declarada.

**Uma paleta só, declarada num lugar só.** A fonte é `css/site/tokens.css`, a
mesma folha que a página inicial usa; `painel/tokens.css` e `style_login.css`
apenas dão apelidos a ela (`--ink: var(--breu)`, `--bg: var(--breu)`). Mexer numa
cor da home muda o painel e o login no mesmo commit.

Já foram três conjuntos de valores parecidos mas não iguais — `#060608` no login
contra `#08080b` na home, `#F0F0F2` contra `#f6f1e9` no texto. A diferença não
aparecia numa tela sozinha; aparecia na troca, como um tom mais frio que ninguém
sabia explicar. **Não declare cor literal em folha nova**: use um token.

| Grupo | Tokens | Uso |
| --- | --- | --- |
| Fundo | `--ink`, `--surface`, `--surface-2`, `--surface-3` | Rampa de elevação |
| Acento | `--ember`, `--ember-soft`, `--ember-deep`, `--ember-wash`, `--ember-line` | Ações e identidade |
| Texto | `--text`, `--text-dim`, `--muted` | Brancos e cinzas quentes, enviesados para o âmbar |
| Traço | `--line`, `--line-strong` | Bordas |
| Estado | `--ok`, `--warn`, `--danger`, `--info` (+ `-wash`) | Semântica, **separada do acento** |

Os nomes antigos (`--primary`, `--bg`, `--border`, `--text-muted`) continuam
existindo como alias, para não quebrar nada que ainda os use.

**Três famílias, três papéis.** Instrument Sans (`--sans` / `--texto`) conduz a
leitura, em todas as telas — home, painel, login e erro. Bricolage Grotesque
(`--display`) fica nos títulos. JetBrains Mono (`--mono`) carrega tudo que é
número, data, contador, rótulo e selo, sempre com
`font-variant-numeric: tabular-nums` para os dígitos não dançarem ao atualizar.
É uma escolha ancorada no assunto: um clube de programação.

`--marca` (Bryndan Write, hospedada em `public/fonts/`) é a voz da marca e só
aparece no nome do clube e nos títulos das telas de autenticação. Um peso só e
sem glifo de travessão — leia `css/site/fontes.css` antes de usá-la em texto novo.

O login, o cadastro e a página de erro pediam `font-family: 'Inter'`, e a Inter
nunca foi carregada em lugar nenhum do projeto: essas três telas caíam na fonte
do sistema enquanto o resto do site rodava em Instrument Sans.

**Estado em forma, não só em texto.** As colunas do kanban têm uma faixa de 2px
no topo com a cor do status; os cards têm uma listra à esquerda que acompanha a
prioridade (via `:has()`); os selos de cargo usam cor para indicar hierarquia.

Tema único (escuro), por escolha — acompanha a grade de fundo, as partículas e o
mascote que já faziam parte da identidade.

### O cabeçalho de tela

Toda tela do painel abre com o mesmo bloco, na mesma ordem:

```html
<div class="painel-header">
  <div>
    <p class="eyebrow">setores</p>      <!-- de que objeto a tela trata -->
    <h1>Novo setor</h1>                 <!-- o que se faz com ele        -->
    <p class="painel-sub">…</p>         <!-- opcional: uma frase de apoio -->
  </div>
  <div class="painel-actions">…</div>   <!-- opcional: ações da tela      -->
</div>
```

O eyebrow não é enfeite: ele é a única coisa na tela que diz em que parte do
sistema você está, já que o painel não tem migalha de pão. Use o plural do
objeto, em minúsculas — `setores`, `membros`, `tarefas`, `anexos`, `cadastro`,
`quadro`.

Nas telas de coluna estreita (formulário, confirmação, detalhe de tarefa) o
cabeçalho vai **dentro** do `.form-page`, para a régua sob o título ter a mesma
largura do cartão.

Havia três padrões concorrentes antes disto, e o terceiro — um `<h1>` solto com
um `<p class="form-subtitle">` cinza — cobria as dez telas de formulário e
confirmação. `.form-subtitle` não existe mais; use `.painel-sub`.

### O vocabulário de botões

Seis classes, e a escolha entre elas é sempre sobre **contexto**, não sobre
gravidade:

| Classe | Quando |
| --- | --- |
| `btn-primary` | A ação da tela. **Uma** por região visual |
| `btn-secondary` | As outras ações, inclusive Cancelar |
| `btn-danger` | Vermelho sólido: a confirmação final, numa tela só dela |
| `btn-danger-ghost` | Contornado: destruir entre pares, numa lista |
| `btn-small` / `btn-small-outline` | Ações dentro de um cartão ou linha de tabela |
| `btn-action` | Ícone de 28px: editar/excluir no cartão do kanban |

Vermelho sólido repetido em toda linha de uma lista deixa de ser aviso e vira
listra — é por isso que existem duas variantes de perigo.

**Não crie classe de botão para uma tela só.** Existiam `btn-aprovar`,
`btn-rejeitar` e `btn-editar`, só na tela de solicitações, com fonte e padding
diferentes de todo o resto; aquela tela parecia de outro sistema.

**O rótulo repete o verbo do título.** Quem entrou em "Novo setor" termina em
"Criar setor", não em "Enviar"; quem entrou em "Excluir setor?" termina em
"Excluir setor", não em "Sim, Excluir". Tudo em caixa de frase.

### Cancelar volta para onde a pessoa estava

O `Cancelar` e o botão de voltar apontam para a tela de origem, não para
`/painel` por reflexo: editar membro volta ao diretório, excluir anexo volta aos
anexos daquela tarefa, excluir tarefa volta à tarefa.

E não repita a navbar dentro da página. "Painel", "Membros" e "Solicitações"
estão sempre a um clique no topo; um botão "Voltar ao quadro" no rodapé da tela
gasta peso visual — ainda por cima ao lado de um botão de excluir — para levar
a um lugar que já está visível.

### Ao mexer no CSS

Toda classe usada nos templates precisa existir aqui. Para conferir:

```bash
cd backend/src
grep -rohE 'class="[^"]*"' views/ \
  | sed 's/class="//;s/"$//' | tr ' ' '\n' \
  | grep -E '^[a-z][a-z0-9-]*$' | sort -u > /tmp/usadas.txt
grep -rohE '\.[a-zA-Z][a-zA-Z0-9_-]*' public/css/ \
  | sed 's/^\.//' | sort -u > /tmp/definidas.txt
comm -23 /tmp/usadas.txt /tmp/definidas.txt
```

O que sobra na lista são hooks de JavaScript (`js-nota`, `form-tarefa`): classe
que só serve de âncora não precisa de regra. Qualquer outra coisa é uma classe
que o template usa e o CSS não conhece — foi essa divergência que quebrou a
navbar (o CSS estilizava `.nav-right` e `.nav-user`, que o template já não usava)
e que deixou `.form-ajuda` e `.form-fixo` sem estilo nenhum.

## Arquivos estáticos

Servidos de `src/public/` sob o prefixo `/static`.

| Arquivo | Onde atua |
| --- | --- |
| `css/style_home.css` | Página inicial |
| `css/style_login.css` | Login, solicitação de cadastro e página de erro |
| `css/painel/*.css` | Todo o painel, um arquivo por assunto (`tokens`, `kanban`, `membros`, `detalhe`, `modal`, …) carregados por `layouts/painel.njk`. `tokens` vem primeiro e `responsivo` por último |
| `js/main.js` | Página inicial |
| `js/auth.js` | Mostrar/ocultar senha |
| `js/painel.js` | Cargo × setor, campo de senha, upload, abas de setor, menu do usuário |
| `js/kanban.js` | Arraste, filtros e troca de status do kanban; expõe `window.PainelKanban` para o pop-up inserir e substituir cartão |
| `js/ui.js` | Base do modal, avisos flutuantes, validação e abas ARIA; expõe `window.PainelUI` |
| `js/tarefas-modal.js` | Pop-up de tarefa: ver, criar, editar e anexar |
| `js/membros.js` | Diretório: busca, filtros, agrupamento, visão e pop-up de perfil |

A ordem de carga em `layouts/painel.njk` **não é arbitrária**: `ui.js` primeiro,
porque os demais usam o `PainelUI`; e `kanban.js` antes do `tarefas-modal.js`,
porque este chama o `PainelKanban` que aquele expõe.

Eles são copiados para `dist/src/public` pelo `nest-cli.json`. **Se você criar um
diretório novo dentro de `src/`, precisa declará-lo em `assets` lá** — a
compilação do TypeScript não copia arquivos não-`.ts`.

### Alterações aparecem na hora

Em desenvolvimento, `bootstrap.ts` lê os templates e os estáticos direto de
`src/`, e o Nunjucks roda com `noCache`. Editar um `.njk` ou um `.css` e
recarregar o navegador basta — sem rebuild, sem reiniciar. Em produção
(`NODE_ENV=production`) tudo vem de `dist/`, como antes.

> A alternativa óbvia seria `watchAssets: true` no `nest-cli.json`. Não use: o
> watcher dele enxerga os arquivos temporários das gravações atômicas
> (`arquivo.njk.tmp.1234.abcd`), tenta copiá-los depois que já sumiram e
> **derruba o servidor** com `ENOENT`. Ler da origem resolve o mesmo problema
> sem watcher nenhum.

### Confirmação de ações destrutivas

Formulários com `data-confirm` são interceptados pelo `ui.js`, que segura o envio
até o usuário confirmar no modal de `partials/modal_confirmar.njk`. Substituiu o
`onsubmit="return confirm(...)"` embutido nos templates herdados do Django.

## Partials com definição única

Um partial existe aqui por um motivo só: **o trecho tem mais de um consumidor**.
Sempre que dois lugares mostram o mesmo dado, eles compartilham o arquivo — foi
assim que o cartão de tarefa parou de existir em doze cópias com `data-*`
faltando em metade delas.

| Partial | Quem usa |
| --- | --- |
| `partials/kanban.njk` | Macros `cartao`, `coluna`, `quadro`, `filtros` e `ferramentas_csv`, usadas por `painel_admin` e `painel_membro` |
| `partials/membros.njk` | Macros `cartao`, `linha` e `regua`, usadas pela grade e pela tabela do diretório |
| `partials/form_tarefa.njk` | A página de criar, a de editar e o pop-up. **Um campo novo é escrito uma vez** |
| `partials/detalhe_tarefa.njk` | A página `/painel/tarefa/:id` e o corpo do pop-up de leitura |
| `partials/lista_anexos.njk` | A aba de anexos e a resposta de `POST …/anexos?parcial=1` |
| `partials/modal_confirmar.njk` | A casca estreita do modal (exclusões) |
| `partials/modal_form.njk` | A casca larga (tarefa e perfil de membro) |

### O contrato do `?parcial=1`

O pop-up nunca monta HTML de formulário em JavaScript. Ele **pede o fragmento ao
servidor**, e o handler decide o que renderizar:

```http
GET /painel/criar-tarefa                → página inteira
GET /painel/criar-tarefa?parcial=1      → só o partial do formulário
GET /painel/tarefa/:id/editar?parcial=1 → só o partial, preenchido
GET /painel/tarefa/:id?parcial=1        → só o detalhe de leitura
POST /painel/tarefa/:id/anexos?parcial=1 → só a lista de anexos, já atualizada
```

O ganho não é performance, é **uma definição só**: um campo novo aparece nos dois
lugares sem ninguém lembrar de editar o segundo. E os filtros do Nunjucks
continuam valendo — `date_utc` no prazo é aplicado pelo template, não
reimplementado no JavaScript, que é onde o bug do fuso costuma voltar.

### O contrato do modal

```js
var modal = PainelUI.abrirModal({ eyebrow, titulo, trilho, corpo, acoes, foco });
// → { fechar, trocarCorpo, elemento, corpo, acoes }

modal.trocarCorpo({ corpo, acoes, titulo, preservarFoco: true });
```

`trocarCorpo` é o que permite **ver → editar sem a caixa piscar**: troca o miolo
mantendo a caixa, a posição e o foco. `PainelUI.confirmar` usa a mesma base por
dentro, então prisão de foco no `Tab`, `Escape`, clique fora e foco devolvido ao
elemento que abriu existem **uma vez só**, não uma por casca.

`trocarCorpo({ podeFechar: fn })` registra um porteiro: o pop-up de edição o usa
para perguntar antes de descartar campo alterado. Passe `null` para soltar a
trava antes de fechar de propósito.

### Camada, não substituição

Todo gatilho de pop-up é um link de verdade para a rota de página
correspondente:

```njk
<a href="{{ url('ver_tarefa', tarefa.id) }}"
   data-modal="ver-tarefa" data-tarefa-id="{{ tarefa.id }}">{{ tarefa.titulo }}</a>
```

Com JavaScript o `tarefas-modal.js` intercepta o clique; sem ele o navegador
navega e a tela de sempre aparece. É o mesmo contrato do `data-confirm`.

> **Ao registrar uma rota nova, edite `views/routes.ts`.** `buildUrl` devolve
> `#` para nome desconhecido, **em silêncio** — um link morto que nenhum erro
> denuncia.

### Verificar que os templates ainda renderizam

`backend/render-check.cjs` renderiza as telas do painel com dados plausíveis,
usando os mesmos filtros que o `bootstrap.ts` registra:

```bash
cd backend && node render-check.cjs
```

Compilar só prova sintaxe; renderizar prova que os caminhos de dado existem. Os
casos incluem as bordas que já quebraram alguma coisa: membro sem sobrenome, sem
setor e com carga zero; tarefa sem descrição, sem prazo e sem projeto; quadro
vazio; Cloudinary desligado. **Ao mudar um template ou o contexto que o
alimenta, acrescente o caso ali.**
