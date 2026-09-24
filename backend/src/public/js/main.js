/* ============================================
   Site público — Clube de Programação

   Vale para a home e para a /seja-membro: as duas herdam de
   `layouts/site.njk`, que carrega este arquivo uma vez só.

   O QUE NÃO ESTÁ MAIS AQUI

   1. Os endereços externos. `PROSEL_INSCRICAO` e `SEMCOMP_INSCRICAO` viviam no
      topo deste arquivo e eram abertos com `window.open` a partir de dois
      <button>. Hoje moram em `src/pages/site-links.ts`, chegam a todo template
      pelo contexto e viram <a href> de verdade. Um botão que abre link não é
      copiável, não abre em nova aba com o meio do mouse, não aparece para o
      Google e some inteiro se este arquivo falhar — e a inscrição é o objetivo
      do site.

   2. As calculadoras de média e de faltas (~470 linhas). Elas são hoje um
      produto à parte, o Help CIMATEC, e a home só aponta para lá.
   ============================================ */

/* ---- NAVBAR ---- */
const navbar = document.getElementById('navbar');

if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });
}

/* ---- MENU DO CELULAR ---- */
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

function fecharMenu() {
  if (!mobileMenu || !hamburger) return;
  mobileMenu.classList.remove('open');
  hamburger.classList.remove('aberto');
  hamburger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const aberto = mobileMenu.classList.toggle('open');
    // As três barras viram X pelo CSS (`.hamburger.aberto`), não por três
    // `style.transform` escritos daqui: a animação é aparência, e aparência
    // que mora no JS não respeita `prefers-reduced-motion`.
    hamburger.classList.toggle('aberto', aberto);
    hamburger.setAttribute('aria-expanded', String(aberto));
    document.body.style.overflow = aberto ? 'hidden' : '';
  });

  // Os itens do menu fecham ao serem usados. Inclui os <button> de modal: sem
  // isto o modal abria ATRÁS do menu aberto, no celular.
  mobileMenu.querySelectorAll('a, button').forEach((item) => {
    item.addEventListener('click', fecharMenu);
  });
}

/* ---- TARJA DE AVISO ----

   Aqui só mora a DISPENSA. Quem decide se a tarja aparece é o script no <head>
   de `layouts/site.njk`, que roda antes da primeira pintura — este arquivo
   chega no fim do body, quando a página já foi desenhada, e mexer na altura do
   topo daqui faria a tela pular a cada carregamento.

   A identidade da campanha vem do <html>, escrita por aquele script: é o que
   mantém a chave do localStorage declarada num lugar só. Sem ela (tarja fora do
   ar, ou script bloqueado) não há o que gravar. */
(function () {
  const botao = document.getElementById('tarjaFechar');
  if (!botao) return;

  botao.addEventListener('click', () => {
    const raiz = document.documentElement;
    // Tirar a classe some com a tarja E devolve o topo à navbar e à página, em
    // um passo: as três medidas saem do mesmo `--tarja-h`.
    raiz.classList.remove('com-tarja');

    const campanha = raiz.dataset.tarja;
    if (!campanha) return;
    try {
      window.localStorage.setItem('tarja:' + campanha, '1');
    } catch (e) {
      /* Sem armazenamento a tarja volta na próxima página. É o que sobra. */
    }
  });
})();

/* ============================================
   MODAIS

   Um sistema só para os três (Comunidade, SEMCOMP e o agradecimento do PROSEL),
   em vez de um par de listeners copiado por modal — que foi como o Discord
   ficou desatualizado numa das duas listas de redes que existiam antes.

   O contrato é o HTML:

     [data-modal="idDoModal"]   qualquer elemento que abre
     [data-modal-fechar]        qualquer elemento que fecha
     .modal-overlay[hidden]     o modal, escondido de verdade até abrir

   `hidden` e não só uma classe: sem ele o conteúdo do modal fica na ordem de
   tabulação e na leitura de tela mesmo fechado — dá para tabular "às cegas"
   por dentro de um modal invisível. A classe `.open` continua existindo para o
   CSS animar a entrada.
   ============================================ */
