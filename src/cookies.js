import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, ensureDirs } from './state.js';

const COOKIE_FILE = path.join(DATA_DIR, 'cookies.json');

/**
 * Converte o cabeçalho "cookie" copiado do navegador
 * (ex.: "MUID=abc; _SSSID=xyz; ...") em lista de cookies.
 */
export function parseCookieHeader(header) {
  return String(header || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf('=');
      if (i <= 0) return null;
      return { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim() };
    })
    .filter(Boolean);
}

export function saveCookies(header) {
  const pairs = parseCookieHeader(header);
  if (!pairs.length) {
    throw new Error('Nenhum cookie encontrado. Cole o valor COMPLETO do cabeçalho "cookie" (ex.: MUID=...; _SSSID=...; ...).');
  }
  const cookies = pairs.map((p) => ({ ...p, domain: '.bing.com', path: '/' }));
  ensureDirs();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify({ savedAt: new Date().toISOString(), cookies }, null, 2));
  return cookies.length;
}

export function saveCookieStore(cookies) {
  ensureDirs();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify({ savedAt: new Date().toISOString(), cookies }, null, 2));
}

export function loadCookies() {
  try {
    const data = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    return Array.isArray(data.cookies) && data.cookies.length ? data.cookies : null;
  } catch {
    return null;
  }
}

export function deleteCookies() {
  try {
    fs.unlinkSync(COOKIE_FILE);
  } catch {
    /* já removido */
  }
}

export function hasCookies() {
  return loadCookies() !== null;
}

export function cookieHeader(cookies) {
  return (cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
}
