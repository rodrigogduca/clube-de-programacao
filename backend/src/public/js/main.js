/* ============================================
   Clube de Programação - Home Page Scripts
   ============================================ */

/* ---- FORMULÁRIOS EXTERNOS ----
   Os dois destinos ficam aqui em cima porque são o que muda a cada edição —
   o resto do arquivo não precisa ser aberto para trocar um link.

   PROSEL é o processo seletivo do clube; SEMCOMP é a inscrição no evento. São
   destinos diferentes e não devem apontar para o mesmo lugar.

   Se `SEMCOMP_INSCRICAO` voltar a ser null (edição encerrada, página nova ainda
   sem link), o botão do evento se desabilita sozinho e avisa que as inscrições
   não estão abertas, em vez de abrir uma aba em branco. */
const PROSEL_INSCRICAO = 'https://tally.so/r/J926Po';
const SEMCOMP_INSCRICAO = 'https://www.even3.com.br/semcomp2026-701106';

/* ---- NAVBAR SCROLL ---- */
const navbar = document.getElementById('navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (currentScroll > 40) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
  lastScroll = currentScroll;
}, { passive: true });

/* ---- MOBILE MENU ---- */
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

function resetHamburger(spans) {
  spans[0].style.transform = 'none';
  spans[1].style.opacity = '1';
  spans[2].style.transform = 'none';
  document.body.style.overflow = '';
}

function closeMenu() {
  mobileMenu.classList.remove('open');
  const spans = hamburger.querySelectorAll('span');
  resetHamburger(spans);
}

hamburger.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('open');
  const spans = hamburger.querySelectorAll('span');
  if (isOpen) {
    spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
    spans[1].style.opacity = '0';
    spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    document.body.style.overflow = 'hidden';
  } else {
    resetHamburger(spans);
  }
});

// Attach closeMenu to mobile menu links
document.querySelectorAll('#mobileMenu a').forEach(link => {
  link.addEventListener('click', closeMenu);
});

/* ---- INTERSECTION OBSERVER (scroll reveal) ---- */
const observerOptions = {
  threshold: 0.08,
  rootMargin: '0px 0px -60px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll('.fade-in, .fade-in-left, .fade-in-right').forEach(el => {
  observer.observe(el);
});

/* ---- CURSOR GLOW (desktop only) ---- */
if (window.matchMedia('(pointer: fine)').matches) {
  const glow = document.getElementById('cursorGlow');
  let mouseX = 0, mouseY = 0;
  let glowX = 0, glowY = 0;
  let animating = false;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!animating) {
      animating = true;
      animateGlow();
    }
  }, { passive: true });

  function animateGlow() {
    glowX += (mouseX - glowX) * 0.08;
    glowY += (mouseY - glowY) * 0.08;
    glow.style.transform = `translate(${glowX - 200}px, ${glowY - 200}px)`;
    if (Math.abs(mouseX - glowX) > 0.5 || Math.abs(mouseY - glowY) > 0.5) {
      requestAnimationFrame(animateGlow);
    } else {
      animating = false;
    }
  }
} else {
  const glowEl = document.getElementById('cursorGlow');
  if (glowEl) glowEl.style.display = 'none';
}

/* ---- SMOOTH ANCHOR SCROLL ---- */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      const position = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: position, behavior: 'smooth' });
    }
  });
});

/* ---- TYPING ANIMATION (hero subtitle) ---- */
const typingEl = document.querySelector('.hero-typing');
if (typingEl) {
  const text = typingEl.dataset.text;
  typingEl.textContent = '';
  let i = 0;
  function typeChar() {
    if (i < text.length) {
      typingEl.textContent += text[i];
      i++;
      setTimeout(typeChar, 25);
    } else {
      typingEl.classList.add('done');
    }
  }
  const typingObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      typeChar();
      typingObserver.disconnect();
    }
  }, { threshold: 0.5 });
  typingObserver.observe(typingEl);
}