(function () {
  const modais = Array.from(document.querySelectorAll('.modal-overlay'));
  if (!modais.length) return;

  // Quem tinha o foco antes de abrir. É para cá que ele volta ao fechar —
  // senão o foco cai no começo da página e a pessoa que navega por teclado
  // perde o lugar onde estava.
  let gatilhoAnterior = null;
  let modalAberto = null;

  const FOCAVEIS = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function focaveis(modal) {
    return Array.from(modal.querySelectorAll(FOCAVEIS))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function abrir(modal, gatilho) {
    if (!modal || modalAberto === modal) return;
    if (modalAberto) fechar({ devolverFoco: false });

    gatilhoAnterior = gatilho || document.activeElement;
    modalAberto = modal;

    modal.hidden = false;
    // Um quadro de atraso antes da classe: `hidden` some e a transição de
    // opacidade só acontece se o elemento já estiver no layout quando a classe
    // chegar. Sem isto o modal aparece estalado, sem a entrada.
    requestAnimationFrame(() => modal.classList.add('open'));
    document.body.style.overflow = 'hidden';

    const alvos = focaveis(modal);
    (alvos[0] || modal).focus();
  }

  function fechar(opcoes) {
    const devolverFoco = !opcoes || opcoes.devolverFoco !== false;
    const modal = modalAberto;
    if (!modal) return;

    modal.classList.remove('open');
    modalAberto = null;
    document.body.style.overflow = '';

    // Espera a transição de saída antes de esconder de verdade; se o usuário
    // pediu menos movimento, a transição dura ~0ms e o `hidden` chega junto.
    const espera = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
    window.setTimeout(() => {
      // Só esconde se nenhum outro modal tiver sido aberto nesse meio tempo.
      if (modalAberto !== modal) modal.hidden = true;
    }, espera);

    if (devolverFoco && gatilhoAnterior && document.contains(gatilhoAnterior)) {
      gatilhoAnterior.focus();
    }
    gatilhoAnterior = null;
  }

  document.querySelectorAll('[data-modal]').forEach((gatilho) => {
    gatilho.addEventListener('click', (e) => {
      e.preventDefault();
      abrir(document.getElementById(gatilho.dataset.modal), gatilho);
    });
  });

  modais.forEach((modal) => {
    modal.querySelectorAll('[data-modal-fechar]').forEach((botao) => {
      botao.addEventListener('click', () => fechar());
    });
    // Clique no fundo — e só no fundo, não em qualquer coisa dentro do cartão.
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) fechar();
    });
    // Um link do modal leva para fora; ao voltar pelo histórico o navegador
    // restaura a página com o modal ainda aberto e o corpo travado.
    modal.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => fechar({ devolverFoco: false }));
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!modalAberto) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
      return;
    }

    // Prende o foco: no último item o Tab volta ao primeiro, e vice-versa.
    // Sem isto o teclado sai do modal e vai passear pela página atrás dele,
    // que é justamente o que `aria-modal` promete que não acontece.
    if (e.key !== 'Tab') return;
    const alvos = focaveis(modalAberto);
    if (!alvos.length) return;

    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  });

  /* Volta do Tally: o formulário do PROSEL redireciona para `?prosel=obrigado`
     e o modal de agradecimento abre a partir daí. O parâmetro sai do endereço
     ao fechar, para um F5 não reabrir o agradecimento. */
  const modalProsel = document.getElementById('modalProsel');
  const voltouDoFormulario =
    new URLSearchParams(window.location.search).get('prosel') === 'obrigado';

  if (modalProsel && voltouDoFormulario) {
    abrir(modalProsel, null);
    modalProsel.addEventListener('transitionend', function limpar() {
      modalProsel.removeEventListener('transitionend', limpar);
    });
    const url = new URL(window.location.href);
    url.searchParams.delete('prosel');
    window.history.replaceState({}, '', url);
  }

  /* ------------------------------------------------------------------
     AVISO QUE ABRE SOZINHO — hoje, a SEMCOMP chegando.

     QUEM ABRE É O `data-aviso`, NÃO UM `id`. Antes daqui saía um
     `getElementById('modalAviso')`, e o modal do PROSEL era o único que existia
     — quando a SEMCOMP ganhou o dela, o caminho barato seria reaproveitar
     aquele id para outro assunto, e o site passaria a ter um "modalAviso" que
     não fala do aviso de que o nome dele veio. O atributo já era o contrato
     (é ele que nomeia a campanha no localStorage); agora é ele que também
     escolhe o modal, e um aviso novo é um `data-aviso` novo no template, sem
     linha nenhuma aqui.

     UM POR PÁGINA, E É O PRIMEIRO DO DOM. `querySelector` e não `querySelectorAll`
     de propósito: dois diálogos abrindo sozinhos um por cima do outro é a praga
     que as regras abaixo existem para evitar. Quando duas campanhas estiverem
     de pé ao mesmo tempo, quem decide qual interrompe é a ORDEM em que o
     `layouts/site.njk` as desenha — o de cima ganha.

     É o único modal do site que ninguém pede para ver, então as três regras
     abaixo existem para ele não virar praga:

     1. UMA VEZ POR CAMPANHA, e não uma vez por página. A marca fica no
        localStorage sob a identidade do `data-aviso` do próprio modal — trocar
        aquele valor no template é o que faz o aviso voltar para todo mundo.
        `localStorage` e não `sessionStorage`: quem fechou o aviso hoje não
        quer revê-lo amanhã só porque abriu o navegador de novo.

     2. NÃO ATROPELA NADA. Se o agradecimento do formulário já estiver aberto,
        o aviso nem entra na fila — e some de vez: quem acabou de se inscrever
        é a última pessoa que precisa saber que as inscrições abriram.

     3. UM RESPIRO ANTES DE APARECER. Sem ele o diálogo rouba o foco no mesmo
        quadro em que a página pinta, antes de a pessoa ver onde chegou.

     O `localStorage` fica em try/catch porque ele LANÇA — não devolve null —
     em navegação privada de Safari antigo e quando o usuário bloqueia dados de
     site. Sem a proteção, o erro derruba o resto deste arquivo junto.
     ------------------------------------------------------------------ */
  const modalAviso = document.querySelector('.modal-overlay[data-aviso]');

  if (modalAviso) {
    const chave = 'aviso:' + (modalAviso.dataset.aviso || 'padrao');

    const jaViu = (function () {
      try {
        return window.localStorage.getItem(chave) === '1';
      } catch (e) {
        // Sem armazenamento, o aviso aparece uma vez por carregamento. É o
        // comportamento pior, mas é o que sobra — e ainda é melhor do que
        // nenhum aviso.
        return false;
      }
    })();

    function marcarVisto() {
      try {
        window.localStorage.setItem(chave, '1');
      } catch (e) {
        /* Sem armazenamento não há o que marcar. */
      }
    }

    if (voltouDoFormulario) {
      marcarVisto();
    } else if (!jaViu) {
      window.setTimeout(function () {
        // Outro modal pode ter sido aberto no meio do respiro — o de
        // Comunidade, por exemplo. Abrir por cima fecharia o que a pessoa
        // pediu para ver.
        if (modalAberto) return;
        abrir(modalAviso, null);
        marcarVisto();
      }, 1200);
    }
  }
})();

