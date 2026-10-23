import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { walkFiles } from './scanner.js';

const CACHE_CAPACITY = 12000;
const fingerprints = new Map();
const hashes = new Map();
const SAMPLE_BYTES = 64 * 1024;
const ABORT = () => Object.assign(new Error('Duplikatsuche abgebrochen.'), { name: 'AbortError' });
function checkAbort(signal) { if (signal?.aborted) throw ABORT(); }
function cacheGet(map, key) {
  if (!map.has(key)) return undefined;
  const value = map.get(key); map.delete(key); map.set(key, value);
  return value;
}
function cacheSet(map, key, value) {
  map.delete(key); map.set(key, value);
  if (map.size > CACHE_CAPACITY) map.delete(map.keys().next().value);
}
function cacheKey(file) { return `${file.path}\0${file.size}\0${file.mtimeMs}\0${file.ctimeMs}`; }

export async function hashFile(file, { signal } = {}) {
  checkAbort(signal);
  const hash = crypto.createHash('sha256');
  const stream = createReadStream(file, { highWaterMark: 256 * 1024, signal });
  for await (const chunk of stream) hash.update(chunk);
  checkAbort(signal);
  return hash.digest('hex');
}

async function sampleHash(file, signal) {
  checkAbort(signal);
  if (file.size === 0) return 'empty';
  const handle = await fs.open(file.path, 'r');
  try {
    const buffer = Buffer.allocUnsafe(Math.min(SAMPLE_BYTES, file.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    checkAbort(signal);
    return crypto.createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex');
  } finally { await handle.close(); }
}

async function parallel(items, concurrency, fn, signal) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      checkAbort(signal);
      const item = items[index++];
      await fn(item);
    }
  }));
}

export async function findDuplicates(root, { onProgress = () => {}, signal, concurrency = 4 } = {}) {
  concurrency = Math.max(1, Math.min(8, Math.trunc(Number(concurrency)) || 4));
  const bySize = new Map();
  let scanned = 0, errors = 0, processed = 0, groupsFound = 0;
  let lastUpdate = 0, lastLongNotice = 0;
  const started = Date.now();
  function progress(phase, total, force = false) {
    const now = Date.now();
    if (!force && now - lastUpdate < 180) return;
    lastUpdate = now;
    const slow = now - started >= 30000 && now - lastLongNotice >= 15000;
    if (slow) lastLongNotice = now;
    onProgress({ phase, scanned, processed, total, groups: groupsFound, errors,
      message: phase === 'scan' ? `${scanned.toLocaleString('de-DE')} Dateien erfasst · Ordner werden gelesen` :
        `${processed.toLocaleString('de-DE')} von ${total.toLocaleString('de-DE')} Kandidaten geprüft`,
      note: slow ? 'Große Verzeichnisse oder langsame Laufwerke können mehrere Minuten benötigen. Du kannst die Suche jederzeit abbrechen.' : '' });
  }
  for await (const file of walkFiles(root, { recursive: true, signal, onError: () => { errors++; } })) {
    scanned++;
    const previous = bySize.get(file.size);
    if (!previous) bySize.set(file.size, file);
    else if (Array.isArray(previous)) previous.push(file);
    else bySize.set(file.size, [previous, file]);
    progress('scan');
  }
  progress('scan', undefined, true);
  const candidateSizes = [...bySize.values()].filter(Array.isArray);
  bySize.clear();
  const candidates = candidateSizes.flat();
  // The sample stage avoids reading entire large files with equal sizes but different headers.
  const bySample = new Map();
  let total = candidates.length;
  processed = 0; lastUpdate = 0;
  await parallel(candidates, concurrency, async file => {
    try {
      const key = cacheKey(file);
      let part = cacheGet(fingerprints, key);
      if (part === undefined) { part = await sampleHash(file, signal); cacheSet(fingerprints, key, part); }
      const signature = `${file.size}:${part}`;
      const bucket = bySample.get(signature);
      if (!bucket) bySample.set(signature, file);
      else if (Array.isArray(bucket)) bucket.push(file);
      else bySample.set(signature, [bucket, file]);
    } catch (error) { if (signal?.aborted || error.name === 'AbortError') throw ABORT(); errors++; }
    finally { processed++; progress('sample', total); }
  }, signal);
  candidates.length = 0;
  const fullCandidates = [...bySample.values()].filter(Array.isArray).flat();
  bySample.clear();
  processed = 0; total = fullCandidates.length; lastUpdate = 0;
  const byHash = new Map();
  await parallel(fullCandidates, concurrency, async file => {
    try {
      const before = await fs.stat(file.path);
      if (before.size !== file.size || before.mtimeMs !== file.mtimeMs || before.ctimeMs !== file.ctimeMs) throw new Error('Datei während Suche verändert');
      const key = cacheKey(file);
      let hash = cacheGet(hashes, key);
      if (hash === undefined) { hash = await hashFile(file.path, { signal }); cacheSet(hashes, key, hash); }
      const after = await fs.stat(file.path);
      if (after.size !== file.size || after.mtimeMs !== file.mtimeMs || after.ctimeMs !== file.ctimeMs) throw new Error('Datei während Suche verändert');
      const signature = `${file.size}:${hash}`;
      const bucket = byHash.get(signature);
      if (!bucket) byHash.set(signature, [{ ...file, hash }]);
      else { bucket.push({ ...file, hash }); if (bucket.length === 2) groupsFound++; }
    } catch (error) { if (signal?.aborted || error.name === 'AbortError') throw ABORT(); errors++; }
    finally { processed++; progress('hash', total); }
  }, signal);
  checkAbort(signal);
  const groups = [...byHash.values()].filter(group => group.length > 1).map(files => {
    files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.length - b.path.length || a.path.localeCompare(b.path));
    return { id: crypto.randomUUID(), size: files[0].size, hash: files[0].hash,
      files: files.map((f, index) => ({ ...f, id: crypto.randomUUID(), recommended: index > 0, keep: index === 0 })) };
  }).sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
  groupsFound = groups.length;
  processed = total;
  progress('hash', total, true);
  const saveable = groups.reduce((sum, group) => sum + group.size * (group.files.length - 1), 0);
  return { scanId: crypto.randomUUID(), root: path.resolve(root), scanned, processed: total, errors, groups, duplicates: groups.reduce((sum, group) => sum + group.files.length - 1, 0), saveable };
}

export function checkTrashSelection(scan, fileIds) {
  if (!scan) throw new Error('Bitte zuerst nach Duplikaten suchen.');
  const selected = new Set(fileIds);
  const all = new Map();
  for (const group of scan.groups) {
    const chosen = group.files.filter(f => selected.has(f.id));
    if (chosen.length === group.files.length && chosen.length > 0) throw new Error('Es muss mindestens eine Datei je Duplikatgruppe erhalten bleiben.');
    for (const file of group.files) all.set(file.id, file);
  }
  if (selected.size === 0) throw new Error('Keine Dateien ausgewählt.');
  if ([...selected].some(id => !all.has(id))) throw new Error('Ungültige Dateiauswahl.');
  return [...selected].map(id => all.get(id));
}

export async function revalidateDuplicate(file) {
  const stat = await fs.lstat(file.path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size || Math.abs(stat.mtimeMs - file.mtimeMs) > 2) throw new Error('Datei hat sich seit dem Scan verändert.');
  const hash = await hashFile(file.path); // Always bypass the scan cache before deleting.
  if (hash !== file.hash) throw new Error('Inhalt hat sich seit dem Scan verändert.');
}
