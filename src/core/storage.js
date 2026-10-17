import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_RULES, cleanRules } from './rules.js';

export function defaults() {
  return { source: '', destination: '', sameFolder: true, recursive: false, theme: 'dark', rules: structuredClone(DEFAULT_RULES) };
}
export class Storage {
  constructor(directory) { this.dir = directory; this.settingsPath = path.join(directory, 'settings.json'); this.historyPath = path.join(directory, 'history.json'); }
  async readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
  async writeJson(file, data) {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    try { await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8'); await fs.rename(tmp, file); }
    finally { await fs.unlink(tmp).catch(() => {}); }
  }
  async getSettings() { const current = await this.readJson(this.settingsPath, defaults()); return { ...defaults(), ...current, rules: cleanRules(current.rules || DEFAULT_RULES) }; }
  async setSettings(value) {
    const existing = await this.getSettings();
    const safe = { ...existing, source: String(value.source || '').slice(0, 2000), destination: String(value.destination || '').slice(0, 2000), sameFolder: !!value.sameFolder, recursive: !!value.recursive, theme: value.theme === 'light' ? 'light' : 'dark', rules: cleanRules(value.rules) };
    await this.writeJson(this.settingsPath, safe); return safe;
  }
  async history() { return this.readJson(this.historyPath, []); }
  async saveHistory(history) { await this.writeJson(this.historyPath, history.slice(0, 35)); }
  async addHistory(record) { const history = await this.history(); history.unshift(record); await this.saveHistory(history); }
}