/* ---- REVELAÇÃO NA ROLAGEM ---- */
(function () {
  const alvos = document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right');
  if (!alvos.length) return;

  const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('visible');
      observador.unobserve(entrada.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

  alvos.forEach((el) => observador.observe(el));
})();

/* ---- BRILHO NO CURSOR (só em ponteiro fino) ---- */
(function () {
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;

  if (!window.matchMedia('(pointer: fine)').matches) {
    glow.style.display = 'none';
    return;
  }

  let mouseX = 0, mouseY = 0, glowX = 0, glowY = 0, animando = false;

  function animar() {
    glowX += (mouseX - glowX) * 0.08;
    glowY += (mouseY - glowY) * 0.08;
    glow.style.transform = `translate(${glowX - 200}px, ${glowY - 200}px)`;
    if (Math.abs(mouseX - glowX) > 0.5 || Math.abs(mouseY - glowY) > 0.5) {
      requestAnimationFrame(animar);
    } else {
      animando = false;
    }
  }

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!animando) {
      animando = true;
      animar();
    }
  }, { passive: true });
})();

/* ---- ROLAGEM SUAVE NAS ÂNCORAS ---- */
document.querySelectorAll('a[href^="#"]').forEach((ancora) => {
  ancora.addEventListener('click', function (e) {
    const destino = this.getAttribute('href');
    if (destino === '#') return;
    const alvo = document.querySelector(destino);
    if (!alvo) return;
    e.preventDefault();
    // O recuo é a navbar flutuante mais a tarja, quando ela está no ar. Medido
    // no clique e não guardado: a tarja pode ter sido fechada no meio do
    // caminho, e aí `offsetHeight` já responde 0 (ela é `display: none`).
    const tarja = document.querySelector('.tarja');
    const recuo = 80 + (tarja ? tarja.offsetHeight : 0);
    const posicao = alvo.getBoundingClientRect().top + window.scrollY - recuo;
    window.scrollTo({ top: posicao, behavior: 'smooth' });
  });
});

