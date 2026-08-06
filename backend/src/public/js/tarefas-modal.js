/* ==========================================================================
   POP-UP DE TAREFA — ver, editar e criar sem sair do quadro.

   Carregado por views/layouts/painel.njk depois do ui.js (de onde vem o
   `PainelUI.abrirModal`) e do kanban.js (de onde vêm `inserirCartao` e
   `substituirCartao`, expostos em window.PainelKanban).

   O PROBLEMA QUE ISTO RESOLVE: toda ação de tarefa era uma navegação de página
   inteira, e o redirect de volta caía em /painel na aba "Todos". Perdiam-se a
   aba de setor aberta, os filtros do kanban (que só existem no DOM), a posição
   da rolagem e o estado dos acordeões. Quem cadastrava cinco tarefas pagava
   esse custo cinco vezes.

   E ler uma tarefa simplesmente não existia: o cartão corta a descrição em 15
   palavras e o único caminho para o resto era o formulário de edição — para
   LER era preciso entrar em modo de ESCRITA.

   CAMADA, NÃO SUBSTITUIÇÃO. Todo gatilho daqui é um link de verdade para a
   rota de página correspondente. Sem JavaScript o clique navega e o fluxo
   antigo funciona inteiro.

   Blocos, na ordem:
     1. Utilidades      rede, erros, montagem do eyebrow
     2. Modo leitura    abre já preenchido com o que o cartão sabia
     3. Modo formulário criar e editar, com envio pela API
     4. Gatilhos        o que abre o quê
   ========================================================================== */

