/* Teste rápido: sobe o Chromium do pacote e abre bing.com + rewards.bing.com.
   Uso: npm run smoke  (ou: node test/smoke.js) */
import { chromium } from 'playwright';
import { resolveBrowser } from '../src/browser.js';
import { ensureDirs, DATA_DIR } from '../src/state.js';
import fs from 'node:fs';
import path from 'node:path';

ensureDirs();
const { executablePath, major, args } = await resolveBrowser();
console.log('executável:', executablePath, '(major', major + ')');

const browser = await chromium.launch({ executablePath, headless: true, args });
console.log('playwright version():', await browser.version());

const page = await browser.newPage();
try {
  console.log('abrindo bing.com ...');
  await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('título:', await page.title());
  await page.screenshot({ path: path.join(DATA_DIR, 'smoke-bing.png') });
  console.log('screenshot bing: OK');
} catch (e) {
  console.error('ERRO no bing.com:', e.message);
}
try {
  console.log('abrindo rewards.bing.com/dashboard ...');
  await page.goto('https://rewards.bing.com/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('url final:', page.url());
  await page.screenshot({ path: path.join(DATA_DIR, 'smoke-rewards.png') });
  console.log('screenshot rewards: OK');
} catch (e) {
  console.error('ERRO no rewards:', e.message);
}
await browser.close();
console.log('SMOKE OK');
process.exit(0);
