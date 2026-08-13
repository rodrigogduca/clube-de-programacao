#!/usr/bin/env python3
"""
Gera as versões web das fotos do clube.

Por que existe: as fotos chegam direto da câmera, com 6000x4000 e ~6 MB cada.
Sem este passo a seção de diretores da home baixaria ~44 MB. Os derivados que
este script escreve somam menos de 300 KB para as mesmas sete fotos.

Os originais nunca são alterados nem apagados — a saída vai para subpastas.

Uso (na pasta backend/):
    pip install Pillow
    python scripts/otimizar-imagens.py

Duas armadilhas que este script resolve e que quebram se alguém reimplementar
na mão:

1. Orientação EXIF. As fotos têm o tag 8 (giradas 90°). O navegador corrige
   sozinho, o Pillow não: sem `exif_transpose` o recorte sai deitado.
2. Recorte quadrado. Parte de 5% da altura, que é onde cabeça e ombros ficam
   enquadrados nestes retratos. Em 0% sobra ar demais acima; em 12% corta o
   queixo de quem é mais alto no quadro.

Para adicionar um diretor novo: solte a foto em `assets/originais/`, acrescente
o par em DIRETORES e rode de novo. Depois referencie em views/core/home.njk, na
lista `diretores`.

ATENÇÃO — treze originais não estão mais no repositório, só os derivados deles:
DIRETORES (luiz.JPG, mateus.JPG, ...), CLUBES (`clube de ia.png`,
`clubedecyber.jpg`, `clube de jogos.jpeg`), as duas fotos de galeria/semcomp
(`IMG_3103.JPG`, `IMG_3137.JPG`) e a arte do letreiro (`SEMCOMP 2026.png`).
Todos vão aparecer em "não encontrados" ao rodar, e os derivados atuais NÃO
podem ser regerados sem recolocar os originais numa das pastas de ORIGENS. Se
precisar mudar recorte ou tamanho, recupere os arquivos de câmera primeiro — e
não apague os derivados achando que são reproduzíveis.

HEIC AGORA É TRATADO. Navegador nenhum exibe HEIC — trocar a extensão do nome
para .jpg não converte nada, só esconde o problema até a imagem não aparecer em
produção. O Pillow abre HEIC com o pacote extra `pillow-heif`; ele é opcional
aqui, e sem ele os arquivos .HEIC são pulados com aviso em vez de derrubar o
script inteiro.

    pip install Pillow pillow-heif

ONDE OS ORIGINAIS PODEM ESTAR: em `src/public/images/` (o de sempre) ou em
`assets/originais/`, na raiz do repositório — a pasta em que os arquivos de
câmera e de Drive caem quando chegam. O script procura nas duas, na ordem, e diz
qual usou. Assim ninguém precisa mover arquivo na mão antes de rodar, e os
originais grandes ficam fora de `src/public/`, que é a pasta publicada.

A PASTA ERA `images-novas/`, na raiz. Dois problemas com aquele nome: "novas" é
temporal — as fotos de agosto não são novas em outubro, e ninguém sabia se o
lugar delas continuava ali — e a pasta ficava no mesmo nível de `backend/` e
`docs/` sem dizer que era matéria-prima, não código. `assets/originais/` diz as
duas coisas: é fonte (`assets/`) e é o arquivo cru (`originais/`).
"""

import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Pillow não está instalado. Rode: pip install Pillow')

# Opcional: sem ele, só os .HEIC são pulados.
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    TEM_HEIC = True
except ImportError:
    TEM_HEIC = False

AQUI = os.path.dirname(os.path.abspath(__file__))
IMAGENS = os.path.join(AQUI, '..', 'src', 'public', 'images')
# Raiz do repositório: backend/scripts/ -> backend/ -> raiz
ORIGINAIS = os.path.join(AQUI, '..', '..', 'assets', 'originais')

# Onde procurar um original, na ordem.
ORIGENS = (IMAGENS, ORIGINAIS)

# original -> nome de saída em images/diretores/
DIRETORES = {
    'luiz.JPG': 'luiz.jpg',
    'mateus.JPG': 'mateus.jpg',
    'rodrigo.JPG': 'rodrigo.jpg',
    'isaque.JPG': 'isaque.jpg',
    'davi.JPG': 'davi.jpg',
    'artur.JPG': 'artur.jpg',
    'gabriel.JPG': 'gabriel.jpg',
}

# Logos dos clubes-satélite -> images/clubes/
CLUBES = {
    'clube de ia.png': 'ia.jpg',
    'clubedecyber.jpg': 'cyber.jpg',
    'clube de jogos.jpeg': 'jogos.jpg',
}