/* ---- COUNTER ANIMATION ---- */
function animateCounters() {
  document.querySelectorAll('.stat-number').forEach(el => {
    const text = el.textContent;
    const match = text.match(/(\d+)/);
    if (!match) return;
    const target = parseInt(match[1]);
    const suffix = text.replace(match[1], '');
    let current = 0;
    const duration = 1500;
    const step = target / (duration / 16);

    function update() {
      current += step;
      if (current >= target) {
        current = target;
        el.innerHTML = target + '<span>' + suffix.trim() + '</span>';
        return;
      }
      el.innerHTML = Math.floor(current) + '<span>' + suffix.trim() + '</span>';
      requestAnimationFrame(update);
    }

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          update();
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    counterObserver.observe(el);
  });
}

animateCounters();

/* ---- MODAL CONTATO ---- */
const btnContato = document.getElementById('btnContato');
const modalContato = document.getElementById('modalContato');
const modalClose = document.getElementById('modalClose');

btnContato.addEventListener('click', () => {
  modalContato.classList.add('open');
  document.body.style.overflow = 'hidden';
});

modalClose.addEventListener('click', () => {
  modalContato.classList.remove('open');
  document.body.style.overflow = '';
});

modalContato.addEventListener('click', (e) => {
  if (e.target === modalContato) {
    modalContato.classList.remove('open');
    document.body.style.overflow = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalContato.classList.contains('open')) {
    modalContato.classList.remove('open');
    document.body.style.overflow = '';
  }
});

/* ---- USER AVATAR DROPDOWN ---- */
(function() {
  const avatar = document.querySelector('.user-avatar');
  if (!avatar) return;
  const dropdown = avatar.nextElementSibling;
  if (!dropdown) return;

  avatar.addEventListener('click', function(e) {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', function(e) {
    if (!dropdown.contains(e.target) && e.target !== avatar) {
      dropdown.classList.remove('open');
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });
})();

/* ---- MODAL PROSEL ---- */
const btnProsel = document.getElementById('btnProsel');
const modalProsel = document.getElementById('modalProsel');
const modalProselClose = document.getElementById('modalProselClose');

if (btnProsel) {
  btnProsel.addEventListener('click', () => {
    window.open(PROSEL_INSCRICAO, '_blank', 'noopener');
  });
}

/* ---- INSCRIÇÃO NA SEMCOMP ---- */
(function () {
  const btnSemcomp = document.getElementById('btnSemcomp');
  if (!btnSemcomp) return;

  const nota = document.querySelector('.event-nota');

  if (!SEMCOMP_INSCRICAO) {
    // Sem formulário ainda: o botão não promete o que não pode cumprir.
    btnSemcomp.disabled = true;
    btnSemcomp.textContent = 'Inscrições ainda não abriram';
    if (nota) {
      nota.textContent = 'Avisamos no Instagram quando abrirem.';
    }
    return;
  }

  btnSemcomp.addEventListener('click', () => {
    window.open(SEMCOMP_INSCRICAO, '_blank', 'noopener');
  });
})();

if (modalProsel && modalProselClose) {
  modalProselClose.addEventListener('click', () => {
    modalProsel.classList.remove('open');
    document.body.style.overflow = '';
    // Remove query param from URL
    const url = new URL(window.location);
    url.searchParams.delete('prosel');
    window.history.replaceState({}, '', url);
  });

  modalProsel.addEventListener('click', (e) => {
    if (e.target === modalProsel) {
      modalProsel.classList.remove('open');
      document.body.style.overflow = '';
      const url = new URL(window.location);
      url.searchParams.delete('prosel');
      window.history.replaceState({}, '', url);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalProsel.classList.contains('open')) {
      modalProsel.classList.remove('open');
      document.body.style.overflow = '';
      const url = new URL(window.location);
      url.searchParams.delete('prosel');
      window.history.replaceState({}, '', url);
    }
  });

  // Show thank-you popup if returning from Tally with ?prosel=obrigado
  if (new URLSearchParams(window.location.search).get('prosel') === 'obrigado') {
    modalProsel.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

/* ---- CUSTOM NUMBER INPUT BUTTONS ---- */
(function() {
  document.querySelectorAll('.tool-number-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var input = this.closest('.tool-number-wrap').querySelector('input[type="number"]');
      if (!input) return;
      var step = parseFloat(input.step) || 1;
      var min = parseFloat(input.min);
      var max = parseFloat(input.max);
      var current = parseFloat(input.value) || 0;
      var dir = this.dataset.dir;

      if (dir === 'up') {
        current = Math.round((current + step) * 10) / 10;
        if (!isNaN(max)) current = Math.min(current, max);
      } else {
        current = Math.round((current - step) * 10) / 10;
        if (!isNaN(min)) current = Math.max(current, min);
      }

      input.value = current;
      input.dispatchEvent(new Event('input'));
    });
  });
})();