(function () {
  'use strict';

  if (!window.PainelUI || !document.getElementById('modal-form')) return;

  var ROTULO_STATUS = {
    pendente: 'Pendente',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
  };

  // ---- 1. Utilidades ----

  /**
   * O `Accept` não é detalhe: o WebExceptionFilter só devolve JSON quando o
   * cabeçalho tem `application/json` E NÃO TEM `text/html`. Sem isso um erro
   * de validação volta como redirect 303 e o fetch engole a mensagem.
   */
  function pedirJson(url, opcoes) {
    opcoes = opcoes || {};
    return fetch(url, {
      method: opcoes.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRFToken': window.PainelUI.csrfToken(),
      },
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    }).then(function (resposta) {
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
    });
  }

  /** Busca um trecho de HTML já renderizado pelo servidor (`?parcial=1`). */
  function pedirHtml(url) {
    return fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    }).then(function (resposta) {
      if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
      return resposta.text();
    });
  }

  function eyebrowDe(id, status) {
    var partes = [];
    if (id) partes.push('<span class="detalhe-id">#' + id + '</span>');
    if (status) {
      partes.push(
        '<span class="badge badge-' + status + '">' +
          (ROTULO_STATUS[status] || status) +
          '</span>',
      );
    }
    return partes.join(' ');
  }

  function botao(rotulo, classe, atributos) {
    return (
      '<button type="button" class="' + classe + '" ' + (atributos || '') + '>' +
      rotulo +
      '</button>'
    );
  }

  // ---- 2. Modo leitura ----

  /**
   * ABRE JÁ CHEIO, NÃO VAZIO.
   *
   * O cartão do kanban já tem no DOM o título, o status e a prioridade. A
   * caixa aparece com esse conteúdo em ~120ms e só a descrição completa e os
   * anexos chegam do servidor — sem spinner no caso comum.
   *
   * Se a busca falhar, a caixa continua útil (mostra o que o cartão sabia) e
   * oferece recarregar, em vez de virar uma caixa vazia com um erro.
   */
  function abrirLeitura(id, dicas) {
    dicas = dicas || {};

    var modal = window.PainelUI.abrirModal({
      eyebrow: eyebrowDe(id, dicas.status),
      titulo: dicas.titulo || 'Tarefa',
      trilho: dicas.status || '',
      corpo: '<div class="detalhe-carregando" aria-live="polite">Carregando os detalhes…</div>',
      acoes: '',
    });
    if (!modal) return;

    function carregar() {
      pedirHtml('/painel/tarefa/' + id + '?parcial=1')
        .then(function (html) {
          modal.trocarCorpo({ corpo: html, preservarFoco: true });
          window.PainelUI.ligarAbas(modal.corpo);
          ligarAnexos(modal, id);
          montarAcoesLeitura(modal, id, dicas);
          ligarTeclasLeitura(modal, id, dicas);
        })
        .catch(function () {
          modal.trocarCorpo({
            corpo:
              '<p class="detalhe-erro">Não foi possível carregar os detalhes. ' +
              '<button type="button" class="link-acao" data-recarregar>Tentar de novo</button></p>',
            preservarFoco: true,
          });
          var botaoRecarregar = modal.corpo.querySelector('[data-recarregar]');
          if (botaoRecarregar) botaoRecarregar.addEventListener('click', carregar);
        });
    }

    carregar();
    return modal;
  }

  /**
   * ANEXAR DENTRO DO POP-UP — a segunda aba aceita envio.
   *
   * É `multipart/form-data`, então NÃO passa pelo `pedirJson`: o corpo vai
   * como FormData, sem Content-Type (o navegador escreve o boundary), e o
   * token viaja no cabeçalho porque o middleware de CSRF não lê corpo
   * multipart — quem valida é o `assertCsrf(req)` do handler.
   *
   * A resposta de sucesso é a lista já renderizada pelo servidor (`?parcial=1`),
   * e não JSON: assim o trecho tem uma definição só, em
   * partials/lista_anexos.njk. O `Accept: application/json` continua indo
   * porque ele governa o formato do ERRO — sem ele, uma falha de validação
   * volta como redirect 303 e o fetch engole a mensagem.
   */
  function ligarAnexos(modal, id) {
    var form = modal.corpo.querySelector('[data-form-anexo]');
    if (!form) return;

    var lista = modal.corpo.querySelector('[data-anexos-lista]');
    var conta = modal.corpo.querySelector('[data-anexos-conta]');
    var acao = form.querySelector('[data-anexo-acao]');
    var arquivo = form.querySelector('[data-anexo-arquivo]');
    var url = form.querySelector('[name="url"]');

    /* O handler decide pelo campo `action`: com URL preenchida vira link, com
       arquivo escolhido vira upload. Decidir aqui evita pedir ao usuário que
       diga o que ele já disse ao preencher um dos dois. */
    function ajustarAcao() {
      var temArquivo = arquivo && arquivo.files && arquivo.files.length > 0;
      if (acao) acao.value = temArquivo ? 'add_file' : 'add_link';
      if (url) url.required = !temArquivo;
    }
    if (arquivo) arquivo.addEventListener('change', ajustarAcao);
    ajustarAcao();

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();

      var enviar = form.querySelector('button[type="submit"]');
      if (enviar) enviar.disabled = true;

      fetch('/painel/tarefa/' + id + '/anexos?parcial=1', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'X-CSRFToken': window.PainelUI.csrfToken(),
        },
        body: new FormData(form),
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
          return resposta.text();
        })
        .then(function (html) {
          if (lista) lista.innerHTML = html;
          if (conta) {
            conta.textContent = lista
              ? lista.querySelectorAll('.detalhe-anexo').length
              : conta.textContent;
          }
          form.reset();
          ajustarAcao();
          window.PainelUI.toast('Anexo adicionado.', 'ok');
        })
        .catch(function (erro) {
          window.PainelUI.toast(erro.message, 'erro');
        })
        .then(function () {
          if (enviar) enviar.disabled = false;
        });
    });
  }

  function montarAcoesLeitura(modal, id, dicas) {
    var podeGerir = document.body.dataset.podeGerirTarefas === 'sim';
    var podeMover = podeGerir || dicas.podeMover;

    var html = '';

    if (podeMover) {
      html +=
        '<label class="sr-only" for="modal-status">Mover tarefa</label>' +
        '<select id="modal-status" class="filter-select" data-mover>' +
        Object.keys(ROTULO_STATUS)
          .map(function (valor) {
            return (
              '<option value="' + valor + '"' +
              (valor === dicas.status ? ' selected' : '') +
              '>' + ROTULO_STATUS[valor] + '</option>'
            );
          })
          .join('') +
        '</select>';
    }

    if (podeGerir) {
      html += botao('Editar', 'btn-primary', 'data-editar');
      html += botao('Excluir', 'btn-danger', 'data-excluir data-acao-perigo');
    }

    modal.trocarCorpo({ acoes: html || '', preservarFoco: true });

    var seletor = modal.acoes.querySelector('[data-mover]');
    if (seletor) {
      seletor.addEventListener('change', function () {
        moverTarefa(id, seletor.value, modal, dicas);
      });
    }

    var editar = modal.acoes.querySelector('[data-editar]');
    if (editar) {
      editar.addEventListener('click', function () {
        abrirFormulario('editar', id, modal, dicas);
      });
    }

    var excluir = modal.acoes.querySelector('[data-excluir]');
    if (excluir) {
      excluir.addEventListener('click', function () {
        window.PainelUI.confirmar({
          titulo: 'Excluir tarefa?',
          detalhe: dicas.titulo || '',
          acao: 'Excluir',
        }).then(function (ok) {
          if (!ok) return;
          pedirJson('/tasks/' + id, { method: 'DELETE' })
            .then(function () {
              modal.fechar();
              if (window.PainelKanban) window.PainelKanban.removerCartao(id);
              window.PainelUI.toast('Tarefa excluída.', 'ok');
            })
            .catch(function (erro) {
              window.PainelUI.toast(erro.message, 'erro');
            });
        });
      });
    }
  }

  /* Alt+setas move o status, a MESMA combinação que o cartão já usa no quadro:
     o pop-up não inventa vocabulário, herda o que o quadro ensinou. */
  function ligarTeclasLeitura(modal, id, dicas) {
    var ORDEM = ['pendente', 'em_andamento', 'concluida'];

    modal.elemento.addEventListener('keydown', function (evento) {
      if (evento.key === 'e' || evento.key === 'E') {
        // Não sequestra a tecla enquanto se digita em algum campo.
        if (evento.target.closest('input, select, textarea')) return;
        var editar = modal.acoes.querySelector('[data-editar]');
        if (editar) {
          evento.preventDefault();
          editar.click();
        }
        return;
      }

      if (!evento.altKey) return;
      if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;

      var atual = ORDEM.indexOf(dicas.status);
      var proximo = atual + (evento.key === 'ArrowRight' ? 1 : -1);
      if (atual < 0 || proximo < 0 || proximo >= ORDEM.length) return;

      evento.preventDefault();
      moverTarefa(id, ORDEM[proximo], modal, dicas);
    });
  }

  function moverTarefa(id, destino, modal, dicas) {
    if (destino === dicas.status) return;

    pedirJson('/tasks/' + id + '/status', {
      method: 'PATCH',
      body: { status: destino },
    })
      .then(function (tarefa) {
        dicas.status = destino;
        modal.trocarCorpo({
          eyebrow: eyebrowDe(id, destino),
          trilho: destino,
          preservarFoco: true,
        });
        if (window.PainelKanban) window.PainelKanban.substituirCartao(tarefa);
        window.PainelUI.toast('Tarefa movida para ' + ROTULO_STATUS[destino] + '.', 'ok');
      })
      .catch(function (erro) {
        window.PainelUI.toast(erro.message, 'erro');
      });
  }

  // ---- 3. Modo formulário ----

  /**
   * Editar NÃO fecha o pop-up: o corpo troca e a caixa fica, mesma posição e
   * mesmo tamanho. O usuário não vê um pop-up fechar e outro abrir.
   */
  function abrirFormulario(modo, id, modalExistente, dicas) {
    dicas = dicas || {};

    var url =
      modo === 'editar'
        ? '/painel/tarefa/' + id + '/editar?parcial=1'
        : '/painel/criar-tarefa?parcial=1' +
          (dicas.status ? '&status=' + encodeURIComponent(dicas.status) : '');

    var modal =
      modalExistente ||
      window.PainelUI.abrirModal({
        eyebrow: eyebrowDe(null, dicas.status),
        titulo: 'Nova tarefa',
        trilho: dicas.status || 'pendente',
        corpo: '<div class="detalhe-carregando" aria-live="polite">Carregando o formulário…</div>',
        acoes: '',
      });
    if (!modal) return;

    if (modalExistente) {
      modal.trocarCorpo({
        corpo: '<div class="detalhe-carregando" aria-live="polite">Carregando o formulário…</div>',
        acoes: '',
        preservarFoco: true,
      });
    }

    pedirHtml(url)
      .then(function (html) {
        modal.trocarCorpo({
          titulo: modo === 'editar' ? dicas.titulo || 'Editar tarefa' : 'Nova tarefa',
          corpo: html,
          acoes:
            botao(
              modo === 'editar' ? 'Salvar alterações' : 'Criar tarefa',
              'btn-primary',
              'data-salvar',
            ) + botao('Cancelar', 'btn-secondary', 'data-cancelar'),
          foco: '#id_titulo',
        });

        var form = modal.corpo.querySelector('[data-form-tarefa]');
        if (!form) return;

        window.PainelUI.ligarValidacao(form);
        // O formulário acabou de entrar no DOM: o espelho do setor precisa
        // partir do responsável que já veio selecionado.
        if (window.PainelSetorEspelho) window.PainelSetorEspelho(form);
        vigiarAlteracoes(form, modal);

        form.addEventListener('submit', function (evento) {
          evento.preventDefault();
          enviar(form, modo, id, modal, dicas);
        });

        modal.acoes
          .querySelector('[data-salvar]')
          .addEventListener('click', function () {
            if (form.requestSubmit) form.requestSubmit();
            else form.dispatchEvent(new Event('submit', { cancelable: true }));
          });

        modal.acoes
          .querySelector('[data-cancelar]')
          .addEventListener('click', function () {
            sairDoFormulario(modal, modo, id, dicas);
          });

        /* Ctrl+Enter salva. Numa caixa com um campo de texto multilinha, o
           Enter sozinho pertence ao textarea. */
        form.addEventListener('keydown', function (evento) {
          if ((evento.ctrlKey || evento.metaKey) && evento.key === 'Enter') {
            evento.preventDefault();
            if (form.requestSubmit) form.requestSubmit();
          }
        });
      })
      .catch(function () {
        modal.trocarCorpo({
          corpo: '<p class="detalhe-erro">Não foi possível carregar o formulário.</p>',
          preservarFoco: true,
        });
      });
  }

  /*
   * Perder texto digitado por um toque de tecla é o pior desfecho possível de
   * um pop-up. Com campo alterado, Esc e clique fora perguntam antes.
   */
  function vigiarAlteracoes(form, modal) {
    var sujo = false;
    form.addEventListener('input', function () {
      sujo = true;
    });
    form.addEventListener('change', function () {
      sujo = true;
    });

    modal.trocarCorpo({
      preservarFoco: true,
      podeFechar: function () {
        if (!sujo) return true;
        return window.PainelUI.confirmar({
          titulo: 'Descartar as alterações?',
          detalhe: 'O que você digitou não será salvo.',
          acao: 'Descartar',
        });
      },
    });
  }

  function sairDoFormulario(modal, modo, id, dicas) {
    // Editar veio da leitura: cancelar volta para ela, não fecha a caixa.
    if (modo === 'editar') {
      modal.trocarCorpo({ podeFechar: null, preservarFoco: true });
      var recarregado = abrirLeituraNoMesmo(modal, id, dicas);
      if (recarregado) return;
    }
    modal.trocarCorpo({ podeFechar: null, preservarFoco: true });
    modal.fechar();
  }

  function abrirLeituraNoMesmo(modal, id, dicas) {
    modal.trocarCorpo({
      titulo: dicas.titulo || 'Tarefa',
      eyebrow: eyebrowDe(id, dicas.status),
      trilho: dicas.status || '',
      corpo: '<div class="detalhe-carregando" aria-live="polite">Carregando…</div>',
      acoes: '',
      preservarFoco: true,
    });

    pedirHtml('/painel/tarefa/' + id + '?parcial=1')
      .then(function (html) {
        modal.trocarCorpo({ corpo: html, preservarFoco: true });
        window.PainelUI.ligarAbas(modal.corpo);
        ligarAnexos(modal, id);
        montarAcoesLeitura(modal, id, dicas);
      })
      .catch(function () {
        modal.fechar();
      });

    return true;
  }

  /**
   * A camada de páginas normaliza strings do navegador; a API JSON usa
   * class-validator, onde @IsInt() REJEITA a string "3" e @IsDateString()
   * rejeita "". Por isso a conversão aqui, e por isso campo vazio vai como
   * `undefined` (omitido do JSON), nunca como "".
   */
  function corpoDoFormulario(form) {
    var dados = new FormData(form);

    function texto(nome) {
      var valor = (dados.get(nome) || '').toString().trim();
      return valor === '' ? undefined : valor;
    }
    function numero(nome) {
      var valor = texto(nome);
      return valor === undefined ? undefined : Number(valor);
    }

    return {
      titulo: texto('titulo'),
      descricao: texto('descricao'),
      responsavelId: numero('responsavelId'),
      // `setorId` não vai: o setor é o do responsável e quem o resolve é o
      // TasksService. Mandar daqui seria oferecer ao cliente a chance de
      // contradizer a regra — e o servidor ignoraria de qualquer jeito.
      prazo: texto('prazo'),
      prioridade: texto('prioridade'),
      funcao: texto('funcao'),
      projeto: texto('projeto'),
      status: texto('status'),
    };
  }

  function enviar(form, modo, id, modal, dicas) {
    if (!window.PainelUI.validarFormulario(form)) return;

    var salvar = modal.acoes.querySelector('[data-salvar]');
    if (salvar) {
      salvar.disabled = true;
      salvar.classList.add('is-enviando');
    }

    function liberar() {
      if (!salvar) return;
      salvar.disabled = false;
      salvar.classList.remove('is-enviando');
    }

    var corpo = corpoDoFormulario(form);
    var pedido =
      modo === 'editar'
        ? pedirJson('/tasks/' + id, { method: 'PATCH', body: corpo })
        : pedirJson('/tasks', { method: 'POST', body: corpo });

    pedido
      .then(function (tarefa) {
        // Solta a trava de "descartar alterações" antes de sair do formulário.
        modal.trocarCorpo({ podeFechar: null, preservarFoco: true });

        if (modo === 'editar') {
          if (window.PainelKanban) window.PainelKanban.substituirCartao(tarefa);
          window.PainelUI.toast('Tarefa atualizada.', 'ok');
          dicas.titulo = tarefa.titulo;
          dicas.status = tarefa.status;
          abrirLeituraNoMesmo(modal, id, dicas);
          return;
        }

        modal.fechar();
        window.PainelUI.toast('Tarefa criada.', 'ok');

        if (window.PainelKanban) {
          var entrou = window.PainelKanban.inserirCartao(tarefa);
          if (!entrou) {
            window.PainelUI.toast(
              'A tarefa está fora dos filtros atuais.',
              'info',
            );
          }
        }
      })
      .catch(function (erro) {
        liberar();
        var titulo = form.querySelector('#id_titulo');
        if (titulo) window.PainelUI.marcar(titulo, erro.message);
        else window.PainelUI.toast(erro.message, 'erro');
      });
  }

  // ---- 4. Gatilhos ----

  document.addEventListener('click', function (evento) {
    // Ver: o título do cartão e qualquer link marcado.
    var verLink = evento.target.closest('[data-modal="ver-tarefa"]');
    if (verLink) {
      evento.preventDefault();
      var cartao = verLink.closest('.kanban-card');
      abrirLeitura(verLink.dataset.tarefaId, {
        titulo: verLink.dataset.tarefaTitulo || verLink.textContent.trim(),
        status: cartao ? cartao.dataset.status : '',
        podeMover: cartao ? cartao.hasAttribute('data-arrastavel') : false,
      });
      return;
    }

    // Editar direto pelo cartão.
    var editarLink = evento.target.closest('[data-modal="editar-tarefa"]');
    if (editarLink) {
      evento.preventDefault();
      var cartaoEdicao = editarLink.closest('.kanban-card');
      abrirFormulario('editar', editarLink.dataset.tarefaId, null, {
        titulo: editarLink.dataset.tarefaTitulo || 'Editar tarefa',
        status: cartaoEdicao ? cartaoEdicao.dataset.status : '',
      });
      return;
    }

    // Criar: o botão do cabeçalho e o `+` de cada coluna.
    var criarLink = evento.target.closest('[data-modal="criar-tarefa"]');
    if (criarLink) {
      evento.preventDefault();
      abrirFormulario('criar', null, null, {
        status: criarLink.dataset.status || 'pendente',
      });
    }
  });
})();
