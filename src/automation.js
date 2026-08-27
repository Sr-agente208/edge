import path from 'node:path';
import { chromium } from 'playwright';
import { DATA_DIR, ensureDirs, screenFile } from './state.js';
import { loadCookies, saveCookieStore } from './cookies.js';
import { getDashboardData, dashboardSummary, SessionExpiredError, DASHBOARD_URL } from './api.js';
import { resolveBrowser } from './browser.js';

/* ------------------------------------------------------------------ */
/* utilidades                                                          */
/* ------------------------------------------------------------------ */

const SEARCH_QUERIES = [
  'clima hoje em são paulo',
  'câmbio dólar para real hoje',
  'resultado da lotofacil hoje',
  'horário das corridas de hoje',
  'previsão do tempo para amanhã',
  'cotação do euro hoje',
  'bitcoin valor em tempo real',
  'receita de feijoada tradicional',
  'receita de bolo de fubá com coco',
  'notícias de tecnologia hoje',
  'classificação brasona 2026',
  'melhores times da série a',
  'horas bichas de hoje para amanhã',
  'tradução de good morning em português',
  'sinônimos de magnífico',
  'como fazer ovo mole na panela',
  'melhor celular custo benefício 2026',
  'voo são paulo para rio de janeiro',
  'filmes em cartaz hoje no cinema',
  'horário de ônibus linha 500',
  'jogos de futebol hoje transmissão',
  'valor do gás de botijão hoje',
  'como tirar molho de tomate da roupa',
  'quantos graus são 22 em fahrenheit',
  'capital da austria',
  'fórmula 1 classificação geral 2026',
  'receita de pudim de leite condensado',
  'notícias do brasil hoje',
  'como funciona o pix automático',
  'concurso público com inscrição aberta',
  'horário de hoje de bicho previsao',
  'quanto custa passagem para florida 2026',
  'melhor plano de celular 2026',
  'como conservar azeite de dendê',
  'significado do nome luiza',
  'jornal hoje manchetes',
  'preço da gasolina em sp hoje',
  'como fazer café coado perfeito',
  'resumo do livro o pequeno príncipe',
  'aplicativo para aprender inglês grátis'
];

const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = (a = 900, b = 2400) => sleep(rand(a, b));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** minúsculas, sem acentos — para comparar textos do painel. */
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function makeLog(emit) {
  return (level, msg) => {
    const line = `[${new Date().toTimeString().slice(0, 8)}] ${msg}`;
    console.log(`[${level}] ${line}`);
    emit({ type: 'log', level, msg: line, ts: Date.now() });
  };
}

function isLoginWall(page) {
  return /login\.live\.com|account\.live\.com|login\.microsoftonline\.com|signup\.live\.com|go\.microsoft\.com/i.test(page.url());
}

async function shot(page, name) {
  try {
    const p = screenFile(name);
    await page.screenshot({ path: p });
    return p;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* helpers de DOM (resistentes a mudanças de layout)                   */
/* ------------------------------------------------------------------ */

export async function isUsable(el) {
  try {
    if (!(await el.isVisible())) return false;
    if (await el.isDisabled()) return false;
    const box = await el.boundingBox();
    return !!box && box.width > 2 && box.height > 2;
  } catch {
    return false;
  }
}

async function clickableByAccessibleName(page, pattern) {
  const out = [];
  for (const role of ['button', 'link']) {
    const loc = page.getByRole(role, { name: pattern });
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) out.push(loc.nth(i));
  }
  return out;
}

/**
 * Encontra um clique no painel pelo TEXTO (pt-BR ou EN), preferindo o
 * elemento visível menor (o "tile") para não clicar num contêiner grande.
 */
export async function findClickableByText(page, texts) {
  for (const text of texts) {
    const pattern = new RegExp(text, 'i');
    // 1) por nome acessível (aria-label/texto do botão)
    const byRole = await clickableByAccessibleName(page, pattern);
    for (const el of byRole) if (await isUsable(el)) return el;
    // 2) por texto contido em elementos clicáveis/títulos — do menor para o maior
    const loc = page
      .locator('button, a, [role="button"], li, h1, h2, h3, [class*="title" i], [class*="header" i], div, span')
      .filter({ hasText: pattern });
    const n = await loc.count().catch(() => 0);
    const sized = [];
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      const box = await el.boundingBox().catch(() => null);
      if (box && box.width < 900 && box.height < 900) sized.push({ el, area: box.width * box.height });
    }
    sized.sort((a, b) => a.area - b.area);
    for (const c of sized) if (await isUsable(c.el)) return c.el;
  }
  return null;
}

