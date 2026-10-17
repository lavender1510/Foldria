import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { scanFiles } from './scanner.js';

export async function hashFile(file) {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
export async function findDuplicates(root, { onProgress = () => {} } = {}) {
  const files = await scanFiles(root, { recursive: true, onProgress });
  const bySize = new Map();
  for (const file of files) {
    const bucket = bySize.get(file.size) || [];
    bucket.push(file);
    bySize.set(file.size, bucket);
  }
  const candidates = [...bySize.values()].filter(group => group.length > 1).flat();
  const bySignature = new Map();
  let errors = 0;
  for (let i = 0; i < candidates.length; i++) {
    const file = candidates[i];
    try {
      const hash = await hashFile(file.path);
      const key = `${file.size}:${hash}`;
      if (!bySignature.has(key)) bySignature.set(key, []);
      bySignature.get(key).push({ ...file, hash });
    } catch { errors++; }
    if (i % 3 === 0 || i === candidates.length - 1) onProgress({ phase: 'hash', processed: i + 1, total: candidates.length, message: `Inhalte vergleichen · ${i + 1}/${candidates.length}` });
  }
  const groups = [...bySignature.values()].filter(group => group.length > 1).map(files => {
    // Prefer older files, then shorter paths, then alphabetical. Suggested files are exact SHA-256 matches.
    files.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.length - b.path.length || a.path.localeCompare(b.path));
    return { id: crypto.randomUUID(), size: files[0].size, hash: files[0].hash, files: files.map((f, index) => ({ ...f, id: crypto.randomUUID(), recommended: index > 0, keep: index === 0 })) };
  }).sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
  const saveable = groups.reduce((sum, group) => sum + group.size * (group.files.length - 1), 0);
  return { scanId: crypto.randomUUID(), root: path.resolve(root), scanned: files.length, errors, groups, duplicates: groups.reduce((sum, group) => sum + group.files.length - 1, 0), saveable };
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
  const hash = await hashFile(file.path);
  if (hash !== file.hash) throw new Error('Inhalt hat sich seit dem Scan verändert.');
}
