# Imagens e fontes

Onde ficam os arquivos visuais do site, o que é original e o que é derivado.

## Pastas

```
backend/src/public/
├── fonts/
│   └── BryndanWriteBook-nGPM.ttf   fonte da marca
└── images/
    ├── logo.png, pato.png          originais, usados direto
    ├── luiz.JPG, mateus.JPG, …     ORIGINAIS de câmera (6 MB cada)
    ├── clube de ia.png, …          originais dos logos de clube
    ├── SEMCOMP 2026.png            original da arte
    ├── semcomp-2026.jpg            ← derivado
    ├── diretores/                  ← derivados (400×400)
    ├── clubes/                     ← derivados (320×320)
    └── galeria/                    ← derivados (1400px de largura)
```

**Os templates só referenciam derivados.** Os originais ficam no repositório
como fonte, mas nunca são servidos: são fotos de 6000×4000 com cerca de 6 MB
cada, e a seção de diretores sozinha baixaria uns 44 MB.

## Gerar os derivados

```bash
cd backend
pip install Pillow
python scripts/otimizar-imagens.py
```

Reduz ~59 MB para ~0,6 MB. É idempotente: rodar de novo só reescreve as
mesmas saídas.

### Foto nova de diretor

1. Solte a foto em `images/`.
2. Acrescente o par em `DIRETORES`, dentro de `scripts/otimizar-imagens.py`.
3. Rode o script.
4. Acrescente a pessoa na lista `diretores` de `views/core/home.njk`.

Duas coisas que o script resolve e que erram fácil se refeitas à mão:

- **Orientação EXIF.** As fotos têm o tag 8 (giradas 90°). O navegador corrige
  sozinho; o Pillow não. Sem `exif_transpose` o recorte sai deitado.
- **Recorte quadrado a 5% da altura.** É onde cabeça e ombros ficam
  enquadrados nestes retratos de estúdio. A 0% sobra ar acima; a 12% corta o
  queixo de quem está mais alto no quadro.

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

## Arquivos não usados

- `IMG_0141.HEIC`, `IMG_0229.HEIC`, `IMG_1581.HEIC` — **nenhum navegador exibe
  HEIC.** Precisam ser convertidos para JPEG antes de servirem para algo.
- `Sandy & Gláucya.jpg` — não está na página porque não se sabe quem são nem
  em que seção entrariam.
- `galeria/evento.jpg` — gerado, mas fora da página: o primeiro plano está
  desfocado e cobre o assunto.

## Fonte da marca

`BryndanWriteBook-nGPM.ttf` é declarada em `css/site/fontes.css` e exposta pelo
token `--marca` (em `css/site/tokens.css` e, de novo, no `:root` de
`style_login.css`, que tem escala própria).

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
