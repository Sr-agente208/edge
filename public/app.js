/* Edge Rewards — painel (vanilla JS) */
const $ = (sel) => document.querySelector(sel);

const els = {
  pillSession: $('#pill-session'),
  pillAuto: $('#pill-auto'),
  statBalance: $('#stat-balance'),
  statGained: $('#stat-gained'),
  statLast: $('#stat-last'),
  statTasks: $('#stat-tasks'),
  statTasksHint: $('#stat-tasks-hint'),
  statNext: $('#stat-next'),
  statNextHint: $('#stat-next-hint'),
  btnRun: $('#btn-run'),
  chkForce: $('#chk-force'),
  runHint: $('#run-hint'),
  cardResult: $('#card-result'),
  resultIcon: $('#result-icon'),
  resultTitle: $('#result-title'),
  resultDetail: $('#result-detail'),
  resultShot: $('#result-shot'),
  cardSession: $('#card-session'),
  stepBadge: $('#step-badge'),
  sessionStatus: $('#session-status'),
  sessionDone: $('#session-done'),
  sessionDetail: $('#session-detail'),
  btnVerify: $('#btn-verify'),
  btnChange: $('#btn-change'),
  btnDelCookies: $('#btn-del-cookies'),
  btnSaveCookies: $('#btn-save-cookies'),
  cookieInput: $('#cookie-input'),
  cookieMsg: $('#cookie-msg'),
  cookieMsgSetup: $('#cookie-msg-setup'),
  cardLive: $('#card-live'),
  liveStatus: $('#live-status'),
  liveStep: $('#live-step'),
  phaseBar: $('#phase-bar'),
  liveShot: $('#live-shot'),
  screenPlaceholder: $('#screen-placeholder'),
  log: $('#log'),
  btnClearLog: $('#btn-clear-log'),
  inpTime: $('#inp-time'),
  chkAutorun: $('#chk-autorun'),
  inpSearches: $('#inp-searches'),
  inpDwell: $('#inp-dwell'),
  btnSaveSettings: $('#btn-save-settings'),
  settingsMsg: $('#settings-msg'),
  history: $('#history'),
  histCount: $('#hist-count')
};

let hasCookies = false;
let running = false;
let lastVerify = null;
let settings = null;
let ws = null;

/* ------------------------------ helpers ------------------------------ */

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(n));

function setMsg(el, text, cls) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg' + (el.classList.contains('inline') ? ' inline' : '') + (cls ? ' ' + cls : '');
}

function addLog(level, line) {
  const div = document.createElement('div');
  div.className = 'log-line ' + level;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = line.match(/^\[(\d{2}:\d{2}:\d{2})\]/)?.[1] || '';
  div.appendChild(t);
  div.appendChild(document.createTextNode(line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '')));
  els.log.appendChild(div);
  while (els.log.children.length > 500) els.log.removeChild(els.log.firstChild);
  els.log.scrollTop = els.log.scrollHeight;

  // etapa atual (linhas "— Nome —")
  const step = line.match(/^\[\d{2}:\d{2}:\d{2}\] — (.+?) —$/);
  if (step) els.liveStep.textContent = step[1].toLowerCase();
}

function nowHm() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------ render ------------------------------ */

function renderState(s) {
  if (!s) return;
  if (typeof s.hasCookies === 'boolean') hasCookies = s.hasCookies;
  if (typeof s.running === 'boolean') running = s.running;
  if (s.settings) settings = s.settings;

  // pills
  els.pillSession.innerHTML = '<i class="dot"></i>' + (hasCookies ? 'Sessão: OK' : 'Sessão: ausente');
  els.pillSession.className = 'pill ' + (hasCookies ? 'pill-on' : 'pill-off');
  els.pillAuto.innerHTML = '<i class="dot"></i>' + (settings?.autoRun ? `Auto: ${settings.dailyTime}` : 'Auto: desligada');
  els.pillAuto.className = 'pill' + (settings?.autoRun ? ' pill-on' : '');

  // card de sessão
  els.cardSession.classList.toggle('configured', hasCookies);
  els.cardSession.classList.toggle('need-setup', !hasCookies);
  els.sessionDone.hidden = !hasCookies;
  els.stepBadge.hidden = hasCookies;
  els.sessionStatus.textContent = hasCookies ? 'configurada' : 'não configurada';
  els.sessionStatus.className = 'badge ' + (hasCookies ? 'badge-on' : 'badge-off');
  if (hasCookies && lastVerify) {
    els.sessionDetail.textContent = lastVerify.ok
      ? `última verificação: ${fmt(lastVerify.availablePoints)} pontos · ${lastVerify.when}`
      : `última verificação falhou · ${lastVerify.when}`;
  }

  // inputs de ajustes
  if (settings) {
    els.inpTime.value = settings.dailyTime || '07:30';
    els.chkAutorun.checked = !!settings.autoRun;
    els.inpSearches.value = settings.searchCount ?? 10;
    els.inpDwell.value = Math.round((settings.dwellMs ?? 9000) / 1000);
  }
  renderNextRun();

  // última execução
  const last = s.lastRun;
  if (last) {
    const d = new Date(last.iso || Date.now());
    const sameDay = d.toDateString() === new Date().toDateString();
    els.statLast.textContent =
      (sameDay ? 'hoje às ' : d.toLocaleDateString('pt-BR') + ' às ') +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (last.gained != null) els.statGained.textContent = (last.gained > 0 ? '+' : '') + fmt(last.gained);
    if (last.after != null) els.statBalance.textContent = fmt(last.after);
    showResult(last);
  }

  if (Array.isArray(s.history)) renderHistory(s.history);
  setRunningUI();
}