/* ---- DIGITAÇÃO DA LINHA DO HERÓI ---- */
(function () {
  const el = document.querySelector('.hero-typing');
  if (!el) return;

  const texto = el.dataset.text || '';

  // Quem pediu menos movimento recebe a frase inteira, de uma vez.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = texto;
    el.classList.add('done');
    return;
  }

  el.textContent = '';
  let i = 0;
  function digitar() {
    if (i < texto.length) {
      el.textContent += texto[i++];
      setTimeout(digitar, 25);
    } else {
      el.classList.add('done');
    }
  }

  const observador = new IntersectionObserver((entradas) => {
    if (!entradas[0].isIntersecting) return;
    digitar();
    observador.disconnect();
  }, { threshold: 0.5 });
  observador.observe(el);
})();

/* ---- CONTAGEM DOS NÚMEROS ---- */
(function () {
  const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('.stat-number').forEach((el) => {
    const texto = el.textContent;
    const achado = texto.match(/(\d+)/);
    if (!achado) return;

    const alvo = parseInt(achado[1], 10);
    const sufixo = texto.replace(achado[1], '').trim();

    if (reduzido) {
      el.innerHTML = `${alvo}<span>${sufixo}</span>`;
      return;
    }

    let atual = 0;
    const passo = alvo / (1500 / 16);

    function subir() {
      atual += passo;
      if (atual >= alvo) {
        el.innerHTML = `${alvo}<span>${sufixo}</span>`;
        return;
      }
      el.innerHTML = `${Math.floor(atual)}<span>${sufixo}</span>`;
      requestAnimationFrame(subir);
    }

    const observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        subir();
        observador.unobserve(entrada.target);
      });
    }, { threshold: 0.5 });

    observador.observe(el);
  });
})();

/* ---- MENU DO USUÁRIO LOGADO ---- */
(function () {
  const avatar = document.querySelector('.user-avatar');
  if (!avatar) return;
  const dropdown = avatar.nextElementSibling;
  if (!dropdown) return;

  avatar.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== avatar) {
      dropdown.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropdown.classList.remove('open');
  });
})();

