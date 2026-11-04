# TermoCBA — Termos de Responsabilidade por Equipamento de Informática

Sistema interno do Setor de TI do **CBA - Centro de Bionegócios da Amazônia** para cadastrar equipamentos e colaboradores, emitir termos de responsabilidade em PDF e registrar devoluções.

**Stack:** Node.js 22 + Express 5 · EJS + Bootstrap 5 (servido localmente, sem CDN) · SQLite (`sqlite3`) · Puppeteer + Chromium.

## Como subir

```bash
docker compose up --build -d
```

Acesse **http://localhost:3000**. Login padrão: **admin / admin**. Para trocar, copie `.env.example` para `.env` e altere `ADMIN_USER` e `ADMIN_PASS`.

Para instalar na VM da empresa e acessar pela rede, siga o **[DEPLOY.md](DEPLOY.md)**.

## Persistência dos dados

O banco fica em `./data/termocba.sqlite` no host, mapeado para `/app/data` no contêiner. Os PDFs são salvos **dentro do banco** (coluna `termos.arquivo_pdf`, Base64).
Os dados sobrevivem a `docker compose down`, a reinícios e a rebuilds.

- **Backup:** rode `./scripts/backup.sh`, que gera uma cópia consistente em `data/backups/` (veja o DEPLOY.md).
- **Não apague** a pasta `data/`.

## Funcionalidades

| Módulo | O que faz |
|---|---|
| Painel | Contadores (equipamentos, disponíveis, em uso, termos ativos) e termos recentes |
| Equipamentos | CRUD com campo opcional **Projeto** (texto livre com sugestões). Entra como **Disponível**. O status muda só pela emissão e pela devolução de termos. Um equipamento em uso ou que já consta em algum termo não pode ser excluído |
| Colaboradores | CRUD com validação e máscara de CPF (o CPF é único). Quem tem termos não pode ser excluído |
| Emitir termo | Seleciona um colaborador existente ou cadastra um novo na hora, marca 1 ou mais equipamentos **Disponíveis** e gera o PDF |
| Termos | Busca por nº, nome, CPF, patrimônio ou série. Visualizar, imprimir ou baixar o PDF. **Registrar Devolução**. Regerar o PDF |

### Regras de emissão
1. Tudo roda numa única transação: colaborador → termo → itens → status `Em Uso`. A reserva de cada equipamento é feita com `UPDATE ... WHERE status = 'Disponível'`, o que impede emitir o mesmo item duas vezes ao mesmo tempo.
2. Em seguida o PDF é gerado pelo Puppeteer e salvo em Base64. Se a geração falhar, a emissão é desfeita e os equipamentos voltam a ficar disponíveis.

### Devolução
Grava `termos.data_devolucao` e devolve todos os equipamentos do termo ao status `Disponível`. O termo continua no histórico.

## Estrutura

```
src/
  server.js          Express e rotas
  db.js              Conexão SQLite, schema e transações
  pdf.js             Puppeteer: template EJS → PDF Base64
  auth.js            Login (cookie de sessão assinado com HMAC, válido por 12h)
  utils.js           CPF, datas e helpers
  routes/            dashboard, equipamentos, colaboradores, termos
views/
  pdf/termo.ejs      Template do PDF (cabeçalho CBA, seções 1–7, assinaturas)
  partials/, equipamentos/, colaboradores/, termos/
public/              CSS e JS do front
```

### Modelo de dados
- `colaboradores(id, nome, cpf UNIQUE)`
- `equipamentos(id, tipo, marca_modelo, projeto, patrimonio UNIQUE, numero_serie, nota_fiscal, especificacoes, acessorios, status CHECK IN ('Disponível','Em Uso'))`
- `termos(id, colaborador_id FK, data_emissao, data_devolucao, arquivo_pdf TEXT/Base64)`
- `termo_itens(termo_id FK, equipamento_id FK, PK(termo_id, equipamento_id))`

## Desenvolvimento sem Docker (opcional)

```bash
npm install          # baixa o Chrome do Puppeteer
npm run dev
```