function renderNextRun() {
  if (!settings || !settings.autoRun) {
    els.statNext.textContent = 'manual';
    els.statNextHint.textContent = 'clique no botão quando quiser';
    return;
  }
  const [h, m] = (settings.dailyTime || '07:30').split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const sameDay = target.toDateString() === now.toDateString();
  els.statNext.textContent = (sameDay ? 'hoje às ' : 'amanhã às ') + target.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  els.statNextHint.textContent = 'agendado automaticamente';
}

function showResult(last) {
  const ok = last.status === 'success';
  const d = new Date(last.iso || Date.now());
  const when = (d.toDateString() === new Date().toDateString() ? 'hoje às ' : d.toLocaleDateString('pt-BR') + ' às ') +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const mins = Math.round((last.durationMs || 0) / 60000);

  els.cardResult.hidden = false;
  els.cardResult.classList.toggle('fail', !ok);
  els.resultIcon.textContent = ok ? '✓' : '!';
  els.resultTitle.textContent = ok ? 'Execução concluída' : 'Execução falhou';
  els.resultDetail.textContent = ok
    ? `+${fmt(last.gained)} pontos em ${mins < 1 ? 'menos de 1 min' : mins + ' min'} · ${when}` +
      (last.steps?.filter((x) => x.status === 'skip').length ? ` · ${last.steps.filter((x) => x.status === 'skip').length} tarefa(s) já estava(m) completa(s)` : '')
    : last.error || 'erro desconhecido';

  if (ok || last.error) {
    els.resultShot.hidden = false;
    fetch('/api/screens').then((r) => r.json()).then((j) => {
      if (j.files && j.files.length) els.resultShot.href = '/api/screens/' + j.files[0];
    }).catch(() => {});
  } else {
    els.resultShot.hidden = true;
  }
}

function setRunningUI() {
  els.btnRun.disabled = running || !hasCookies;
  els.cardLive.classList.toggle('done', !running);
  els.liveStatus.innerHTML = running
    ? '<i class="dot pulse"></i>executando…'
    : '<i class="dot"></i>concluída';
  els.liveStatus.className = 'badge ' + (running ? 'badge-run' : 'badge-on');
  els.btnSaveCookies.disabled = running;
  els.btnVerify.disabled = running;
}

function renderHistory(history) {
  els.history.innerHTML = '';
  els.histCount.textContent = history.length ? `${history.length} execução(ões)` : '';
  if (!history.length) {
    els.history.innerHTML = '<li class="empty">Sem execuções ainda.</li>';
    return;
  }
  for (const r of history) {
    const li = document.createElement('li');
    const d = new Date(r.iso || Date.now());
    const date = document.createElement('span');
    date.className = 'hist-date';
    date.textContent = `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${r.source === 'cron' ? 'auto' : 'manual'}`;
    const gain = document.createElement('span');
    const g = r.gained;
    gain.className = 'hist-gain ' + (g == null ? 'zero' : g > 0 ? 'plus' : g < 0 ? 'minus' : 'zero');
    gain.textContent = g == null ? '?' : (g > 0 ? '+' : '') + fmt(g);
    const st = document.createElement('span');
    st.className = 'hist-status ' + (r.status === 'success' ? 'ok' : 'fail');
    st.textContent = r.status === 'success' ? 'ok' : 'falhou';
    if (r.error) st.title = r.error;
    li.append(date, gain, st);
    els.history.appendChild(li);
  }
}

/* ------------------------------ verificação ------------------------------ */

async function verifySession() {
  setMsg(els.cookieMsg, 'Verificando sessão…', 'warn');
  els.btnVerify.disabled = true;
  try {
    const res = await fetch('/api/verify');
    const j = await res.json();
    lastVerify = { ok: j.ok, availablePoints: j.availablePoints ?? null, when: nowHm() };
    if (!j.ok) {
      setMsg(els.cookieMsg, j.error || 'Verificação falhou.', 'err');
      return;
    }
    if (j.availablePoints != null) {
      els.statBalance.textContent = fmt(j.availablePoints);
      els.statTasks.textContent = j.dailySetPending;
      els.statTasksHint.textContent = `de ${j.dailySetTotal} pendentes`;
    }
    els.sessionDetail.textContent = `sessão OK — saldo: ${fmt(j.availablePoints)} pontos · ${j.dailySetPending} tarefa(s) pendente(s) hoje`;
    setMsg(els.cookieMsg, 'Pronto! É só clicar em “Executar agora”.', 'ok');
  } finally {
    if (!running) els.btnVerify.disabled = false;
  }
}

