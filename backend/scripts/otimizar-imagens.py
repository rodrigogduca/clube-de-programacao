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

Para adicionar um diretor novo: solte a foto em `images/`, acrescente o par em
DIRETORES e rode de novo. Depois referencie em views/core/home.njk, na lista
`diretores`.

ATENÇÃO — os originais de DIRETORES (luiz.JPG, mateus.JPG, ...) e de CLUBES
(`clube de ia.png`, `clubedecyber.jpg`, `clube de jogos.jpeg`) não estão mais no
repositório: só os derivados em `images/diretores/` e `images/clubes/`. Esses
dois grupos vão aparecer em "não encontrados" ao rodar, e os derivados atuais
NÃO podem ser regerados sem recolocar os originais em `images/`. Se precisar
mudar recorte ou tamanho dessas fotos, recupere os arquivos de câmera primeiro.

HEIC (IMG_*.HEIC) não é tratado aqui: navegador nenhum exibe HEIC, e o Pillow
só abre com o pacote extra `pillow-heif`. Converta para JPEG antes se precisar
usar alguma dessas.
"""

import os
import sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Pillow não está instalado. Rode: pip install Pillow')

AQUI = os.path.dirname(os.path.abspath(__file__))
IMAGENS = os.path.join(AQUI, '..', 'src', 'public', 'images')

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
GALERIA = {
    'IMG_3103.JPG': 'stand.jpg',
}

# Material da SEMCOMP -> images/semcomp/. Fica junto porque a home consome os
# três como um conjunto: o letreiro, o fallback em JPEG e a foto do evento.
SEMCOMP_FOTO = {
    'IMG_3137.JPG': 'evento.jpg',
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

    # Via tobytes/frombytes e não getdata/putdata: getdata está a caminho da
    # remoção no Pillow 14 e materializar 250 mil tuplas custa mais que
    # percorrer o buffer cru.
    origem_bytes = im.tobytes()
    destino_bytes = bytearray(len(origem_bytes) // 3 * 4)

    for i in range(0, len(origem_bytes), 3):
        r, g, b = origem_bytes[i], origem_bytes[i + 1], origem_bytes[i + 2]
        a = max(r, g, b)
        j = i // 3 * 4
        if a:
            destino_bytes[j:j + 4] = (
                r * 255 // a, g * 255 // a, b * 255 // a, a
            )

    return Image.frombytes('RGBA', im.size, bytes(destino_bytes))


def salvar_png(im, destino):
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    im.save(destino, 'PNG', optimize=True)
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


def main():
    # (pasta, mapa, transformar, escrever)
    grupos = (
        ('diretores', DIRETORES,
         lambda o: retrato(o, LARGURA_RETRATO, TOPO_RETRATO, APERTO_RETRATO), salvar),
        ('clubes', CLUBES, lambda o: quadrado(o, LADO_CLUBE, 0.0), salvar),
        ('galeria', GALERIA, lambda o: largura_fixa(o, LARGURA_GALERIA), salvar),
        ('semcomp', SEMCOMP_FOTO, lambda o: largura_fixa(o, LARGURA_GALERIA), salvar),
        ('semcomp', SOLTAS, lambda o: largura_fixa(o, LARGURA_SOLTA), salvar),
        # PNG e não JPEG: o alfa é o ponto todo, e JPEG não tem canal alfa.
        ('semcomp', NEON, lambda o: neon(o, MARGEM_NEON), salvar_png),
        # Pasta vazia: entrada e saída moram as duas em images/, porque o
        # original aqui não é arquivo de câmera — é o logo, e ele continua
        # sendo servido em tamanho cheio para os robôs de compartilhamento.
        ('', LOGO, lambda o: png_reduzido(o, LADO_LOGO), salvar_png),
    )

    antes_total = depois_total = 0
    faltando = []

    print(f'{"saída":<36}{"antes":>10}{"depois":>10}')
    print('-' * 56)

    for pasta, mapa, transformar, escrever in grupos:
        for origem, saida in mapa.items():
            caminho = os.path.join(IMAGENS, origem)
            if not os.path.exists(caminho):
                faltando.append(origem)
                continue

            destino = os.path.join(IMAGENS, pasta, saida) if pasta else os.path.join(IMAGENS, saida)
            antes = os.path.getsize(caminho) / 1024
            depois = escrever(transformar(caminho), destino)

            antes_total += antes
            depois_total += depois
            rotulo = f'{pasta}/{saida}' if pasta else saida
            print(f'{rotulo:<36}{antes:>9.0f}K{depois:>9.0f}K')

    print('-' * 56)
    if antes_total:
        print(f'{"TOTAL":<36}{antes_total / 1024:>8.1f}M{depois_total / 1024:>8.1f}M')
        print(f'redução: {100 * (1 - depois_total / antes_total):.1f}%')

    if faltando:
        print('\nnão encontrados em images/ (ignorados):')
        for nome in faltando:
            print(f'  {nome}')


if __name__ == '__main__':
    main()
