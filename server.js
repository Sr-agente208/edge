import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import cron from 'node-cron';

import { loadState, saveState, ensureDirs, SCREEN_DIR } from './src/state.js';
import { saveCookies, deleteCookies, hasCookies, loadCookies, saveCookieStore } from './src/cookies.js';
import { getDashboardData, dashboardSummary, spToday, SessionExpiredError } from './src/api.js';
import { runAutomation } from './src/automation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

ensureDirs();
let state = loadState();
let running = false;

/* ------------------------------ helpers ------------------------------ */

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(s);
  }
}

function publicState() {
  return {
    running,
    hasCookies: hasCookies(),
    spToday: spToday(),
    settings: state.settings,
    lastRun: state.lastRun,
    history: state.history.slice(0, 15)
  };
}

/* ------------------------------- rotas ------------------------------- */

app.get('/api/state', (req, res) => {
  res.json(publicState());
});

app.post('/api/cookies', (req, res) => {
  try {
    const count = saveCookies((req.body || {}).cookieHeader || '');
    state.cookieUpdatedAt = new Date().toISOString();
    saveState(state);
    broadcast({ type: 'cookies-saved', count, ts: Date.now() });
    res.json({ ok: true, count });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.delete('/api/cookies', (req, res) => {
  deleteCookies();
  saveState(state);
  res.json({ ok: true });
});

/** Testa a sessão sem executar nada (recomendado depois de salvar cookies). */
app.get('/api/verify', async (req, res) => {
  try {
    const cookies = loadCookies();
    if (!cookies) return res.status(400).json({ ok: false, error: 'Nenhum cookie salvo ainda.' });
    const data = await getDashboardData(cookies);
    saveCookieStore(cookies);
    const s = dashboardSummary(data);
    res.json({
      ok: true,
      availablePoints: s.availablePoints,
      dailySetTotal: s.dailySetTotal,
      dailySetPending: s.dailySetPending.length,
      punchCards: s.punchCards.length
    });
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      return res.status(401).json({ ok: false, error: 'Sessão inválida ou expirada — copie os cookies de novo (passo a passo abaixo do campo).' });
    }
    const code = (e && e.cause && e.cause.code) || '';
    if (/fetch failed|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ECONNABORTED|UND_ERR/i.test(code + ' ' + (e.message || ''))) {
      return res.status(502).json({
        ok: false,
        error: 'Não consegui alcançar a Microsoft a partir desta máquina — verifique a internet/rede onde o site está rodando.'
      });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/settings', (req, res) => {
  const body = req.body || {};
  if (typeof body.dailyTime === 'string' && /^\d{2}:\d{2}$/.test(body.dailyTime)) {
    const [h, m] = body.dailyTime.split(':').map(Number);
    if (h < 24 && m < 60) state.settings.dailyTime = body.dailyTime;
  }
  if (typeof body.autoRun === 'boolean') state.settings.autoRun = body.autoRun;
  if (Number.isFinite(Number(body.searchCount))) {
    state.settings.searchCount = Math.min(20, Math.max(1, Math.round(Number(body.searchCount))));
  }
  if (Number.isFinite(Number(body.dwellMs))) {
    state.settings.dwellMs = Math.min(30000, Math.max(3000, Math.round(Number(body.dwellMs))));
  }
  saveState(state);
  reschedule();
  res.json({ ok: true, settings: state.settings });
});

app.post('/api/run', (req, res) => {
  if (running) return res.status(409).json({ ok: false, error: 'Já há uma execução em andamento.' });
  if (!hasCookies()) return res.status(400).json({ ok: false, error: 'Configure os cookies da sua conta antes de rodar.' });
  const force = !!(req.body || {}).force;
  const last = state.lastRun;
  if (last && last.date === spToday() && last.status === 'success' && !force) {
    return res.status(409).json({ ok: false, error: 'Você já rodou hoje com sucesso. Marque "forçar" para executar de novo.' });
  }
  res.json({ ok: true, message: 'Execução iniciada — acompanhe os logs ao vivo.' });
  runNow('manual');
});

app.get('/api/screens', (req, res) => {
  try {
    const files = fs
      .readdirSync(SCREEN_DIR)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .reverse()
      .slice(0, 30);
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

app.get('/api/screens/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(SCREEN_DIR, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'screenshot não encontrado' });
  res.sendFile(p);
});

/* --------------------------- execução + cron -------------------------- */

async function runNow(source) {
  if (running) return;
  running = true;
  broadcast({ type: 'run-state', running: true, ts: Date.now() });
  const t0 = Date.now();
  let result = { date: spToday(), iso: new Date().toISOString(), source, status: 'failed', steps: [] };
  try {
    const r = await runAutomation({ settings: state.settings }, broadcast);
    result = { ...r, date: spToday(), iso: new Date().toISOString(), source, status: 'success' };
  } catch (e) {
    result.error = (e && e.message) || String(e);
    broadcast({ type: 'log', level: 'error', msg: `[ERRO] ${result.error}`, ts: Date.now() });
  }
  result.durationMs = Date.now() - t0;
  state.lastRun = result;
  state.history = [result, ...state.history].slice(0, 60);
  saveState(state);
  running = false;
  broadcast({ type: 'run-state', running: false, lastRun: result, ts: Date.now() });
}

let cronTask = null;
function reschedule() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  if (!state.settings.autoRun) return;
  const m = /^(\d{2}):(\d{2})$/.exec(state.settings.dailyTime || '');
  if (!m) return;
  const expr = `${Number(m[2])} ${Number(m[1])} * * *`;
  if (!cron.validate(expr)) return;
  cronTask = cron.schedule(expr, () => {
    if (!running && hasCookies()) runNow('cron');
  }, { timezone: 'America/Sao_Paulo' });
  console.log(`[cron] Execução automática todos os dias às ${state.settings.dailyTime} (America/Sao_Paulo)`);
}
reschedule();

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', ...publicState(), ts: Date.now() }));
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[edge-rewards] Painel no ar: http://localhost:${PORT}`);
  console.log('[edge-rewards] ⚠ Lembrete: automatizar pontos pode violar os Termos do Microsoft Rewards. Rode no máximo 1x/dia.');
});