/* ---- A HORA DA /semcomp ----
   Um relógio só para a contagem do topo e para a barra da programação: as
   duas precisam concordar sobre que horas são.

   `?agora=2026-10-01T10:00` finge outra hora, para conferir a página fora da
   semana. Sem fuso na string, vale o de Salvador. Só muda o navegador de quem
   abriu o link. */
const semcompAgora = (function () {
  const falso = new URLSearchParams(location.search).get('agora');
  const deslocamento = falso
    ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(falso) ? falso : falso + '-03:00').getTime() - Date.now()
    : 0;
  return () => Date.now() + (Number.isNaN(deslocamento) ? 0 : deslocamento);
})();

/* ---- CONTAGEM REGRESSIVA (topo da /semcomp) ----
   Até o credenciamento do primeiro dia; durante a semana vira "acontecendo
   agora" e, depois, "terminou". Ver o comentário do `#contagemSemcomp` em
   `core/semcomp.njk`. */
(function () {
  const caixa = document.getElementById('contagemSemcomp');
  if (!caixa) return;

  const inicio = new Date(caixa.dataset.inicio).getTime();
  const fim = new Date(caixa.dataset.fim).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return;

  const rotulo = caixa.querySelector('[data-contagem-rotulo]');
  const numeros = caixa.querySelector('[data-contagem-numeros]');
  const aoVivo = caixa.querySelector('[data-contagem-aovivo]');
  const campo = {};
  caixa.querySelectorAll('[data-contagem]').forEach((el) => { campo[el.dataset.contagem] = el; });

  const doisDigitos = (n) => String(n).padStart(2, '0');
  const TOTAL_DIAS = 5;
  let relogio = null;

  function atualizar() {
    const t = semcompAgora();

    if (t < inicio) {
      let resto = Math.floor((inicio - t) / 1000);
      const dias = Math.floor(resto / 86400); resto -= dias * 86400;
      const horas = Math.floor(resto / 3600); resto -= horas * 3600;
      const minutos = Math.floor(resto / 60);
      const segundos = resto - minutos * 60;

      campo.dias.textContent = doisDigitos(dias);
      campo.horas.textContent = doisDigitos(horas);
      campo.minutos.textContent = doisDigitos(minutos);
      campo.segundos.textContent = doisDigitos(segundos);
      numeros.setAttribute('aria-label',
        `Faltam ${dias} dias, ${horas} horas e ${minutos} minutos para a abertura da SEMCOMP 2026`);
      rotulo.textContent = 'Faltam para a abertura';
      numeros.hidden = false;
      aoVivo.hidden = true;
      caixa.dataset.fase = 'antes';
      return;
    }

    numeros.hidden = true;
    aoVivo.hidden = false;

    if (t >= fim) {
      rotulo.textContent = 'SEMCOMP 2026';
      aoVivo.textContent = 'A semana terminou. Obrigado a quem veio, e até a próxima edição!';
      caixa.dataset.fase = 'depois';
      clearInterval(relogio);
      return;
    }

    // Dia da semana (1 a 5) pela data em Salvador, e se é horário de evento.
    const hojeMs = Date.parse(new Date(t - 3 * 3600e3).toISOString().slice(0, 10));
    const primeiroMs = Date.parse(new Date(inicio - 3 * 3600e3).toISOString().slice(0, 10));
    const dia = Math.min(TOTAL_DIAS, Math.floor((hojeMs - primeiroMs) / 864e5) + 1);
    const horaLocal = new Date(t - 3 * 3600e3);
    const minutosDoDia = horaLocal.getUTCHours() * 60 + horaLocal.getUTCMinutes();
    const emHorario = minutosDoDia >= 7 * 60 + 30 && minutosDoDia < 18 * 60;

    if (emHorario) {
      rotulo.textContent = 'Acontecendo agora';
      aoVivo.textContent = `Dia ${dia} de ${TOTAL_DIAS} da SEMCOMP 2026`;
      caixa.dataset.fase = 'dia';
    } else {
      rotulo.textContent = `Dia ${dia} de ${TOTAL_DIAS}`;
      aoVivo.textContent = minutosDoDia < 7 * 60 + 30
        ? 'Hoje tem SEMCOMP: o credenciamento abre às 07:30'
        : 'Amanhã tem mais, com credenciamento às 07:30';
      caixa.dataset.fase = 'noite';
    }
  }

  caixa.hidden = false;
  atualizar();
  relogio = setInterval(atualizar, 1000);
})();