/* ------------------------------ ações ------------------------------ */

els.btnRun.addEventListener('click', async () => {
  setMsg(els.runHint, '', '');
  els.runHint.textContent = 'Iniciando…';
  els.runHint.style.color = 'rgba(255,255,255,.85)';
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: els.chkForce.checked })
    });
    const j = await res.json();
    if (!res.ok) {
      els.runHint.textContent = j.error || 'Erro ao iniciar.';
      els.runHint.style.color = '#ffd7d9';
      return;
    }
    els.runHint.textContent = 'Rodando — acompanhe em “Ao vivo”.';
    els.runHint.style.color = '#d3f5e5';
    els.cardLive.hidden = false;
    els.log.innerHTML = '';
    setTimeout(() => els.cardLive.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  } catch (e) {
    els.runHint.textContent = 'Falha de rede: ' + e.message;
    els.runHint.style.color = '#ffd7d9';
  }
});

// salvar + verificar (um clique)
async function saveAndVerify() {
  const value = els.cookieInput.value.trim();
  if (!value) return setMsg(els.cookieMsgSetup, 'Cole os cookies primeiro (passos 1–3 acima).', 'warn');
  setMsg(els.cookieMsgSetup, 'Salvando…', 'warn');
  els.btnSaveCookies.disabled = true;
  try {
    const res = await fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookieHeader: value })
    });
    const j = await res.json();
    if (!res.ok) return setMsg(els.cookieMsgSetup, j.error || 'Erro ao salvar.', 'err');
    hasCookies = true;
    els.cookieInput.value = '';
    renderState({ hasCookies: true });
    await verifySession();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    els.btnSaveCookies.disabled = false;
  }
}

els.btnSaveCookies.addEventListener('click', saveAndVerify);
els.cookieInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveAndVerify();
});

els.btnVerify.addEventListener('click', verifySession);

els.btnChange.addEventListener('click', () => {
  els.cardSession.classList.add('show-setup');
  els.cookieInput.focus();
});

els.btnDelCookies.addEventListener('click', async () => {
  await fetch('/api/cookies', { method: 'DELETE' });
  hasCookies = false;
  lastVerify = null;
  renderState({ hasCookies: false });
});

els.btnClearLog.addEventListener('click', () => { els.log.innerHTML = ''; });

els.btnSaveSettings.addEventListener('click', async () => {
  setMsg(els.settingsMsg, 'Salvando…', 'warn');
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dailyTime: els.inpTime.value,
      autoRun: els.chkAutorun.checked,
      searchCount: Number(els.inpSearches.value),
      dwellMs: Number(els.inpDwell.value) * 1000
    })
  });
  const j = await res.json();
  if (!res.ok) return setMsg(els.settingsMsg, 'Erro ao salvar.', 'err');
  settings = j.settings;
  renderNextRun();
  els.pillAuto.innerHTML = '<i class="dot"></i>' + (j.settings.autoRun ? `Auto: ${j.settings.dailyTime}` : 'Auto: desligada');
  els.pillAuto.className = 'pill' + (j.settings.autoRun ? ' pill-on' : '');
  setMsg(els.settingsMsg, j.settings?.autoRun ? `Ativado — rodará todo dia às ${j.settings.dailyTime}.` : 'Ajustes salvos.', 'ok');
});

/* ------------------------------ websocket ------------------------------ */

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    switch (m.type) {
      case 'hello':
        renderState(m);
        break;
      case 'log':
        addLog(m.level, m.msg);
        break;
      case 'shot':
        els.liveShot.src = 'data:image/jpeg;base64,' + m.data;
        els.liveShot.hidden = false;
        els.screenPlaceholder.style.display = 'none';
        break;
      case 'points':
        if (m.before != null) els.statBalance.textContent = fmt(m.before);
        if (m.after != null) els.statBalance.textContent = fmt(m.after);
        if (m.gained != null) els.statGained.textContent = (m.gained > 0 ? '+' : '') + fmt(m.gained);
        if (m.dailySetPending != null) {
          els.statTasks.textContent = m.dailySetPending;
          els.statTasksHint.textContent = `de ${m.dailySetTotal ?? '?'} pendentes`;
        }
        break;
      case 'run-state':
        running = !!m.running;
        setRunningUI();
        if (m.running) {
          els.cardLive.hidden = false;
          els.cardLive.classList.remove('done');
        }
        if (m.lastRun) renderState({ lastRun: m.lastRun });
        break;
      case 'cookies-saved':
        hasCookies = true;
        break;
    }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => ws.close();
}

/* ------------------------------ boot ------------------------------ */

(async function boot() {
  try {
    const res = await fetch('/api/state');
    renderState(await res.json());
  } catch {
    addLog('warn', 'Sem resposta do servidor ainda — tentando reconectar…');
  }
  connectWS();
})();
