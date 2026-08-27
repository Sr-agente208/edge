import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.join(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const SCREEN_DIR = path.join(DATA_DIR, 'screenshots');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export const defaultState = {
  settings: {
    dailyTime: '07:30', // horário (America/Sao_Paulo) da execução automática
    autoRun: false,
    searchCount: 10, // quantas buscas fazer no Bing
    dwellMs: 9000 // tempo mínimo "lendo" páginas de tarefa
  },
  lastRun: null,
  history: []
};

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
}

export function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      ...defaultState,
      ...raw,
      settings: { ...defaultState.settings, ...(raw.settings || {}) },
      history: Array.isArray(raw.history) ? raw.history : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state) {
  ensureDirs();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function screenFile(name) {
  const safe = String(name).replace(/[^a-z0-9-]/gi, '_').slice(0, 60);
  return path.join(SCREEN_DIR, `${Date.now()}-${safe}.png`);
}
