/* ==========================================================================
   UI DO PAINEL — modais, avisos flutuantes e validação.

   Carregado por views/layouts/painel.njk antes do kanban.js, que usa o
   `PainelUI.toast` daqui para relatar falha ao mover cartão, e antes do
   tarefas-modal.js e do membros.js, que usam o `PainelUI.abrirModal`.

   Expõe em window.PainelUI:
     toast(texto, tipo)      tipo: 'ok' | 'erro' | 'info'
     confirmar(opcoes)       devolve Promise<boolean>
     abrirModal(opcoes)      devolve { fechar, trocarCorpo, elemento }
     marcar(campo, texto)    mensagem de erro ancorada no campo
     limparMarca(campo)
     validarFormulario(form) devolve boolean
     ligarAbas(raiz)         assume o controle de abas recém-inseridas

   Blocos, na ordem:
     1. Avisos flutuantes
     2. Base do modal      foco preso, Esc, clique fora — uma implementação só
     3. Confirmação        a casca estreita, para exclusões
     4. Modal de conteúdo  a casca larga, para tarefa e perfil
     5. Exclusões          links [data-confirm] postam sem sair da página
     6. Importar CSV       escolher o arquivo já envia
     7. Limpar tarefas     confirmação com palavra digitada
     8. Validação          mensagens inline em português
     9. Abas ARIA          setas navegam, roving tabindex
   ========================================================================== */

