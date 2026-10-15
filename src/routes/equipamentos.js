const express = require('express');
const { run, get, all } = require('../db');
const { limpar } = require('../utils');

const router = express.Router();

const CAMPOS = ['tipo', 'marca_modelo', 'patrimonio', 'numero_serie', 'nota_fiscal', 'especificacoes', 'acessorios'];

function lerForm(body) {
  const dados = {};
  for (const c of CAMPOS) dados[c] = limpar(body[c]);
  return dados;
}

function validar(d) {
  if (!d.tipo) return 'Informe o tipo do equipamento.';
  if (!d.marca_modelo) return 'Informe a marca/modelo.';
  return null;
}

function mensagemErroDb(err) {
  if (/UNIQUE constraint failed: equipamentos.patrimonio/.test(err.message)) {
    return 'Já existe um equipamento com este número de patrimônio.';
  }
  throw err;
}

router.get('/', async (req, res) => {
  const busca = String(req.query.q || '').trim();
  const status = ['Disponível', 'Em Uso'].includes(req.query.status) ? req.query.status : '';
  const where = [];
  const params = [];
  if (busca) {
    where.push(`(tipo LIKE ? OR marca_modelo LIKE ? OR patrimonio LIKE ? OR numero_serie LIKE ? OR nota_fiscal LIKE ?)`);
    params.push(...Array(5).fill(`%${busca}%`));
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const equipamentos = await all(
    `SELECT e.*,
            (SELECT t.id FROM termo_itens i JOIN termos t ON t.id = i.termo_id
              WHERE i.equipamento_id = e.id AND t.data_devolucao IS NULL
              ORDER BY t.id DESC LIMIT 1) AS termo_ativo_id
       FROM equipamentos e
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.tipo, e.marca_modelo`,
    params
  );
  res.render('equipamentos/lista', { titulo: 'Equipamentos', equipamentos, busca, status });
});

router.get('/novo', (req, res) => {
  res.render('equipamentos/form', { titulo: 'Novo equipamento', equipamento: {}, erroForm: null });
});

router.post('/', async (req, res) => {
  const dados = lerForm(req.body);
  const erroForm = validar(dados);
  if (erroForm) {
    return res.status(400).render('equipamentos/form', { titulo: 'Novo equipamento', equipamento: dados, erroForm });
  }
  try {
    await run(
      `INSERT INTO equipamentos (${CAMPOS.join(', ')}, status) VALUES (${CAMPOS.map(() => '?').join(', ')}, 'Disponível')`,
      CAMPOS.map((c) => dados[c])
    );
  } catch (err) {
    return res.status(400).render('equipamentos/form', {
      titulo: 'Novo equipamento', equipamento: dados, erroForm: mensagemErroDb(err),
    });
  }
  res.redirect('/equipamentos?ok=' + encodeURIComponent('Equipamento cadastrado com sucesso.'));
});

router.get('/:id/editar', async (req, res) => {
  const equipamento = await get('SELECT * FROM equipamentos WHERE id = ?', [req.params.id]);
  if (!equipamento) return res.redirect('/equipamentos?erro=' + encodeURIComponent('Equipamento não encontrado.'));
  res.render('equipamentos/form', { titulo: 'Editar equipamento', equipamento, erroForm: null });
});

router.post('/:id', async (req, res) => {
  const atual = await get('SELECT * FROM equipamentos WHERE id = ?', [req.params.id]);
  if (!atual) return res.redirect('/equipamentos?erro=' + encodeURIComponent('Equipamento não encontrado.'));
  const dados = lerForm(req.body);
  const equipamento = { ...atual, ...dados };
  const erroForm = validar(dados);
  if (erroForm) {
    return res.status(400).render('equipamentos/form', { titulo: 'Editar equipamento', equipamento, erroForm });
  }
  try {
    await run(
      `UPDATE equipamentos SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...CAMPOS.map((c) => dados[c]), atual.id]
    );
  } catch (err) {
    return res.status(400).render('equipamentos/form', {
      titulo: 'Editar equipamento', equipamento, erroForm: mensagemErroDb(err),
    });
  }
  res.redirect('/equipamentos?ok=' + encodeURIComponent('Equipamento atualizado.'));
});

router.post('/:id/excluir', async (req, res) => {
  const equip = await get('SELECT * FROM equipamentos WHERE id = ?', [req.params.id]);
  if (!equip) return res.redirect('/equipamentos?erro=' + encodeURIComponent('Equipamento não encontrado.'));
  if (equip.status === 'Em Uso') {
    return res.redirect('/equipamentos?erro=' + encodeURIComponent('Não é possível excluir um equipamento em uso.'));
  }
  const historico = await get('SELECT COUNT(*) AS n FROM termo_itens WHERE equipamento_id = ?', [equip.id]);
  if (historico.n > 0) {
    return res.redirect('/equipamentos?erro=' + encodeURIComponent(
      'Este equipamento consta em termos já emitidos e não pode ser excluído (histórico preservado).'
    ));
  }
  await run('DELETE FROM equipamentos WHERE id = ?', [equip.id]);
  res.redirect('/equipamentos?ok=' + encodeURIComponent('Equipamento excluído.'));
});

module.exports = router;
