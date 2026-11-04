const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'termocba.sqlite');

const db = new sqlite3.Database(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

// Transações são serializadas: a conexão é única, então duas transações
// concorrentes não podem ficar abertas ao mesmo tempo.
let fila = Promise.resolve();
function withTransaction(fn) {
  const resultado = fila.then(async () => {
    await exec('BEGIN IMMEDIATE');
    try {
      const r = await fn();
      await exec('COMMIT');
      return r;
    } catch (err) {
      await exec('ROLLBACK').catch(() => {});
      throw err;
    }
  });
  fila = resultado.catch(() => {});
  return resultado;
}

async function init() {
  await exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS colaboradores (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      nome  TEXT NOT NULL,
      cpf   TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS equipamentos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo            TEXT NOT NULL,
      marca_modelo    TEXT NOT NULL,
      projeto         TEXT,
      patrimonio      TEXT UNIQUE,
      numero_serie    TEXT,
      nota_fiscal     TEXT,
      especificacoes  TEXT,
      acessorios      TEXT,
      status          TEXT NOT NULL DEFAULT 'Disponível'
                      CHECK (status IN ('Disponível', 'Em Uso'))
    );

    CREATE TABLE IF NOT EXISTS termos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      colaborador_id  INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
      data_emissao    TEXT NOT NULL,
      data_devolucao  TEXT,
      arquivo_pdf     TEXT
    );

    CREATE TABLE IF NOT EXISTS termo_itens (
      termo_id        INTEGER NOT NULL REFERENCES termos(id) ON DELETE CASCADE,
      equipamento_id  INTEGER NOT NULL REFERENCES equipamentos(id) ON DELETE RESTRICT,
      PRIMARY KEY (termo_id, equipamento_id)
    );

    CREATE INDEX IF NOT EXISTS idx_termos_colaborador ON termos(colaborador_id);
    CREATE INDEX IF NOT EXISTS idx_termo_itens_equip ON termo_itens(equipamento_id);
    CREATE INDEX IF NOT EXISTS idx_equip_status ON equipamentos(status);
  `);

  const colunas = await all('PRAGMA table_info(equipamentos)');
  if (!colunas.some((c) => c.name === 'projeto')) {
    await exec('ALTER TABLE equipamentos ADD COLUMN projeto TEXT');
  }
}

module.exports = { db, run, get, all, exec, withTransaction, init, DB_FILE, DATA_DIR };
