/* ==========================================================================
   KANBAN — arraste, troca de status sem recarregar e filtros.

   Carregado por views/layouts/painel.njk junto do painel.js. Sai cedo se a
   página não tiver quadro, então serve todas as telas sem custo.

   Contrato com os templates (views/partials/kanban.njk):
     [data-kanban]                    o quadro
     .kanban-cards[data-status]       zona de soltura, com o status de destino
     .kanban-card[data-tarefa-id]     o cartão
     .kanban-card[data-arrastavel]    cartão que este usuário pode mover
     [data-contador]                  número no cabeçalho da coluna
     [data-filtros]                   barra de busca e filtros do quadro

   Por que Pointer Events e não a API de drag-and-drop do HTML5: a nativa não
   dispara em toque nenhum, o que deixaria o quadro sem arraste em celular.
   Pointer Events cobre mouse, toque e caneta com um caminho só.

   Dois detalhes que o arraste exige e que não são óbvios:

   - O cartão NÃO leva `draggable="true"`. Esse atributo liga o drag nativo, que
     assume o gesto e para de emitir pointermove no meio do caminho — o arraste
     morria logo depois de começar. O template marca com `data-arrastavel`.
   - pointermove/up/cancel ficam no `document`, não no quadro. Durante o arraste
     o ponteiro passa por cima do fantasma e sai da área do quadro; ouvindo no
     documento o gesto não se perde nesses trechos.

   Blocos, na ordem:
     1. Utilidades      CSRF, toast, contadores
     2. Troca de status chamada à API, otimista e reversível
     3. Arraste         mouse com limiar, toque com toque longo
     4. Teclado         Alt+setas move o cartão focado
     5. Filtros         busca e seletores por quadro
   ========================================================================== */