(function () {
  'use strict';

  var PainelUI = {};
  window.PainelUI = PainelUI;

  // ---- 1. Avisos flutuantes ----

  var pilha = null;

  PainelUI.toast = function (texto, tipo) {
    if (!pilha) {
      pilha = document.createElement('div');
      pilha.className = 'toast-pilha';
      pilha.setAttribute('role', 'status');
      pilha.setAttribute('aria-live', 'polite');
      document.body.appendChild(pilha);
    }

    var aviso = document.createElement('div');
    aviso.className = 'toast toast-' + (tipo || 'info');

    var span = document.createElement('span');
    span.textContent = texto;
    aviso.appendChild(span);

    var fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'toast-fechar';
    fechar.setAttribute('aria-label', 'Fechar aviso');
    fechar.textContent = '×';
    aviso.appendChild(fechar);

    function remover() {
      aviso.classList.add('is-saindo');
      setTimeout(function () {
        aviso.remove();
      }, 200);
    }

    fechar.addEventListener('click', remover);
    pilha.appendChild(aviso);

    // Erro fica mais tempo: costuma ter texto para ler.
    setTimeout(remover, tipo === 'erro' ? 8000 : 5000);
  };

  // ---- 2. Base do modal ----

  /*
   * Prisão de foco, Esc, clique fora e devolução do foco existiam só dentro do
   * `confirmar`. Agora são uma implementação só, que as duas cascas usam — o
   * pop-up de tarefa não reimplementa acessibilidade, herda a que já estava
   * resolvida aqui.
   */
  var FOCAVEIS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([type="hidden"]):not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function abrirCaixa(modal, config) {
    config = config || {};

    var focoAnterior = document.activeElement;
    var fechado = false;
    var resolver;
    var promessa = new Promise(function (r) {
      resolver = r;
    });

    modal.classList.add('is-aberto');
    modal.removeAttribute('hidden');
    document.body.classList.add('modal-aberto');

    function focaveis() {
      return Array.prototype.filter.call(
        modal.querySelectorAll(FOCAVEIS),
        function (el) {
          return el.offsetParent !== null && !el.hidden;
        },
      );
    }

    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        pedirFechar();
        return;
      }

      if (evento.key !== 'Tab') return;

      var lista = focaveis();
      if (!lista.length) return;

      var primeiro = lista[0];
      var ultimo = lista[lista.length - 1];

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    function aoClicarFora(evento) {
      if (evento.target === modal) pedirFechar();
    }

    /*
     * `podeFechar` deixa a casca segurar o fechamento — é como o pop-up de
     * edição pergunta antes de descartar o que foi digitado. Perder texto por
     * um toque de tecla é o pior desfecho possível de um pop-up.
     */
    function pedirFechar() {
      if (!config.podeFechar) {
        fechar(false);
        return;
      }
      Promise.resolve(config.podeFechar()).then(function (ok) {
        if (ok) fechar(false);
      });
    }

    function fechar(resultado) {
      if (fechado) return;
      fechado = true;

      modal.classList.remove('is-aberto');
      modal.setAttribute('hidden', '');
      document.body.classList.remove('modal-aberto');
      document.removeEventListener('keydown', aoTeclar, true);
      modal.removeEventListener('click', aoClicarFora);

      if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
      resolver(resultado);
    }

    // Na captura: o Esc deve funcionar mesmo com o foco dentro de um campo.
    document.addEventListener('keydown', aoTeclar, true);
    modal.addEventListener('click', aoClicarFora);

    return { fechar: fechar, pedirFechar: pedirFechar, promessa: promessa };
  }

  /** Põe o foco no primeiro campo útil, ou num alvo explícito. */
  function focarPrimeiro(raiz, seletor) {
    var alvo = seletor ? raiz.querySelector(seletor) : null;
    if (!alvo) {
      alvo = raiz.querySelector(
        'input:not([type="hidden"]):not([disabled]), select, textarea',
      );
    }
    if (!alvo) alvo = raiz.querySelector('button, a[href]');
    if (alvo && alvo.focus) alvo.focus();
  }

  // ---- 3. Confirmação ----

  var modalConfirmar = document.getElementById('modal-confirmar');

  /**
   * @param {object} opcoes
   *   titulo    pergunta principal
   *   detalhe   linha secundária, normalmente o nome do que será apagado
   *   acao      rótulo do botão que confirma
   *   palavra   se presente, exige que o usuário a digite para liberar o botão
   */
  PainelUI.confirmar = function (opcoes) {
    // Sem o modal no DOM cai no confirm() do navegador, que é feio mas funciona.
    if (!modalConfirmar) {
      return Promise.resolve(window.confirm(opcoes.titulo || 'Confirmar?'));
    }

    var modal = modalConfirmar;
    var titulo = modal.querySelector('[data-modal-titulo]');
    var detalhe = modal.querySelector('[data-modal-detalhe]');
    var botao = modal.querySelector('[data-modal-confirmar]');
    var cancelar = modal.querySelector('[data-modal-cancelar]');
    var grupoPalavra = modal.querySelector('[data-modal-palavra-grupo]');
    var campoPalavra = modal.querySelector('[data-modal-palavra]');
    var rotuloPalavra = modal.querySelector('[data-modal-palavra-rotulo]');

    titulo.textContent = opcoes.titulo || 'Confirmar ação';
    detalhe.textContent = opcoes.detalhe || '';
    detalhe.hidden = !opcoes.detalhe;
    botao.textContent = opcoes.acao || 'Confirmar';

    var exigePalavra = Boolean(opcoes.palavra);
    grupoPalavra.hidden = !exigePalavra;
    campoPalavra.value = '';
    botao.disabled = exigePalavra;
    if (exigePalavra) {
      rotuloPalavra.textContent = opcoes.palavra;
      campoPalavra.setAttribute('placeholder', opcoes.palavra);
    }

    var caixa = abrirCaixa(modal);

    // Foco no destrutivo é armadilha; começa no cancelar (ou no campo).
    (exigePalavra ? campoPalavra : cancelar).focus();

    function aoConfirmar() {
      if (exigePalavra && campoPalavra.value.trim() !== opcoes.palavra) return;
      caixa.fechar(true);
    }
    function aoCancelar() {
      caixa.fechar(false);
    }
    function aoDigitar() {
      botao.disabled = campoPalavra.value.trim() !== opcoes.palavra;
    }
    function aoTeclarCampo(evento) {
      if (evento.key === 'Enter' && exigePalavra) {
        evento.preventDefault();
        aoConfirmar();
      }
    }

    botao.addEventListener('click', aoConfirmar);
    cancelar.addEventListener('click', aoCancelar);
    campoPalavra.addEventListener('input', aoDigitar);
    campoPalavra.addEventListener('keydown', aoTeclarCampo);

    return caixa.promessa.then(function (resultado) {
      botao.removeEventListener('click', aoConfirmar);
      cancelar.removeEventListener('click', aoCancelar);
      campoPalavra.removeEventListener('input', aoDigitar);
      campoPalavra.removeEventListener('keydown', aoTeclarCampo);
      return Boolean(resultado);
    });
  };

  // ---- 4. Modal de conteúdo ----

  var modalForm = document.getElementById('modal-form');

  /**
   * A casca larga, usada pelo pop-up de tarefa e pelo perfil de membro.
   *
   * @param {object} opcoes
   *   eyebrow    linha fina acima do título (ex.: "#42 · Em andamento")
   *   titulo     o título da caixa
   *   corpo      HTML ou Node
   *   acoes      HTML ou Node do rodapé
   *   trilho     'pendente' | 'em_andamento' | 'concluida' — cor da borda
   *   foco       seletor do que deve receber o foco
   *   podeFechar função que devolve boolean ou Promise<boolean>
   *
   * @returns {{fechar, trocarCorpo, elemento}}
   *   `trocarCorpo` é o que permite ver → editar sem a caixa piscar: troca o
   *   miolo e mantém posição, tamanho e título.
   */
  PainelUI.abrirModal = function (opcoes) {
    if (!modalForm) return null;

    opcoes = opcoes || {};

    var elEyebrow = modalForm.querySelector('[data-modal-eyebrow]');
    var elTitulo = modalForm.querySelector('[data-modal-form-titulo]');
    var elCorpo = modalForm.querySelector('[data-modal-corpo]');
    var elAcoes = modalForm.querySelector('[data-modal-acoes]');
    var elFechar = modalForm.querySelector('[data-modal-fechar]');
    var elCaixa = modalForm.querySelector('.modal-caixa');

    var estado = { podeFechar: opcoes.podeFechar };

    function preencher(dados) {
      if (dados.eyebrow !== undefined) {
        elEyebrow.innerHTML = '';
        if (typeof dados.eyebrow === 'string') {
          elEyebrow.innerHTML = dados.eyebrow;
        } else if (dados.eyebrow) {
          elEyebrow.appendChild(dados.eyebrow);
        }
        elEyebrow.hidden = !dados.eyebrow;
      }

      if (dados.titulo !== undefined) {
        elTitulo.textContent = dados.titulo || '';
        elTitulo.hidden = !dados.titulo;
      }

      if (dados.corpo !== undefined) {
        elCorpo.innerHTML = '';
        if (typeof dados.corpo === 'string') {
          elCorpo.innerHTML = dados.corpo;
        } else if (dados.corpo) {
          elCorpo.appendChild(dados.corpo);
        }
      }

      if (dados.acoes !== undefined) {
        elAcoes.innerHTML = '';
        if (typeof dados.acoes === 'string') {
          elAcoes.innerHTML = dados.acoes;
        } else if (dados.acoes) {
          elAcoes.appendChild(dados.acoes);
        }
        elAcoes.hidden = !dados.acoes;
      }

      if (dados.trilho !== undefined) {
        elCaixa.setAttribute('data-trilho', dados.trilho || '');
      }

      if (dados.podeFechar !== undefined) {
        estado.podeFechar = dados.podeFechar;
      }
    }

    preencher(opcoes);

    var caixa = abrirCaixa(modalForm, {
      podeFechar: function () {
        return estado.podeFechar ? estado.podeFechar() : true;
      },
    });

    function aoFechar() {
      caixa.pedirFechar();
    }
    elFechar.addEventListener('click', aoFechar);
    caixa.promessa.then(function () {
      elFechar.removeEventListener('click', aoFechar);
    });

    focarPrimeiro(elCorpo, opcoes.foco);

    return {
      elemento: modalForm,
      corpo: elCorpo,
      acoes: elAcoes,
      fechar: caixa.fechar,
      /*
       * Troca o miolo sem fechar. `preservarFoco` evita roubar o foco quando a
       * troca é só um refresh de conteúdo, não uma mudança de modo.
       */
      trocarCorpo: function (dados) {
        elCorpo.classList.add('is-trocando');
        preencher(dados);
        // Deixa o navegador pintar antes de tirar a classe, senão a transição
        // não acontece.
        requestAnimationFrame(function () {
          elCorpo.classList.remove('is-trocando');
        });
        if (!dados.preservarFoco) focarPrimeiro(elCorpo, dados.foco);
      },
    };
  };

  /** Posta para uma URL como formulário, levando o CSRF da página. */
  function postar(url, extras) {
    var campo = document.querySelector('[name=csrfmiddlewaretoken]');
    var form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';

    if (campo) {
      var token = document.createElement('input');
      token.type = 'hidden';
      token.name = 'csrfmiddlewaretoken';
      token.value = campo.value;
      form.appendChild(token);
    }

    Object.keys(extras || {}).forEach(function (nome) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = nome;
      input.value = extras[nome];
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }

  PainelUI.postar = postar;

  PainelUI.csrfToken = function () {
    var campo = document.querySelector('[name=csrfmiddlewaretoken]');
    return campo ? campo.value : '';
  };

  // ---- 5. Exclusões ----

  function opcoesDe(elemento) {
    return {
      titulo: elemento.dataset.confirm,
      detalhe: elemento.dataset.confirmDetalhe,
      acao: elemento.dataset.confirmAcao || 'Confirmar',
    };
  }

  /*
   * Link com data-confirm: continua apontando para a tela de confirmação (rota
   * GET), então sem JS o fluxo antigo funciona igual. Com JS o clique abre o
   * modal e posta direto para a mesma URL — que é a rota POST da exclusão.
   */
  document.addEventListener('click', function (evento) {
    var alvo = evento.target.closest('a[data-confirm]');
    if (!alvo) return;

    evento.preventDefault();

    PainelUI.confirmar(opcoesDe(alvo)).then(function (ok) {
      if (ok) postar(alvo.getAttribute('href'), {});
    });
  });

  /*
   * Formulário com data-confirm: já posta para o lugar certo, só falta segurar
   * o envio até a confirmação. Substitui o `onsubmit="return confirm(...)"`
   * que estava embutido em solicitacoes.
   */
  document.addEventListener(
    'submit',
    function (evento) {
      var form = evento.target;
      if (!form.matches || !form.matches('form[data-confirm]')) return;
      if (form.dataset.confirmado === 'sim') return;

      evento.preventDefault();

      PainelUI.confirmar(opcoesDe(form)).then(function (ok) {
        if (!ok) return;
        // Marca antes de reenviar para não cair neste handler de novo.
        form.dataset.confirmado = 'sim';
        form.submit();
      });
    },
    true,
  );

  // ---- 6. Importar CSV ----

  document.querySelectorAll('[data-import-csv]').forEach(function (form) {
    var input = form.querySelector('input[type=file]');
    if (!input) return;

    input.addEventListener('change', function () {
      if (!input.files || !input.files.length) return;

      var arquivo = input.files[0];
      if (arquivo.size > 2 * 1024 * 1024) {
        PainelUI.toast('O arquivo passa de 2 MB.', 'erro');
        input.value = '';
        return;
      }

      PainelUI.toast('Importando ' + arquivo.name + '…', 'info');
      form.submit();
    });
  });

  // ---- 7. Limpar todas as tarefas ----

  var abrirLimpar = document.querySelector('[data-limpar-tarefas-abrir]');
  var formLimpar = document.querySelector('[data-limpar-tarefas]');

  if (abrirLimpar && formLimpar) {
    abrirLimpar.addEventListener('click', function () {
      PainelUI.confirmar({
        titulo: 'Apagar todas as tarefas?',
        detalhe:
          'Todas as tarefas e seus anexos são removidos. Não há como desfazer — exporte o CSV antes se quiser guardar.',
        acao: 'Apagar tudo',
        palavra: 'LIMPAR',
      }).then(function (ok) {
        if (!ok) return;
        formLimpar.querySelector('[name=confirmacao]').value = 'LIMPAR';
        formLimpar.submit();
      });
    });
  }

  // ---- 8. Validação ----

  /*
   * As mensagens nativas do navegador saem no idioma dele e fora do visual do
   * painel. Aqui a checagem é a mesma (Constraint Validation API), só a
   * apresentação muda.
   */
  var MENSAGENS = {
    valueMissing: 'Preencha este campo.',
    typeMismatch: 'O formato não está correto.',
    tooShort: 'Escreva um pouco mais.',
    tooLong: 'O texto está longo demais.',
    rangeUnderflow: 'O valor é baixo demais.',
    rangeOverflow: 'O valor é alto demais.',
    patternMismatch: 'O formato não está correto.',
    badInput: 'Confira o que foi digitado.',
    stepMismatch: 'Escolha um valor válido.',
  };

  function mensagemPara(campo) {
    var v = campo.validity;

    if (v.valueMissing) {
      if (campo.tagName === 'SELECT') return 'Escolha uma opção.';
      if (campo.type === 'checkbox') return 'Marque esta opção para seguir.';
      return MENSAGENS.valueMissing;
    }
    if (v.typeMismatch && campo.type === 'email') {
      return 'Digite um e-mail válido, como nome@dominio.com.';
    }
    if (v.tooShort) {
      return 'Use ao menos ' + campo.minLength + ' caracteres.';
    }

    for (var chave in MENSAGENS) {
      if (v[chave]) return campo.dataset.erro || MENSAGENS[chave];
    }
    return campo.dataset.erro || 'Confira este campo.';
  }

  function alvoDoErro(campo) {
    // O input de senha vive dentro de .password-wrapper; a mensagem precisa
    // ficar depois do wrapper, senão aparece por cima do botão do olho.
    var wrapper = campo.closest('.password-wrapper');
    return wrapper || campo;
  }

  function marcar(campo, texto) {
    var grupo = campo.closest('.form-group') || campo.parentElement;
    var erro = grupo.querySelector('.form-erro');

    if (!erro) {
      erro = document.createElement('p');
      erro.className = 'form-erro';
      erro.id = 'erro-' + (campo.id || campo.name || Math.random().toString(36).slice(2));
      alvoDoErro(campo).insertAdjacentElement('afterend', erro);
    }

    erro.textContent = texto;
    campo.classList.add('is-invalido');
    campo.setAttribute('aria-invalid', 'true');
    campo.setAttribute('aria-describedby', erro.id);
  }

  function limparMarca(campo) {
    var grupo = campo.closest('.form-group') || campo.parentElement;
    var erro = grupo.querySelector('.form-erro');
    if (erro) erro.remove();
    campo.classList.remove('is-invalido');
    campo.removeAttribute('aria-invalid');
    campo.removeAttribute('aria-describedby');
  }

  // Expostos para o pop-up ancorar no campo certo o erro que a API devolveu,
  // em vez de repetir estas funções.
  PainelUI.marcar = marcar;
  PainelUI.limparMarca = limparMarca;

  function validar(campo) {
    if (campo.disabled || campo.type === 'hidden') return true;
    // Campo escondido por regra de tela (cargo x setor) não deve barrar o envio.
    if (campo.offsetParent === null && campo.type !== 'file') return true;

    if (campo.checkValidity()) {
      limparMarca(campo);
      return true;
    }
    marcar(campo, mensagemPara(campo));
    return false;
  }

  /**
   * Valida o formulário inteiro e foca o primeiro campo com problema.
   * O pop-up usa esta mesma função antes de chamar a API.
   */
  function validarFormulario(form) {
    var primeiroInvalido = null;

    form.querySelectorAll('input, select, textarea').forEach(function (campo) {
      if (!validar(campo) && !primeiroInvalido) primeiroInvalido = campo;
    });

    if (primeiroInvalido) {
      primeiroInvalido.focus();
      primeiroInvalido.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    return true;
  }

  PainelUI.validarFormulario = validarFormulario;
  PainelUI.ligarValidacao = ligarValidacao;

  function ligarValidacao(form) {
    if (form.dataset.validacaoLigada === 'sim') return;
    form.dataset.validacaoLigada = 'sim';

    // `novalidate` desliga o balão nativo mas mantém a API de validação.
    form.setAttribute('novalidate', '');

    form.querySelectorAll('input, select, textarea').forEach(function (campo) {
      campo.addEventListener('blur', function () {
        // Não acusa erro em campo que o usuário ainda nem preencheu.
        if (campo.value !== '' || campo.classList.contains('is-invalido')) {
          validar(campo);
        }
      });

      campo.addEventListener('input', function () {
        if (campo.classList.contains('is-invalido')) validar(campo);
      });

      campo.addEventListener('change', function () {
        if (campo.classList.contains('is-invalido')) validar(campo);
      });
    });
  }

  // ---- 9. Abas ARIA ----

  /*
   * Abas de conteúdo — hoje as do detalhe da tarefa (detalhes / anexos).
   *
   * Delegado no documento de propósito: o mesmo trecho é servido na página
   * /painel/tarefa/:id e injetado dentro do pop-up depois, e um handler ligado
   * no carregamento perderia o segundo caso.
   *
   * SEM JAVASCRIPT OS DOIS PAINÉIS APARECEM. A barra de abas nasce `hidden` no
   * markup — uma aba que não obedece ao clique é pior que aba nenhuma — e é o
   * `ligarAbas` que a revela e esconde o painel secundário. Quem chega sem
   * script vê tudo empilhado, que é a leitura certa numa página inteira.
   */
  function abasDe(lista) {
    return Array.prototype.slice.call(lista.querySelectorAll('[role="tab"]'));
  }

  function painelDa(aba) {
    var id = aba.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  function selecionarAba(aba, mover) {
    var lista = aba.closest('[role="tablist"]');
    if (!lista) return;

    abasDe(lista).forEach(function (outra) {
      var ativa = outra === aba;
      outra.setAttribute('aria-selected', ativa ? 'true' : 'false');
      outra.classList.toggle('active', ativa);
      // Roving tabindex: uma parada de Tab para o grupo inteiro, e as setas
      // andam entre as abas — é o que o padrão ARIA pede.
      outra.tabIndex = ativa ? 0 : -1;

      var painel = painelDa(outra);
      if (painel) painel.hidden = !ativa;
    });

    if (mover) aba.focus();
  }

  document.addEventListener('click', function (evento) {
    var aba = evento.target.closest('[role="tab"]');
    if (!aba || !aba.closest('[data-abas]')) return;
    evento.preventDefault();
    selecionarAba(aba, false);
  });

  document.addEventListener('keydown', function (evento) {
    var aba = evento.target.closest('[role="tab"]');
    if (!aba || !aba.closest('[data-abas]')) return;

    var lista = aba.closest('[role="tablist"]');
    var abas = abasDe(lista);
    var atual = abas.indexOf(aba);
    var destino = -1;

    if (evento.key === 'ArrowRight') destino = (atual + 1) % abas.length;
    else if (evento.key === 'ArrowLeft') destino = (atual - 1 + abas.length) % abas.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = abas.length - 1;
    else return;

    evento.preventDefault();
    selecionarAba(abas[destino], true);
  });

  /* Chamado quando um trecho com abas entra no DOM: fecha os painéis que não
     são o da aba marcada como selecionada no HTML. */
  function ligarAbas(raiz) {
    (raiz || document).querySelectorAll('[data-abas]').forEach(function (lista) {
      var selecionada =
        lista.querySelector('[role="tab"][aria-selected="true"]') ||
        lista.querySelector('[role="tab"]');
      if (!selecionada) return;
      lista.hidden = false;
      selecionarAba(selecionada, false);
    });
  }

  PainelUI.ligarAbas = ligarAbas;
  ligarAbas(document);

  // `.login-card` cobre login e solicitação de cadastro, que usam o layout de
  // autenticação e não o do painel.
  document.querySelectorAll('.form-card form, .login-card form').forEach(function (form) {
    ligarValidacao(form);

    form.addEventListener('submit', function (evento) {
      if (!validarFormulario(form)) {
        evento.preventDefault();
        return;
      }

      // Evita duplo envio em conexão lenta.
      var enviar = form.querySelector('button[type=submit]');
      if (enviar) {
        enviar.disabled = true;
        enviar.classList.add('is-enviando');
        // Se o servidor recusar e voltar por redirect, a página é nova e o
        // botão volta sozinho; este timer cobre o caso de o submit ser
        // cancelado por outro handler.
        setTimeout(function () {
          enviar.disabled = false;
          enviar.classList.remove('is-enviando');
        }, 8000);
      }
    });
  });
})();
