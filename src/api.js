import { cookieHeader } from './cookies.js';

export const DASHBOARD_URL = 'https://rewards.bing.com/dashboard';
const USERINFO_URL = 'https://rewards.bing.com/api/getuserinfo';

export const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class SessionExpiredError extends Error {
  constructor(message = 'Sessão inválida ou expirada (cookie desatualizado).') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/**
 * Mescla Set-Cookie da resposta nos cookies guardados (a Microsoft
 * renova os cookies de sessão a cada requisição — é preciso persistir).
 */
function mergeSetCookies(cookies, setCookieLines) {
  if (!Array.isArray(setCookieLines) || !setCookieLines.length) return;
  const byName = new Map(cookies.map((c) => [c.name, c]));
  for (const line of setCookieLines) {
    const first = line.split(';')[0];
    const i = first.indexOf('=');
    if (i <= 0) continue;
    const name = first.slice(0, i).trim();
    const value = first.slice(i + 1).trim();
    const existing = byName.get(name);
    if (value === '' || value === 'deleted') {
      if (existing) {
        cookies.splice(cookies.indexOf(existing), 1);
        byName.delete(name);
      }
    } else if (existing) {
      existing.value = value;
    } else {
      const c = { name, value, domain: '.bing.com', path: '/' };
      cookies.push(c);
      byName.set(name, c);
    }
  }
}

/**
 * Busca os dados do painel (mesma chamada que o site usa):
 * saldo, daily set, punch cards e promoções.
 */
export async function getDashboardData(cookies) {
  const res = await fetch(USERINFO_URL, {
    redirect: 'follow',
    headers: {
      Cookie: cookieHeader(cookies),
      Referer: DASHBOARD_URL,
      Origin: 'https://rewards.bing.com',
      'User-Agent': DESKTOP_UA,
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.6'
    }
  });
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  mergeSetCookies(cookies, setCookies);

  if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
  if (res.redirected && /login|account\.live/i.test(res.url)) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`getuserinfo respondeu HTTP ${res.status}`);

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SessionExpiredError('Resposta não é JSON (provável redirect para login).');
  }
  if (!data || !data.dashboard) throw new SessionExpiredError('Dados do painel ausentes na resposta.');
  return data;
}

/** Data de hoje no fuso America/Sao_Paulo, formato YYYY-MM-DD (usado pelo API do painel). */
export function spToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/** Resumo prático do JSON do painel. */
export function dashboardSummary(data) {
  const d = (data && data.dashboard) || {};
  const userStatus = d.userStatus || {};
  const today = spToday();
  const dailySet = (d.dailySetPromotions && d.dailySetPromotions[today]) || [];
  return {
    availablePoints: typeof userStatus.availablePoints === 'number' ? userStatus.availablePoints : null,
    today,
    dailySetTotal: dailySet.length,
    dailySetPending: dailySet.filter((p) => !p.complete && (p.pointProgressMax || 0) > 0),
    punchCards: Array.isArray(d.punchCards) ? d.punchCards : [],
    morePromotions: Array.isArray(d.morePromotions) ? d.morePromotions : []
  };
}
