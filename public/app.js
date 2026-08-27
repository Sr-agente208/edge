/* Edge Rewards — painel (2 telas: login + início) */
const $ = (sel) => document.querySelector(sel);

const els = {
  viewLogin: $('#view-login'),
  viewHome: $('#view-home'),

  // login
  cookieInput: $('#cookie-input'),
  btnLogin: $('#btn-login'),
  loginMsg: $('#login-msg'),

  // home
  pillSession: $('#pill-session'),
  statBalance: $('#stat-balance'),
  todayLine: $('#today-line'),
  btnRun: $('#btn-run'),
  runSpinner: $('#run-spinner'),
  runLabel: $('#run-label'),
  runStatus: $('#run-status'),
  chkForce: $('#chk-force'),
  btnVerify: $('#btn-verify'),
  btnLogout: $('#btn-logout'),
  cardResult: $('#card-result'),
  resultIcon: $('#result-icon'),
  resultTitle: $('#result-title'),
  resultDetail: $('#result-detail'),
  resultShot: $('#result-shot'),
  cardLive: $('#card-live'),
  liveStatus: $('#live-status'),
  liveStep: $('#live-step'),
  liveShot: $('#live-shot'),
  screenPlaceholder: $('#screen-placeholder'),
  log: $('#log'),
  lanHint: $('#lan-hint'),
  lanUrl: $('#lan-url'),

  // modais
  modalSettings: $('#modal-settings'),
  modalHistory: $('#modal-history'),
  btnSettings: $('#btn-settings'),
  btnHistory: $('#btn-history'),
  inpTime: $('#inp-time'),
  chkAutorun: $('#chk-autorun'),
  inpSearches: $('#inp-searches'),
  inpDwell: $('#inp-dwell'),
  btnSaveSettings: $('#btn-save-settings'),
  history: $('#history')
};

let hasCookies = false;
let running = false;
let settings = null;
let lastVerify = null; // {ok, availablePoints, dailySetPending, dailySetTotal, when}
let lastRun = null;
let historyList = [];
let runStartTs = null;
let timerId = null;
let ws = null;

// GitHub Pages (ou file://) = sem servidor → modo demonstração
const isStatic = location.hostname.endsWith('.github.io') || location.protocol === 'file:';

function applyStaticMode() {
  if (!isStatic) return;
  const notice = $('#static-notice');
  if (notice) notice.hidden = false;
  els.btnLogin.disabled = true;
  els.cookieInput.disabled = true;
  // blindagem extra: nunca deixa modal "preso" aberto nesse modo (mesmo com CSS em cache antigo)
  document.querySelectorAll('.modal-overlay').forEach((m) => {
    m.hidden = true;
    m.style.display = 'none';
  });
}

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
  while (els.log.children.length > 500) els.log.removeChild(els.log.firstChild);
  els.log.scrollTop = els.log.scrollHeight;

  const step = line.match(/^\[\d{2}:\d{2}:\d{2}\] — (.+?) —$/);
  if (step) {
    els.liveStep.textContent = step[1].toLowerCase();
    if (running) tickRunStatus(step[1]);
  }
}