# Fotos de ambiente -> images/galeria/
#
# `evento.jpg` ESTAVA SENDO SERVIDO CRU. O arquivo de câmera (6000x4000, 5,7 MB)
# tinha sido commitado direto em `src/public/images/galeria/`, que é a pasta
# publicada: toda visita à /seja-membro baixava 5,7 MB para desenhar uma foto de
# 500px de largura. Num 4G de 10 Mbps são ~5 segundos só nela; num 3G, quarenta.
#
# O original voltou para `assets/originais/` (fora do que vai para o ar) e é
# daqui que sai a versão web, com 1400px e ~200 KB. A regra vale para qualquer
# foto nova: original em `assets/originais/`, derivado em `src/public/images/`.
GALERIA = {
    'IMG_3103.JPG': 'stand.jpg',
    'evento.jpg': 'evento.jpg',
}

# Material da SEMCOMP -> images/semcomp/. Fica junto porque a home consome os
# três como um conjunto: o letreiro, o fallback em JPEG e a foto do evento.
SEMCOMP_FOTO = {
    'IMG_3137.JPG': 'evento.jpg',
}

# Banner deitado da SEMCOMP -> images/semcomp/.
#
# `semcomp-estande.jpg` é vertical de celular (4000x6000 depois do EXIF) e vira
# faixa 16:9 na seção "o que acontece", logo abaixo do cartão "Estandes — o
# corredor": é literalmente a cena que o cartão descreve.
#
#   origem -> (saída, fração da altura onde a faixa começa)
BANNERS_SEMCOMP = {
    # 0.13 e não 0.28 como nos outros recortes: a dupla está no TERÇO DE CIMA
    # da vertical, não no meio. A 0.22 a testa dos dois já encostava na borda
    # e a 0.28 as duas cabeças saíam do quadro — o que sobrava era um banner
    # de mãos segurando lata.
    'semcomp-estande.jpg': ('estande.jpg', 0.13),
}

# Foto 4:3 da SEMCOMP -> images/semcomp/.
#
# `semcomp-plateia.jpg` é o auditório cheio visto de perto (6000x4000 de câmera,
# 7 MB) e ocupa o quadro da seção "sobre o evento". ALI ESTAVA `turma.jpg`, QUE
# É A FOTO DO HERÓI da mesma página: a mesma imagem duas vezes numa rolagem só é
# repetição, não é ritmo — e no herói ela nem se vê direito, porque vive sob as
# duas camadas do `.capa-veu`. Agora cada uma aparece uma vez.
#
# 0.20: o terço de cima do original é parede branca com luminária. Cortado ali,
# a primeira fileira de cabeças entra a um quarto da altura do quadro final e o
# resto é o auditório, que é o que a foto tem para dizer.
#
# 1600x1200 é exatamente a caixa que `turma.jpg` ocupava neste quadro, então a
# troca não mexe em `width`/`height` no template nem reserva espaço diferente.
#
#   origem -> (saída, fração da altura onde o recorte começa)
FOTOS_SEMCOMP = {
    'semcomp-plateia.jpg': ('plateia.jpg', 0.20),
}

# Nome de saída sem espaço: o helper `static()` dos templates não escapa espaço
# em nome de arquivo.
SOLTAS = {
    'SEMCOMP 2026.png': 'semcomp-2026.jpg',
}

# Logotipos de neon sobre preto -> PNG recortado e com alfa (ver `neon()`).
NEON = {
    'SEMCOMP 2026.png': 'semcomp-2026.png',
}

# O LOGO DO CLUBE, NO TAMANHO EM QUE ELE APARECE.
#
# `logo.png` tem 864x864 e 147 KB, e era ele que ia para a tela em TODO uso:
# 34px no rodapé, 36px na navbar, 63px no pop-up, 84px no login e ainda como
# favicon. Ou seja, 147 KB para desenhar um selo de 36 pixels — vinte e quatro
# vezes maior do que precisa ser em cada dimensão.
#
# Num 3G de 400 kbps isso deixava o logo em branco por ~14 segundos enquanto o
# resto da página já estava lida e rolável. Não é que ele não carregasse: é que
# chegava depois de quem estava olhando desistir.
#
# 256px cobre o maior uso na tela (os 84px do login) com folga para telas 3x.
# O original FICA e continua servindo o que precisa de tamanho: a imagem de
# compartilhamento (og:image, twitter:image) e o `logo` do JSON-LD, que são
# lidos por robô e não por navegador.
LOGO = {
    'logo.png': 'logo-256.png',
}

# ---------------------------------------------------------------------------
# COMPETIÇÕES — o material que chegou em assets/originais/
# ---------------------------------------------------------------------------