/**
 * Encontra o tile cuja área de texto contenha o título da tarefa,
 * usando o próprio DOM da página (funciona com ícones, subtextos etc).
 */
export async function findTileByText(page, title) {
  const candidates = [normalize(title), normalize(title).slice(0, 40), normalize(title).slice(0, 24), normalize(title).slice(0, 14)]
    .filter((s, i, arr) => s.length >= 6 && arr.indexOf(s) === i);
  for (const key of candidates) {
    const handle = await page
      .evaluateHandle(
        (k) => {
          const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const els = Array.from(document.querySelectorAll('button, a, [role="button"], li, div, span'));
          let best = null;
          let bestArea = Infinity;
          for (const el of els) {
            if (norm(el.textContent || '').includes(k)) {
              const r = el.getBoundingClientRect();
              if (r.width < 6 || r.height < 6 || r.width > 860 || r.height > 760) continue;
              const area = r.width * r.height;
              if (area < bestArea) {
                best = el;
                bestArea = area;
              }
            }
          }
          return best;
        },
        key
      )
      .catch(() => null);
    const el = handle && handle.asElement ? handle.asElement() : null;
    if (el && (await isUsable(el))) return el;
  }
  return null;
}

/** Aguarda uma nova aba ou mudança de URL após um clique. */
async function waitForNewOrChanged(context, page, pagesBefore, urlBefore, timeout = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const p of context.pages()) {
      if (!pagesBefore.has(p) && !p.isClosed()) return p;
    }
    try {
      if (page.url() !== urlBefore) return page;
    } catch {
      return null;
    }
    await sleep(250);
  }
  return null;
}

async function closeExtraTabs(context, keep) {
  for (const p of context.pages()) {
    if (p !== keep && !p.isClosed()) {
      try {
        await p.close();
      } catch {
        /* ok */
      }
    }
  }
}

async function backToDashboard(context, page, log) {
  try {
    if (!/rewards\.bing\.com/i.test(page.url())) {
      await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(3500);
    } else {
      await sleep(1500);
    }
  } catch {
    /* página pode ter sido fechada */
  }
  await closeExtraTabs(context, page);
}

/* ------------------------------------------------------------------ */
/* tarefas individuais                                                  */
/* ------------------------------------------------------------------ */