function hhmm(d) {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------ telas ------------------------------ */

function showView(name) {
  const isLogin = name === 'login';
  els.viewLogin.style.display = isLogin ? 'grid' : 'none';
  els.viewHome.hidden = !isLogin;
  document.title = isLogin ? 'Edge Rewards · Entrar' : 'Edge Rewards';
}

function renderTodayLine() {
  const parts = [];
  if (lastVerify?.ok) {
    parts.push(`${lastVerify.dailySetPending} tarefa(s) pendente(s) hoje`);
  }
  if (lastRun) {
    const d = new Date(lastRun.iso || Date.now());
    const when = d.toDateString() === new Date().toDateString() ? 'hoje às ' + hhmm(d) : d.toLocaleDateString('pt-BR') + ' às ' + hhmm(d);
    parts.push(lastRun.status === 'success' ? `última execução ${when} (+${fmt(lastRun.gained)})` : `última execução ${when} falhou`);
  }
  els.todayLine.textContent = parts.length
    ? parts.join(' · ') + '.'
    : 'Conectado — clique abaixo para fazer as tarefas de hoje.';
}

function renderLanHint(url) {
  if (!url) return;
  els.lanUrl.textContent = url;
  els.lanUrl.href = url;
  els.lanHint.hidden = false;
}

function renderBalance() {
  const bal = lastVerify?.ok ? lastVerify.availablePoints : (lastRun?.after ?? null);
  if (bal != null) els.statBalance.textContent = fmt(bal);
}

/* ------------------------------ execução ------------------------------ */

function tickRunStatus(stage) {
  if (!running || !runStartTs) return;
  const sec = Math.floor((Date.now() - runStartTs) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  els.runStatus.className = 'run-status run';
  els.runStatus.textContent = `Rodando há ${mm}:${ss}${stage ? ' · ' + stage.toLowerCase() : ''}`;
}

function setRunningUI(on) {
  running = on;
  els.btnRun.disabled = on;
  els.runSpinner.hidden = !on;
  els.runLabel.textContent = on ? 'Executando…' : 'Iniciar automação';
  els.cardLive.classList.toggle('done', !on);
  els.liveStatus.innerHTML = on ? '<i class="dot pulse"></i>executando…' : '<i class="dot"></i>concluída';
  els.liveStatus.className = 'badge ' + (on ? 'badge-run' : 'badge-on');
  els.pillSession.innerHTML = on ? '<i class="dot pulse"></i>bot ativo' : '<i class="dot"></i>conectado';

  if (on) {
    runStartTs = Date.now();
    els.log.innerHTML = '';
    els.cardLive.hidden = false;
    els.runStatus.className = 'run-status run';
    els.runStatus.textContent = 'Iniciando…';
    timerId = setInterval(() => tickRunStatus(), 1000);
    setTimeout(() => els.cardLive.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  } else {
    clearInterval(timerId);
  }
}

function showResult(last) {
  const ok = last.status === 'success';
  const d = new Date(last.iso || Date.now());
  const when = (d.toDateString() === new Date().toDateString() ? 'hoje às ' : d.toLocaleDateString('pt-BR') + ' às ') + hhmm(d);
  const mins = Math.round((last.durationMs || 0) / 60000);

  els.cardResult.hidden = false;
  els.cardResult.classList.toggle('fail', !ok);
  els.resultIcon.textContent = ok ? '✓' : '!';
  els.resultTitle.textContent = ok ? 'Execução concluída' : 'Execução falhou';
  els.resultDetail.textContent = ok
    ? `+${fmt(last.gained)} pontos em ${mins < 1 ? 'menos de 1 min' : mins + ' min'} · ${when}`
    : last.error || 'erro desconhecido';

  els.resultShot.hidden = !(ok || last.error);
  if (!els.resultShot.hidden) {
    fetch('/api/screens').then((r) => r.json()).then((j) => {
      if (j.files && j.files.length) els.resultShot.href = '/api/screens/' + j.files[0];
    }).catch(() => {});
  }
}

/* ------------------------------ verificação ------------------------------ */

async function verifySession(showOk = true) {
  const res = await fetch('/api/verify');
  const j = await res.json();
  lastVerify = { ok: j.ok, availablePoints: j.availablePoints ?? null, dailySetPending: j.dailySetPending ?? null, dailySetTotal: j.dailySetTotal ?? null, when: hhmm(new Date()) };
  renderBalance();
  renderTodayLine();
  if (j.ok && showOk) {
    els.statBalance.textContent = fmt(j.availablePoints);
    els.todayLine.textContent = `Saldo: ${fmt(j.availablePoints)} pontos · ${j.dailySetPending} tarefa(s) pendente(s) hoje.`;
  }
  return j;
}

/* ------------------------------ ações ------------------------------ */

// LOGIN: salvar + verificar + entrar
els.btnLogin.addEventListener('click', async () => {
  const value = els.cookieInput.value.trim();
  if (!value) return setMsg(els.loginMsg, 'Cole o cookie do seu navegador primeiro.', 'warn');
  setMsg(els.loginMsg, 'Conectando…', 'warn');
  els.btnLogin.disabled = true;
  try {
    const res = await fetch('/api/cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookieHeader: value })
    });
    const j = await res.json();
    if (!res.ok) return setMsg(els.loginMsg, j.error || 'Erro ao salvar.', 'err');

    setMsg(els.loginMsg, 'Verificando sua conta…', 'warn');
    const v = await verifySession(false);
    if (!v.ok) {
      setMsg(els.loginMsg, v.error || 'Não consegui validar a sessão.', 'err');
      return;
    }
    hasCookies = true;
    els.cookieInput.value = '';
    showView('home');
    renderTodayLine();
    if (lastRun) showResult(lastRun);
    window.scrollTo({ top: 0 });
  } finally {
    els.btnLogin.disabled = false;
  }
});
els.cookieInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) els.btnLogin.click();
});