/* ---- PASSEI SENAI? CALCULATOR ----

   Calcula a cada tecla, sem botão. Três estados, conforme quantas notas estão
   preenchidas:

     0 notas    -> convite ("preencha as notas")
     1 a 3      -> resolve o que falta: quanto precisa nas avaliações em branco
     4          -> média fechada, situação, tabela e barra

   O estado do meio é o que as pessoas realmente querem no meio do semestre
   ("saiu a AV1, quanto eu preciso na AV3 e no EDAG?"). Antes ele só respondia
   com três notas na mão; com uma ou duas a calculadora se limitava a contar
   quantas faltavam, que é a informação que a pessoa já tinha.

   Com mais de uma em branco a conta não tem resposta única, então ela dá as
   duas leituras úteis: a nota igual em todas as que faltam, e — por avaliação —
   o mínimo naquela caso as outras venham com 10.

   As regras são do CIMATEC e não mudam aqui:
     AG = somatório(nota × peso) / 100, com pesos 25/25/30/20
     AG >= 7 aprova; 3 <= AG < 7 vai para a final; AG < 3 reprova
     pontuação na final = (50 - 6 × AG) / 4                                  */
(function() {
  var resultado = document.getElementById('resultadoMedia');
  var limpar = document.getElementById('btnLimparMedia');
  var campos = Array.prototype.slice.call(document.querySelectorAll('.js-nota'));

  // `limpar` no guarda também: sem ele, `limpar.hidden` dentro de render()
  // lançaria e a calculadora inteira morreria calada se alguém tirasse o botão
  // do template.
  if (!resultado || !limpar || !campos.length) return;

  var META = 7;
  var MIN_FINAL = 3;

  function virgula(n) {
    return n.toFixed(1).replace('.', ',');
  }

  /* Sem decimal à força: a soma ponderada dá 640 num caso e 512,5 noutro, e
     `toFixed(0)` mostrava "513" numa fórmula cuja conta usou 512,5. */
  function numero(n) {
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }

  // "AV3 e EDAG", "AV2, AV3 e EDAG" — em vez de listas com vírgula solta.
  function listar(itens) {
    if (itens.length < 2) return itens.join('');
    return itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
  }

  /* Lê os campos. `valor` é null quando vazio e o campo fica marcado como fora
     de faixa quando a nota digitada não é de 0 a 10 — antes o valor era
     silenciosamente cortado para 10 e a pessoa via o resultado de um número
     que não tinha digitado. */
  function ler() {
    return campos.map(function(campo) {
      var bruto = campo.value.trim();
      var n = parseFloat(bruto.replace(',', '.'));
      var vazio = bruto === '' || isNaN(n);
      var foraDaFaixa = !vazio && (n < 0 || n > 10);
      campo.classList.toggle('invalido', foraDaFaixa);
      campo.setAttribute('aria-invalid', foraDaFaixa ? 'true' : 'false');
      return {
        rotulo: campo.dataset.rotulo,
        peso: parseFloat(campo.dataset.peso),
        valor: vazio || foraDaFaixa ? null : n
      };
    });
  }

  function tabelaDe(notas) {
    var linhas = notas.map(function(a) {
      return '<tr><td>' + a.rotulo + '</td><td>' + virgula(a.valor) +
             '</td><td>' + a.peso + '%</td></tr>';
    }).join('');
    return '<table class="result-table">' +
      '<thead><tr><th>Avaliação</th><th>Nota</th><th>Peso</th></tr></thead>' +
      '<tbody>' + linhas + '</tbody></table>';
  }

  function render() {
    var notas = ler();
    var preenchidas = notas.filter(function(a) { return a.valor !== null; });
    var faltando = notas.filter(function(a) { return a.valor === null; });
    var invalidos = campos.filter(function(c) { return c.classList.contains('invalido'); });

    limpar.hidden = !campos.some(function(c) { return c.value.trim() !== ''; });

    if (invalidos.length) {
      resultado.className = 'tool-result';
      resultado.innerHTML =
        '<div class="result-title">Nota fora da faixa</div>' +
        '<div class="result-detail">As notas vão de 0 a 10. Corrija ' +
        invalidos.map(function(c) { return c.dataset.rotulo; }).join(' e ') +
        ' para ver a média.</div>';
      return;
    }

    if (!preenchidas.length) {
      resultado.className = 'tool-result vazio';
      resultado.innerHTML = 'Preencha as notas e a média aparece aqui. ' +
        'O que ficar em branco vira resposta: ela diz quanto você precisa tirar ' +
        'nessas avaliações para passar.';
      return;
    }

    // Soma ponderada do que já existe.
    var somaPesada = preenchidas.reduce(function(t, a) {
      return t + a.valor * a.peso;
    }, 0);

    /* Mais de uma em branco: a conta não tem resposta única, então saem as duas
       leituras que respondem a pergunta real ("saiu a AV1, quanto preciso na AV3
       e no EDAG?"): a nota igual em todas as que faltam, e — por avaliação — o
       mínimo naquela supondo 10 nas outras que faltam.

       Antes esse estado só contava quantas notas faltavam, que é a informação
       que a pessoa já tinha na tela. */
    if (faltando.length > 1) {
      var pesoFaltante = faltando.reduce(function(t, a) { return t + a.peso; }, 0);
      var uniforme = (META * 100 - somaPesada) / pesoFaltante;
      var tetoPossivel = (somaPesada + 10 * pesoFaltante) / 100;
      var quaisFaltam = listar(faltando.map(function(a) { return a.rotulo; }));
      resultado.className = 'tool-result';

      if (uniforme <= 0) {
        resultado.innerHTML =
          '<div class="result-value aprovado">' + virgula(0) + '</div>' +
          '<div class="result-title">Precisa em ' + quaisFaltam + '</div>' +
          '<div class="result-status aprovado-bg">Média 7,0 já garantida</div>' +
          '<div class="result-detail">As notas que você já tem fecham a média, mesmo com ' +
          quaisFaltam + ' zeradas.</div>';
        return;
      }

      if (uniforme > 10) {
        resultado.innerHTML =
          '<div class="result-value reprovado">—</div>' +
          '<div class="result-title">Precisa em ' + quaisFaltam + '</div>' +
          '<div class="result-status final-bg">Não dá mais 7,0</div>' +
          '<div class="result-detail">Nem com 10 em ' + quaisFaltam +
          ' a média chega a 7,0: o máximo possível é <strong>' + virgula(tetoPossivel) +
          '</strong>. Ainda cabe a Avaliação Final.</div>';
        return;
      }

      /* Arredondado para CIMA, como no caso de uma nota só: é um mínimo, e
         9,31 exibido como 9,3 não fecha os 7,0 que a linha promete. */
      var uniformeExibida = Math.ceil(uniforme * 10) / 10;

      /* Coluna "com 10 nas outras": o mínimo nesta avaliação supondo que as
         demais em branco venham com 10. Nunca passa de 10 aqui, porque
         `uniforme <= 10` já garante que existe combinação possível. */
      var linhas = faltando.map(function(a) {
        var minimo = (META * 100 - somaPesada - 10 * (pesoFaltante - a.peso)) / a.peso;
        minimo = Math.max(0, Math.ceil(minimo * 10) / 10);
        return '<tr><td>' + a.rotulo + '</td><td>' + a.peso + '%</td><td>' +
               virgula(minimo) + '</td></tr>';
      }).join('');

      resultado.innerHTML =
        '<div class="result-value final-nota">' + virgula(uniformeExibida) + '</div>' +
        '<div class="result-title">Precisa em cada uma: ' + quaisFaltam + '</div>' +
        '<div class="result-detail">É a nota mínima se você tirar o mesmo em ' +
        quaisFaltam + ', para a média fechar em 7,0 e passar direto.</div>' +
        '<table class="result-table">' +
          '<thead><tr><th>Falta</th><th>Peso</th><th>Mínimo com 10 nas outras</th></tr></thead>' +
          '<tbody>' + linhas + '</tbody>' +
        '</table>' +
        '<div class="result-formula">precisa = (7 × 100 − ' + numero(somaPesada) +
        ') ÷ ' + pesoFaltante + '</div>';
      return;
    }

    if (faltando.length === 1) {
      var alvo = faltando[0];
      var precisa = (META * 100 - somaPesada) / alvo.peso;
      var maximo = (somaPesada + 10 * alvo.peso) / 100;
      resultado.className = 'tool-result';

      if (precisa <= 0) {
        resultado.innerHTML =
          '<div class="result-value aprovado">' + virgula(0) + '</div>' +
          '<div class="result-title">Precisa em ' + alvo.rotulo + '</div>' +
          '<div class="result-status aprovado-bg">Média 7,0 já garantida</div>' +
          '<div class="result-detail">As outras notas já fecham a média, mesmo com ' +
          alvo.rotulo + ' zerada.</div>';
      } else if (precisa > 10) {
        resultado.innerHTML =
          '<div class="result-value reprovado">—</div>' +
          '<div class="result-title">Precisa em ' + alvo.rotulo + '</div>' +
          '<div class="result-status final-bg">Não dá mais 7,0</div>' +
          '<div class="result-detail">Nem com 10 em ' + alvo.rotulo +
          ' a média chega a 7,0: o máximo possível é <strong>' + virgula(maximo) +
          '</strong>. Ainda cabe a Avaliação Final.</div>';
      } else {
        /* Arredonda para CIMA na casa decimal: é um mínimo. Em 9,375 o
           arredondamento normal daria 9,4 (que serve), mas em 9,31 daria 9,3 —
           e 9,3 não fecha os 7,0 que a linha promete. */
        var precisaExibida = Math.ceil(precisa * 10) / 10;
        resultado.innerHTML =
          '<div class="result-value final-nota">' + virgula(precisaExibida) + '</div>' +
          '<div class="result-title">Precisa em ' + alvo.rotulo + '</div>' +
          '<div class="result-detail">É a nota mínima em ' + alvo.rotulo +
          ' para a média fechar em 7,0 e passar direto.</div>' +
          '<div class="result-formula">precisa = (7 × 100 − ' +
          numero(somaPesada) + ') ÷ ' + alvo.peso + '</div>';
      }
      return;
    }

    // Quatro notas: média fechada.
    var ag = somaPesada / 100;
    var agArredondado = Math.round(ag * 10) / 10;

    /* A SITUAÇÃO SAI DA MÉDIA ARREDONDADA, a mesma que aparece na tela.

       Com 6,95 a comparação crua reprovava para a final embaixo de um número
       escrito "7,0" — a tela dizia uma coisa e o selo dizia outra. Quem lê vê a
       média exibida, e é essa que tem de valer; a pontuação da final já usava a
       arredondada, então a conta inteira agora concorda consigo mesma. */
    var tabela = tabelaDe(notas) +
      '<div class="result-formula">AG = (25×AV1 + 25×AV2 + 30×AV3 + 20×EDAG) ÷ 100</div>';
    resultado.className = 'tool-result';

    if (agArredondado >= META) {
      resultado.innerHTML =
        '<div class="result-value aprovado">' + virgula(agArredondado) + '</div>' +
        '<div class="result-title">Média do semestre</div>' +
        '<div class="result-status aprovado-bg">Aprovado direto</div>' +
        tabela +
        '<div class="result-bar"><div class="result-bar-fill green" style="width:' + (ag * 10) + '%"></div></div>';
    } else if (agArredondado >= MIN_FINAL) {
      var notaFinal = Math.round(((50 - 6 * agArredondado) / 4) * 10) / 10;
      resultado.innerHTML =
        '<div class="result-value final">' + virgula(agArredondado) + '</div>' +
        '<div class="result-title">Média do semestre</div>' +
        '<div class="result-status final-bg">Vai para a final</div>' +
        tabela +
        '<div class="result-divider"></div>' +
        '<div class="result-value final-nota">' + virgula(notaFinal) + '</div>' +
        '<div class="result-title">Pontuação na final</div>' +
        '<div class="result-detail">Quem não fecha AG de 7,0 tem direito à Avaliação Final, em caráter de recuperação.</div>' +
        '<div class="result-formula">pontuação = (50 − 6 × AG) ÷ 4</div>' +
        '<div class="result-bar"><div class="result-bar-fill orange" style="width:' + (ag * 10) + '%"></div></div>';
    } else {
      resultado.innerHTML =
        '<div class="result-value reprovado">' + virgula(agArredondado) + '</div>' +
        '<div class="result-title">Média do semestre</div>' +
        '<div class="result-status reprovado-bg">Reprovado</div>' +
        '<div class="result-detail">Abaixo de 3,0 não há direito à Avaliação Final.</div>' +
        tabela +
        '<div class="result-bar"><div class="result-bar-fill red" style="width:' + (ag * 10) + '%"></div></div>';
    }
  }

  /* Adia o desenho em 220ms. Sem isso o `aria-live` do resultado anuncia uma
     média nova a cada dígito e o leitor de tela vira uma metralhadora. */
  var pendente;
  function agendarRender() {
    clearTimeout(pendente);
    pendente = setTimeout(render, 220);
  }

  campos.forEach(function(campo) {
    campo.addEventListener('input', agendarRender);
  });

  limpar.addEventListener('click', function() {
    campos.forEach(function(campo) { campo.value = ''; });
    render();
    campos[0].focus();
  });

  render();
})();

