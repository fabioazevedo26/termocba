const express = require('express');
const { run, get, all, withTransaction } = require('../db');
const { gerarPdfTermo } = require('../pdf');
const { UserError, cpfValido, formatarCpf, limpar, somenteDigitos } = require('../utils');

const router = express.Router();

async function carregarTermo(id) {
  const termo = await get(
    'SELECT id, colaborador_id, data_emissao, data_devolucao, arquivo_pdf IS NOT NULL AS tem_pdf FROM termos WHERE id = ?',
    [id]
  );
  if (!termo) return null;
  const colaborador = await get('SELECT * FROM colaboradores WHERE id = ?', [termo.colaborador_id]);
  const itens = await all(
    `SELECT e.* FROM termo_itens i JOIN equipamentos e ON e.id = i.equipamento_id
      WHERE i.termo_id = ? ORDER BY e.tipo, e.marca_modelo`,
    [id]
  );
  return { termo, colaborador, itens };
}

async function renderNovo(res, { erroForm = null, old = {}, status = 200 } = {}) {
  const [colaboradores, equipamentos] = await Promise.all([
    all('SELECT * FROM colaboradores ORDER BY nome'),
    all(`SELECT * FROM equipamentos WHERE status = 'Disponível' ORDER BY tipo, marca_modelo`),
  ]);
  res.status(status).render('termos/novo', { titulo: 'Emitir termo', colaboradores, equipamentos, erroForm, old });
}

