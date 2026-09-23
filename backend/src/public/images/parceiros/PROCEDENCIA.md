# Logos dos patrocinadores — de onde vieram

Marca de terceiro não é arte do clube, e um arquivo sem procedência é um
arquivo que ninguém sabe se pode usar. Cada logo desta pasta está registrado
abaixo com a fonte, a licença do ARQUIVO e o que foi alterado nele.

A licença cobre o arquivo, não a marca: o desenho de cada logo continua sendo
marca registrada da empresa, e usá-lo aqui se apoia em as empresas serem
patrocinadoras reais da SEMCOMP. **Antes de publicar, confirme com cada
patrocinador** — o normal é o próprio patrocinador mandar o kit de imprensa, e
aí o arquivo dele substitui o daqui.

| arquivo        | fonte                                                      | licença do arquivo | alteração                          |
|----------------|------------------------------------------------------------|--------------------|------------------------------------|
| `google.svg`   | Wikimedia Commons, `Google 2026 logo.svg`                   | domínio público    | nenhuma                            |
| `aws.png`      | posto na pasta pela comissão                                 | —                  | versão clara (ver abaixo)          |
| `red-bull.svg` | Wikimedia Commons, `Logo of Red bull.svg`                   | domínio público    | nenhuma                            |
| `fortinet.svg` | Wikimedia Commons, `Fortinet logo.svg`                      | domínio público    | `#231f20` → `#ffffff` (ver abaixo) |
| `caffeine-army.png` | derivado de `caffeine.png`, posto na pasta pela comissão | —                  | versão clara (ver abaixo)          |
| `senai-cimatec.png` | derivado de `universidade-senai-cimatec-300x132.png`, posto na pasta pela comissão | — | versão clara (ver abaixo) |
| `x-logic.png` | `X_Logic.png`, posto na pasta pela comissão (já em branco, fundo transparente) | — | recortado, reduzido a 160px de altura e quantizado em 64 cores |

A Dortech ainda não mandou logo e sai com o nome escrito. Google, AWS e
Caffeine Army saíram da faixa em 23/09/2026; os arquivos continuam aqui.

Os do Commons foram baixados em 16/09/2026. Os três SVG não têm `<script>`,
manipulador de evento nem referência externa — foi conferido, porque SVG é
executável e estes são servidos pelo domínio do clube.

Houve um `aws.svg` vindo do Commons (`Amazon Web Services 2025.svg`) e ele foi
REMOVIDO: o desenho estava errado. O que vale é o `aws.png` abaixo.

## A troca de cor da Fortinet

Ela chega com o wordmark em quase-preto (`#231f20`), que sobre o fundo desta
página é um logo invisível. Só o quase-preto virou branco; o vermelho da marca
ficou intacto. É o lockup "reverse" que ela publica para fundo escuro, e não
uma repintura inventada.

## A versão clara da AWS

`aws.png` chegou com fundo branco opaco — na página, um quadrado branco. O
arquivo que está na pasta é ele mesmo, já convertido no lugar:

  · o branco do papel virou transparente;
  · o wordmark "aws", que era o marinho `#252f3e`, virou branco;
  · **o laranja do sorriso ficou intacto.**

O alfa das bordas é a COBERTURA de tinta (quanto do pixel era tinta e não
papel, normalizado pela tinta cheia), e não `1 - brilho`: a segunda conta
deixa o miolo da letra com 75% de opacidade, e wordmark translúcido sobre
fundo escuro lê como cinza, não como branco. A mesma conta vale para a
Caffeine Army.

Separar o laranja do marinho é por MATIZ e BRILHO, não por saturação: o
marinho tem saturação 0,40 — num tom escuro `(max-min)/max` infla —, então
qualquer corte por saturação o trata como cor de marca e o deixa azul.

O original com fundo branco não está guardado, mas volta compondo este arquivo
sobre branco.

## A versão clara da Caffeine Army

`caffeine.png` é o arquivo como veio: tinta escura sobre papel branco OPACO —
sobre esta página, um quadrado branco. `caffeine-army.png` é o que a faixa usa,
derivado dele por `scripts/` nenhum (foi conversão pontual, registrada aqui):

  · o branco do papel virou transparente;
  · o letreiro "CAFFEINE ARMY", que era quase-preto, virou o branco quente da
    página (`--giz`), com o alfa saindo de quão escuro o pixel era — é o que
    preserva o antisserrilhado das bordas em vez de deixar o texto serrilhado;
  · **o ícone ficou como estava**, círculo creme com a chama escura dentro. Ele
    se apoia no próprio creme, não no fundo da página; clarear a chama junto
    teria apagado o desenho por dentro do círculo. Foi o primeiro resultado da
    conversão e por isso o ícone é tratado à parte.

O original fica na pasta de propósito: é a procedência do derivado, e é dele
que sai uma nova versão se o tamanho ou a cor precisarem mudar.

Se a marca mandar o kit de imprensa (SVG, ou PNG com transparência e versão
para fundo escuro), ele substitui os dois — é sempre melhor que uma conversão.

## A versão clara do SENAI CIMATEC

`universidade-senai-cimatec-300x132.png` é o arquivo como veio, já com fundo
transparente, mas com o letreiro em marinho `#164194` — sobre o `--breu` da
página dá contraste de cerca de 2:1, um logo que some. `senai-cimatec.png` é o
que a faixa usa:

  · o marinho virou branco, com o alfa de cada pixel mantido (o arquivo só tem
    duas cores cheias e o antisserrilhado já está no alfa, então a troca é
    exata e não pede a conta de cobertura da AWS);
  · **o laranja `#e84910` ficou intacto.**

O original fica na pasta, como o da Caffeine Army: é a procedência do derivado.

## Tamanho dos PNG

`aws.png`, `caffeine-army.png` e `senai-cimatec.png` são quantizados em 64
cores. Os três têm duas ou três cores de verdade e o resto é antisserrilhado,
então a paleta não tira nada visível e corta o arquivo em cerca de seis vezes (33 KB → 4 KB no da AWS).