/** Tenta responder um quiz aberto na página (melhor esforço). */
async function maybeDoQuiz(page, log) {
  try {
    const head = await page.evaluate(() => (document.body.innerText || '').slice(0, 2500));
    if (!/quiz|pergunta|question/i.test(head)) return false;
    log('info', 'Quiz detectado — respondendo as perguntas...');
    for (let q = 0; q < 10; q++) {
      const picked = await page.evaluate(() => {
        const skip = /(pr[oó]ximo|next|voltar|back|enviar|send|verificar|submit|conclu[ií]r|finish|fechar|close|pular|skip)/i;
        const btns = Array.from(document.querySelectorAll('button')).filter((b) => {
          const t = (b.innerText || '').trim();
          return t.length >= 3 && t.length <= 120 && !skip.test(t) && !b.disabled && b.offsetParent !== null;
        });
        if (!btns.length) return null;
        const el = btns[Math.floor(Math.random() * Math.min(2, btns.length))];
        el.click();
        return (el.innerText || '').trim().slice(0, 60);
      });
      if (!picked) break;
      log('info', `Pergunta ${q + 1}: respondendo "${picked}"`);
      await sleep(1600);
      const advanced = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const next = btns.find((b) =>
          /(pr[oó]ximo|next|enviar|send|verificar|conclu[ií]r|finish)/i.test((b.innerText || '').trim()) &&
          b.offsetParent !== null &&
          !b.disabled
        );
        if (next) {
          next.click();
          return true;
        }
        return false;
      });
      if (!advanced) {
        const body = await page.evaluate(() => (document.body.innerText || '').slice(0, 1800));
        if (/resultado|result|you got|voc[eê] acertou|acertou|pontos? (ganho|conquistado)/i.test(body)) {
          log('info', 'Quiz finalizado — resultado exibido.');
          break;
        }
        await sleep(900);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Executa um item do daily set / promoção: encontra o tile pelo título,
 * clica, aguarda o tempo de "leitura" e volta ao painel.
 */
export async function doTileTask(context, page, title, log, settings, { expectQuiz = false, dwell } = {}) {
  const el = await findTileByText(page, title);
  if (!el) {
    log('warn', `Tile "${title}" não encontrado na página (já concluído ou layout mudou). Pulando.`);
    return 'skip';
  }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await delay(300, 900);
  const pagesBefore = new Set(context.pages());
  const urlBefore = page.url();
  await el.click().catch(async () => el.evaluate((e) => e.click()));

  const target = await waitForNewOrChanged(context, page, pagesBefore, urlBefore, 9000);
  if (!target) {
    log('info', `Clique em "${title}" não abriu nova página — talvez o ponto seja instantâneo.`);
    if (expectQuiz) await maybeDoQuiz(page, log);
    await sleep(2500);
    await backToDashboard(context, page, log);
    return 'ok';
  }

  const looksLikeArticle = /news|artigo|leia|read|not[ií]cia/i.test(String(title));
  const ms = dwell || (looksLikeArticle ? Math.max(settings.dwellMs || 9000, 9000) : rand(5000, 8000));
  log('info', `Página da tarefa aberta — aguardando ${Math.round(ms / 1000)}s...`);
  await sleep(ms);
  if (expectQuiz) {
    const quizPage = target !== page ? target : page;
    if (!(await maybeDoQuiz(quizPage, log))) log('info', 'Nenhum quiz identificado nessa página.');
  }
  if (target !== page) {
    await target.close().catch(() => {});
  } else if (page.url() !== urlBefore) {
    await backToDashboard(context, page, log);
  }
  await delay(1500, 3000);
  return 'ok';
}

/** Punch card: acha a seção do cartão e clica na primeira casa pendente. */
export async function doPunchCard(context, page, punchCard, log, settings) {
  const sectionEl = await findTileByText(page, punchCard.name || 'punch card');
  const anchor = sectionEl || (await findClickableByText(page, [/punch card/i, /cart[aã]o de ponto/i, /cart[aã]o/i]).catch(() => null));
  if (!anchor) {
    log('info', 'Seção de punch card não visível no painel (pode estar em outra aba do site).');
    return 'skip';
  }
  log('info', `Punch card: ${punchCard.name} — procurando a próxima casa...`);
  const cell = await page.evaluateHandle(() => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cells = Array.from(document.querySelectorAll('button, [role="button"], div, span, li')).filter((el) => {
      const t = norm((el.textContent || '').trim());
      if (!/^\d{1,2}$/.test(t)) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 20 && r.width <= 120 && r.height >= 20 && r.height <= 120 && r.width > 0;
    });
    return cells[0] || null;
  });
  const cellEl = cell && cell.asElement ? cell.asElement() : null;
  if (!cellEl) {
    log('info', 'Nenhuma casa do punch card encontrada — talvez já esteja completo.');
    return 'skip';
  }
  await cellEl.scrollIntoViewIfNeeded().catch(() => {});
  await delay(400, 1000);
  const pagesBefore = new Set(context.pages());
  const urlBefore = page.url();
  await cellEl.click().catch(async () => cellEl.evaluate((e) => e.click()));
  const target = await waitForNewOrChanged(context, page, pagesBefore, urlBefore, 7000);
  if (target && target !== page) {
    await sleep(Math.max(settings.dwellMs || 8000, 6000));
    await target.close().catch(() => {});
  } else {
    await sleep(2500);
  }
  await backToDashboard(context, page, log);
  return 'ok';
}

/** Buscas aleatórias no Bing (pontos de busca do dia). */
export async function doSearches(context, page, settings, log) {
  const count = Math.max(1, Math.min(20, settings.searchCount || 10));
  const queries = shuffle(SEARCH_QUERIES).slice(0, count);

  let box = page.locator('#sb_form_q, input[name="q"]').first();
  if (!(await box.count().catch(() => 0))) {
    log('info', `Abrindo bing.com para ${count} buscas...`);
    try {
      await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded' });
    } catch (e) {
      log('warn', 'Não consegui abrir o bing.com (' + String(e.message).split('\n')[0] + ') — pulando as buscas.');
      return 0;
    }
    await sleep(3000);
    box = page.locator('#sb_form_q, input[name="q"]').first();
    if (!(await box.count().catch(() => 0))) {
      log('warn', 'Campo de busca do Bing não encontrado — pulando as buscas.');
      return 0;
    }
  }
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
      const box = page.locator('#sb_form_q, input[name="q"]').first();
      if (!(await box.count().catch(() => 0))) {
        log('warn', 'Campo de busca do Bing não encontrado — encerrando buscas.');
        break;
      }
      await box.click();
      await box.fill('');
      await box.type(q, { delay: rand(25, 75) });
      await sleep(rand(300, 800));
      await page.keyboard.press('Enter');
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
      await sleep(rand(4500, 7000));
      log('info', `Busca ${i + 1}/${count}: "${q}" ✓`);
    } catch (e) {
      log('warn', `Busca ${i + 1}/${count} falhou: ${e.message}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* fluxo principal                                                      */
/* ------------------------------------------------------------------ */

export async function runAutomation(opts, emitRaw) {
  const emit = (obj) => {
    try {
      emitRaw(obj);
    } catch {
      /* sem conexões ws ainda */
    }
  };
  const log = makeLog(emit);
  const settings = opts.settings || {};
  ensureDirs();

  const cookies = loadCookies();
  if (!cookies) throw new Error('Nenhum cookie configurado. Cole os cookies do seu navegador no painel primeiro.');

  const profileDir = path.join(DATA_DIR, 'profile');
  const { executablePath, major, args: browserArgs } = await resolveBrowser();
  const ua = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;

  log('info', `Iniciando navegador (Chromium ${major}) com a sua sessão...`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: ua,
    viewport: { width: 1600, height: 900 },
    ignoreHTTPSErrors: true,
    args: browserArgs
  });
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      if (!window.chrome) window.chrome = { runtime: {} };
    } catch {
      /* ok */
    }
  });
  await context.addCookies(cookies);
  context.setDefaultNavigationTimeout(60000);
  context.setDefaultTimeout(45000);

  const page = await context.newPage();
  const result = { steps: [] };

  // stream de "tela ao vivo"
  let current = page;
  const stopShots = (() => {
    const timer = setInterval(async () => {
      try {
        const p = current;
        if (!p || p.isClosed()) return;
        const buf = await p.screenshot({ type: 'jpeg', quality: 55 });
        emit({ type: 'shot', data: buf.toString('base64'), ts: Date.now() });
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(timer);
  })();

  const step = async (name, fn) => {
    log('info', `— ${name} —`);
    const t0 = Date.now();
    try {
      const status = (await fn()) || 'ok';
      const entry = { name, status, ms: Date.now() - t0 };
      result.steps.push(entry);
      if (status === 'ok') log('info', `✓ ${name} finalizado`);
      return entry;
    } catch (e) {
      const entry = { name, status: 'error', error: e.message, ms: Date.now() - t0 };
      result.steps.push(entry);
      log('error', `Falha em "${name}": ${e.message}`);
      await shot(page, `erro-${name.slice(0, 24)}`).catch(() => {});
      return entry;
    }
  };

  try {
    emit({ type: 'phase', phase: 'abertura' });
    log('info', `Abrindo ${DASHBOARD_URL} ...`);
    try {
      await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
    } catch (e) {
      const first = String(e.message || e).split('\n')[0];
      if (/net::ERR_|NS_ERROR_|ERR_NAME_NOT_RESOLVED/i.test(first)) {
        throw new Error(
          'Não consegui alcançar o rewards.bing.com a partir desta máquina (' + first + '). Verifique a internet/rede onde o site está rodando.'
        );
      }
      throw e;
    }
    await sleep(6000);

    if (isLoginWall(page)) {
      await shot(page, 'tela-de-login');
      throw new SessionExpiredError('Fui redirecionado para o login da Microsoft. Os cookies expiraram — recopie os cookies e salve de novo.');
    }
    await shot(page, '01-painel-inicial');

    // sincroniza cookies renovados pela Microsoft de volta para o armazenamento
    const syncCookies = async () => {
      try {
        const ctxCookies = await context.cookies('https://www.bing.com', 'https://rewards.bing.com', 'https://login.live.com');
        const byName = new Map(cookies.map((c) => [c.name, c]));
        let changed = 0;
        for (const c of ctxCookies) {
          const ex = byName.get(c.name);
          if (!ex || ex.value !== c.value) {
            const nc = { name: c.name, value: c.value, domain: c.domain || '.bing.com', path: c.path || '/' };
            if (ex) Object.assign(ex, nc);
            else {
              cookies.push(nc);
              byName.set(c.name, nc);
            }
            changed++;
          }
        }
        if (changed) {
          saveCookieStore(cookies);
          log('info', `Sessão renovada: ${changed} cookie(s) atualizado(s).`);
        }
      } catch (e) {
        log('warn', `Não consegui sincronizar cookies: ${e.message}`);
      }
    };
    await syncCookies();

    emit({ type: 'phase', phase: 'leitura' });
    let data = await getDashboardData(cookies);
    const summary = dashboardSummary(data);
    emit({ type: 'points', before: summary.availablePoints, dailySetPending: summary.dailySetPending.length, dailySetTotal: summary.dailySetTotal });
    log('info', `Saldo atual: ${summary.availablePoints ?? '?'} pontos`);
    log('info', `Daily set de hoje: ${summary.dailySetTotal} tarefa(s), ${summary.dailySetPending.length} pendente(s)`);
    if (summary.availablePoints == null) log('warn', 'Não consegui ler o saldo numericamente — sigo com as tarefas.');

    /* 1) check-in diário (botão, quando aparece) */
    await step('Check-in diário', async () => {
      const el = await findClickableByText(page, [/check[\s-]?in/i, /fazer check[\s-]?in/i, /check[\s-]?in di[aá]rio/i]);
      if (!el) {
        log('info', 'Botão de check-in não encontrado (provavelmente já feito hoje).');
        return 'skip';
      }
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.click().catch(async () => el.evaluate((e) => e.click()));
      await sleep(2500);
      return 'ok';
    });

    /* 2) daily set (tarefas do dia) */
    for (const item of summary.dailySetPending.slice(0, 8)) {
      const title = item.title || item.name || 'tarefa';
      const isQuiz = /quiz/i.test(String(item.name || title));
      const isSearchOnBing = /exploreonbing/i.test(String(item.name || ''));
      await step(`Daily Set: ${title}`, () =>
        doTileTask(context, page, title, log, settings, { expectQuiz: isQuiz, dwell: isSearchOnBing ? 7000 : undefined })
      );
    }
    if (!summary.dailySetPending.length) log('info', 'Daily set já está todo completo hoje.');

    /* 3) punch cards */
    const pendingPunchCard = summary.punchCards.find((pc) => pc && pc.parentPromotion && !pc.parentPromotion.complete);
    if (pendingPunchCard) {
      await step(`Punch card: ${pendingPunchCard.name || 'diário'}`, () => doPunchCard(context, page, pendingPunchCard, log, settings));
    } else {
      log('info', 'Nenhum punch card pendente.');
    }

    /* 4) promoções do dia (urlreward, sem as de busca — já cobertas pelo daily set) */
    const promoPending = summary.morePromotions
      .filter((p) => p && p.promotionType === 'urlreward' && !p.complete && (p.pointProgressMax || 0) > 0)
      .filter((p) => !/exploreonbing/i.test(String(p.name || '')))
      .slice(0, 4);
    for (const p of promoPending) {
      const title = p.title || p.name || 'promoção';
      await step(`Promoção: ${title}`, () => doTileTask(context, page, title, log, settings, {}));
    }
    if (!promoPending.length) log('info', 'Nenhuma promoção extra pendente.');

    /* 5) buscas no Bing */
    await step(`Buscas no Bing (${settings.searchCount || 10}x)`, () => doSearches(context, page, settings, log));

    /* 6) saldo final */
    emit({ type: 'phase', phase: 'finalizacao' });
    log('info', 'Voltando ao painel para ler o saldo final...');
    await backToDashboard(context, page, log);
    await sleep(3000);
    await syncCookies();
    let after = null;
    try {
      const data2 = await getDashboardData(cookies);
      after = data2.dashboard?.userStatus?.availablePoints ?? null;
      saveCookieStore(cookies);
    } catch (e) {
      log('warn', `Não consegui reler o saldo final: ${e.message}`);
    }
    await shot(page, '99-painel-final');

    const before = summary.availablePoints;
    result.before = before;
    result.after = after;
    result.gained = before != null && after != null ? after - before : null;
    emit({ type: 'points', before, after, gained: result.gained });
    if (result.gained != null) {
      log('info', `Ganho total da execução: +${result.gained} pontos (saldo final: ${after})`);
    }
    return result;
  } finally {
    stopShots();
    await context.close().catch(() => {});
  }
}
