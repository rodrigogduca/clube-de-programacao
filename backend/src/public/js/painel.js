/* ==========================================================================
   PAINEL — comportamentos das telas autenticadas.

   Carregado por views/layouts/painel.njk, ou seja, em todas elas. Cada bloco
   e um IIFE independente que sai cedo se os elementos de que precisa nao
   existirem na pagina atual — por isso um unico arquivo serve a todas as
   telas sem custo.

   Blocos, na ordem:
     1. Cargo x setor      esconde o setor para presidente/vice
     2. Campo de senha     botao de mostrar/ocultar
     3. Upload de arquivo  rotulo com o nome do arquivo escolhido
     4. Abas               painel_admin
     5. Acordeao de cargos painel_admin
     6. Menu do usuario    navbar

   Arraste, filtros e troca de status do kanban ficam em kanban.js; modal de
   confirmacao, avisos e validacao de formulario ficam em ui.js.
   ========================================================================== */

// ---- 1. Cargo/Setor toggle (adicionar_membro, editar_membro) ----
(function() {
  var cargoSelect = document.getElementById('id_cargo');
  var setorField = document.getElementById('id_setor');
  if (!cargoSelect || !setorField) return;
  var setorGroup = setorField.closest('.form-group');
  function toggleSetor() {
    var cargo = cargoSelect.value;
    if (cargo === 'presidente' || cargo === 'vice_presidente') {
      setorGroup.style.display = 'none';
      setorField.value = '';
    } else {
      setorGroup.style.display = '';
    }
  }
  cargoSelect.addEventListener('change', toggleSetor);
  toggleSetor();
})();

// ---- 1b. Espelho do setor (form de tarefa) ----
/*
 * O setor da tarefa e o setor do responsavel — a regra vive no TasksService.
 * Aqui o formulario so MOSTRA qual sera, sem prometer nada: o texto muda junto
 * com o <select> de responsavel para a pessoa nao descobrir o setor da tarefa
 * depois de salvar.
 *
 * Delegado no documento porque o mesmo formulario chega por dois caminhos: a
 * pagina de criar/editar e o pop-up, que o injeta depois do carregamento.
 */
(function () {
  function espelhar(select) {
    var form = select.closest('form');
    if (!form) return;
    var alvo = form.querySelector('[data-setor-espelho] strong');
    if (!alvo) return;

    var opcao = select.options[select.selectedIndex];
    var setor = opcao ? opcao.dataset.setor : '';
    alvo.textContent = setor || '—';
  }

  document.addEventListener('change', function (evento) {
    var select = evento.target.closest('[data-responsavel]');
    if (select) espelhar(select);
  });

  // Estado inicial, e de novo quando o pop-up injeta o formulario.
  function sincronizar(raiz) {
    (raiz || document)
      .querySelectorAll('[data-responsavel]')
      .forEach(espelhar);
  }

  window.PainelSetorEspelho = sincronizar;
  sincronizar(document);
})();

// ---- 2. Password wrapper (adicionar_membro, editar_membro) ----
(function() {
  var inputs = document.querySelectorAll('input[type="password"]');
  if (!inputs.length) return;
  inputs.forEach(function(input) {
    var wrapper = document.createElement('div');
    wrapper.className = 'password-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    btn.setAttribute('aria-label', 'Mostrar senha');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    btn.addEventListener('click', function() {
      var isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
    wrapper.appendChild(btn);
  });
})();

// ---- 3. Upload de arquivo: mostra o nome do arquivo escolhido ----
// Antes isto era um <script> inline copiado em gerenciar_anexos.njk e
// editar_anexo.njk, e criava um wrapper NOVO em volta de um input que ja
// estava dentro de um — resultando em wrapper aninhado e botao duplicado.
(function () {
  function nomeDoArquivo(input) {
    return input.files && input.files.length
      ? input.files[0].name
      : 'Nenhum arquivo selecionado';
  }

  function init() {
    // `:not([hidden])` deixa de fora o input do importar CSV, que fica escondido
    // dentro de um <label> que ja e o botao. Sem isso este bloco construia um
    // wrapper visivel em volta dele e aparecia um "Escolher arquivo / Nenhum
    // arquivo selecionado" solto na barra do kanban.
    var inputs = document.querySelectorAll('input[type="file"]:not([hidden])');
    if (!inputs.length) return;

    inputs.forEach(function (input) {
      var wrapper = input.closest('.file-upload-wrapper');

      // Sem wrapper no HTML: constroi um. Com wrapper: apenas usa o existente.
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'file-upload-wrapper';

        var btn = document.createElement('span');
        btn.className = 'file-upload-btn';
        btn.textContent = 'Escolher arquivo';

        var texto = document.createElement('span');
        texto.className = 'file-upload-text';
        texto.textContent = nomeDoArquivo(input);

        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(btn);
        wrapper.appendChild(texto);
        wrapper.appendChild(input);
      }

      var alvo = wrapper.querySelector('.file-upload-text');
      if (!alvo) return;

      input.addEventListener('change', function () {
        alvo.textContent = nomeDoArquivo(input);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ---- 4. Tab switching (painel_admin) ----
(function () {
  function initTabs() {
    var tabsBar = document.querySelector('.tabs-bar');
    if (!tabsBar) return;

    var panels = document.querySelectorAll('.tab-panel');

    function activateTab(targetId) {
      var buttons = tabsBar.querySelectorAll('.tab-btn');
      buttons.forEach(function (btn) {
        var isActive = btn.getAttribute('data-tab') === targetId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      panels.forEach(function (panel) {
        panel.classList.toggle('active', panel.id === targetId);
      });
    }

    // Event delegation on the tabs bar
    tabsBar.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab-btn');
      // Sem `data-tab` nao e aba: a barra tambem hospeda o link de criar
      // setor, e sem esta guarda um clique nele apagaria todos os paineis
      // antes de a navegacao acontecer.
      if (!btn || !btn.hasAttribute('data-tab')) return;
      activateTab(btn.getAttribute('data-tab'));
    });

    var activeSetor = tabsBar.dataset.activeSetor;
    if (activeSetor) {
      activateTab('tab-setor-' + activeSetor);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabs);
  } else {
    initTabs();
  }
})();

// ---- Cargo accordion (painel_admin - Todos os Membros) ----
(function() {
  function initAccordion() {
    var toggles = document.querySelectorAll('.cargo-toggle');
    if (!toggles.length) return;

    toggles.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var targetId = btn.getAttribute('data-target');
        var target = document.getElementById(targetId);
        if (!target) return;

        var vaiAbrir = target.classList.contains('collapsed');
        target.classList.toggle('collapsed', !vaiAbrir);
        btn.classList.toggle('collapsed', !vaiAbrir);
        // Sem isto o leitor de tela anuncia "recolhido" com o grupo aberto.
        btn.setAttribute('aria-expanded', vaiAbrir ? 'true' : 'false');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccordion);
  } else {
    initAccordion();
  }
})();

// ---- User avatar dropdown ----
(function() {
  var avatar = document.querySelector('.user-avatar');
  if (!avatar) return;
  var dropdown = avatar.parentElement.querySelector('.user-dropdown');
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
