import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_FILES = 40000;
export function isSameOrInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
export async function scanFiles(root, { recursive = false, excludeDirectories = [], onProgress = () => {} } = {}) {
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) throw new Error('Der Quellpfad ist kein Ordner.');
  const files = [];
  const blocked = excludeDirectories.filter(Boolean).map(x => path.resolve(x));
  const queue = [path.resolve(root)];
  let visited = 0;
  while (queue.length) {
    const folder = queue.shift();
    if (blocked.some(x => isSameOrInside(folder, x))) continue;
    const entries = await fs.readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue; // never follow junctions/symlinks
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (recursive) queue.push(fullPath);
      } else if (entry.isFile()) {
        try {
          const info = await fs.stat(fullPath);
          files.push({ path: fullPath, name: entry.name, size: info.size, mtimeMs: info.mtimeMs });
          if (files.length >= MAX_FILES) throw Object.assign(new Error(`Maximal ${MAX_FILES.toLocaleString('de-DE')} Dateien pro Scan. Bitte einen kleineren Ordner wählen.`), { code: 'LIMIT' });
        } catch (e) { if (e.code === 'LIMIT') throw e; if (e.code !== 'ENOENT' && e.code !== 'EACCES') throw e; }
      }
    }
    visited++;
    if (visited % 5 === 0) onProgress({ phase: 'scan', processed: files.length, message: `${files.length} Dateien gefunden` });
  }
  return files;
}