# Fotos de grupo e de ambiente. Duas são HEIC de iPhone com 4284x5712 e ~2,7 MB
# cada; saem daqui como JPEG progressivo de ~100 KB.
#
# `prosel` substitui `galeria/evento.jpg` no cartaz do processo seletivo: a
# antiga era uma pessoa falando, e esta é a turma inteira que entrou. O cartaz
# vende "faça parte disto", e disto é gente.
# O TOPO DO RECORTE É POR FOTO, e não uma constante como nos retratos da
# diretoria. Aqueles são de estúdio, todos com a mesma distância e o mesmo
# enquadramento; estes são de celular, cada um tirado de um jeito. Com um valor
# único, o recorte que acertava a turma do PROSEL cortava a frase "Bem vindas à
# MFP" do quadro branco na outra — e um número que serve mal às duas é pior que
# dois números que servem bem.
#
#   origem -> (saída, fração da altura onde o recorte começa)
FOTOS_NOVAS = {
    # 0.24 e não 0.30: em 0.30 sobrava uma fileira inteira de carteira vazia no
    # pé da foto, e o grupo ficava espremido contra a borda de cima.
    'prosel.HEIC': ('prosel.jpg', 0.24),
    # 0.22 sobe o bastante para o "Bem vindas à MFP" escrito no quadro entrar
    # no quadro — é a legenda da foto, escrita à mão pelas próprias meninas.
    'maratona-feminina.HEIC': ('maratona-feminina.jpg', 0.22),
}

# Recorte deitado para banner. A foto do laboratório é 2256x4000 (vertical de
# celular): o assunto — as fileiras de computadores com gente — ocupa a faixa
# do meio, e teto e mesa vazia tomam o resto. `TOPO_BANNER` é onde essa faixa
# começa, em fração da altura.
BANNERS = {
    'Maratonas1.jpg': 'maratona-lab.jpg',
}

# Logotipos de terceiros -> images/competicoes/.
#
# O MATERIAL FOI TROCADO: as três marcas chegaram de novo, agora em PNG de
# 1080x1350 com alfa (`obi logo.png`, `mfp nome.png`, ...) e cada uma em DOIS
# arquivos — o símbolo ("logo") e o wordmark ("nome"). Antes a SBC e a OBI só
# existiam em JPEG desenhado para fundo BRANCO, e o script precisava repintá-las
# inteiras em mono claro para elas assentarem no escuro (a função `logo_mono`,
# que saiu junto com os originais `maratona-logo.jpg` e `logo-obi2.jpg` — os
# arquivos continuam em `assets/originais/`, sem mapa que os aponte).
#
# O GANHO: a OBI volta a aparecer NA COR DELA (o disco amarelo com a lâmpada
# pontilhada), que é o que a marca é. Só a SBC continua repintada, e por medida:
# o azul #2b4a78 dela dá 2,1:1 contra o #100f14 do cartão — abaixo do 3:1 que um
# elemento gráfico precisa para ser visto. Entre alterar a cor e não mostrar a
# marca, altera-se a cor; onde não é preciso alterar, não se altera.
#
# TRÊS TRATAMENTOS, um por arquivo, escritos ao lado do nome em vez de deduzidos
# de um limiar de luminância — o que cada arte precisa foi medido uma vez, e um
# número mágico decidindo isso sozinho erraria calado no dia em que a próxima
# marca chegasse num tom intermediário:
#
#   'direto'    alfa limpo e traço claro; só apara e reduz.
#   'tingir'    mantém o alfa e chapa o RGB em TINTA_MONO (a SBC).
#   'do-preto'  a arte vem sobre um véu preto semitransparente, que na página
#               virava um retângulo escuro por cima do bloco roxo do MFP. O
#               preto vira transparência pelo mesmo caminho do `neon()`: o
#               brilho É o alfa (ver `alfa_do_preto`).
#
# O TERCEIRO CAMPO É O RESPIRO dentro do selo quadrado, em fração do lado, e ele
# é por ARTE e não por tratamento: SBC e OBI são desenho chapado de contorno
# fechado e ocupam o quadro inteiro que lhes cabe (0.06); o papagaio do MFP é
# silhueta aberta — asas, cauda, bico — e com o mesmo respiro lê como menor do
# que é (0.02). Os dois valores deixam os três com presença óptica equivalente na
# fileira, que é o que "alinhado" quer dizer aqui, e não ter o mesmo número no
# CSS. O wordmark ignora este campo: ele é limitado por largura.
#
#   origem -> (saída, tratamento, respiro)

# Símbolo: sai QUADRADO, porque os três ficam lado a lado na fileira de cartões
# e uma caixa por proporção de arquivo deixaria a fileira com marcas de tamanhos
# aparentes diferentes.
#
# A MARATONA SBC SAIU DESTA TABELA. Os dois arquivos dela em
# `src/public/images/competicoes/` — `sbc.png` e `maratona sbc nome.png` — são
# postos à mão, na arte original e no AZUL ORIGINAL da marca, e a página os
# consome como estão. Enquanto for assim, gerar derivado aqui só serviria para
# este script apagar o arquivo posto à mão na próxima vez que alguém o rodasse.
#
# Se um dia a decisão voltar a ser repintar a marca em claro, a linha é
#     'maratona sbc logo.png': ('sbc.png', 'tingir', 0.06),
# e o wordmark, em MARCAS_COMP,
#     'maratona sbc nome.png': ('sbc-marca.png', 'tingir'),
# com os dois originais já em `assets/originais/`. O `tingir` existe e continua
# testado; o que mudou foi a escolha, não a receita.
SELOS_COMP = {
    'obi logo.png': ('obi.png', 'direto', 0.06),
    'mfp logo.png': ('mfp.png', 'do-preto', 0.02),
}

