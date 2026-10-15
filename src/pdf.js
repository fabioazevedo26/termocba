const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const { formatarDataExtenso } = require('./utils');

const TEMPLATE = path.join(__dirname, '..', 'views', 'pdf', 'termo.ejs');
// Logo embutida como data URI: o HTML é carregado via setContent, sem servidor de arquivos.
const LOGO = 'data:image/png;base64,' +
  fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'logo-cba.png')).toString('base64');

let browserPromise = null;
let emUso = 0;
let timerOcioso = null;
const OCIOSO_MS = 5 * 60 * 1000; // fecha o Chromium após 5 min sem gerar PDF (economiza RAM)

function agendarFechamento() {
  clearTimeout(timerOcioso);
  timerOcioso = setTimeout(() => {
    if (emUso === 0) fecharBrowser();
  }, OCIOSO_MS);
  timerOcioso.unref();
}

function getBrowser() {
  if (!browserPromise) {
    const atual = puppeteer
      .launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      })
      .then((browser) => {
        browser.on('disconnected', () => { if (browserPromise === atual) browserPromise = null; });
        return browser;
      })
      .catch((err) => {
        if (browserPromise === atual) browserPromise = null;
        throw err;
      });
    browserPromise = atual;
  }
  return browserPromise;
}

/**
 * Renderiza o template EJS do termo e converte para PDF.
 * @returns {Promise<string>} PDF codificado em Base64
 */
async function gerarPdfTermo({ termo, colaborador, itens }) {
  const html = await ejs.renderFile(TEMPLATE, {
    termo,
    colaborador,
    itens,
    logo: LOGO,
    dataExtenso: formatarDataExtenso(termo.data_emissao),
  });

  emUso++;
  clearTimeout(timerOcioso);
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '18mm', left: '20mm', right: '20mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `
        <div style="font-family: Arial, sans-serif; font-size: 8px; color: #666; width: 100%; padding: 0 20mm; display: flex; justify-content: space-between;">
          <span>Termo de Responsabilidade nº ${String(termo.id).padStart(5, '0')}</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
    });
    return Buffer.from(pdf).toString('base64');
  } finally {
    if (page) await page.close().catch(() => {});
    emUso--;
    agendarFechamento();
  }
}

async function fecharBrowser() {
  if (browserPromise) {
    const p = browserPromise;
    browserPromise = null;
    const b = await p.catch(() => null);
    if (b) await b.close().catch(() => {});
  }
}

module.exports = { gerarPdfTermo, fecharBrowser };
