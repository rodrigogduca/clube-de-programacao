/**
 * DESTINOS EXTERNOS DO SITE PÚBLICO — a única fonte da verdade.
 *
 * Isto morava num `{% set links = {...} %}` no topo de `views/core/home.njk`,
 * o que bastava enquanto existia uma página pública só. Com a chegada de
 * `/seja-membro` passaram a ser duas, e um `set` de template não atravessa
 * `{% include %}` nem `{% extends %}`: o mapa teria de ser copiado nas duas —
 * exatamente a duplicação que ele existia para acabar.
 *
 * Aqui em cima ele é injetado pelo `PageContextService.base()` e chega a TODA
 * página pública como `links`, inclusive ao layout compartilhado, que é quem
 * desenha a navbar e os modais.
 *
 * QUANDO UM PROCESSO ENCERRAR, deixe a string vazia em vez de apagar a chave.
 * Os templates conferem antes de desenhar (`{% if links.prosel %}`), então o
 * bloco correspondente some da página sozinho em vez de virar um botão que
 * leva a um formulário fechado. Apagar a chave quebraria o `if`.
 */
export const SITE_LINKS = {
  /**
   * Processo seletivo para entrar na ADMINISTRAÇÃO do clube.
   *
   * ENCERRADO — as inscrições do PROSEL 2026 fecharam. A string vazia é o que
   * apaga, de uma vez, a tarja do topo, o pop-up de aviso e o botão de
   * inscrição da /seja-membro; no lugar deles os templates desenham o aviso de
   * encerramento e mandam acompanhar as redes. Na próxima edição, basta
   * devolver o endereço do formulário aqui.
   *
   * Formulário da edição de 2026: https://tally.so/r/vG6KPd
   */
  prosel: '',

  /**
   * Inscrição na SEMCOMP, no Even3. DESTINO DIFERENTE do PROSEL: um é para
   * trabalhar no clube, o outro é para assistir à semana. Já foram confundidos.
   */
  semcomp: 'https://www.even3.com.br/semcomp2026-701106',

  /**
   * Cadastro de membro, sem seleção. Guardado sem o `?edit_requested=true` que
   * veio colado no endereço original — aquilo é resquício de quem estava
   * editando o formulário e não faz parte do endereço público.
   */
  membresia:
    'https://docs.google.com/forms/d/1dsH2payyp2EaLyqjtkg0XrEwEX8-rfcsbB9iusM99II/viewform',

  /** Pré-venda das camisas do clube. */
  camisas: 'https://tally.so/r/xXbva9',

  /**
   * As ferramentas acadêmicas (média do semestre, limite de faltas) viviam
   * dentro da home como duas calculadoras. Hoje são um produto à parte da
   * comunidade e o site só aponta para lá.
   */
  helpCimatec: 'https://help-cimatec.netlify.app/',

  instagram: 'https://www.instagram.com/clubedeprogramacaocimatec',
  instagramSemcomp: 'https://www.instagram.com/semcompcimatec',
  whatsapp: 'https://chat.whatsapp.com/KMe3tc8wW38DVmymqQvoKP',
  discord: 'https://discord.gg/myDYj6hN',
  linkedin: 'https://www.linkedin.com/company/clube-de-programa%C3%A7%C3%A3o',
  tiktok: 'https://www.tiktok.com/@clube.de.programacao',
  youtube: 'https://www.youtube.com/@patotv-quack',

  /**
   * Grupos de estudo da maratona, por nível. Guardados sem a cauda
   * `?s=sw&p=i&mlu=0&ilr=2`: são parâmetros que o WhatsApp gruda quando o
   * convite é compartilhado pelo aplicativo, para contar de onde veio quem
   * entrou. O convite é só o código de 22 caracteres.
   */
  maratonaNovatos: 'https://chat.whatsapp.com/KTZhcsKd8Bu3GRxJJnxmEg',
  maratonaExperientes: 'https://chat.whatsapp.com/JnblfiaTqcGANlaAAhalbO',
} as const;

export type SiteLinks = typeof SITE_LINKS;