# Wordmark: mantém a proporção do próprio desenho e é limitado por LARGURA —
# espremer "Maratona Feminina de Programação" num quadrado deixaria a lettering
# minúscula.
#
# A SBC NÃO SAI DAQUI HOJE, e o selo dela também não sai de SELOS_COMP — os
# dois arquivos da Maratona em `src/public/images/competicoes/` são postos à
# mão, na arte original e no azul original, e é assim que a página os quer.
# Rodar este script os SUBSTITUI pelas versões tingidas de branco. Antes de
# rodar, veja o aviso no cabeçalho do arquivo.
MARCAS_COMP = {
    'obi nome.png': ('obi-marca.png', 'direto'),
    'mfp nome.png': ('mfp-marca.png', 'do-preto'),
}

LARGURA_BANNER = 1600
TOPO_BANNER = 0.44        # onde a faixa com gente começa em Maratonas1.jpg
PROPORCAO_BANNER = 16 / 9
LARGURA_GRUPO = 1400
# (o topo de cada foto de grupo vive junto do nome dela, em FOTOS_NOVAS)
PROPORCAO_GRUPO = 4 / 3
# A foto de ambiente da SEMCOMP é maior que as de grupo porque ocupa metade da
# largura do container numa tela larga, e não um cartão.
LARGURA_FOTO_SEMCOMP = 1600
LADO_LOGO_COMP = 480
LARGURA_MARCA = 480
# O branco quente da paleta (`--giz` é #f6f1e9), um passo abaixo: a marca de
# terceiro acompanha o texto da página sem gritar mais alto que o título dela.
# É a tinta do tratamento 'tingir' (hoje, só a Maratona SBC).
TINTA_MONO = (238, 233, 225)
# Piso de alfa para o aparo (ver `arte_terceiro`).
#
# `getbbox()` no alfa cru corta em alfa > 0, e no 'do-preto' isso é a caixa do
# HALO, não a do desenho: o véu preto dos PNGs do MFP se apaga num degradê longo
# e sobra uma auréola de alfa 1..7 — invisível na tela, mas dentro da caixa. Medido
# nos seis arquivos: no wordmark do MFP a caixa cai de 781x580 para 699x373 ao
# exigir alfa >= 8, ou seja 36% da altura era auréola, e o desenho aparecia 1,5x
# menor do que devia. Nas artes de alfa limpo (OBI, SBC) o mesmo piso muda de 1 a
# 3px. Em 4 a auréola ainda entra; de 8 a 40 a caixa não se move mais.
LIMIAR_APARO = 8
# Paleta dos logotipos de competição (ver `salvar_png_paleta`).
CORES_PALETA = 64

LADO_LOGO = 256        # maior uso na tela são os 84px do login; cobre telas 3x
LARGURA_RETRATO = 560  # exibido entre 215px e 250px; cobre telas 2x
LADO_CLUBE = 640       # exibido do tamanho do cartão (~360px); cobre telas 2x
LARGURA_GALERIA = 1400
LARGURA_SOLTA = 1600
TOPO_RETRATO = 0.04
# Recorta 12% da largura (6% de cada lado). Os sete retratos são de estúdio, com
# a pessoa bem no meio e sobra de fundo cinza nas laterais: apertar aproxima o
# rosto sem chegar perto de cortar ombro de ninguém.
APERTO_RETRATO = 0.88
# Quase encostado: o degradê do neon já morre em 3~4px, então o `getbbox` cai
# praticamente sobre o traço aceso. Margem maior que isso vira padding vazio e
# o logo aparece recuado em relação ao texto que fica ao lado dele na página.
MARGEM_NEON = 2


def achar(nome):
    """Devolve o caminho do original, procurando nas pastas de ORIGENS."""
    for pasta in ORIGENS:
        caminho = os.path.normpath(os.path.join(pasta, nome))
        if os.path.exists(caminho):
            return caminho
    return None


def salvar(im, destino, qualidade=82):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    # Sem EXIF: metadado de câmera não serve ao navegador e ainda carrega
    # data, modelo e às vezes GPS.
    im.convert('RGB').save(
        destino, 'JPEG', quality=qualidade, optimize=True, progressive=True
    )
    return os.path.getsize(destino) / 1024


