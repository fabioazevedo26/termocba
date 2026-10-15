const express = require('express');
const { get, all } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const [equip, colab, termos, recentes] = await Promise.all([
    get(`SELECT COUNT(*) AS total,
                SUM(status = 'Disponível') AS disponiveis,
                SUM(status = 'Em Uso') AS em_uso
           FROM equipamentos`),
    get('SELECT COUNT(*) AS total FROM colaboradores'),
    get('SELECT COUNT(*) AS total, SUM(data_devolucao IS NULL) AS ativos FROM termos'),
    all(`SELECT t.id, t.data_emissao, t.data_devolucao, c.nome, c.cpf,
                (SELECT COUNT(*) FROM termo_itens i WHERE i.termo_id = t.id) AS qtd_itens
           FROM termos t JOIN colaboradores c ON c.id = t.colaborador_id
          ORDER BY t.id DESC LIMIT 8`),
  ]);
  res.render('dashboard', { titulo: 'Painel', equip, colab, termos, recentes });
});

module.exports = router;
