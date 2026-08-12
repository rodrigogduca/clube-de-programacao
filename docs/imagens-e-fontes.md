# Imagens e fontes

Onde ficam os arquivos visuais do site, o que é original e o que é derivado.

## Duas pastas: a fonte e o que vai para o ar

```
assets/originais/                    FONTE — nunca servida
├── Maratonas1.jpg                   6 MB, 2256×4000 (celular)
├── prosel.HEIC                      2,7 MB, 4284×5712
├── maratona-feminina.HEIC           2,9 MB
├── evento.jpg                       5,7 MB, arquivo de câmera
├── semcomp-estande.jpg              8,3 MB, 6000×4000 (EXIF 8 → vertical)
├── semcomp-plateia.jpg              7,4 MB — ainda sem derivado
├── semcomp-vr.jpg                   6,8 MB — ainda sem derivado
└── logo-mfp.png, logo-obi2.jpg, …   arte de terceiros como veio

backend/src/public/                  PUBLICADO — só derivado
├── fonts/
│   └── BryndanWriteBook-nGPM.ttf    fonte da marca
└── images/
    ├── logo.png                     864×864, o original (usado direto)
    ├── logo-256.png                 ← derivado: favicon e navbar
    ├── pato.png                     o mascote, usado direto
    ├── diretores/                   ← derivados 560×700 (~23 KB cada)
    ├── clubes/                      ← derivados 640×640
    ├── competicoes/                 ← derivados 480×480 (PNG)
    ├── galeria/                     ← derivados 1400–1600px de largura
    └── semcomp/                     ← letreiro, miniatura social e foto
```

**Os templates só referenciam derivados.** Os originais ficam no repositório
como fonte para recortar de novo, mas nunca são servidos: são fotos de
6000×4000 com cerca de 6 MB cada, e a seção de diretores sozinha baixaria uns
44 MB.

**`assets/originais/` era `images-novas/`, na raiz.** O nome dizia "novas", que
envelhece — as fotos de agosto não são novas em outubro, e ninguém sabia se o
lugar delas continuava ali. E a pasta ficava no mesmo nível de `backend/` e
`docs/`, sem sinal de que era matéria-prima e não código. Ela está no
`.vercelignore`: 14,6 MB que a função nunca abre não precisam subir em cada
deploy.

## Gerar os derivados

```bash
cd backend
pip install Pillow pillow-heif      # o segundo só para os .HEIC
python scripts/otimizar-imagens.py
```

Reduz ~59 MB para ~0,6 MB. É idempotente: rodar de novo só reescreve as
mesmas saídas. O script procura cada original em `src/public/images/` e depois
em `assets/originais/`, e imprime de qual das duas veio.

### Foto nova de diretor

1. Solte a foto em `assets/originais/`.
2. Acrescente o par em `DIRETORES`, dentro de `scripts/otimizar-imagens.py`.
3. Rode o script.
4. Acrescente a pessoa na lista `diretores` de `views/core/home.njk`.

Duas coisas que o script resolve e que erram fácil se refeitas à mão:

- **Orientação EXIF.** As fotos têm o tag 8 (giradas 90°). O navegador corrige
  sozinho; o Pillow não. Sem `exif_transpose` o recorte sai deitado.
- **Recorte quadrado a 5% da altura.** É onde cabeça e ombros ficam
  enquadrados nestes retratos de estúdio. A 0% sobra ar acima; a 12% corta o
  queixo de quem está mais alto no quadro.

## Logotipo de terceiro em página escura

`competicoes/sbc.png` e `competicoes/obi.png` chegam como JPEG desenhado para
fundo **branco**: azul-escuro na SBC, preto e âmbar na OBI. O site é escuro, e
não existe saída sem custo — as três possíveis foram consideradas:

| Saída | O que custa |
|---|---|
| Plaquinha branca atrás | Dois retângulos brancos num site escuro, e o `padding` encolhe o desenho para ~48 px dentro de um selo de 84 |
| Só tirar o fundo | O wordmark preto da OBI e o azul `#2b4a78` da SBC ficam em ~1,4:1 contra o `#100f14` do cartão — ilegíveis |
| **Mono claro (o que está no ar)** | Descarta a cor da marca alheia |

O script resolve em `logo_mono()`: o alfa sai da **cobertura de tinta** do
original (quanto mais escuro o pixel, mais opaco fica), o RGB é chapado em
`TINTA_MONO`, e a rampa é linear em vez de um corte binário — sem isso o
antisserrilhado do JPEG viraria uma borda serrilhada de um pixel em volta de
cada letra.

Duas sutilezas que não são óbvias ao ler o código:

- **A opacidade máxima é normalizada para 255.** Sem isso cada marca sairia com
  o brilho do próprio pigmento: o preto da OBI dá alfa 255 e o azul da SBC dá
  181, e a SBC apareceria 29% mais apagada que a vizinha na mesma fileira —
  diferença que não é decisão de design nenhuma, é só a tinta que o autor
  escolheu.
