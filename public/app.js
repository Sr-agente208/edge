/* Edge Rewards — painel (vanilla JS) */
const $ = (sel) => document.querySelector(sel);

const els = {
  badgeCookies: $('#badge-cookies'),
  badgeSchedule: $('#badge-schedule'),
  badgeRunning: $('#badge-running'),
  statBalance: $('#stat-balance'),
  statBalanceHint: $('#stat-balance-hint'),
  statGained: $('#stat-gained'),
  statGainedHint: $('#stat-gained-hint'),
  statTasks: $('#stat-tasks'),
  statTasksHint: $('#stat-tasks-hint'),
  statLast: $('#stat-last'),
  statLastHint: $('#stat-last-hint'),
  btnRun: $('#btn-run'),
  chkForce: $('#chk-force'),
  runHint: $('#run-hint'),
  liveStatus: $('#live-status'),
  liveShot: $('#live-shot'),
  screenPlaceholder: $('#screen-placeholder'),
  log: $('#log'),
  btnClearLog: $('#btn-clear-log'),
  cookieInput: $('#cookie-input'),
  btnSaveCookies: $('#btn-save-cookies'),
  btnVerify: $('#btn-verify'),
  btnDelCookies: $('#btn-del-cookies'),
  cookieMsg: $('#cookie-msg'),
  inpTime: $('#inp-time'),
  chkAutorun: $('#chk-autorun'),
  inpSearches: $('#inp-searches'),
  inpDwell: $('#inp-dwell'),
  btnSaveSettings: $('#btn-save-settings'),
  settingsMsg: $('#settings-msg'),
  history: $('#history')
};

let ws = null;
let running = false;
let hasCookies = false;

/* ------------------------------ helpers ------------------------------ */

const fmt = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-BR').format(n));

function setMsg(el, text, cls) {
  el.textContent = text || '';
  el.className = 'msg' + (cls ? ' ' + cls : '');
}

function addLog(level, line) {
  const div = document.createElement('div');
  div.className = `log-line ${level}`;
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
  hasCookies = !!s.hasCookies;
  running = !!s.running;

  els.badgeCookies.textContent = hasCookies ? 'Cookies: OK' : 'Cookies: ausentes';
  els.badgeCookies.className = 'badge ' + (hasCookies ? 'badge-on' : 'badge-off');
  els.badgeSchedule.textContent =
    s.settings?.autoRun ? `Auto: diário às ${s.settings.dailyTime}` : 'Auto: desativada';
  setRunningUI();

  if (s.settings) {
    els.inpTime.value = s.settings.dailyTime || '07:30';
    els.chkAutorun.checked = !!s.settings.autoRun;
    els.inpSearches.value = s.settings.searchCount ?? 10;
    els.inpDwell.value = Math.round((s.settings.dwellMs ?? 9000) / 1000);
  }

  const last = s.lastRun;
  if (last) {
    const d = new Date(last.iso || Date.now());
    els.statLast.textContent = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    els.statLastHint.textContent = last.status === 'success' ? 'sucesso' : 'falhou';
    if (last.gained != null) {
      els.statGained.textContent = (last.gained > 0 ? '+' : '') + fmt(last.gained);
      els.statGainedHint.textContent = 'pontos';
    }
    if (last.after != null) {
      els.statBalance.textContent = fmt(last.after);
      els.statBalanceHint.textContent = 'pontos (saldo final)';
    }
  }
  renderHistory(s.history || []);
}

function setRunningUI() {
  els.btnRun.disabled = running || !hasCookies;
  els.badgeRunning.classList.toggle('badge-hidden', !running);
  els.badgeRunning.classList.toggle('badge-run', running);
  els.liveStatus.textContent = running ? 'executando…' : 'aguardando execução';
  els.liveStatus.classList.toggle('on', running);
  if (hasCookies && !running && els.runHint.dataset.initialized !== '1') {
    els.runHint.dataset.initialized = '1';
  }
}

