# Imagens das competições — de onde vieram

Os originais ficam em `outros/` na raiz do repositório.

| arquivo                  | fonte                                                                  | alteração |
|--------------------------|------------------------------------------------------------------------|-----------|
| `ping-pong.svg`, `toto.svg`, `domino.svg`, `truco.svg` | desenhados para esta página (SVG próprio) | — |
| `occ.png`                | `outros/logo-maratona.png`, posto pela comissão                        | letras pretas → branco quente (`--giz`); o pato e o laranja intactos |
| `league-of-legends.svg`  | simple-icons (`leagueoflegends`), CC0                                  | preenchido com `#C28F2C` |
| `valorant.svg`           | simple-icons (`valorant`), CC0                                         | preenchido com `#FA4454` |
| `ea.svg`                 | simple-icons (`ea`), CC0                                               | preenchido com `#F6F1E9` |
| `tft.png`                | ícone oficial do TFT, favicon de teamfighttactics.leagueoflegends.com (23/09/2026) | recortado, 128px |
| `brawl-stars.png`        | logo oficial da página do jogo em supercell.com (23/09/2026)          | só a caveira amarela, recortada em círculo, 128px; o logo inteiro fica em `outros/jogos-digitais/brawl-stars-logo.png` |
| `phoenix.webp`           | retrato do Phoenix ("fullportrait") da valorant-api.com, que serve as artes do próprio jogo com fundo transparente (23/09/2026) | recortado no conteúdo, 640px de largura, WebP |

A licença CC0 da simple-icons cobre o ARQUIVO, não a marca: LoL e Valorant
são marcas da Riot Games (assim como o TFT), EA / EA Sports FC, da Electronic Arts,
e Brawl Stars, da Supercell. O uso aqui
é só para identificar os jogos das competições.

O Phoenix é personagem do Valorant (Riot Games), um dos jogos da copa. Ele
está na faixa de e-sports como chamariz visual, a pedido da comissão, e foi
escolhido porque o fogo laranja dele é o mesmo âmbar da página. Antes dele
passaram a Tracer (Overwatch, fora da copa) e a Jett (azul, brigava com a
paleta); as duas saíram da página. Se a Riot ou a coordenação pedir, é só
apagar o `<img class="esports-heroina">` em `core/semcomp.njk`, e a faixa
funciona sem ele.

O EA FC 26 não tem logo na simple-icons: entra a marca EA com "FC 26"
escrito ao lado. O Wikimedia Commons tem o logo oficial
(`EAFC26 SEASONAL SOLID CHALK WHITE HORIZONTAL RGB.svg`), mas o download
automático foi bloqueado. Se alguém baixar à mão, ele substitui o `ea.svg`.

## DeepRacer

O cartão da competição de IA usa o ícone ilustrado da comissão
(`images/semcomp/icones/deepracer.webp`, de
`outros/icons-diferentes/icon-awsdeepracer.png`). A foto do carrinho, tirada da
página do produto na AWS, foi usada por um tempo e saiu; o original continua em
`outros/deepracer/`.