- **O respiro dentro do selo tem dois valores** (`RESPIRO_MONO` 6%,
  `RESPIRO_ALFA` 2%). SBC e OBI são desenho chapado de contorno fechado; o
  papagaio do MFP é silhueta aberta e, com o mesmo respiro, lê como menor do
  que é. "Alinhado" aqui quer dizer presença óptica equivalente, não o mesmo
  número no CSS.

**Se a arte de alguma delas chegar um dia em SVG ou PNG com alfa e traço
claro**, ela deixa de precisar disto: basta movê-la de `LOGOS_MONO` para
`LOGOS_ALFA` e a cor original volta.

## A miniatura de compartilhamento da SEMCOMP

`images/semcomp/semcomp-og.jpg` — **1200×630**, a logo do evento centralizada
sobre o fundo da página. É o `og:image` e o `twitter:image` de `/semcomp`, e é o
que aparece quando o link é colado no WhatsApp, no LinkedIn ou no X.

Três decisões que ela carrega:

- **1200×630** é a proporção que todas as redes recortam sem cortar nada. A arte
  original (`semcomp-2026.jpg`) tem 1600×400 — num cartão 1,91:1 ela apareceria
  com tarja preta em cima e embaixo, ou seria recortada nas pontas.
- **JPEG, e não o `.png` do letreiro.** O PNG tem fundo transparente, e
  transparência em cartão de compartilhamento vira preto no Facebook e branco no
  iMessage: a mesma arte com dois fundos diferentes conforme o aplicativo.
- **Nada além da logo.** Sem data, sem chamada, sem foto. Data em imagem envelhece
  e não é indexada; quem compartilha quer que a pessoa reconheça o evento.

Para regerar (por exemplo, quando a arte da edição mudar), a receita é: recortar a
arte pelo que acende (`getbbox` sobre o preto), reduzir para ~940 px de largura,
centralizar num quadro 1200×630 de `#08080b` com um halo âmbar e compor por
`ImageChops.lighter` — assim o preto do arquivo original não vira um retângulo
colado no meio do fundo. As metas `og:image:width`/`height` no template precisam
acompanhar o tamanho do arquivo: sem elas o WhatsApp mostra o cartão sem imagem
na primeira vez que o link é colado.

## O que nenhum template pede pelo nome

Um `grep` por nome de arquivo nas views acusa a pasta `diretores/`, a `clubes/`
e a `competicoes/` como não referenciadas — **elas são, e o grep é que não
alcança**: os caminhos são montados dentro do laço, como
`static('images/diretores/' ~ d.foto ~ '.jpg')`. Antes de apagar qualquer coisa
por parecer órfã, procure pelo nome da PASTA.

Sobra um caso real:

- `semcomp/semcomp-2026.jpg` (1600×400, 31 KB) — nenhuma página o serve. Ele é o
  passo do meio: derivado da arte original em PNG, e é dele que sai a miniatura
  de compartilhamento (a seção acima). Fica onde está porque é a única cópia da
  assinatura completa com o pato dentro da lâmpada.

## Fonte da marca

`BryndanWriteBook-nGPM.ttf` é declarada em `css/site/fontes.css` e exposta pelo
token `--marca` (em `css/site/tokens.css` e, de novo, no `:root` de
`css/auth/login.css`, que tem escala própria).

Fica em títulos e no nome do clube — hero, títulos de seção, "SEMCOMP", nomes
dos diretores, título do login. **Nunca em texto corrido**, por dois limites do
arquivo:

- **Um peso só** (Regular). `font-weight: 700` faria o navegador engordar o
  traço na força bruta. Todo seletor que usa `--marca` fixa `font-weight: 400`.
- **Não tem travessão** (— nem –): sai retângulo vazio. Texto com travessão
  fica na `--texto`. É por isso que o rodapé ("Clube de Programação — Iniciativa
  Estudantil") e a estatística "Salvador — BA" seguem nas fontes antigas.

A acentuação do português está completa.

Ela é mais larga por caractere que a grotesca que havia antes, então
`--t-hero` caiu de `6.25rem` para `4.5rem`: no tamanho anterior a frase do
herói quebrava em cinco linhas e empurrava os botões de "quero participar"
para fora da primeira tela.

O arquivo tem 167 KB. Converter para WOFF2 derrubaria para ~60 KB, mas exige
`fonttools` com `brotli` — não feito. `font-display: swap` já evita que os
167 KB bloqueiem o texto.

## Logo

`logo.png` é um círculo desenhado à mão, **864×864 com fundo transparente**.

Não leva moldura em lugar nenhum. Antes a tela de login a punha dentro de um
quadrado de canto arredondado com borda âmbar, e a borda competia com o traço
do desenho; a navbar, o rodapé e os modais aplicavam `border-radius: 50%`, que
recortava de novo um círculo que já era círculo. Agora só o brilho
(`drop-shadow`), que é luz e não contorno.
