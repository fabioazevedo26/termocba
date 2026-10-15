const express = require('express');
const { run, get, all } = require('../db');
const { cpfValido, formatarCpf, limpar, somenteDigitos } = require('../utils');

const router = express.Router();

function lerForm(body) {
  return { nome: limpar(body.nome), cpf: limpar(body.cpf) };
}

async function validar(d, idAtual = null) {
  if (!d.nome) return 'Informe o nome do colaborador.';
  if (!cpfValido(d.cpf)) return 'CPF inválido.';
  d.cpf = formatarCpf(d.cpf);
  const existente = await get('SELECT id, nome FROM colaboradores WHERE cpf = ?', [d.cpf]);
  if (existente && existente.id !== Number(idAtual)) return `CPF já cadastrado para ${existente.nome}.`;
  return null;
}

router.get('/', async (req, res) => {
  const busca = String(req.query.q || '').trim();
  const params = [];
  let where = '';
  if (busca) {
    where = `WHERE c.nome LIKE ? OR REPLACE(REPLACE(c.cpf, '.', ''), '-', '') LIKE ?`;
    const digitos = /^[\d.\-\s]+$/.test(busca) ? somenteDigitos(busca) : '';
    params.push(`%${busca}%`, digitos ? `%${digitos}%` : '-');
  }
  const colaboradores = await all(
    `SELECT c.*,
            (SELECT COUNT(*) FROM termos t WHERE t.colaborador_id = c.id) AS qtd_termos,
            (SELECT COUNT(*) FROM termos t WHERE t.colaborador_id = c.id AND t.data_devolucao IS NULL) AS termos_ativos
       FROM colaboradores c ${where}
      ORDER BY c.nome`,
    params
  );
  res.render('colaboradores/lista', { titulo: 'Colaboradores', colaboradores, busca });
});

router.get('/novo', (req, res) => {
  res.render('colaboradores/form', { titulo: 'Novo colaborador', colaborador: {}, erroForm: null });
});

router.post('/', async (req, res) => {
  const dados = lerForm(req.body);
  const erroForm = await validar(dados);
  if (erroForm) {
    return res.status(400).render('colaboradores/form', { titulo: 'Novo colaborador', colaborador: dados, erroForm });
  }
  await run('INSERT INTO colaboradores (nome, cpf) VALUES (?, ?)', [dados.nome, dados.cpf]);
  res.redirect('/colaboradores?ok=' + encodeURIComponent('Colaborador cadastrado com sucesso.'));
});

router.get('/:id/editar', async (req, res) => {
  const colaborador = await get('SELECT * FROM colaboradores WHERE id = ?', [req.params.id]);
  if (!colaborador) return res.redirect('/colaboradores?erro=' + encodeURIComponent('Colaborador não encontrado.'));
  res.render('colaboradores/form', { titulo: 'Editar colaborador', colaborador, erroForm: null });
});

router.post('/:id', async (req, res) => {
  const atual = await get('SELECT * FROM colaboradores WHERE id = ?', [req.params.id]);
  if (!atual) return res.redirect('/colaboradores?erro=' + encodeURIComponent('Colaborador não encontrado.'));
  const dados = lerForm(req.body);
  const erroForm = await validar(dados, atual.id);
  if (erroForm) {
    return res.status(400).render('colaboradores/form', {
      titulo: 'Editar colaborador', colaborador: { ...atual, ...dados }, erroForm,
    });
  }
  await run('UPDATE colaboradores SET nome = ?, cpf = ? WHERE id = ?', [dados.nome, dados.cpf, atual.id]);
  res.redirect('/colaboradores?ok=' + encodeURIComponent(
    'Colaborador atualizado. Termos já emitidos mantêm os dados do PDF original.'
  ));
});

router.post('/:id/excluir', async (req, res) => {
  const colab = await get('SELECT id FROM colaboradores WHERE id = ?', [req.params.id]);
  if (!colab) return res.redirect('/colaboradores?erro=' + encodeURIComponent('Colaborador não encontrado.'));
  const termos = await get('SELECT COUNT(*) AS n FROM termos WHERE colaborador_id = ?', [colab.id]);
  if (termos.n > 0) {
    return res.redirect('/colaboradores?erro=' + encodeURIComponent(
      'Colaborador possui termos emitidos e não pode ser excluído.'
    ));
  }
  await run('DELETE FROM colaboradores WHERE id = ?', [colab.id]);
  res.redirect('/colaboradores?ok=' + encodeURIComponent('Colaborador excluído.'));
});

module.exports = router;
