/* Teste offline (sem internet): valida as heurísticas de DOM contra
   fixtures locais que imitam o painel do Microsoft Rewards.
   Uso: node test/dom.test.js */
import { chromium } from 'playwright';
import { resolveBrowser } from '../src/browser.js';
import { findClickableByText, findTileByText, doSearches } from '../src/automation.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = (f) => 'file://' + path.join(__dirname, 'fixtures', f);

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name + (extra ? ' — ' + extra : ''));
  }
}

const { executablePath, args } = await resolveBrowser();
const browser = await chromium.launch({ executablePath, headless: true, args });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const log = (lvl, msg) => console.log(`  [${lvl}] ${msg}`);

/* ---------- painel ---------- */
console.log('— fixture: painel —');
await page.goto(url('dashboard.html'), { waitUntil: 'domcontentloaded' });

// 1) check-in por texto
const checkin = await findClickableByText(page, [/fazer check[\s-]?in/i, /check[\s-]?in/i]);
check('encontra botão "Fazer check-in"', !!checkin);
if (checkin) {
  await checkin.click();
  const cls = await page.locator('#btn-checkin').getAttribute('class');
  check('check-in clicou (classe .done)', /done/.test(cls || ''));
}

// 2) tile "Pesquisar na web"
const searchTile = await findTileByText(page, 'Pesquisar na web');
check('encontra tile "Pesquisar na web"', !!searchTile);
if (searchTile) {
  await searchTile.scrollIntoViewIfNeeded().catch(() => {});
  await searchTile.click();
  const cls = await page.locator('#tile-search').getAttribute('class');
  check('tile de pesquisa foi o clicado (id #tile-search)', /done/.test(cls || ''));
}

// 3) tile "Leia uma notícia" — sem acento na busca (normalização)
const newsTile = await findTileByText(page, 'Leia uma noticia');
check('encontra tile "Leia uma notícia" (busca sem acento)', !!newsTile);

// 4) tile de quiz
const quizTile = await findTileByText(page, 'Complete o quiz');
check('encontra tile de quiz', !!quizTile);

// 5) seção do punch card
const punch = await findClickableByText(page, [/punch card/i, /cart[aã]o de ponto/i]);
check('encontra seção de punch card', !!punch);

// 6) saldo legível no texto da página
const bodyText = await page.evaluate(() => document.body.innerText);
const ptsMatch = /você tem\s*([\d.]+)\s*pontos/i.exec(bodyText);
check('lê o saldo no texto da página', !!ptsMatch, bodyText.slice(0, 40));

/* ---------- bing ---------- */
console.log('— fixture: bing —');
await page.goto(url('bing.html'), { waitUntil: 'domcontentloaded' });
await doSearches(context, page, { searchCount: 2, dwellMs: 3000 }, log);
const cnt = await page.locator('#search-count').textContent();
check('doSearches fez 2 buscas', cnt === 'buscas: 2', 'valor: ' + cnt);

await browser.close();
console.log(`\nRESULTADO: ${passed} passou, ${failed} falhou`);
process.exit(failed ? 1 : 0);