/* ---- ANDAMENTO DA SEMCOMP (barra de progresso da /semcomp) ----
   Lê o horário de cada dia nos `data-inicio`/`data-fim` da trilha e desenha
   três coisas: a barra de cima, o preenchimento do filete que liga os dias e
   o selo "Hoje" no dia corrente. Ver o comentário do `.semana-status` em
   `core/semcomp.njk` para o porquê de ser no navegador. */
(function () {
  const trilha = document.getElementById('trilhaSemana');
  const status = document.getElementById('semanaStatus');
  if (!trilha || !status) return;

  const dias = Array.from(trilha.querySelectorAll('.trilha-dia')).map((li) => ({
    li,
    data: li.dataset.data,
    inicio: new Date(li.dataset.inicio).getTime(),
    fim: new Date(li.dataset.fim).getTime(),
    tema: li.dataset.tema,
    selo: li.querySelector('[data-trilha-hoje]'),
    plaqueta: li.querySelector('.trilha-data'),
  }));
  if (!dias.length || dias.some((d) => Number.isNaN(d.inicio))) return;

  const rotulo = status.querySelector('[data-status-rotulo]');
  const pct = status.querySelector('[data-status-pct]');
  const barra = status.querySelector('[role="progressbar"]');
  const preenchido = status.querySelector('[data-status-preenchido]');
  const marcas = status.querySelectorAll('[data-status-dia]');

  const agora = semcompAgora;

  // A data de calendário em Salvador (-03:00, sem horário de verão).
  const dataLocal = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
  const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

  /* Onde o dia está: `indice` do dia de referência e `fracao` (0 a 1) do
     quanto ele já andou. À noite, entre dois dias, fica em 1 no dia que
     acabou — a barra para e espera o credenciamento do seguinte. */
  function situacao(t) {
    if (t < dias[0].inicio) return { fase: 'antes', indice: 0, fracao: 0 };
    const ultimo = dias.length - 1;
    if (t >= dias[ultimo].fim) return { fase: 'depois', indice: ultimo, fracao: 1 };
    for (let i = ultimo; i >= 0; i--) {
      const d = dias[i];
      if (t >= d.inicio) {
        if (t < d.fim) return { fase: 'dia', indice: i, fracao: (t - d.inicio) / (d.fim - d.inicio) };
        return { fase: 'noite', indice: i, fracao: 1 };
      }
    }
    return { fase: 'antes', indice: 0, fracao: 0 };
  }

  function texto(s, t) {
    const n = dias.length;
    if (s.fase === 'antes') {
      const faltam = diasEntre(dataLocal(t), dias[0].data);
      if (faltam <= 0) return 'Começa hoje · credenciamento às 07:30';
      if (faltam === 1) return 'Começa amanhã · credenciamento às 07:30';
      return `Começa em ${faltam} dias`;
    }
    if (s.fase === 'depois') return 'A SEMCOMP 2026 terminou · até a próxima edição';
    const d = dias[s.indice];
    if (s.fase === 'dia') return `Acontecendo agora · dia ${s.indice + 1} de ${n}: ${d.tema}`;
    const prox = dias[s.indice + 1];
    return `Dia ${s.indice + 1} de ${n} encerrado · amanhã: ${prox.tema}`;
  }

  /* O filete da trilha: vai do centro da primeira plaqueta ao centro da
     última, e dentro de um dia anda proporcionalmente até a plaqueta do dia
     seguinte. O último dia anda até o fim do filete, que termina a 34px do
     pé da lista (o mesmo `bottom` do `.trilha::before` na folha). */
  function preencherFilete(s) {
    const centro = (d) => d.li.offsetTop + d.plaqueta.offsetTop + d.plaqueta.offsetHeight / 2;
    const topo = centro(dias[0]);
    let alvo = topo;
    if (s.fase !== 'antes') {
      const daqui = centro(dias[s.indice]);
      const dali = s.indice + 1 < dias.length ? centro(dias[s.indice + 1]) : trilha.offsetHeight - 34;
      alvo = daqui + (dali - daqui) * s.fracao;
    }
    trilha.style.setProperty('--trilha-topo', `${topo}px`);
    trilha.style.setProperty('--trilha-progresso', `${Math.max(0, alvo - topo)}px`);
  }

  function atualizar() {
    const t = agora();
    const s = situacao(t);
    const hoje = dataLocal(t);
    const total = s.fase === 'antes' ? 0 : (s.indice + s.fracao) / dias.length;
    const porcento = Math.round(total * 100);

    rotulo.textContent = texto(s, t);
    pct.textContent = `${porcento}%`;
    barra.setAttribute('aria-valuenow', String(porcento));
    barra.setAttribute('aria-valuetext', rotulo.textContent);
    preenchido.style.width = `${total * 100}%`;
    status.dataset.fase = s.fase;

    dias.forEach((d, i) => {
      const passou = t >= d.fim;
      const ehHoje = d.data === hoje;
      const aoVivo = t >= d.inicio && t < d.fim;
      d.li.classList.toggle('trilha-dia--passado', passou && !ehHoje);
      d.li.classList.toggle('trilha-dia--hoje', ehHoje);
      d.li.classList.toggle('trilha-dia--vivo', aoVivo);
      if (d.selo) {
        d.selo.hidden = !ehHoje;
        d.selo.textContent = aoVivo ? 'Ao vivo' : 'Hoje';
      }
      if (marcas[i]) {
        marcas[i].classList.toggle('feito', passou);
        marcas[i].classList.toggle('hoje', ehHoje);
      }
    });

    preencherFilete(s);
  }

  status.hidden = false;
  atualizar();
  setInterval(atualizar, 60e3);
  window.addEventListener('resize', () => preencherFilete(situacao(agora())));
  // As fontes mudam a altura dos cartões depois do primeiro desenho.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(atualizar);
})();