function renderHistory(history) {
  els.history.innerHTML = '';
  if (!history.length) {
    els.history.innerHTML = '<li class="muted">Sem execuções ainda.</li>';
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

/* ------------------------------ websocket ------------------------------ */

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => addLog('info', 'Conectado ao servidor.');
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    switch (m.type) {
      case 'hello':
        renderState(m);
        break;
      case 'log':
        addLog(m.level === 'ok' ? 'ok' : m.level, m.msg);
        break;
      case 'shot': {
        els.liveShot.src = 'data:image/jpeg;base64,' + m.data;
        els.liveShot.hidden = false;
        els.screenPlaceholder.style.display = 'none';
        break;
      }
      case 'points':
        if (m.before != null) {
          els.statBalance.textContent = fmt(m.before);
          els.statBalanceHint.textContent = 'pontos (início)';
        }
        if (m.after != null) {
          els.statBalance.textContent = fmt(m.after);
          els.statBalanceHint.textContent = 'pontos (saldo final)';
        }
        if (m.gained != null) {
          els.statGained.textContent = (m.gained > 0 ? '+' : '') + fmt(m.gained);
          els.statGainedHint.textContent = 'pontos nesta execução';
        }
        if (m.dailySetPending != null) {
          els.statTasks.textContent = m.dailySetPending;
          els.statTasksHint.textContent = `de ${m.dailySetTotal ?? '?'} pendentes`;
        }
        break;
      case 'run-state':
        running = !!m.running;
        setRunningUI();
        if (m.lastRun) renderState({ lastRun: m.lastRun });
        if (!m.running) addLog('info', 'Execução encerrada.');
        break;
      case 'cookies-saved':
        hasCookies = true;
        renderState({ hasCookies: true });
        break;
    }
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
  ws.onerror = () => ws.close();
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
    setMsg(els.runHint, j.message || 'Iniciado.', 'ok');
    els.btnRun.disabled = true;
  } catch (e) {
    setMsg(els.runHint, 'Falha de rede: ' + e.message, 'err');
  }
});

els.btnClearLog.addEventListener('click', () => {
  els.log.innerHTML = '';
});

els.btnSaveCookies.addEventListener('click', async () => {
  setMsg(els.cookieMsg, 'Salvando…', 'warn');
  const res = await fetch('/api/cookies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookieHeader: els.cookieInput.value })
  });
  const j = await res.json();
  if (!res.ok) return setMsg(els.cookieMsg, j.error || 'Erro ao salvar.', 'err');
  hasCookies = true;
  renderState({ hasCookies: true });
  setMsg(els.cookieMsg, `${j.count} cookies salvos. Clique em "Verificar" para testar a sessão.`, 'ok');
  els.cookieInput.value = '';
});

els.btnDelCookies.addEventListener('click', async () => {
  await fetch('/api/cookies', { method: 'DELETE' });
  hasCookies = false;
  renderState({ hasCookies: false });
  setMsg(els.cookieMsg, 'Cookies removidos.', 'ok');
});

els.btnVerify.addEventListener('click', async () => {
  setMsg(els.cookieMsg, 'Verificando sessão…', 'warn');
  const res = await fetch('/api/verify');
  const j = await res.json();
  if (!res.ok) return setMsg(els.cookieMsg, j.error || 'Verificação falhou.', 'err');
  if (j.availablePoints != null) {
    els.statBalance.textContent = fmt(j.availablePoints);
    els.statBalanceHint.textContent = 'pontos (saldo agora)';
    els.statTasks.textContent = j.dailySetPending;
    els.statTasksHint.textContent = `de ${j.dailySetTotal} pendentes`;
  }
  setMsg(els.cookieMsg, `Sessão OK! Saldo: ${fmt(j.availablePoints)} pontos · ${j.dailySetPending} tarefa(s) pendente(s) hoje.`, 'ok');
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
  setMsg(els.settingsMsg, j.settings?.autoRun ? 'Ajustes salvos. Execução diária ativada.' : 'Ajustes salvos.', 'ok');
  els.badgeSchedule.textContent = j.settings.autoRun ? `Auto: diário às ${j.settings.dailyTime}` : 'Auto: desativada';
});

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
