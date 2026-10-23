import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { Storage } from './core/storage.js';
import { createPreview, runPreview, undoRun } from './core/organizer.js';
import { findDuplicates, checkTrashSelection, revalidateDuplicate } from './core/duplicates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow; let storage; let previewCache = null; let duplicatesCache = null; let busy = false; let duplicateController = null;
function sendProgress(info) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('task:progress', info); }
async function task(callback) {
  if (busy) throw new Error('Es läuft bereits ein Vorgang.');
  busy = true;
  try { return await callback(); }
  finally { busy = false; sendProgress({ phase: 'idle', processed: 0, message: '' }); }
}
function registerHandlers() {
  ipcMain.handle('folders:select', async (_event, type) => {
    if (busy) throw new Error('Bitte erst den laufenden Vorgang abschließen.');
    const result = await dialog.showOpenDialog(mainWindow, { title: type === 'destination' ? 'Zielordner auswählen' : 'Quellordner auswählen', properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('settings:get', async () => storage.getSettings());
  ipcMain.handle('settings:save', async (_event, payload) => { if (busy) throw new Error('Während eines Vorgangs können keine Einstellungen geändert werden.'); previewCache = null; duplicatesCache = null; return storage.setSettings(payload); });
  ipcMain.handle('preview:create', async () => task(async () => {
    const s = await storage.getSettings();
    previewCache = await createPreview({ source: s.source, destination: s.sameFolder ? s.source : s.destination, recursive: s.recursive, rules: s.rules, onProgress: sendProgress });
    return previewCache;
  }));
  ipcMain.handle('sort:run', async (_event, previewId) => task(async () => {
    if (!previewCache || previewCache.id !== previewId) throw new Error('Vorschau nicht mehr aktuell. Bitte neu scannen.');
    if (Date.now() - previewCache.createdAt > 1000 * 60 * 30) throw new Error('Die Vorschau ist älter als 30 Minuten. Bitte neu scannen.');
    const current = previewCache; previewCache = null; duplicatesCache = null;
    const result = await runPreview(current, { onProgress: sendProgress });
    if (result.moved.length || result.errors.length) await storage.addHistory(result);
    return result;
  }));
  ipcMain.handle('duplicates:scan', async () => task(async () => {
    const s = await storage.getSettings();
    if (!s.source) throw new Error('Bitte zuerst einen Quellordner auswählen.');
    duplicateController = new AbortController();
    duplicatesCache = null;
    try {
      duplicatesCache = await findDuplicates(s.source, { onProgress: sendProgress, signal: duplicateController.signal, concurrency: s.duplicateWorkers });
      return duplicatesCache;
    } finally { duplicateController = null; }
  }));
  ipcMain.handle('duplicates:cancel', () => {
    if (!duplicateController) return false;
    duplicateController.abort();
    return true;
  });
  ipcMain.handle('duplicates:trash', async (_event, scanId, fileIds) => task(async () => {
    if (!duplicatesCache || duplicatesCache.scanId !== scanId) throw new Error('Duplikatsuche ist nicht mehr aktuell.');
    if (!Array.isArray(fileIds) || fileIds.length > 250000) throw new Error('Ungültige Dateiauswahl.');
    const chosen = checkTrashSelection(duplicatesCache, fileIds);
    const selected = new Set(fileIds);
    const allowedIds = new Set();
    const completed = []; const errors = [];
    // A candidate is only removed if a verified, non-selected copy STILL exists.
    for (const group of duplicatesCache.groups) {
      const requests = group.files.filter(f => selected.has(f.id));
      if (!requests.length) continue;
      let survivorAvailable = false;
      for (const keep of group.files.filter(f => !selected.has(f.id))) {
        try { await revalidateDuplicate(keep); survivorAvailable = true; break; } catch { /* try another keeper */ }
      }
      if (!survivorAvailable) {
        for (const file of requests) errors.push({ name: file.name, error: 'Keine unveränderte Kopie zum Behalten gefunden. Datei bleibt erhalten.' });
      } else for (const file of requests) allowedIds.add(file.id);
    }
    for (let i = 0; i < chosen.length; i++) {
      const file = chosen[i];
      if (allowedIds.has(file.id)) {
        try { await revalidateDuplicate(file); await shell.trashItem(file.path); completed.push(file.id); }
        catch (e) { errors.push({ name: file.name, error: e.message }); }
      }
      sendProgress({ phase: 'trash', processed: i + 1, total: chosen.length, message: `In den Papierkorb · ${i + 1}/${chosen.length}` });
    }
    duplicatesCache = null;
    return { trashed: completed.length, errors };
  }));
  ipcMain.handle('history:list', async () => storage.history());
  ipcMain.handle('history:undo', async (_event, id) => task(async () => {
    const history = await storage.history();
    const item = history.find(x => x.id === id);
    if (!item || item.undone) throw new Error('Vorgang nicht vorhanden oder bereits rückgängig gemacht.');
    const result = await undoRun(item, { onProgress: sendProgress });
    item.moved = result.remaining;
    item.undone = item.moved.length === 0;
    item.restored = (item.restored || 0) + result.restored;
    await storage.saveHistory(history);
    previewCache = null; duplicatesCache = null;
    return result;
  }));
  ipcMain.handle('file:reveal', async (_event, filePath) => {
    const settings = await storage.getSettings();
    const allowed = [settings.source, settings.sameFolder ? settings.source : settings.destination].filter(Boolean).some(root => {
      const rel = path.relative(path.resolve(root), path.resolve(String(filePath || '')));
      return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
    });
    if (!allowed) throw new Error('Pfad liegt außerhalb der gewählten Ordner.');
    const info = await fs.stat(filePath);
    if (info.isDirectory()) return shell.openPath(filePath);
    shell.showItemInFolder(filePath);
    return true;
  });
  ipcMain.handle('report:save', async (_event, csv) => {
    if (typeof csv !== 'string' || csv.length > 15000000) throw new Error('Bericht zu groß.');
    const save = await dialog.showSaveDialog(mainWindow, { title: 'CSV-Bericht speichern', defaultPath: 'Foldria-Bericht.csv', filters: [{ name: 'CSV-Dateien', extensions: ['csv'] }] });
    if (save.canceled || !save.filePath) return false;
    await fs.writeFile(save.filePath, '\ufeff' + csv, 'utf8');
    return true;
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1020, minHeight: 680, backgroundColor: '#191d21', title: 'Foldria', show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
app.whenReady().then(() => { nativeTheme.themeSource = 'system'; storage = new Storage(app.getPath('userData')); registerHandlers(); createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
