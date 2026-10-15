class UserError extends Error {}

function somenteDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

function cpfValido(valor) {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(cpf[t])) return false;
  }
  return true;
}

function formatarCpf(valor) {
  const d = somenteDigitos(valor);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : valor;
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const fmtDataExtenso = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

const formatarData = (iso) => (iso ? fmtData.format(new Date(iso)) : '');
const formatarDataHora = (iso) => (iso ? fmtDataHora.format(new Date(iso)) : '');
const formatarDataExtenso = (iso) => (iso ? fmtDataExtenso.format(new Date(iso)) : '');

// Converte strings vazias em null (para colunas opcionais / UNIQUE).
function limpar(v) {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

module.exports = {
  UserError,
  somenteDigitos,
  cpfValido,
  formatarCpf,
  formatarData,
  formatarDataHora,
  formatarDataExtenso,
  limpar,
};
