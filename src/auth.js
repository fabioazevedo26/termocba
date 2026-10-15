const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { DATA_DIR } = require('./db');

const USUARIO = process.env.ADMIN_USER || 'admin';
const SENHA = process.env.ADMIN_PASS || 'admin';
const COOKIE = 'termocba_sessao';
const DURACAO_MS = 12 * 60 * 60 * 1000; // 12 horas

// Segredo de assinatura persistido no volume: sessões sobrevivem a reinícios do contêiner.
function obterSegredo() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const arquivo = path.join(DATA_DIR, '.session_secret');
  try {
    return fs.readFileSync(arquivo, 'utf8').trim();
  } catch {
    const novo = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(arquivo, novo, { mode: 0o600 });
    return novo;
  }
}
const SEGREDO = obterSegredo();

// A assinatura inclui usuário e senha: trocar a senha encerra as sessões abertas.
function assinar(expira) {
  return crypto.createHmac('sha256', SEGREDO).update(`${USUARIO}:${SENHA}:${expira}`).digest('base64url');
}

function iguais(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function lerCookie(req) {
  const cabecalho = req.headers.cookie || '';
  for (const parte of cabecalho.split(';')) {
    const [nome, ...resto] = parte.trim().split('=');
    if (nome === COOKIE) return decodeURIComponent(resto.join('='));
  }
  return null;
}

function sessaoValida(req) {
  const token = lerCookie(req);
  if (!token) return false;
  const [expira, assinatura] = token.split('.');
  if (!expira || !assinatura || Number(expira) < Date.now()) return false;
  return iguais(assinatura, assinar(expira));
}

function destinoSeguro(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const router = express.Router();

router.get('/login', (req, res) => {
  if (sessaoValida(req)) return res.redirect('/');
  res.render('login', { erroLogin: null, usuario: '', next: destinoSeguro(req.query.next) });
});

router.post('/login', async (req, res) => {
  const { usuario = '', senha = '', next } = req.body || {};
  // Avalia os dois sempre, sem curto-circuito, para não revelar qual campo errou.
  const okUsuario = iguais(usuario, USUARIO);
  const okSenha = iguais(senha, SENHA);
  if (!(okUsuario && okSenha)) {
    await new Promise((r) => setTimeout(r, 800)); // freia tentativas em sequência
    return res.status(401).render('login', {
      erroLogin: 'Usuário ou senha inválidos.', usuario, next: destinoSeguro(next),
    });
  }
  const expira = Date.now() + DURACAO_MS;
  res.cookie(COOKIE, `${expira}.${assinar(expira)}`, {
    httpOnly: true, sameSite: 'lax', maxAge: DURACAO_MS, path: '/',
  });
  res.redirect(destinoSeguro(next));
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.redirect('/login');
});

function exigirLogin(req, res, next) {
  if (sessaoValida(req)) return next();
  if (req.method === 'GET') return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  res.redirect('/login');
}

module.exports = { router, exigirLogin };