// INICIAR AUTOMAÇÃO
els.btnRun.addEventListener('click', async () => {
  if (running) return;
  els.runStatus.className = 'run-status';
  els.runStatus.textContent = 'Iniciando…';
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: els.chkForce.checked })
    });
    const j = await res.json();
    if (!res.ok) {
      els.runStatus.className = 'run-status err';
      els.runStatus.textContent = j.error || 'Erro ao iniciar.';
      return;
    }
    setRunningUI(true);
  } catch (e) {
    els.runStatus.className = 'run-status err';
    els.runStatus.textContent = 'Falha de rede: ' + e.message;
  }
});

els.btnVerify.addEventListener('click', async () => {
  els.runStatus.className = 'run-status';
  els.runStatus.textContent = 'Verificando saldo…';
  const v = await verifySession(true);
  if (!v.ok) {
    els.runStatus.className = 'run-status err';
    els.runStatus.textContent = v.error || 'Falha ao verificar.';
  }
});

els.btnLogout.addEventListener('click', async () => {
  await fetch('/api/cookies', { method: 'DELETE' });
  hasCookies = false;
  lastVerify = null;
  showView('login');
});

// MODAIS
function openModal(id) { $(id).hidden = false; }
function closeModal(el) { el.hidden = true; }
els.btnSettings.addEventListener('click', () => {
  if (settings) {
    els.inpTime.value = settings.dailyTime || '07:30';
    els.chkAutorun.checked = !!settings.autoRun;
    els.inpSearches.value = settings.searchCount ?? 10;
    els.inpDwell.value = Math.round((settings.dwellMs ?? 9000) / 1000);
  }
  openModal('#modal-settings');
});
els.btnHistory.addEventListener('click', () => {
  renderHistory();
  openModal('#modal-history');
});
document.querySelectorAll('.modal-overlay').forEach((ov) => {
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-close]')) closeModal(ov);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach((ov) => (ov.hidden = true));
});

els.btnSaveSettings.addEventListener('click', async () => {
  els.btnSaveSettings.disabled = true;
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
  els.btnSaveSettings.disabled = false;
  if (!res.ok) return;
  settings = j.settings;
  els.pillSession.title = settings.autoRun ? `Execução diária às ${settings.dailyTime}` : '';
  closeModal(els.modalSettings);
});

function renderHistory() {
  els.history.innerHTML = '';
  if (!historyList.length) {
    els.history.innerHTML = '<li class="empty">Sem execuções ainda.</li>';
    return;
  }
  for (const r of historyList) {
    const li = document.createElement('li');
    const d = new Date(r.iso || Date.now());
    const date = document.createElement('span');
    date.className = 'hist-date';
    date.textContent = `${d.toLocaleDateString('pt-BR')} ${hhmm(d)} · ${r.source === 'cron' ? 'auto' : 'manual'}`;
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
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    switch (m.type) {
      case 'hello':
        hasCookies = !!m.hasCookies;
        settings = m.settings || settings;
        lastRun = m.lastRun || lastRun;
        historyList = m.history || [];
        renderLanHint(m.lanUrl);
        if (hasCookies) {
          showView('home');
          renderBalance();
          renderTodayLine();
          if (m.lastRun) showResult(m.lastRun);
        } else {
          showView('login');
        }
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
        if (m.dailySetPending != null) {
          lastVerify = { ...(lastVerify || {}), ok: true, dailySetPending: m.dailySetPending, dailySetTotal: m.dailySetTotal, availablePoints: m.before ?? lastVerify?.availablePoints };
          renderTodayLine();
        }
        break;
      case 'run-state':
        setRunningUI(!!m.running);
        if (m.lastRun) {
          lastRun = m.lastRun;
          renderTodayLine();
          renderBalance();
          if (!m.running) {
            const ok = m.lastRun.status === 'success';
            els.runStatus.className = 'run-status ' + (ok ? 'ok' : 'err');
            els.runStatus.textContent = ok
              ? `Concluído: +${fmt(m.lastRun.gained)} pontos`
              : 'Falhou — veja o motivo abaixo.';
            showResult(m.lastRun);
          }
        }
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
  applyStaticMode();
  if (isStatic) {
    showView('login');
    return; // sem servidor: não conecta WebSocket, só mostra a interface + instruções
  }
  try {
    const res = await fetch('/api/state');
    const s = await res.json();
    hasCookies = s.hasCookies;
    settings = s.settings;
    lastRun = s.lastRun;
    historyList = s.history;
    renderLanHint(s.lanUrl);
    showView(hasCookies ? 'home' : 'login');
    if (hasCookies) {
      renderBalance();
      renderTodayLine();
      if (s.lastRun) showResult(s.lastRun);
    }
  } catch {
    /* ws vai reconectar */
  }
  connectWS();
})();
