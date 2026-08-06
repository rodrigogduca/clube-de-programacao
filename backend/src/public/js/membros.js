/* ==========================================================================
   DIRETÓRIO DE MEMBROS — busca, filtros, alternância de visão e perfil.

   Carregado por views/layouts/painel.njk. Sai cedo se a página não for o
   diretório, então serve todas as telas sem custo.

   Tudo filtra no cliente, sobre os `data-*` do cartão — mesmo padrão do
   kanban, que já provou funcionar na escala do clube. Se a lista passar de
   algumas centenas, a decisão volta à mesa.

   Blocos, na ordem:
     1. Filtros    busca, cargo e setor
     2. Agrupar    cargo (padrão), setor ou lista plana
     3. Visão      grade e tabela
     4. Perfil     o pop-up com bio e tarefas do membro
   ========================================================================== */

(function () {
  'use strict';

  var barra = document.querySelector('[data-membros-barra]');
  if (!barra) return;

  // ---- 1. Filtros ----

  var campos = {};
  barra.querySelectorAll('[data-filtro]').forEach(function (campo) {
    campos[campo.dataset.filtro] = campo;
  });

  var limpar = barra.querySelector('[data-limpar-filtros]');
  var vazio = document.querySelector('[data-vazio-filtro]');
  var alvos = [];
  var grupos = [];

  /* Refeito depois de reagrupar: o "agrupar por" move os cartões entre
     seções, então as duas listas envelhecem. */
  function recolher() {
    alvos = Array.prototype.slice.call(
      document.querySelectorAll('[data-membro-id]'),
    );
    grupos = Array.prototype.slice.call(document.querySelectorAll('[data-grupo]'));
  }
  recolher();

  function valor(nome) {
    var campo = campos[nome];
    return campo ? campo.value.trim() : '';
  }

  function aplicar() {
    var busca = valor('busca').toLowerCase();
    var cargo = valor('cargo');
    var setor = valor('setor');
    var algumFiltro = Boolean(busca || cargo || setor);
    var visiveis = 0;

    alvos.forEach(function (alvo) {
      var passa =
        (!busca || alvo.dataset.busca.indexOf(busca) !== -1) &&
        (!cargo || alvo.dataset.cargo === cargo) &&
        (!setor || alvo.dataset.setorId === setor);

      alvo.classList.toggle('is-oculta', !passa);
      // A linha da tabela precisa de `hidden`: `display` vem do <tr>.
      if (alvo.tagName === 'TR') alvo.hidden = !passa;
      if (passa) visiveis += 1;
    });

    // Um grupo de cargo sem ninguém visível não deve deixar o cabeçalho órfão.
    grupos.forEach(function (grupo) {
      var restantes = grupo.querySelectorAll('[data-membro-id]:not(.is-oculta)');
      grupo.hidden = restantes.length === 0;
    });

    // O âmbar no seletor marca "há filtro em vigor" — é informação, não hover.
    ['cargo', 'setor'].forEach(function (nome) {
      if (campos[nome]) campos[nome].classList.toggle('is-ativo', Boolean(valor(nome)));
    });

    if (limpar) limpar.hidden = !algumFiltro;
    // A grade dividida em grupos some inteira; o aviso ocupa o lugar dela.
    if (vazio) vazio.hidden = visiveis > 0;
  }

  Object.keys(campos).forEach(function (nome) {
    var campo = campos[nome];
    campo.addEventListener(campo.tagName === 'INPUT' ? 'input' : 'change', aplicar);
  });

  if (limpar) {
    limpar.addEventListener('click', function () {
      Object.keys(campos).forEach(function (nome) {
        campos[nome].value = '';
      });
      aplicar();
      if (campos.busca) campos.busca.focus();
    });
  }

  if (campos.busca) {
    campos.busca.addEventListener('keydown', function (evento) {
      if (evento.key === 'Enter') evento.preventDefault();
    });
  }

  // O filtro de setor pode vir preenchido pela URL (?setor=3).
  aplicar();

  // ---- 2. Agrupar por ----

  /*
   * O servidor entrega a grade agrupada por cargo, que é o padrão e o que
   * fica de pé sem JavaScript. Trocar para setor ou para lista plana não
   * recarrega e não pede HTML novo: move os MESMOS cartões entre seções.
   *
   * Reaproveitar os elementos, em vez de remontá-los, é o que mantém uma
   * definição só do cartão (a macro em partials/membros.njk) e preserva o que
   * já está neles — a régua, os data-* e o estado de filtro.
   */
  var grade = document.querySelector('[data-visao-painel="grade"]');
  var controle = barra.querySelector('[data-agrupar-grupo]');

  if (grade && controle) {
    controle.hidden = false;

    // A ordem de cargo do servidor é a hierarquia; lida do DOM na primeira vez
    // para não repetir a lista aqui e vê-la sair de sincronia depois.
    var ordemCargo = [];
    grade.querySelectorAll('[data-membro-id]').forEach(function (cartao) {
      if (ordemCargo.indexOf(cartao.dataset.cargo) === -1) {
        ordemCargo.push(cartao.dataset.cargo);
      }
    });

    var todosCartoes = Array.prototype.slice.call(
      grade.querySelectorAll('[data-membro-id]'),
    );

    function chaveDe(cartao, modo) {
      if (modo === 'setor') {
        return {
          id: cartao.dataset.setorId || '0',
          rotulo: cartao.dataset.setorNome || 'Sem setor',
        };
      }
      return {
        id: cartao.dataset.cargo,
        rotulo: cartao.dataset.cargoLabel || cartao.dataset.cargo,
      };
    }

    function secao(rotulo, quantos) {
      var bloco = document.createElement('section');
      bloco.className = 'painel-section';
      bloco.setAttribute('data-grupo', '');

      if (rotulo !== null) {
        var titulo = document.createElement('p');
        titulo.className = 'eyebrow';
        titulo.textContent = rotulo.toLowerCase() + ' ';

        var conta = document.createElement('span');
        conta.className = 'eyebrow-conta';
        conta.textContent = quantos;
        titulo.appendChild(conta);

        bloco.appendChild(titulo);
      }

      var linha = document.createElement('div');
      linha.className = 'cards-grid';
      bloco.appendChild(linha);
      return { bloco: bloco, linha: linha };
    }

    function reagrupar(modo) {
      grade.textContent = '';

      // Lista plana: uma grade só, sem cabeçalho de grupo.
      if (modo === 'nenhum') {
        var solta = secao(null, 0);
        todosCartoes.forEach(function (cartao) {
          solta.linha.appendChild(cartao);
        });
        grade.appendChild(solta.bloco);
        recolher();
        aplicar();
        return;
      }

      var baldes = new Map();
      todosCartoes.forEach(function (cartao) {
        var chave = chaveDe(cartao, modo);
        if (!baldes.has(chave.id)) {
          baldes.set(chave.id, { rotulo: chave.rotulo, cartoes: [] });
        }
        baldes.get(chave.id).cartoes.push(cartao);
      });

      var chaves = Array.from(baldes.keys());
      if (modo === 'cargo') {
        // Hierarquia, não alfabeto: presidente antes de membro.
        chaves.sort(function (a, b) {
          return ordemCargo.indexOf(a) - ordemCargo.indexOf(b);
        });
      } else {
        // "Sem setor" por último: é a sobra, não um setor.
        chaves.sort(function (a, b) {
          if (a === '0') return 1;
          if (b === '0') return -1;
          return baldes.get(a).rotulo.localeCompare(baldes.get(b).rotulo, 'pt-BR');
        });
      }

      chaves.forEach(function (chave) {
        var balde = baldes.get(chave);
        var nova = secao(balde.rotulo, balde.cartoes.length);
        balde.cartoes.forEach(function (cartao) {
          nova.linha.appendChild(cartao);
        });
        grade.appendChild(nova.bloco);
      });

      recolher();
      aplicar();
    }

    controle.querySelectorAll('[data-agrupar]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        controle.querySelectorAll('[data-agrupar]').forEach(function (b) {
          var ativo = b === botao;
          b.classList.toggle('active', ativo);
          b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        });
        reagrupar(botao.dataset.agrupar);
      });
    });
  }

  // ---- 3. Visão ----

  var botoesVisao = barra.querySelectorAll('[data-visao]');
  var paineisVisao = document.querySelectorAll('[data-visao-painel]');

  botoesVisao.forEach(function (botao) {
    botao.addEventListener('click', function () {
      var alvo = botao.dataset.visao;

      botoesVisao.forEach(function (b) {
        var ativo = b === botao;
        b.classList.toggle('active', ativo);
        b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      });

      paineisVisao.forEach(function (painel) {
        painel.hidden = painel.dataset.visaoPainel !== alvo;
      });
    });
  });

  // ---- 4. Perfil ----

  var ROTULO_STATUS = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
  };

  function escapar(texto) {
    var div = document.createElement('div');
    div.textContent = texto == null ? '' : String(texto);
    return div.innerHTML;
  }

  function dataUtc(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }

  /*
   * O perfil é onde a bio finalmente aparece: o campo era gravado em
   * `editar_membro` e não era lido em lugar nenhum do sistema.
   *
   * É também onde "Excluir" vive. Saiu do cartão de propósito — aqui existe
   * contexto sobre o que a exclusão leva junto (as tarefas atribuídas à
   * pessoa), e excluir alguém não é ação de passagem.
   */
  function abrirPerfil(id) {
    if (!window.PainelUI || !window.PainelUI.abrirModal) return false;

    var modal = window.PainelUI.abrirModal({
      titulo: 'Membro',
      corpo: '<div class="detalhe-carregando" aria-live="polite">Carregando o perfil…</div>',
      acoes: '',
    });
    if (!modal) return false;

    function json(url) {
      return fetch(url, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }

    Promise.all([json('/members/' + id), json('/members/' + id + '/tarefas?limite=5')])
      .then(function (resultado) {
        var m = resultado[0];
        var trabalho = resultado[1];
        var nome = m.usuario.get_full_name || m.usuario.username;
        var iniciais =
          (m.usuario.first_name || '?').charAt(0) + (m.usuario.last_name || '').charAt(0);

        var html =
          '<div class="perfil-topo">' +
          '<div class="perfil-avatar" aria-hidden="true">' + escapar(iniciais) + '</div>' +
          '<div><h3 class="perfil-nome">' + escapar(nome) + '</h3>' +
          '<p class="perfil-usuario">@' + escapar(m.usuario.username) + '</p></div>' +
          '<span class="badge badge-' + escapar(m.cargo) + '" style="margin-left:auto">' +
          escapar(m.cargo_label) + '</span>' +
          '</div>';

        html +=
          '<dl class="perfil-dados">' +
          '<dt>setor</dt><dd>' + escapar(m.setor ? m.setor.nome : '—') + '</dd>' +
          '<dt>no clube desde</dt><dd>' + dataUtc(m.data_entrada) + '</dd>' +
          '</dl>';

        if (m.bio) {
          html += '<p class="perfil-bio">' + escapar(m.bio) + '</p>';
        }

        html += '<p class="eyebrow">trabalho</p>';
        html += '<div class="perfil-contagem">';
        Object.keys(ROTULO_STATUS).forEach(function (chave) {
          html +=
            '<span class="badge badge-' + chave + '">' +
            (trabalho.total[chave] || 0) + ' ' + ROTULO_STATUS[chave].toLowerCase() +
            '</span>';
        });
        html += '</div>';

        if (trabalho.tarefas.length) {
          html += '<div class="perfil-lista">';
          trabalho.tarefas.forEach(function (t) {
            html +=
              '<a class="perfil-tarefa' + (t.atrasada ? ' is-atrasada' : '') + '" ' +
              'href="/painel/tarefa/' + t.id + '" ' +
              'data-modal="ver-tarefa" data-tarefa-id="' + t.id + '" ' +
              'data-tarefa-titulo="' + escapar(t.titulo) + '">' +
              '<span class="perfil-tarefa-titulo">' + escapar(t.titulo) + '</span>' +
              (t.prazo ? '<span class="perfil-tarefa-prazo">' + dataUtc(t.prazo) + '</span>' : '') +
              '</a>';
          });
          html += '</div>';
        } else {
          html += '<p class="detalhe-vazio">Nenhuma tarefa atribuída.</p>';
        }

        var acoes = '';
        if (document.body.dataset.podeEditarMembro === 'sim') {
          acoes +=
            '<a class="btn-primary" href="/painel/membro/' + id + '/editar">Editar</a>';
        }
        if (
          document.body.dataset.podeExcluirMembro === 'sim' &&
          String(id) !== document.body.dataset.membroAtual
        ) {
          acoes +=
            '<a class="btn-danger" data-acao-perigo href="/painel/membro/' + id + '/excluir" ' +
            'data-confirm="Excluir membro?" ' +
            'data-confirm-detalhe="' + escapar(nome) +
            ' — a conta e as tarefas atribuídas a ele são removidas." ' +
            'data-confirm-acao="Excluir">Excluir</a>';
        }

        modal.trocarCorpo({
          titulo: nome,
          corpo: html,
          acoes: acoes,
          preservarFoco: true,
        });
      })
      .catch(function () {
        modal.trocarCorpo({
          corpo: '<p class="detalhe-erro">Não foi possível carregar o perfil.</p>',
          preservarFoco: true,
        });
      });

    return true;
  }

  /* O nome continua apontando para a tela de edição: sem JavaScript o clique
     leva a algum lugar útil, e com JavaScript abre o perfil. */
  document.addEventListener('click', function (evento) {
    var alvo = evento.target.closest('[data-perfil]');
    if (!alvo) return;
    if (abrirPerfil(alvo.dataset.perfil)) evento.preventDefault();
  });
})();