(function () {
  'use strict';

  var quadros = document.querySelectorAll('[data-kanban]');
  var barras = document.querySelectorAll('[data-filtros]');
  if (!quadros.length && !barras.length) return;

  var ORDEM = ['pendente', 'em_andamento', 'concluida'];
  var ROTULOS = {
    pendente: 'Pendente',
    em_andamento: 'Em Andamento',
    concluida: 'Concluída',
  };

  /* Cada barra de filtros registra aqui como reavaliar os seus cartões. O
     pop-up usa isso para não deixar um cartão novo aparecer contrariando um
     filtro em vigor. */
  var reavaliadores = [];

  // ---- 1. Utilidades ----

  function csrfToken() {
    var campo = document.querySelector('[name=csrfmiddlewaretoken]');
    return campo ? campo.value : '';
  }

  function avisar(texto, tipo) {
    if (window.PainelUI && window.PainelUI.toast) {
      window.PainelUI.toast(texto, tipo);
    }
  }

  /** Região que o leitor de tela anuncia a cada movimento. */
  var anunciador = null;
  function anunciar(texto) {
    if (!anunciador) {
      anunciador = document.createElement('div');
      anunciador.className = 'sr-only';
      anunciador.setAttribute('aria-live', 'polite');
      document.body.appendChild(anunciador);
    }
    anunciador.textContent = texto;
  }

  /**
   * Conta só o que está visível, porque os filtros escondem cartões com a
   * classe `is-oculta` em vez de removê-los do DOM.
   */
  function atualizarContadores(quadro) {
    var colunas = quadro.querySelectorAll('.kanban-column');
    colunas.forEach(function (coluna) {
      var visiveis = coluna.querySelectorAll('.kanban-card:not(.is-oculta)');
      var contador = coluna.querySelector('[data-contador]');
      if (contador) contador.textContent = visiveis.length;

      // O aviso de coluna vazia é o mesmo elemento, escondido ou não.
      var vazio = coluna.querySelector('.kanban-empty');
      if (vazio) vazio.hidden = visiveis.length > 0;
    });
  }

  // ---- 2. Troca de status ----

  /**
   * Move o cartão no DOM primeiro e só depois confirma no servidor: o quadro
   * responde na hora e, se a API recusar, o cartão volta para onde estava.
   */
  function moverCartao(cartao, destino, zonaDestino) {
    var origem = cartao.dataset.status;
    if (origem === destino) return;

    var vizinhoAnterior = cartao.nextElementSibling;
    var zonaOrigem = cartao.parentElement;
    var quadro = cartao.closest('[data-kanban]');

    // Aplica otimista
    var avisoVazio = zonaDestino.querySelector('.kanban-empty');
    if (avisoVazio) {
      zonaDestino.insertBefore(cartao, avisoVazio);
    } else {
      zonaDestino.appendChild(cartao);
    }
    cartao.dataset.status = destino;
    cartao.classList.add('is-salvando');

    var seletor = cartao.querySelector('.kanban-select');
    if (seletor) seletor.value = destino;

    if (quadro) atualizarContadores(quadro);
    anunciar(cartao.dataset.busca + ' movida para ' + ROTULOS[destino]);

    function reverter() {
      if (vizinhoAnterior) {
        zonaOrigem.insertBefore(cartao, vizinhoAnterior);
      } else {
        var vazioOrigem = zonaOrigem.querySelector('.kanban-empty');
        if (vazioOrigem) {
          zonaOrigem.insertBefore(cartao, vazioOrigem);
        } else {
          zonaOrigem.appendChild(cartao);
        }
      }
      cartao.dataset.status = origem;
      if (seletor) seletor.value = origem;
      if (quadro) atualizarContadores(quadro);
    }

    fetch('/tasks/' + cartao.dataset.tarefaId + '/status', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRFToken': csrfToken(),
      },
      body: JSON.stringify({ status: destino }),
    })
      .then(function (resposta) {
        if (!resposta.ok) {
          return resposta
            .json()
            .catch(function () {
              return {};
            })
            .then(function (corpo) {
              throw new Error(corpo.message || 'HTTP ' + resposta.status);
            });
        }
        return resposta.json();
      })
      .then(function () {
        cartao.classList.remove('is-salvando');
        // O estado de atraso depende do status: concluída não fica atrasada.
        if (destino === 'concluida') {
          cartao.classList.remove('is-atrasada', 'is-proxima');
          cartao.dataset.atrasada = 'nao';
        }
      })
      .catch(function (erro) {
        cartao.classList.remove('is-salvando');
        reverter();
        avisar(erro.message || 'Não foi possível mover a tarefa.', 'erro');
      });
  }

  /**
   * Sem JS o formulário posta e recarrega. Com JS ele vira a mesma chamada do
   * arraste, o que evita perder a aba aberta e a posição da rolagem.
   */
  quadros.forEach(function (quadro) {
    quadro.addEventListener('submit', function (evento) {
      var form = evento.target.closest('.kanban-status-form');
      if (!form) return;

      evento.preventDefault();
      var cartao = form.closest('.kanban-card');
      var seletor = form.querySelector('.kanban-select');
      if (!cartao || !seletor) return;

      var destino = seletor.value;
      var zona = quadro.querySelector('.kanban-cards[data-status="' + destino + '"]');
      if (zona) moverCartao(cartao, destino, zona);
    });

    // Trocar no seletor já move: o botão "Mover" fica só para quem não tem JS.
    quadro.addEventListener('change', function (evento) {
      var seletor = evento.target.closest('.kanban-select');
      if (!seletor) return;
      var form = seletor.closest('.kanban-status-form');
      if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
    });

    quadro.querySelectorAll('.kanban-mover').forEach(function (botao) {
      botao.hidden = true;
    });
  });

  // ---- 3. Arraste (mouse, toque e caneta) ----

  var LIMIAR_PX = 6; // mouse: distância antes de virar arraste, para não roubar cliques
  var TOQUE_MS = 250; // toque: pressão longa, para não brigar com a rolagem

  quadros.forEach(function (quadro) {
    var arraste = null;

    function limparZonas() {
      quadro.querySelectorAll('.kanban-cards').forEach(function (zona) {
        zona.classList.remove('is-alvo', 'is-recusa');
      });
    }

    function encerrar(cancelado) {
      if (!arraste) return;
      var atual = arraste;
      arraste = null;

      clearTimeout(atual.timer);
      document.body.classList.remove('kanban-arrastando');
      atual.cartao.classList.remove('is-arrastando');
      if (atual.fantasma) atual.fantasma.remove();
      limparZonas();

      if (cancelado || !atual.iniciado) return;

      var zona = atual.zonaAtual;
      if (zona && zona.dataset.status !== atual.cartao.dataset.status) {
        moverCartao(atual.cartao, zona.dataset.status, zona);
      }
    }

    function iniciar(estado) {
      estado.iniciado = true;
      document.body.classList.add('kanban-arrastando');
      estado.cartao.classList.add('is-arrastando');

      // O fantasma é o que segue o dedo/cursor; o original fica no lugar como
      // marcador do buraco.
      var caixa = estado.cartao.getBoundingClientRect();
      var fantasma = estado.cartao.cloneNode(true);
      fantasma.classList.add('kanban-fantasma');
      fantasma.classList.remove('is-arrastando');
      fantasma.style.width = caixa.width + 'px';
      fantasma.removeAttribute('data-tarefa-id');
      document.body.appendChild(fantasma);

      estado.fantasma = fantasma;
      estado.deslocX = estado.x - caixa.left;
      estado.deslocY = estado.y - caixa.top;
      posicionarFantasma(estado);
    }

    function posicionarFantasma(estado) {
      if (!estado.fantasma) return;
      estado.fantasma.style.transform =
        'translate(' +
        (estado.x - estado.deslocX) +
        'px,' +
        (estado.y - estado.deslocY) +
        'px)';
    }

    function detectarZona(estado) {
      if (estado.fantasma) estado.fantasma.style.visibility = 'hidden';
      var alvo = document.elementFromPoint(estado.x, estado.y);
      if (estado.fantasma) estado.fantasma.style.visibility = '';

      var zona = alvo ? alvo.closest('.kanban-cards') : null;
      // Só aceita zona do mesmo quadro: as abas têm um quadro cada.
      if (zona && !quadro.contains(zona)) zona = null;

      limparZonas();
      estado.zonaAtual = zona;

      if (zona) {
        var mesma = zona.dataset.status === estado.cartao.dataset.status;
        zona.classList.add(mesma ? 'is-recusa' : 'is-alvo');
      }
    }

    quadro.addEventListener('pointerdown', function (evento) {
      if (evento.button !== 0 && evento.pointerType === 'mouse') return;

      var cartao = evento.target.closest('.kanban-card[data-arrastavel]');
      if (!cartao) return;

      // Clicar em link, botão ou seletor dentro do cartão não deve arrastar.
      if (evento.target.closest('a, button, select, input, textarea, label')) {
        return;
      }

      arraste = {
        cartao: cartao,
        x: evento.clientX,
        y: evento.clientY,
        inicioX: evento.clientX,
        inicioY: evento.clientY,
        iniciado: false,
        toque: evento.pointerType !== 'mouse',
        zonaAtual: null,
        fantasma: null,
        timer: null,
        ponteiro: evento.pointerId,
      };

      if (arraste.toque) {
        arraste.timer = setTimeout(function () {
          if (arraste && !arraste.iniciado) {
            iniciar(arraste);
            detectarZona(arraste);
          }
        }, TOQUE_MS);
      }
    });

    // No documento, e não no quadro: durante o arraste o ponteiro passa sobre o
    // fantasma e sai da área do quadro, e ali os eventos não chegariam.
    document.addEventListener('pointermove', function (evento) {
      if (!arraste || evento.pointerId !== arraste.ponteiro) return;

      arraste.x = evento.clientX;
      arraste.y = evento.clientY;

      if (!arraste.iniciado) {
        var dx = Math.abs(arraste.x - arraste.inicioX);
        var dy = Math.abs(arraste.y - arraste.inicioY);

        if (arraste.toque) {
          // Mexeu antes do toque longo completar: era rolagem, não arraste.
          if (dx > LIMIAR_PX || dy > LIMIAR_PX) {
            clearTimeout(arraste.timer);
            arraste = null;
          }
          return;
        }

        if (dx < LIMIAR_PX && dy < LIMIAR_PX) return;
        iniciar(arraste);
      }

      evento.preventDefault();
      posicionarFantasma(arraste);
      detectarZona(arraste);
    });

    document.addEventListener('pointerup', function () {
      encerrar(false);
    });

    document.addEventListener('pointercancel', function () {
      encerrar(true);
    });

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && arraste) encerrar(true);
    });

    // Cinto e suspensório: se algum navegador ainda tentar o arraste nativo em
    // cima do cartão, ele não deve concorrer com o nosso.
    quadro.addEventListener('dragstart', function (evento) {
      if (evento.target.closest('.kanban-card')) evento.preventDefault();
    });

    // ---- 4. Teclado ----

    quadro.addEventListener('keydown', function (evento) {
      if (!evento.altKey) return;
      if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;

      var cartao = evento.target.closest('.kanban-card[data-arrastavel]');
      if (!cartao) return;

      var atual = ORDEM.indexOf(cartao.dataset.status);
      var proximo = atual + (evento.key === 'ArrowRight' ? 1 : -1);
      if (atual < 0 || proximo < 0 || proximo >= ORDEM.length) return;

      evento.preventDefault();
      var destino = ORDEM[proximo];
      var zona = quadro.querySelector(
        '.kanban-cards[data-status="' + destino + '"]',
      );
      if (zona) {
        moverCartao(cartao, destino, zona);
        cartao.focus();
      }
    });
  });

  // ---- 5. Filtros ----

  barras.forEach(function (barra) {
    // A barra e o quadro são irmãos dentro da mesma <section>.
    var secao = barra.closest('.painel-section') || document;
    var quadro = secao.querySelector('[data-kanban]');
    if (!quadro) return;

    var campos = {};
    barra.querySelectorAll('[data-filtro]').forEach(function (campo) {
      campos[campo.dataset.filtro] = campo;
    });

    // Dois botões de limpar: o da barra e o que vem dentro do aviso de "nenhuma
    // tarefa passa nestes filtros". Quem está lendo o aviso não deveria ter de
    // subir a tela para desfazer o que causou o aviso.
    var limpar = barra.querySelector('[data-limpar-filtros]');
    var avisoFiltro = secao.querySelector('[data-vazio-filtro]');
    var limparNoAviso = avisoFiltro
      ? avisoFiltro.querySelector('[data-limpar-filtros]')
      : null;

    var cartoes = Array.prototype.slice.call(
      quadro.querySelectorAll('.kanban-card'),
    );

    function valor(nome) {
      var campo = campos[nome];
      if (!campo) return '';
      return campo.type === 'checkbox' ? campo.checked : campo.value.trim();
    }

    function aplicar() {
      var busca = String(valor('busca')).toLowerCase();
      var setor = valor('setor');
      var responsavel = valor('responsavel');
      var prioridade = valor('prioridade');
      var status = valor('status');
      var soAtrasadas = valor('atrasada') === true;

      var algumFiltro = Boolean(
        busca || setor || responsavel || prioridade || status || soAtrasadas,
      );
      var visiveis = 0;

      cartoes.forEach(function (cartao) {
        var passa =
          (!busca || cartao.dataset.busca.indexOf(busca) !== -1) &&
          (!setor || cartao.dataset.setorId === setor) &&
          (!responsavel || cartao.dataset.responsavelId === responsavel) &&
          (!prioridade || cartao.dataset.prioridade === prioridade) &&
          (!status || cartao.dataset.status === status) &&
          (!soAtrasadas || cartao.dataset.atrasada === 'sim');

        cartao.classList.toggle('is-oculta', !passa);
        if (passa) visiveis += 1;
      });

      if (limpar) limpar.hidden = !algumFiltro;

      /* "Nada aqui" três vezes não diz que o problema é o filtro. Quando há
         filtro em vigor e nenhum cartão passa, o aviso do quadro assume e os
         vazios de coluna se calam. */
      var soFiltrou = algumFiltro && visiveis === 0 && cartoes.length > 0;
      if (avisoFiltro) avisoFiltro.hidden = !soFiltrou;
      quadro.classList.toggle('is-sem-resultado', soFiltrou);

      atualizarContadores(quadro);
    }

    /*
     * FILTRO VINDO DA URL. A régua de carga do diretório abre o quadro em
     * /painel?responsavel=7&status=pendente — ela é navegação, não enfeite, e
     * o destino precisa chegar já filtrado.
     *
     * Só a primeira barra (a da aba "Todos") recebe: é a aba que abre, e
     * espalhar o filtro por todas as abas de setor esconderia cartões em telas
     * que o usuário não pediu para filtrar.
     */
    if (barra === barras[0]) {
      var query = new URLSearchParams(window.location.search);
      ['responsavel', 'setor', 'prioridade', 'status'].forEach(function (nome) {
        var vindo = query.get(nome);
        if (!vindo || !campos[nome]) return;
        // Ignora valor que o <select> não conhece, em vez de esvaziar a tela.
        if (
          campos[nome].tagName === 'SELECT' &&
          !campos[nome].querySelector('option[value="' + CSS.escape(vindo) + '"]')
        ) {
          return;
        }
        campos[nome].value = vindo;
      });
      if (query.get('atrasada') === '1' && campos.atrasada) {
        campos.atrasada.checked = true;
      }
      // Os campos foram preenchidos por código: nenhum evento disparou.
      aplicar();
    }

    Object.keys(campos).forEach(function (nome) {
      var campo = campos[nome];
      campo.addEventListener(
        campo.tagName === 'INPUT' && campo.type !== 'checkbox'
          ? 'input'
          : 'change',
        aplicar,
      );
    });

    function limparTudo() {
      Object.keys(campos).forEach(function (nome) {
        var campo = campos[nome];
        if (campo.type === 'checkbox') campo.checked = false;
        else campo.value = '';
      });
      aplicar();
    }

    if (limpar) limpar.addEventListener('click', limparTudo);
    if (limparNoAviso) {
      limparNoAviso.addEventListener('click', function () {
        limparTudo();
        // O aviso acabou de sumir sob o foco: devolve-o à busca, que é onde a
        // pessoa vai digitar em seguida.
        if (campos.busca) campos.busca.focus();
      });
    }

    // Enter numa busca dentro de <form> nenhum não deve navegar.
    if (campos.busca) {
      campos.busca.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter') evento.preventDefault();
      });
    }

    /*
     * Registrado para o pop-up: quando um cartão entra ou muda, os filtros em
     * vigor precisam ser aplicados sobre ele também. `recarregar` refaz a
     * lista de cartões porque o conjunto muda depois da criação.
     */
    reavaliadores.push({
      quadro: quadro,
      aplicar: function () {
        cartoes = Array.prototype.slice.call(
          quadro.querySelectorAll('.kanban-card'),
        );
        aplicar();
      },
    });
  });

  // Contagem inicial: alinha o número do cabeçalho com o que está na tela.
  quadros.forEach(atualizarContadores);

  // ---- 6. Ponte com o pop-up ----

  /*
   * O pop-up cria e edita tarefas sem recarregar a página, então precisa
   * conseguir mexer no quadro. O cartão é montado aqui, e não lá, porque este
   * arquivo é quem conhece o contrato dos `data-*` — se ele mudar, muda num
   * lugar só.
   *
   * O HTML é construído com createElement e textContent, nunca com innerHTML
   * de dado vindo do servidor: título e projeto são texto do usuário.
   */
  function montarCartao(t) {
    var cartao = document.createElement('article');
    cartao.className = 'kanban-card';
    if (t.atrasada) cartao.classList.add('is-atrasada');
    if (t.prazo_proximo) cartao.classList.add('is-proxima');

    var responsavelNome =
      (t.responsavel && t.responsavel.usuario &&
        (t.responsavel.usuario.get_full_name || t.responsavel.usuario.username)) ||
      '';

    cartao.dataset.tarefaId = t.id;
    cartao.dataset.status = t.status;
    cartao.dataset.setorId = (t.setor && t.setor.id) || 0;
    cartao.dataset.responsavelId = (t.responsavel && t.responsavel.id) || 0;
    cartao.dataset.prioridade = t.prioridade || 'media';
    cartao.dataset.atrasada = t.atrasada ? 'sim' : 'nao';
    cartao.dataset.busca = [
      t.titulo,
      t.descricao || '',
      t.projeto || '',
      responsavelNome,
    ]
      .join(' ')
      .toLowerCase();
    cartao.setAttribute('data-arrastavel', 'sim');
    cartao.setAttribute('tabindex', '0');
    cartao.setAttribute('aria-roledescription', 'cartão arrastável');

    var titulo = document.createElement('h4');
    titulo.className = 'kanban-card-titulo';
    var link = document.createElement('a');
    link.href = '/painel/tarefa/' + t.id;
    link.className = 'kanban-card-link';
    link.setAttribute('data-modal', 'ver-tarefa');
    link.dataset.tarefaId = t.id;
    link.dataset.tarefaTitulo = t.titulo;
    link.textContent = t.titulo;
    titulo.appendChild(link);
    cartao.appendChild(titulo);

    if (t.descricao) {
      var desc = document.createElement('p');
      desc.className = 'kanban-card-desc';
      var palavras = String(t.descricao).split(/\s+/);
      desc.textContent =
        palavras.length > 15 ? palavras.slice(0, 15).join(' ') + '...' : t.descricao;
      cartao.appendChild(desc);
    }

    var tags = document.createElement('div');
    tags.className = 'kanban-card-tags';
    if (t.prioridade) {
      var prio = document.createElement('span');
      prio.className = 'kanban-card-prioridade prioridade-' + t.prioridade;
      prio.textContent = t.prioridade_label || t.prioridade;
      tags.appendChild(prio);
    }
    if (t.funcao) {
      var func = document.createElement('span');
      func.className = 'kanban-card-funcao';
      func.textContent = t.funcao_label || t.funcao;
      tags.appendChild(func);
    }
    if (t.projeto) {
      var proj = document.createElement('span');
      proj.className = 'kanban-card-projeto';
      proj.textContent = t.projeto;
      tags.appendChild(proj);
    }
    cartao.appendChild(tags);

    var meta = document.createElement('div');
    meta.className = 'kanban-card-meta';
    var pessoa = document.createElement('span');
    pessoa.className = 'kanban-card-pessoa';
    var avatar = document.createElement('span');
    avatar.className = 'kanban-card-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (responsavelNome || '?').charAt(0);
    pessoa.appendChild(avatar);
    pessoa.appendChild(document.createTextNode(' ' + responsavelNome));
    meta.appendChild(pessoa);

    if (t.prazo) {
      var prazo = document.createElement('span');
      prazo.className = 'kanban-prazo';
      // UTC e não local: `prazo` é data sem hora gravada como meia-noite UTC,
      // e no fuso do Brasil a leitura local mostra o dia anterior.
      var d = new Date(t.prazo);
      var pad = function (n) {
        return String(n).padStart(2, '0');
      };
      prazo.textContent =
        pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
      if (t.atrasada) {
        var aviso = document.createElement('em');
        aviso.className = 'kanban-prazo-aviso';
        aviso.textContent = 'atrasada';
        prazo.appendChild(aviso);
      }
      meta.appendChild(prazo);
    }

    cartao.appendChild(meta);

    // O rodapé só existe para quem pode agir: o cartão recém-criado precisa
    // nascer com as mesmas ações que os renderizados pelo servidor têm.
    var rodape = document.createElement('div');
    rodape.className = 'kanban-card-rodape';

    var anexos = document.createElement('a');
    anexos.className = 'kanban-card-anexos';
    anexos.href = '/painel/tarefa/' + t.id + '/anexos';
    anexos.textContent = String(t.anexos_count || 0);
    rodape.appendChild(anexos);

    if (document.body.dataset.podeGerirTarefas === 'sim') {
      var acoes = document.createElement('span');
      acoes.className = 'kanban-card-acoes';

      var editar = document.createElement('a');
      editar.className = 'kbn-edit';
      editar.href = '/painel/tarefa/' + t.id + '/editar';
      editar.setAttribute('data-modal', 'editar-tarefa');
      editar.dataset.tarefaId = t.id;
      editar.dataset.tarefaTitulo = t.titulo;
      editar.textContent = 'Editar';
      acoes.appendChild(editar);

      var excluir = document.createElement('a');
      excluir.className = 'kbn-delete';
      excluir.href = '/painel/tarefa/' + t.id + '/excluir';
      excluir.dataset.confirm = 'Excluir tarefa?';
      excluir.dataset.confirmDetalhe = t.titulo;
      excluir.dataset.confirmAcao = 'Excluir';
      excluir.textContent = 'Excluir';
      acoes.appendChild(excluir);

      rodape.appendChild(acoes);
    }

    cartao.appendChild(rodape);

    return cartao;
  }

  function acharCartao(id) {
    return document.querySelector('.kanban-card[data-tarefa-id="' + id + '"]');
  }

  function zonaDe(quadro, status) {
    return quadro.querySelector('.kanban-cards[data-status="' + status + '"]');
  }

  function reavaliar(quadro) {
    reavaliadores.forEach(function (r) {
      if (!quadro || r.quadro === quadro) r.aplicar();
    });
  }

  window.PainelKanban = {
    /**
     * Insere a tarefa nova na coluna certa. Devolve false quando ela nasce
     * escondida por um filtro em vigor — o pop-up avisa em vez de deixar o
     * usuário procurar um cartão que não vai encontrar.
     */
    inserirCartao: function (t) {
      // A aba "Todos" é o quadro que recebe qualquer tarefa; as abas de setor
      // só recebem o que pertence a elas.
      var alvo = null;
      for (var i = 0; i < quadros.length; i++) {
        var painel = quadros[i].closest('.tab-panel');
        if (!painel || painel.id === 'tab-todos') {
          alvo = quadros[i];
          break;
        }
      }
      if (!alvo) alvo = quadros[0];
      if (!alvo) return false;

      var zona = zonaDe(alvo, t.status);
      if (!zona) return false;

      var cartao = montarCartao(t);
      var avisoVazio = zona.querySelector('.kanban-empty');
      if (avisoVazio) zona.insertBefore(cartao, avisoVazio);
      else zona.appendChild(cartao);

      reavaliar(alvo);
      atualizarContadores(alvo);

      var visivel = !cartao.classList.contains('is-oculta');
      if (visivel) {
        // O único momento orquestrado do painel: responde "para onde foi a
        // tarefa que acabei de criar?".
        cartao.classList.add('is-nova');
        cartao.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(function () {
          cartao.classList.remove('is-nova');
        }, 700);
      }
      return visivel;
    },

    substituirCartao: function (t) {
      var antigo = acharCartao(t.id);
      if (!antigo) return false;

      var quadro = antigo.closest('[data-kanban]');
      var novo = montarCartao(t);
      var zona = quadro ? zonaDe(quadro, t.status) : antigo.parentElement;

      antigo.remove();
      if (zona) {
        var avisoVazio = zona.querySelector('.kanban-empty');
        if (avisoVazio) zona.insertBefore(novo, avisoVazio);
        else zona.appendChild(novo);
      }

      if (quadro) {
        reavaliar(quadro);
        atualizarContadores(quadro);
      }
      return true;
    },

    removerCartao: function (id) {
      var cartao = acharCartao(id);
      if (!cartao) return false;
      var quadro = cartao.closest('[data-kanban]');
      cartao.remove();
      if (quadro) {
        reavaliar(quadro);
        atualizarContadores(quadro);
      }
      return true;
    },
  };
})();
