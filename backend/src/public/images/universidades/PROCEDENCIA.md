# Logos das universidades — de onde vieram

Baixados do site oficial de cada universidade em 23/09/2026. Os arquivos
como vieram ficam em `outros/universidades/` na raiz do repositório.

| arquivo        | fonte                                                                 | alteração |
|----------------|-----------------------------------------------------------------------|-----------|
| `ufba.png`     | ufba.br — `logoufba_rodape.png` (versão clara do rodapé do portal)    | recortado |
| `uesb.png`     | uesb.br — `logo_uesb.png` (já com letreiro branco)                    | recortado |
| `ucsal.png`    | ucsal.br — `logo-ucsal.png` (versão branca)                           | recortado |
| `uneb.png`     | portal.uneb.br — `logo_uneb.svg`                                       | rasterizado; letreiro (à direita do brasão) marinho → `--giz`; filete vermelho e brasão intactos |
| `unifacs.svg`  | unifacs.br — `logo-unifacs.svg`                                        | `#002F87` → `#F6F1E9`; selo vermelho intacto |
| `unijorge.svg` | unijorge.edu.br — `header_logo.svg`                                    | `#014C84` → `#F6F1E9`; vermelhos intactos |

O SENAI CIMATEC usa `images/parceiros/senai-cimatec.png`, o mesmo arquivo da
faixa de patrocinadores (procedência lá).

Os três SVG foram conferidos: nenhum tem `<script>`, manipulador de evento
nem referência externa.

A UNEB foi rasterizada duas vezes, sobre preto e sobre branco, e o alfa de
cada pixel saiu da diferença entre as duas imagens. O SVG dela pinta por classe
CSS, e o mesmo azul do letreiro aparece no brasão: trocar a cor no arquivo
clarearia o escudo junto.

A licença cobre só o uso para identificar as instituições participantes. Os
logos continuam sendo marca de cada universidade.

## Tudo em branco (23/09/2026)

A página mostra as sete universidades em branco, por um filtro CSS
(`brightness(0) invert(1)` no `.instituicoes img`). O filtro troca a cor e
mantém a transparência de cada pixel.

`uesb.png` e `uneb.png` foram REFEITOS para isso: os brasões dos dois são cor
sobre cor, e chapados em branco viravam uma mancha. Nos dois arquivos atuais
cada pixel é branco, e a transparência vem do brilho que ele tinha: o claro
fica sólido, as cores ficam a meia transparência (com piso de 18%, para a
silhueta do brasão continuar aparecendo) e o contorno quase preto some. As
versões coloridas saem de novo dos originais em `outros/universidades/`.
