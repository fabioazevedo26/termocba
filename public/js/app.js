(function () {
  // Confirmação para formulários destrutivos
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (ev) => {
      if (!confirm(form.dataset.confirm)) ev.preventDefault();
    });
  });

  // Linhas clicáveis
  document.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.classList.add('row-link');
    tr.addEventListener('click', () => { window.location = tr.dataset.href; });
  });

  // Máscara de CPF
  document.querySelectorAll('input[data-mask="cpf"]').forEach((input) => {
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 11);
      input.value = d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    });
  });

  // ---------- Tela de emissão ----------
  const formTermo = document.getElementById('form-termo');
  if (!formTermo) return;

  const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Alternância colaborador existente / novo
  const blocoExistente = document.getElementById('bloco-existente');
  const blocoNovo = document.getElementById('bloco-novo');
  formTermo.querySelectorAll('input[name="colaborador_modo"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const novo = radio.value === 'novo' && radio.checked;
      blocoNovo.classList.toggle('d-none', !novo);
      blocoExistente.classList.toggle('d-none', novo);
    });
  });

  // Filtro de colaboradores
  const filtroColab = document.getElementById('filtro-colab');
  const selectColab = document.getElementById('colaborador_id');
  if (filtroColab && selectColab) {
    filtroColab.addEventListener('input', () => {
      const q = normalizar(filtroColab.value);
      const qDig = filtroColab.value.replace(/\D/g, '');
      Array.from(selectColab.options).forEach((opt) => {
        const txt = normalizar(opt.text);
        const ok = !q || txt.includes(q) || (qDig && opt.text.replace(/\D/g, '').includes(qDig));
        opt.hidden = !ok;
      });
    });
  }

  // Seleção de equipamentos
  const checks = Array.from(formTermo.querySelectorAll('.equip-check'));
  const contador = document.getElementById('contador-sel');
  const atualizar = () => {
    let n = 0;
    checks.forEach((c) => {
      c.closest('tr').classList.toggle('table-success', c.checked);
      if (c.checked) n++;
    });
    contador.textContent = `${n} selecionado(s)`;
  };
  checks.forEach((c) => c.addEventListener('change', atualizar));
  formTermo.querySelectorAll('.equip-row').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (ev.target.matches('input, label')) return;
      const c = tr.querySelector('.equip-check');
      c.checked = !c.checked;
      atualizar();
    });
  });
  atualizar();

  const filtroEquip = document.getElementById('filtro-equip');
  filtroEquip.addEventListener('input', () => {
    const q = normalizar(filtroEquip.value);
    formTermo.querySelectorAll('.equip-row').forEach((tr) => {
      tr.classList.toggle('d-none', q && !normalizar(tr.textContent).includes(q));
    });
  });

  // Validação e bloqueio de duplo envio
  formTermo.addEventListener('submit', (ev) => {
    const modoNovo = formTermo.querySelector('#modo-novo').checked;
    if (!modoNovo && (!selectColab || !selectColab.value)) {
      ev.preventDefault();
      alert('Selecione um colaborador ou cadastre um novo.');
      return;
    }
    if (!checks.some((c) => c.checked)) {
      ev.preventDefault();
      alert('Selecione ao menos um equipamento.');
      return;
    }
    const btn = document.getElementById('btn-emitir');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Gerando PDF...';
  });
})();
