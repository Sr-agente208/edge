/* postinstall: prepara o navegador do bot.
   - Windows/macOS: tenta baixar o Chromium do Playwright (não falha a instalação se der erro).
   - Linux: pré-extrai o Chromium embutido + libs (funciona offline/CDN bloqueado). */
import { execSync } from 'node:child_process';
import process from 'node:process';

if (process.platform === 'win32' || process.platform === 'darwin') {
  try {
    execSync('npx playwright install chromium', { stdio: 'inherit', timeout: 900000 });
    console.log('[postinstall] Chromium do Playwright pronto.');
  } catch {
    console.warn('[postinstall] AVISO: não consegui baixar o Chromium automaticamente.');
    console.warn('[postinstall] Rode depois, manualmente:  npx playwright install chromium');
  }
} else {
  try {
    const { resolveBrowser } = await import('./src/browser.js');
    const { executablePath } = await resolveBrowser();
    console.log('[postinstall] Chromium embutido pronto em:', executablePath);
  } catch (e) {
    console.warn('[postinstall] AVISO: preparação do Chromium embutido falhou (' + e.message + ').');
    console.warn('[postinstall] O bot tentará usar o Chromium do Playwright. Rode se necessário: npx playwright install chromium');
  }
}
