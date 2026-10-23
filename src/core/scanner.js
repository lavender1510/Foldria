import fs from 'node:fs/promises';
import path from 'node:path';

export function isSameOrInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function checkAbort(signal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : Object.assign(new Error('Suche abgebrochen.'), { name: 'AbortError' });
}

// Streams directory entries; there is deliberately no global file-count limit.
// Directory errors are reported and skipped, rather than hiding other readable files.
export async function* walkFiles(root, { recursive = false, excludeDirectories = [], signal, onError = () => {} } = {}) {
  const info = await fs.stat(root);
  if (!info.isDirectory()) throw new Error('Der Quellpfad ist kein Ordner.');
  const blocked = excludeDirectories.filter(Boolean).map(x => path.resolve(x));
  const pending = [path.resolve(root)];
  while (pending.length) {
    checkAbort(signal);
    const directory = pending.pop();
    if (blocked.some(x => isSameOrInside(directory, x))) continue;
    try {
      const handle = await fs.opendir(directory);
      try {
        for await (const entry of handle) {
          checkAbort(signal);
          if (entry.isSymbolicLink()) continue; // never follow junctions / symlinks
          const fullPath = path.join(directory, entry.name);
          if (entry.isDirectory()) { if (recursive) pending.push(fullPath); continue; }
          if (!entry.isFile()) continue;
          try {
            const stat = await fs.stat(fullPath);
            if (stat.isFile()) yield { path: fullPath, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
          } catch (error) { onError(error, fullPath); }
        }
      } finally {
        // for-await closes the directory handle; do not close it twice.
      }
    } catch (error) {
      checkAbort(signal);
      onError(error, directory);
    }
  }
}

// Preview/sorting retains the array API; duplicate scanning consumes walkFiles
// directly so it need not accumulate every unique file.
export async function scanFiles(root, { recursive = false, excludeDirectories = [], onProgress = () => {}, signal, onError } = {}) {
  const files = [];
  let lastUpdate = 0;
  for await (const file of walkFiles(root, { recursive, excludeDirectories, signal, onError })) {
    files.push(file);
    if (Date.now() - lastUpdate > 150) {
      onProgress({ phase: 'scan', scanned: files.length, processed: files.length, message: `${files.length.toLocaleString('de-DE')} Dateien gefunden` });
      lastUpdate = Date.now();
    }
  }
  onProgress({ phase: 'scan', scanned: files.length, processed: files.length, message: `${files.length.toLocaleString('de-DE')} Dateien gefunden` });
  return files;
}