/* ---- RODÍZIO DOS LOGOS DO CARTÃO "ESTANDES" (/semcomp) ----
   Cada grupo mostra um logo por vez. Os grupos começam defasados para não
   trocarem todos no mesmo instante, e o rodízio para enquanto o ponteiro
   ou o foco estão no cartão, para quem quer ler o logo com calma. */
(function () {
  const grupos = document.querySelectorAll('.estandes-rodizio');
  if (!grupos.length) return;

  // Tempo que cada logo fica no ar: dá para ler a marca com calma.
  const INTERVALO = 4500;
  let pausado = false;

  const cartao = grupos[0].closest('.formato-card');
  if (cartao) {
    cartao.addEventListener('mouseenter', () => { pausado = true; });
    cartao.addEventListener('mouseleave', () => { pausado = false; });
    cartao.addEventListener('focusin', () => { pausado = true; });
    cartao.addEventListener('focusout', () => { pausado = false; });
  }

  grupos.forEach((grupo, g) => {
    const itens = grupo.querySelectorAll('.estandes-item');
    if (itens.length < 2) return;
    let atual = 0;

    setTimeout(() => {
      setInterval(() => {
        if (pausado || document.hidden) return;
        itens[atual].classList.remove('estandes-item--ativo');
        atual = (atual + 1) % itens.length;
        itens[atual].classList.add('estandes-item--ativo');
      }, INTERVALO);
    }, g * (INTERVALO / grupos.length));
  });
})();
