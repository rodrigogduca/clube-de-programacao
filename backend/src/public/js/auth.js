function togglePassword(inputId, btn) {
  var input = document.getElementById(inputId);
  var isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  btn.innerHTML = isPassword
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function initCustomSelects() {
  document.querySelectorAll('select.form-input').forEach(function(select) {
    var wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    var trigger = document.createElement('div');
    trigger.className = 'custom-select__trigger';
    trigger.tabIndex = 0;

    var selectedOption = select.options[select.selectedIndex];
    var isPlaceholder = !selectedOption || !selectedOption.value;
    var labelSpan = document.createElement('span');
    if (isPlaceholder) {
      labelSpan.className = 'placeholder';
      labelSpan.textContent = selectedOption ? selectedOption.textContent : 'Selecione';
    } else {
      labelSpan.textContent = selectedOption.textContent;
    }
    trigger.appendChild(labelSpan);

    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'custom-select__arrow');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('stroke', 'currentColor');
    arrow.setAttribute('stroke-width', '2');
    arrow.setAttribute('stroke-linecap', 'round');
    arrow.setAttribute('stroke-linejoin', 'round');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'm6 9 6 6 6-6');
    arrow.appendChild(path);
    trigger.appendChild(arrow);

    var optionsPanel = document.createElement('div');
    optionsPanel.className = 'custom-select__options';

    Array.from(select.options).forEach(function(opt) {
      if (!opt.value) return;
      var div = document.createElement('div');
      div.className = 'custom-select__option';
      if (opt.value === select.value) div.classList.add('selected');
      div.dataset.value = opt.value;
      div.textContent = opt.textContent;

      div.addEventListener('click', function() {
        select.value = opt.value;
        select.dispatchEvent(new Event('change'));
        labelSpan.textContent = opt.textContent;
        labelSpan.className = '';
        optionsPanel.querySelectorAll('.custom-select__option').forEach(function(o) {
          o.classList.remove('selected');
        });
        div.classList.add('selected');
        wrapper.classList.remove('open');
      });

      optionsPanel.appendChild(div);
    });

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.custom-select.open').forEach(function(el) {
        if (el !== wrapper) el.classList.remove('open');
      });
      wrapper.classList.toggle('open');
    });

    select.parentNode.insertBefore(wrapper, select);
    select.style.display = 'none';
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(optionsPanel);
  });

  document.addEventListener('click', function() {
    document.querySelectorAll('.custom-select.open').forEach(function(el) {
      el.classList.remove('open');
    });
  });
}

document.addEventListener('DOMContentLoaded', initCustomSelects);
