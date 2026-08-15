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
     AVISO QUE ABRE SOZINHO — o PROSEL aberto, a membresia e a camisa.

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
  const modalAviso = document.getElementById('modalAviso');

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
    const posicao = alvo.getBoundingClientRect().top + window.scrollY - 80;
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
