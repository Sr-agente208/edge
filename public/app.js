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
  btnRun: $('#btn-run'),
  chkForce: $('#chk-force'),
  runHint: $('#run-hint'),
  cardSession: $('#card-session'),
  sessionStatus: $('#session-status'),
  sessionDone: $('#session-done'),
  sessionDetail: $('#session-detail'),
  sessionSetup: $('#session-setup'),
  btnVerify: $('#btn-verify'),
  btnChange: $('#btn-change'),
  btnDelCookies: $('#btn-del-cookies'),
  btnSaveCookies: $('#btn-save-cookies'),
  cookieInput: $('#cookie-input'),
  cookieMsg: $('#cookie-msg'),
  cardLive: $('#card-live'),
  liveStatus: $('#live-status'),
  liveShot: $('#live-shot'),
  screenPlaceholder: $('#screen-placeholder'),
  log: $('#log'),
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
let lastVerify = null; // {ok, availablePoints, when}
let ws = null;

/* ------------------------------ helpers ------------------------------ */

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(n));

function setMsg(el, text, cls) {
  el.textContent = text || '';
  el.className = 'msg' + (cls ? ' ' + cls : '');
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
  while (els.log.children.length > 400) els.log.removeChild(els.log.firstChild);
  els.log.scrollTop = els.log.scrollHeight;
}

/* ------------------------------ render ------------------------------ */

function renderState(s) {
  if (!s) return;
  if (typeof s.hasCookies === 'boolean') hasCookies = s.hasCookies;
  if (typeof s.running === 'boolean') running = s.running;

  // pills
  els.pillSession.textContent = hasCookies ? 'Sessão: OK' : 'Sessão: ausente';
  els.pillSession.className = 'pill ' + (hasCookies ? 'pill-on' : 'pill-off');
  els.pillAuto.textContent = s.settings?.autoRun ? `Auto: ${s.settings.dailyTime}` : 'Auto: desligada';

  // card de sessão
  els.cardSession.classList.toggle('configured', hasCookies);
  els.sessionDone.hidden = !hasCookies;
  els.sessionStatus.textContent = hasCookies ? 'configurada' : 'não configurada';
  els.sessionStatus.className = 'badge ' + (hasCookies ? 'badge-on' : 'badge-off');
  if (hasCookies && lastVerify) {
    els.sessionDetail.textContent = lastVerify.ok
      ? `Última verificação: ${fmt(lastVerify.availablePoints)} pontos · ${lastVerify.when}`
      : `Última verificação falhou · ${lastVerify.when}`;
  }

  // settings inputs
  if (s.settings) {
    els.inpTime.value = s.settings.dailyTime || '07:30';
    els.chkAutorun.checked = !!s.settings.autoRun;
    els.inpSearches.value = s.settings.searchCount ?? 10;
    els.inpDwell.value = Math.round((s.settings.dwellMs ?? 9000) / 1000);
  }

  // última execução
  const last = s.lastRun;
  if (last) {
    const d = new Date(last.iso || Date.now());
    const sameDay = d.toDateString() === new Date().toDateString();
    els.statLast.textContent =
      (sameDay ? 'hoje às ' : d.toLocaleDateString('pt-BR') + ' às ') +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
      (last.status === 'failed' ? ' · falhou' : '');
    if (last.gained != null) {
      els.statGained.textContent = (last.gained > 0 ? '+' : '') + fmt(last.gained);
    }
    if (last.after != null) {
      els.statBalance.textContent = fmt(last.after);
    }
  }

  if (Array.isArray(s.history)) renderHistory(s.history);
  setRunningUI();
}

function setRunningUI() {
  els.btnRun.disabled = running || !hasCookies;
  els.liveStatus.textContent = running ? 'executando…' : 'concluída';
  els.liveStatus.className = 'badge ' + (running ? 'badge-run' : 'badge-on');
  els.btnSaveCookies.disabled = running;
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

function nowPt() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------ verificação ------------------------------ */

async function verifySession() {
  setMsg(els.cookieMsg, 'Verificando sessão…', 'warn');
  els.btnVerify.disabled = true;
  try {
    const res = await fetch('/api/verify');
    const j = await res.json();
    lastVerify = { ok: j.ok, availablePoints: j.availablePoints ?? null, when: nowPt() };
    if (!j.ok) {
      setMsg(els.cookieMsg, j.error || 'Verificação falhou.', 'err');
      return;
    }
    if (j.availablePoints != null) {
      els.statBalance.textContent = fmt(j.availablePoints);
      els.statTasks.textContent = j.dailySetPending;
      els.statTasksHint.textContent = `de ${j.dailySetTotal} pendentes`;
    }
    els.sessionDetail.textContent = `Sessão OK! Saldo: ${fmt(j.availablePoints)} pontos · ${j.dailySetPending} tarefa(s) pendente(s) hoje.`;
    setMsg(els.cookieMsg, '✓ Tudo certo — é só clicar em “Executar agora”.', 'ok');
  } finally {
    els.btnVerify.disabled = false;
  }
}

/* ------------------------------ ações ------------------------------ */

els.btnRun.addEventListener('click', async () => {
  setMsg(els.runHint, 'Iniciando…', 'warn');
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: els.chkForce.checked })
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(els.runHint, j.error || 'Erro ao iniciar.', 'err');
      return;
    }
    setMsg(els.runHint, 'Executando… acompanhe em “Ao vivo” abaixo.', 'ok');
    els.cardLive.hidden = false;
    els.cardLive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {
    setMsg(els.runHint, 'Falha de rede: ' + e.message, 'err');
  }
});

// salvar + verificar (um clique só)
els.btnSaveCookies.addEventListener('click', async () => {
  const value = els.cookieInput.value.trim();
  if (!value) return setMsg(els.cookieMsg, 'Cole os cookies primeiro (passos 1–3 acima).', 'warn');
  setMsg(els.cookieMsg, 'Salvando…', 'warn');
  els.btnSaveCookies.disabled = true;
  try {
    const res = await fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookieHeader: value })
    });
    const j = await res.json();
    if (!res.ok) return setMsg(els.cookieMsg, j.error || 'Erro ao salvar.', 'err');
    hasCookies = true;
    els.cookieInput.value = '';
    renderState({ hasCookies: true });
    await verifySession();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    els.btnSaveCookies.disabled = false;
  }
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
  setMsg(els.settingsMsg, j.settings?.autoRun ? `✓ Ativado — rodará todo dia às ${j.settings.dailyTime}.` : '✓ Ajustes salvos.', 'ok');
  els.pillAuto.textContent = j.settings.autoRun ? `Auto: ${j.settings.dailyTime}` : 'Auto: desligada';
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
          els.cardLive.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