// ---------- Listagem ----------
router.get('/', async (req, res) => {
  const busca = String(req.query.q || '').trim();
  const situacao = ['ativos', 'devolvidos'].includes(req.query.situacao) ? req.query.situacao : '';
  const where = [];
  const params = [];
  if (busca) {
    const digitos = /^[\d.\-\s]+$/.test(busca) ? somenteDigitos(busca) : '';
    where.push(`(c.nome LIKE ? OR REPLACE(REPLACE(c.cpf, '.', ''), '-', '') LIKE ? OR CAST(t.id AS TEXT) = ? OR EXISTS (
      SELECT 1 FROM termo_itens i JOIN equipamentos e ON e.id = i.equipamento_id
       WHERE i.termo_id = t.id AND (e.patrimonio LIKE ? OR e.numero_serie LIKE ? OR e.projeto LIKE ?)))`);
    params.push(`%${busca}%`, digitos ? `%${digitos}%` : '-', digitos.replace(/^0+/, ''),
      `%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  if (situacao === 'ativos') where.push('t.data_devolucao IS NULL');
  if (situacao === 'devolvidos') where.push('t.data_devolucao IS NOT NULL');

  const termos = await all(
    `SELECT t.id, t.data_emissao, t.data_devolucao, c.nome, c.cpf,
            (SELECT GROUP_CONCAT(e.tipo || ' ' || COALESCE('(' || e.patrimonio || ')', ''), ', ')
               FROM termo_itens i JOIN equipamentos e ON e.id = i.equipamento_id
              WHERE i.termo_id = t.id) AS resumo_itens
       FROM termos t JOIN colaboradores c ON c.id = t.colaborador_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.id DESC`,
    params
  );
  res.render('termos/lista', { titulo: 'Termos', termos, busca, situacao });
});

// ---------- Emissão ----------
router.get('/novo', async (req, res) => {
  const old = {};
  if (req.query.colaborador_id) old.colaborador_id = String(req.query.colaborador_id);
  await renderNovo(res, { old });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  const modo = body.colaborador_modo === 'novo' ? 'novo' : 'existente';
  const ids = [...new Set([].concat(body.equipamentos || []).map(Number).filter(Number.isInteger))];
  const old = {
    colaborador_modo: modo,
    colaborador_id: String(body.colaborador_id || ''),
    novo_nome: body.novo_nome || '',
    novo_cpf: body.novo_cpf || '',
    equipamentos: ids,
  };

  let termoId;
  try {
    if (!ids.length) throw new UserError('Selecione ao menos um equipamento.');

    termoId = await withTransaction(async () => {
      // 1. Colaborador (existente ou novo)
      let colaboradorId;
      if (modo === 'novo') {
        const nome = limpar(body.novo_nome);
        if (!nome) throw new UserError('Informe o nome do novo colaborador.');
        if (!cpfValido(body.novo_cpf)) throw new UserError('CPF do novo colaborador é inválido.');
        const cpf = formatarCpf(body.novo_cpf);
        const existente = await get('SELECT id, nome FROM colaboradores WHERE cpf = ?', [cpf]);
        if (existente) {
          throw new UserError(`CPF já cadastrado para ${existente.nome}. Selecione-o na lista de colaboradores.`);
        }
        colaboradorId = (await run('INSERT INTO colaboradores (nome, cpf) VALUES (?, ?)', [nome, cpf])).lastID;
      } else {
        const colab = await get('SELECT id FROM colaboradores WHERE id = ?', [body.colaborador_id]);
        if (!colab) throw new UserError('Selecione um colaborador.');
        colaboradorId = colab.id;
      }

      // 2. Termo
      const { lastID } = await run(
        'INSERT INTO termos (colaborador_id, data_emissao) VALUES (?, ?)',
        [colaboradorId, new Date().toISOString()]
      );

      // 3. Itens: só equipamentos ainda 'Disponível' (verificação atômica)
      for (const eqId of ids) {
        const r = await run(
          `UPDATE equipamentos SET status = 'Em Uso' WHERE id = ? AND status = 'Disponível'`,
          [eqId]
        );
        if (r.changes !== 1) {
          const eq = await get('SELECT tipo, patrimonio FROM equipamentos WHERE id = ?', [eqId]);
          throw new UserError(eq
            ? `O equipamento ${eq.tipo}${eq.patrimonio ? ' (patrimônio ' + eq.patrimonio + ')' : ''} não está mais disponível.`
            : 'Um dos equipamentos selecionados não existe mais.');
        }
        await run('INSERT INTO termo_itens (termo_id, equipamento_id) VALUES (?, ?)', [lastID, eqId]);
      }
      return lastID;
    });
  } catch (err) {
    if (err instanceof UserError) {
      old.colaborador_id = modo === 'novo' ? '' : old.colaborador_id;
      return renderNovo(res, { erroForm: err.message, old, status: 400 });
    }
    throw err;
  }

  // 4. PDF via Puppeteer -> Base64 no banco. Se falhar, desfaz a emissão.
  try {
    const dados = await carregarTermo(termoId);
    const base64 = await gerarPdfTermo(dados);
    await run('UPDATE termos SET arquivo_pdf = ? WHERE id = ?', [base64, termoId]);
  } catch (err) {
    console.error('Falha ao gerar PDF do termo', termoId, err);
    await withTransaction(async () => {
      await run(
        `UPDATE equipamentos SET status = 'Disponível'
          WHERE id IN (SELECT equipamento_id FROM termo_itens WHERE termo_id = ?)`,
        [termoId]
      );
      await run('DELETE FROM termo_itens WHERE termo_id = ?', [termoId]);
      await run('DELETE FROM termos WHERE id = ?', [termoId]);
    });
    return renderNovo(res, {
      erroForm: 'Não foi possível gerar o PDF do termo. A emissão foi cancelada. Detalhe: ' + err.message,
      old,
      status: 500,
    });
  }

  res.redirect(`/termos/${termoId}?ok=` + encodeURIComponent('Termo emitido com sucesso.'));
});

// ---------- Detalhe ----------
router.get('/:id', async (req, res) => {
  const dados = await carregarTermo(req.params.id);
  if (!dados) return res.redirect('/termos?erro=' + encodeURIComponent('Termo não encontrado.'));
  res.render('termos/detalhe', { titulo: `Termo nº ${dados.termo.id}`, ...dados });
});

// ---------- PDF ----------
router.get('/:id/pdf', async (req, res) => {
  const row = await get('SELECT id, arquivo_pdf FROM termos WHERE id = ?', [req.params.id]);
  if (!row || !row.arquivo_pdf) return res.status(404).send('PDF não encontrado.');
  const nome = `termo-responsabilidade-${String(row.id).padStart(5, '0')}.pdf`;
  const disposicao = req.query.download ? 'attachment' : 'inline';
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `${disposicao}; filename="${nome}"`);
  res.send(Buffer.from(row.arquivo_pdf, 'base64'));
});

// Regenera o PDF com os dados atuais (ex.: após corrigir cadastro)
router.post('/:id/regerar-pdf', async (req, res) => {
  const dados = await carregarTermo(req.params.id);
  if (!dados) return res.redirect('/termos?erro=' + encodeURIComponent('Termo não encontrado.'));
  const base64 = await gerarPdfTermo(dados);
  await run('UPDATE termos SET arquivo_pdf = ? WHERE id = ?', [base64, dados.termo.id]);
  res.redirect(`/termos/${dados.termo.id}?ok=` + encodeURIComponent('PDF regerado com os dados atuais.'));
});

// ---------- Devolução ----------
router.post('/:id/devolucao', async (req, res) => {
  const id = req.params.id;
  try {
    await withTransaction(async () => {
      const termo = await get('SELECT id, data_devolucao FROM termos WHERE id = ?', [id]);
      if (!termo) throw new UserError('Termo não encontrado.');
      if (termo.data_devolucao) throw new UserError('A devolução deste termo já foi registrada.');
      await run(
        `UPDATE equipamentos SET status = 'Disponível'
          WHERE id IN (SELECT equipamento_id FROM termo_itens WHERE termo_id = ?)`,
        [id]
      );
      await run('UPDATE termos SET data_devolucao = ? WHERE id = ?', [new Date().toISOString(), id]);
    });
  } catch (err) {
    if (err instanceof UserError) return res.redirect(`/termos/${id}?erro=` + encodeURIComponent(err.message));
    throw err;
  }
  res.redirect(`/termos/${id}?ok=` + encodeURIComponent('Devolução registrada. Equipamentos disponíveis novamente.'));
});

module.exports = router;