/* ---- CALCULADORA DE FALTAS ----

   Também sem botão: responde assim que a carga horária é escolhida e reage a
   cada mudança nas faltas.

   Regra do CIMATEC, inalterada: cada dia letivo vale 2 aulas de 50min (100min), o
   semestre tem carga × 60 ÷ 50 aulas, e o limite de faltas é 25% delas.

   Dois modos de contar, porque as pessoas chegam com um número ou com o outro:
   "faltei 2 dias" e "o portal marcou 5 faltas" são a mesma pergunta em unidades
   diferentes. A conta acontece sempre em aulas — a unidade indivisível — e só a
   exibição muda; assim os dois modos nunca discordam.

   A barra passou a ter rótulo e um risco fixo nos 75%: antes era uma barra
   colorida sem escala nenhuma, e não dava para saber se aquele comprimento era
   bom ou ruim. Agora ela mostra a presença contra o mínimo exigido.            */
(function() {
  var cargaInput = document.getElementById('cargaHoraria');
  var faltasInput = document.getElementById('faltasAtuais');
  var faltasLabel = document.getElementById('faltasLabel');
  var resultado = document.getElementById('resultadoFaltas');
  var modos = Array.prototype.slice.call(document.querySelectorAll('.js-modo-falta'));

  if (!cargaInput || !faltasInput || !resultado) return;

  var PRESENCA_MINIMA = 75;
  var AULAS_POR_DIA = 2;

  function plural(n, singular, plural_) {
    return n + ' ' + (n === 1 ? singular : plural_);
  }

  function modoAtual() {
    for (var i = 0; i < modos.length; i++) {
      if (modos[i].checked) return modos[i].value;
    }
    return 'dias';
  }

  // Um número de aulas dito na unidade que a pessoa escolheu.
  function naUnidade(aulas, modo) {
    return modo === 'aulas'
      ? plural(aulas, 'falta', 'faltas')
      : plural(Math.floor(aulas / AULAS_POR_DIA), 'dia', 'dias');
  }

  function render() {
    var modo = modoAtual();

    /* O rótulo e o exemplo do campo mudam com o modo: sem isso o "3" digitado
       fica ambíguo entre três dias e três faltas. */
    if (faltasLabel) {
      faltasLabel.textContent = modo === 'aulas'
        ? 'Faltas lançadas no portal'
        : 'Dias que você faltou';
    }
    faltasInput.placeholder = modo === 'aulas' ? 'ex: 6' : 'ex: 3';

    var cargaHoras = parseFloat(cargaInput.value);

    if (!cargaHoras || cargaHoras <= 0) {
      resultado.className = 'tool-result vazio';
      resultado.innerHTML = 'Escolha a carga horária para ver quanto você ainda pode faltar.';
      return;
    }

    var informado = parseInt(faltasInput.value, 10);
    if (isNaN(informado) || informado < 0) informado = 0;

    // O que aquela carga horária é na prática, na semana da pessoa (30h é uma
    // aula por semana, 105h são as práticas integradas). Vem do `<option>`
    // para a regra viver num lugar só.
    var opcao = cargaInput.options[cargaInput.selectedIndex];
    var encontros = opcao ? opcao.dataset.encontros : '';

    // Tudo em aulas; dias saem daí. Os números batem com a conta antiga
    // (30h → 36 aulas, 18 dias, limite de 9 aulas / 4 dias).
    var totalAulas = Math.floor(cargaHoras * 60 / 50);
    var maxAulas = Math.floor(totalAulas * (100 - PRESENCA_MINIMA) / 100);
    var totalDias = Math.floor(totalAulas / AULAS_POR_DIA);
    var faltasAulas = modo === 'aulas' ? informado : informado * AULAS_POR_DIA;

    var restantesAulas = Math.max(0, maxAulas - faltasAulas);
    var excedenteAulas = Math.max(0, faltasAulas - maxAulas);
    // Arredondado para baixo no que sobra e para cima no que passou: nos dois
    // casos o número exibido não pode soar melhor do que a situação é.
    var restantes = modo === 'aulas'
      ? restantesAulas
      : Math.floor(restantesAulas / AULAS_POR_DIA);
    var excedente = modo === 'aulas'
      ? excedenteAulas
      : Math.ceil(excedenteAulas / AULAS_POR_DIA);

    var presenca = totalAulas > 0
      ? Math.max(0, 100 - (faltasAulas / totalAulas) * 100)
      : 0;

    var estado, selo, cor;
    if (excedenteAulas > 0) {
      estado = 'reprovado';
      selo = 'Reprovado por falta';
      cor = 'red';
    } else if (restantes === 0) {
      estado = 'final';
      selo = 'No limite — não pode faltar mais';
      cor = 'orange';
    } else if (restantesAulas <= 2 * AULAS_POR_DIA) {
      estado = 'final';
      selo = 'Perto do limite';
      cor = 'orange';
    } else {
      estado = 'aprovado';
      selo = 'Dentro da presença mínima';
      cor = 'green';
    }

    /* "Ainda pode faltar / 0 dias" com o selo "não pode faltar mais" logo
       abaixo se contradizia; no limite exato o título muda. */
    var titulo;
    if (excedenteAulas > 0) {
      titulo = 'Faltas além do limite';
    } else if (restantes === 0) {
      titulo = 'Limite atingido';
    } else {
      titulo = 'Ainda pode faltar';
    }

    var valor = excedenteAulas > 0
      ? (modo === 'aulas'
          ? plural(excedente, 'falta a mais', 'faltas a mais')
          : plural(excedente, 'dia a mais', 'dias a mais'))
      : naUnidade(restantesAulas, modo);

    // A linha da unidade que não está em uso: quem conta por dia também quer
    // saber quantas faltas isso é no portal, e vice-versa.
    var equivalencia = modo === 'aulas'
      ? plural(Math.floor(maxAulas / AULAS_POR_DIA), 'dia', 'dias')
      : plural(maxAulas, 'falta', 'faltas');

    resultado.className = 'tool-result';
    resultado.innerHTML =
      '<div class="result-value ' + estado + '">' + valor + '</div>' +
      '<div class="result-title">' + titulo + '</div>' +
      '<div class="result-status ' + estado + '-bg">' + selo + '</div>' +
      '<table class="result-table">' +
        '<tbody>' +
          (encontros ? '<tr><td>Na semana</td><td>' + encontros + '</td></tr>' : '') +
          '<tr><td>' + (modo === 'aulas' ? 'Aulas no semestre' : 'Dias letivos') + '</td>' +
              '<td>' + (modo === 'aulas' ? totalAulas : totalDias) + '</td></tr>' +
          '<tr><td>Limite de faltas</td><td>' +
              naUnidade(maxAulas, modo) + ' <span class="result-td-fraco">(' +
              equivalencia + ')</span></td></tr>' +
          '<tr><td>Você já faltou</td><td>' +
              (modo === 'aulas'
                ? plural(faltasAulas, 'falta', 'faltas')
                : plural(informado, 'dia', 'dias') + ' <span class="result-td-fraco">(' +
                  plural(faltasAulas, 'falta', 'faltas') + ')</span>') +
              '</td></tr>' +
        '</tbody>' +
      '</table>' +
      '<div class="result-medida" style="--minimo:' + PRESENCA_MINIMA + '%">' +
        '<div class="result-bar-rotulo">' +
          '<span>Presença</span><strong>' + presenca.toFixed(1).replace('.', ',') + '%</strong>' +
        '</div>' +
        '<div class="result-bar com-minimo">' +
          '<div class="result-bar-fill ' + cor + '" style="width:' + Math.min(100, presenca) + '%"></div>' +
        '</div>' +
        '<div class="result-bar-escala">' +
          '<span>0%</span><span>mínimo ' + PRESENCA_MINIMA + '%</span><span>100%</span>' +
        '</div>' +
      '</div>';
  }

  cargaInput.addEventListener('change', render);
  faltasInput.addEventListener('input', render);

  /* Trocar de modo converte o que já está digitado, em vez de reinterpretar o
     número numa unidade nova: quem digitou 3 dias e troca para faltas quer ver
     6, não 3. De faltas para dias arredonda para cima — 5 faltas são 2 dias e
     meio, e a metade que sobra é um dia em que a pessoa esteve ausente. */
  var modoAnterior = modoAtual();
  modos.forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (!radio.checked || radio.value === modoAnterior) return;

      var atual = parseInt(faltasInput.value, 10);
      if (!isNaN(atual) && atual > 0) {
        faltasInput.value = radio.value === 'aulas'
          ? atual * AULAS_POR_DIA
          : Math.ceil(atual / AULAS_POR_DIA);
      }

      modoAnterior = radio.value;
      render();
    });
  });

  render();
})();
