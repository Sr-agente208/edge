import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium as pwChromium } from 'playwright';

import { DATA_DIR, ensureDirs } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIBS_DIR = path.join(DATA_DIR, 'chromium-libs', 'lib');

function baseArgs() {
  return [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--font-render-hinting=none'
  ];
}

function readMajor(executablePath) {
  try {
    const out = execSync(`"${executablePath}" --version`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '' }
    }).toString();
    const m = /(\d+)\./.exec(out);
    if (m) return m[1];
  } catch {
    /* fallback abaixo */
  }
  return '149';
}

/** Chromium baixado pelo próprio Playwright (Windows/macOS, ou Linux com CDN liberado). */
async function fromPlaywright() {
  let executablePath;
  try {
    executablePath = pwChromium.executablePath();
  } catch {
    throw new Error('Chromium do Playwright não instalado. Rode uma vez: npx playwright install chromium');
  }
  if (!fs.existsSync(executablePath)) {
    throw new Error('Chromium do Playwright não encontrado. Rode: npx playwright install chromium');
  }
  return { executablePath, major: readMajor(executablePath), args: baseArgs() };
}

/**
 * Chromium embutido no pacote npm @sparticuz/chromium (Linux) — funciona
 * mesmo sem acesso aos CDNs oficiais (ex.: ambientes restritos).
 */
async function fromBundled() {
  const { default: sparticuz } = await import('@sparticuz/chromium').catch(() => ({ default: null }));
  if (!sparticuz) throw new Error('Pacote @sparticuz/chromium não encontrado. Rode: npm install');
  ensureDirs();
  const executablePath = await sparticuz.executablePath();
  if (!fs.existsSync(executablePath)) throw new Error('Binário do Chromium não encontrado em ' + executablePath);

  if (!fs.existsSync(path.join(LIBS_DIR, 'libnss3.so'))) {
    const brPath = path.join(__dirname, '..', 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br');
    if (!fs.existsSync(brPath)) throw new Error('Pacote @sparticuz/chromium incompleto (falta bin/al2023.tar.br)');
    const tarPath = path.join(DATA_DIR, 'chromium-libs.tar');
    fs.mkdirSync(path.dirname(LIBS_DIR), { recursive: true });
    fs.writeFileSync(tarPath, zlib.brotliDecompressSync(fs.readFileSync(brPath)));
    execSync(`tar -xPf "${tarPath}" -C "${path.dirname(LIBS_DIR)}"`, { stdio: 'inherit' });
    fs.rmSync(tarPath, { force: true });
  }

  process.env.LD_LIBRARY_PATH = [LIBS_DIR, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  if (fs.existsSync('/tmp/fonts/fonts.conf')) process.env.FONTCONFIG_PATH = '/tmp/fonts';

  return { executablePath, major: readMajor(executablePath), args: baseArgs() };
}

/**
 * Escolhe o melhor navegador disponível para esta plataforma:
 * - Windows/macOS  → Chromium do Playwright (precisa de `npx playwright install chromium` uma vez)
 * - Linux          → Chromium embutido no npm (sem depender de CDN); fallback para o do Playwright
 */
export async function resolveBrowser() {
  const platform = process.platform;
  if (platform === 'win32' || platform === 'darwin') {
    return await fromPlaywright();
  }
  try {
    return await fromBundled();
  } catch (bundledErr) {
    try {
      return await fromPlaywright();
    } catch (pwErr) {
      throw new Error(
        'Nenhum navegador disponível. Linux: confira "npm install". Outra SO: rode "npx playwright install chromium". Detalhes: ' +
          (bundledErr && bundledErr.message)
      );
    }
  }
}