def quadrado(origem, lado, topo_rel):
    im = ImageOps.exif_transpose(Image.open(origem))
    largura, altura = im.size

    if altura >= largura:
        topo = min(int(altura * topo_rel), altura - largura)
        im = im.crop((0, topo, largura, topo + largura))
    else:
        esq = (largura - altura) // 2
        im = im.crop((esq, 0, esq + altura, altura))

    # Nunca amplia: `clube de jogos.jpeg` só tem 500px e esticar até 640
    # inventaria detalhe que o arquivo não tem.
    lado = min(lado, im.size[0])
    return im.resize((lado, lado), Image.LANCZOS)


def retrato(origem, largura, topo_rel, aperto):
    """Recorte 4:5 para os retratos da diretoria.

    Era quadrado, porque o cartão mostrava a foto num selo de 104px. Agora a
    foto ocupa a largura inteira do cartão (~230px) e retrato em pé enquadra
    cabeça e ombros muito melhor que quadrado — em 1:1 sobrava ar dos dois
    lados do rosto.

    `exif_transpose` é obrigatório: as sete fotos têm o tag 8 (giradas 90°) e
    chegam como 6000x4000, viram 4000x6000. Sem isso o recorte sai deitado.
    """
    im = ImageOps.exif_transpose(Image.open(origem))
    total_largura, total_altura = im.size

    corte_largura = round(total_largura * aperto)
    corte_altura = round(corte_largura * 5 / 4)
    esq = (total_largura - corte_largura) // 2
    topo = min(round(total_altura * topo_rel), max(0, total_altura - corte_altura))

    im = im.crop((esq, topo, esq + corte_largura, topo + corte_altura))

    if im.size[0] > largura:
        im = im.resize((largura, round(largura * 5 / 4)), Image.LANCZOS)
    return im


def neon(origem, margem):
    """Recorta o preto morto de um logotipo de neon e devolve PNG com alfa.

    A arte da SEMCOMP é um letreiro de neon desenhado sobre preto puro numa
    tela de 1600x400 — mas o letreiro em si ocupa só 763x304 no meio dela.
    Aplicada como imagem, 70% do arquivo era preto vazio: dentro de um cartão
    de fundo #100f14 aquilo virava uma tarja preta com o logo pequeno perdido
    no meio, e era isso que fazia a arte parecer mal colocada.

    Duas etapas:

    1. Recorte pelo retângulo do conteúdo (`getbbox` sobre a luminância), com
       uma margem de respiro. Sobra o letreiro e só ele.
    2. Preto -> transparente. Neon sobre preto é luz aditiva: o valor do pixel
       *é* o brilho. Então o canal máximo serve direto como alfa, e o RGB é
       dividido por ele (desmultiplicação) para o halo fraco não escurecer
       duas vezes ao ser composto. Sem essa divisão o brilho em volta das
       letras fica sujo em vez de difuso.

    O resultado assenta em qualquer fundo escuro sem `mix-blend-mode`.
    """
    im = ImageOps.exif_transpose(Image.open(origem)).convert('RGB')

    caixa = im.convert('L').getbbox()
    if caixa:
        esq, topo, dir_, base = caixa
        im = im.crop((
            max(0, esq - margem),
            max(0, topo - margem),
            min(im.size[0], dir_ + margem),
            min(im.size[1], base + margem),
        ))

    return brilho_para_alfa(im)


