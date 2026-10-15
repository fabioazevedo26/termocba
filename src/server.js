const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const { fecharBrowser } = require('./pdf');
const utils = require('./utils');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const raiz = path.join(__dirname, '..');

app.set('view engine', 'ejs');
app.set('views', path.join(raiz, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(raiz, 'public')));
// Bootstrap servido localmente (sem dependência de CDN / internet)
app.use('/vendor/bootstrap', express.static(path.join(raiz, 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/bootstrap-icons', express.static(path.join(raiz, 'node_modules', 'bootstrap-icons', 'font')));

// Helpers e mensagens (?ok= / ?erro=) disponíveis em todas as views
app.use((req, res, next) => {
  res.locals.fmt = utils;
  res.locals.path = req.path;
  res.locals.ok = typeof req.query.ok === 'string' ? req.query.ok : null;
  res.locals.erro = typeof req.query.erro === 'string' ? req.query.erro : null;
  next();
});

// Login: tudo abaixo daqui exige sessão
app.use(auth.router);
app.use(auth.exigirLogin);

app.use('/', require('./routes/dashboard'));
app.use('/equipamentos', require('./routes/equipamentos'));
app.use('/colaboradores', require('./routes/colaboradores'));
app.use('/termos', require('./routes/termos'));

app.use((req, res) => {
  res.status(404).render('erro', { titulo: 'Página não encontrada', mensagem: 'O endereço solicitado não existe.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('erro', { titulo: 'Erro interno', mensagem: err.message });
});

db.init()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`TermoCBA rodando em http://localhost:${PORT} (banco: ${db.DB_FILE})`);
    });
    const encerrar = async () => {
      server.close();
      await fecharBrowser();
      db.db.close(() => process.exit(0));
    };
    process.on('SIGTERM', encerrar);
    process.on('SIGINT', encerrar);
  })
  .catch((err) => {
    console.error('Falha ao inicializar o banco de dados:', err);
    process.exit(1);
  });