def brilho_para_alfa(im, alfa_base=None):
    """Arte desenhada SOBRE PRETO -> RGBA com o preto virando transparência.

    Luz sobre preto é aditiva: o valor do pixel *é* o brilho. Então o canal
    máximo serve direto como alfa, e o RGB é dividido por ele (desmultiplicação)
    para o meio-tom não escurecer duas vezes ao ser composto. Sem essa divisão o
    halo em volta das letras fica sujo em vez de difuso.

    Composta de volta sobre preto, a imagem sai IDÊNTICA à original — a
    operação só ensina o arquivo a dizer onde ele não tem tinta.

    `alfa_base` é o alfa que o arquivo já trazia, multiplicado no resultado. Os
    PNGs do MFP chegam com um véu preto SEMITRANSPARENTE em volta do desenho
    (alfa 31..99 nos cantos): sem multiplicar, o véu voltaria opaco onde tem
    brilho; sem o brilho, o retângulo escuro do véu continuaria aparecendo por
    cima do bloco roxo da página.

    Via tobytes/frombytes e não getdata/putdata: getdata está a caminho da
    remoção no Pillow 14 e materializar um milhão de tuplas custa mais que
    percorrer o buffer cru.
    """
    origem_bytes = im.convert('RGB').tobytes()
    base = alfa_base.tobytes() if alfa_base is not None else None
    destino_bytes = bytearray(len(origem_bytes) // 3 * 4)

    for i in range(0, len(origem_bytes), 3):
        r, g, b = origem_bytes[i], origem_bytes[i + 1], origem_bytes[i + 2]
        a = max(r, g, b)
        j = i // 3 * 4
        if a:
            if base is not None:
                a = a * base[j // 4] // 255
                if not a:
                    continue
            destino_bytes[j:j + 4] = (
                r * 255 // max(r, g, b), g * 255 // max(r, g, b),
                b * 255 // max(r, g, b), a
            )

    return Image.frombytes('RGBA', im.size, bytes(destino_bytes))


def salvar_png(im, destino):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    im.save(destino, 'PNG', optimize=True)
    return os.path.getsize(destino) / 1024


def salvar_png_paleta(im, destino, cores=CORES_PALETA):
    """PNG de paleta, com alfa. Para os quatro logotipos de competição.

    PNG de cor plena guarda CADA PIXEL em 4 bytes, mesmo quando a imagem
    inteira tem seis cores — e estes quatro são exatamente isso: desenho
    chapado (SBC e OBI saem de `logo_mono` com um RGB só e alfa variável; o
    papagaio do MFP tem meia dúzia de roxos). Sem paleta, `obi.png` ocupava
    125 KB para desenhar um selo de 84 px na tela.

    64 cores, e não 128: nos quatro arquivos o erro médio contra o original
    (já composto sobre o fundo do cartão) empata em ~1/255 nos dois valores —
    o dobro de paleta não compra nada aqui. O conjunto cai de 395 KB para
    55 KB.

    FASTOCTREE e não MEDIANCUT: só o primeiro preserva o canal alfa, e o alfa
    é o motivo de estes arquivos existirem. Com MEDIANCUT o fundo transparente
    volta a ser um retângulo opaco.

    O LOGO DO CLUBE NÃO PASSA POR AQUI, de propósito — ver `png_reduzido`. Lá
    o ganho de KB não paga o risco de sujar a borda antisserrilhada de um
    círculo desenhado à mão; aqui a arte é chapada e de terceiro.
    """
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    paleta = im.convert('RGBA').quantize(colors=cores, method=Image.FASTOCTREE)
    paleta.save(destino, 'PNG', optimize=True)
    return os.path.getsize(destino) / 1024


def png_reduzido(origem, lado):
    """Reduz um PNG quadrado preservando o alfa.

    Sem `convert('RGB')` como o `salvar()` faz: o logo é um círculo desenhado
    com fundo transparente, e achatar o alfa colocaria um quadrado branco atrás
    dele em toda tela escura do projeto.

    Sem quantizar para paleta, também: a 256 cores o arquivo cairia de 27 KB
    para ~6 KB e a diferença é invisível no tamanho em que o logo aparece — mas
    é a marca do clube, e o ganho de 21 KB não paga o risco de sujar a borda
    antisserrilhada do círculo num tamanho que ninguém revisou.
    """
    im = ImageOps.exif_transpose(Image.open(origem)).convert('RGBA')
    if im.size[0] <= lado:
        return im
    altura = round(im.size[1] * lado / im.size[0])
    return im.resize((lado, altura), Image.LANCZOS)


def largura_fixa(origem, largura):
    im = ImageOps.exif_transpose(Image.open(origem))
    if im.size[0] <= largura:
        return im
    altura = round(im.size[1] * largura / im.size[0])
    return im.resize((largura, altura), Image.LANCZOS)


def faixa(origem, largura, proporcao, topo_rel):
    """Recorta uma faixa deitada de uma foto vertical de celular.

    As fotos novas são 9:16 e o assunto ocupa uma tira no meio: em `Maratonas1`
    o terço de cima é teto e luminária, o de baixo é mesa com garrafa e mochila.
    Usada inteira num banner, a página mostraria dois metros de teto.

    `topo_rel` é onde a tira começa, em fração da altura, E ELE É O PRIMEIRO
    CORTE — não um deslocamento aplicado dentro de um dos ramos. Era isso antes,
    e o efeito era que `topo_rel` valia só para foto em pé: numa foto que já
    chega mais deitada que o alvo, o recorte saía centralizado na vertical e não
    havia como dizer "comece mais embaixo". `semcomp-plateia.jpg` é 6000x4000
    com o terço de cima em parede vazia, e sem este corte um terço do quadro
    final era parede.

    Para as verticais o resultado é idêntico ao de antes: tirar h*topo_rel do
    topo e pegar a faixa a partir dali é a mesma janela que o crop deslocado
    recortava.

    E cortar primeiro também é o que dispensa o `min` que existia aqui: uma foto
    mais curta que o esperado agora cai sozinha no ramo de baixo, que aperta pela
    largura, em vez de gerar coordenada além do fim da imagem — o crop do Pillow
    aceita coordenada fora e devolve borda preta, que é um bug silencioso e feio.
    """
    im = ImageOps.exif_transpose(Image.open(origem))

    alto = round(im.size[1] * topo_rel)
    if alto:
        im = im.crop((0, alto, im.size[0], im.size[1]))

    total_largura, total_altura = im.size

    altura_corte = round(total_largura / proporcao)
    if altura_corte > total_altura:
        # Foto já mais deitada que o alvo: aperta pela largura.
        largura_corte = round(total_altura * proporcao)
        esq = (total_largura - largura_corte) // 2
        im = im.crop((esq, 0, esq + largura_corte, total_altura))
    else:
        im = im.crop((0, 0, total_largura, altura_corte))

    if im.size[0] > largura:
        im = im.resize((largura, round(largura / proporcao)), Image.LANCZOS)
    return im


def tingir(im, tinta):
    """Mantém o alfa e chapa o RGB numa tinta só.

    Para a marca que chega com alfa limpo mas em tinta ESCURA — o azul #2b4a78 da
    Maratona SBC dá 2,1:1 contra o #100f14 do cartão, abaixo do 3:1 que um
    elemento gráfico precisa para ser visto. O desenho continua o mesmo; muda a
    cor, não a forma.

    Não tenta preservar a cor da marca: clarear o azul mantendo o matiz devolveria
    um azul-bebê que não é a cor de ninguém. Entre um azul inventado e o branco da
    página, o branco da página é o que se assume como escolha nossa.
    """
    marca = Image.new('RGBA', im.size, tinta + (255,))
    marca.putalpha(im.getchannel('A'))
    return marca


def encaixar(im, lado, respiro_rel):
    """Centraliza uma arte RGBA num quadrado transparente, com respiro.

    Quadrado porque os três selos de competição ficam lado a lado na fileira e
    precisam da mesma caixa; se cada um tivesse a proporção do seu arquivo, a
    fileira ficaria com marcas de tamanhos aparentes diferentes.

    O `paste` vai sem máscara de propósito: a tela está vazia, então copiar o
    RGBA inteiro (alfa incluído) é o resultado certo. Com máscara, o Pillow
    comporia a arte contra transparente e o antisserrilhado das bordas sairia
    multiplicado duas vezes — o contorno fica sujo.
    """
    respiro = round(lado * respiro_rel)
    util = lado - 2 * respiro

    escala = min(util / im.size[0], util / im.size[1])
    novo = (max(1, round(im.size[0] * escala)), max(1, round(im.size[1] * escala)))
    im = im.resize(novo, Image.LANCZOS)

    tela = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    tela.paste(im, ((lado - novo[0]) // 2, (lado - novo[1]) // 2))
    return tela


def arte_terceiro(origem, tratamento):
    """Marca de terceiro -> RGBA aparado e legível sobre fundo escuro.

    O passo comum aos seis arquivos de competição, antes de virar selo ou
    wordmark. `tratamento` é o que o arquivo pede, medido uma vez e escrito na
    tabela (ver SELOS_COMP): 'direto', 'tingir' ou 'do-preto'.

    O APARO É O PONTO e vale para todos: as artes chegam em tela de 1080x1350 com
    o desenho ocupando o meio (o "OBI" usa 710x296 dela). Encaixada com
    `object-fit: contain`, a margem vazia conta como parte da imagem e a marca é
    desenhada menor que as vizinhas no mesmo selo — o wordmark do MFP aparecia
    com ~186px de largura útil onde cabiam 260.

    A ORDEM IMPORTA: aparar depois de tratar. No 'do-preto' o véu preto tem alfa
    próprio, então a caixa do alfa cru é o retângulo do véu, não a do desenho —
    aparar antes cortaria pelo lugar errado e deixaria a margem do véu no
    arquivo.

    E o aparo mede com PISO DE ALFA (`LIMIAR_APARO`), não com `getbbox()` no alfa
    cru: o que sobra do véu é um degradê que morre em alfa 1..7, invisível na tela
    e ainda assim dentro da caixa.
    """
    im = ImageOps.exif_transpose(Image.open(origem)).convert('RGBA')

    if tratamento == 'tingir':
        im = tingir(im, TINTA_MONO)
    elif tratamento == 'do-preto':
        im = brilho_para_alfa(im, alfa_base=im.getchannel('A'))
    elif tratamento != 'direto':
        raise ValueError(f'tratamento desconhecido: {tratamento!r}')

    visivel = im.getchannel('A').point(
        lambda p: 255 if p >= LIMIAR_APARO else 0
    )
    caixa = visivel.getbbox()
    return im.crop(caixa) if caixa else im


def selo_comp(origem, lado, tratamento, respiro_rel):
    """Marca de competição -> selo quadrado, para a fileira de três cartões."""
    return encaixar(arte_terceiro(origem, tratamento), lado, respiro_rel)


def marca_comp(origem, largura, tratamento, _respiro=None):
    """Marca de competição -> wordmark na proporção do próprio desenho.

    Sem quadrado, ao contrário do `selo_comp`: o CSS limita o wordmark por
    LARGURA, e enfiar "Maratona Feminina de Programação" numa caixa quadrada
    deixaria a lettering minúscula.

    `_respiro` existe só para a assinatura casar com a das tabelas, que carregam
    o respiro do selo em toda linha — aqui não há quadrado onde respirar.
    """
    im = arte_terceiro(origem, tratamento)
    if im.size[0] <= largura:
        return im
    altura = round(im.size[1] * largura / im.size[0])
    return im.resize((largura, altura), Image.LANCZOS)


def main():
    # (pasta, mapa, transformar, escrever)
    grupos = (
        ('diretores', DIRETORES,
         lambda o: retrato(o, LARGURA_RETRATO, TOPO_RETRATO, APERTO_RETRATO), salvar),
        ('clubes', CLUBES, lambda o: quadrado(o, LADO_CLUBE, 0.0), salvar),
        ('galeria', GALERIA, lambda o: largura_fixa(o, LARGURA_GALERIA), salvar),
        ('semcomp', SEMCOMP_FOTO, lambda o: largura_fixa(o, LARGURA_GALERIA), salvar),
        ('semcomp', BANNERS_SEMCOMP,
         lambda o, topo: faixa(o, LARGURA_BANNER, PROPORCAO_BANNER, topo), salvar),
        ('semcomp', FOTOS_SEMCOMP,
         lambda o, topo: faixa(o, LARGURA_FOTO_SEMCOMP, PROPORCAO_GRUPO, topo), salvar),
        ('semcomp', SOLTAS, lambda o: largura_fixa(o, LARGURA_SOLTA), salvar),
        # PNG e não JPEG: o alfa é o ponto todo, e JPEG não tem canal alfa.
        ('semcomp', NEON, lambda o: neon(o, MARGEM_NEON), salvar_png),
        # Pasta vazia: entrada e saída moram as duas em images/, porque o
        # original aqui não é arquivo de câmera — é o logo, e ele continua
        # sendo servido em tamanho cheio para os robôs de compartilhamento.
        ('', LOGO, lambda o: png_reduzido(o, LADO_LOGO), salvar_png),

        # --- material de competições (assets/originais/) ---
        # Este grupo tem o topo do recorte junto do nome da saída; o `main`
        # desempacota a tupla (ver `desempacotar`).
        ('galeria', FOTOS_NOVAS,
         lambda o, topo: faixa(o, LARGURA_GRUPO, PROPORCAO_GRUPO, topo), salvar),
        ('galeria', BANNERS,
         lambda o: faixa(o, LARGURA_BANNER, PROPORCAO_BANNER, TOPO_BANNER), salvar),
        # PNG e não JPEG nos cinco: o alfa é o ponto. Sem ele não há como pôr
        # marca de terceiro sobre o escuro sem uma plaquinha branca atrás.
        #
        # As duas tabelas carregam `(saída, tratamento[, respiro])`, e o `main`
        # desempacota o resto da tupla como argumento extra.
        ('competicoes', SELOS_COMP,
         lambda o, trat, respiro: selo_comp(o, LADO_LOGO_COMP, trat, respiro),
         salvar_png_paleta),
        ('competicoes', MARCAS_COMP,
         lambda o, trat: marca_comp(o, LARGURA_MARCA, trat), salvar_png_paleta),
    )

    antes_total = depois_total = 0
    faltando = []
    pulados = []

    print(f'{"saída":<36}{"antes":>10}{"depois":>10}  origem')
    print('-' * 76)

    for pasta, mapa, transformar, escrever in grupos:
        for origem, valor in mapa.items():
            # Um mapa comum guarda só o nome de saída; FOTOS_NOVAS guarda
            # `(saída, topo)` porque cada foto precisa do seu enquadramento.
            saida, extras = (valor[0], valor[1:]) if isinstance(valor, tuple) else (valor, ())

            caminho = achar(origem)
            if not caminho:
                faltando.append(origem)
                continue
            if origem.lower().endswith(('.heic', '.heif')) and not TEM_HEIC:
                pulados.append(origem)
                continue

            destino = os.path.join(IMAGENS, pasta, saida) if pasta else os.path.join(IMAGENS, saida)
            antes = os.path.getsize(caminho) / 1024
            depois = escrever(transformar(caminho, *extras), destino)

            antes_total += antes
            depois_total += depois
            rotulo = f'{pasta}/{saida}' if pasta else saida
            de = (
                'assets/originais/'
                if caminho.startswith(os.path.normpath(ORIGINAIS))
                else 'images/'
            )
            print(f'{rotulo:<36}{antes:>9.0f}K{depois:>9.0f}K  {de}')

    print('-' * 76)
    if antes_total:
        print(f'{"TOTAL":<36}{antes_total / 1024:>8.1f}M{depois_total / 1024:>8.1f}M')
        print(f'redução: {100 * (1 - depois_total / antes_total):.1f}%')

    if pulados:
        print('\nHEIC pulados — instale o leitor e rode de novo:')
        print('  pip install pillow-heif')
        for nome in pulados:
            print(f'  {nome}')

    if faltando:
        print('\nnão encontrados em images/ nem em assets/originais/ (ignorados):')
        for nome in faltando:
            print(f'  {nome}')


if __name__ == '__main__':
    main()
