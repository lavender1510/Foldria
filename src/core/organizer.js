import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ruleForFile, cleanRules } from './rules.js';
import { scanFiles, isSameOrInside } from './scanner.js';

async function exists(file) { try { await fs.access(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
export async function uniqueDestination(target, reserved = new Set()) {
  const parsed = path.parse(target);
  let candidate = target;
  let iteration = 2;
  while (reserved.has(candidate.toLowerCase()) || await exists(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name} (${iteration})${parsed.ext}`);
    iteration++;
    if (iteration > 100000) throw new Error('Zu viele Namenskonflikte.');
  }
  reserved.add(candidate.toLowerCase());
  return candidate;
}

export async function createPreview({ source, destination, recursive, rules, onProgress = () => {} }) {
  if (!source || !destination) throw new Error('Bitte einen Quell- und Zielordner auswählen.');
  const cleaned = cleanRules(rules);
  const resolvedSource = path.resolve(source);
  const resolvedDestination = path.resolve(destination);
  const excluded = resolvedSource !== resolvedDestination && isSameOrInside(resolvedDestination, resolvedSource) ? [resolvedDestination] : [];
  const files = await scanFiles(resolvedSource, { recursive, excludeDirectories: excluded, onProgress });
  const reservations = new Set();
  const operations = [];
  let skipped = 0;
  let collisions = 0;
  for (const file of files) {
    const rule = ruleForFile(file.path, cleaned);
    if (!rule) { skipped++; continue; }
    const planned = path.resolve(resolvedDestination, rule.folder, file.name);
    if (!isSameOrInside(planned, resolvedDestination)) throw new Error('Ungültiger Zielpfad.');
    if (path.resolve(file.path).toLowerCase() === planned.toLowerCase()) { skipped++; continue; }
    const to = await uniqueDestination(planned, reservations);
    if (to !== planned) collisions++;
    operations.push({ from: file.path, to, name: file.name, size: file.size, mtimeMs: file.mtimeMs, ruleName: rule.name, ruleColor: rule.color, renamed: to !== planned, status: 'ready' });
  }
  return { id: crypto.randomUUID(), createdAt: Date.now(), source: resolvedSource, destination: resolvedDestination, operations, found: files.length, skipped, collisions, bytes: operations.reduce((a, x) => a + x.size, 0) };
}

async function safelyMove(from, to, expected = {}) {
  const sourceStat = await fs.lstat(from);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('Quelldatei ist keine reguläre Datei.');
  if (expected.size !== undefined && sourceStat.size !== expected.size) throw new Error('Quelldatei wurde seit dem Scan verändert (Größe).');
  if (expected.mtimeMs !== undefined && Math.abs(sourceStat.mtimeMs - expected.mtimeMs) > 2) throw new Error('Quelldatei wurde seit dem Scan verändert (Datum).');
  await fs.mkdir(path.dirname(to), { recursive: true });
  // COPYFILE_EXCL prevents overwriting existing files even with races.
  await fs.copyFile(from, to, (await import('node:fs')).constants.COPYFILE_EXCL);
  let done = false;
  try {
    const copied = await fs.stat(to);
    const latest = await fs.stat(from);
    if (copied.size !== sourceStat.size || latest.size !== sourceStat.size || Math.abs(latest.mtimeMs - sourceStat.mtimeMs) > 2) throw new Error('Datei wurde während des Kopierens verändert; Original bleibt erhalten.');
    await fs.utimes(to, sourceStat.atime, sourceStat.mtime).catch(() => {});
    await fs.unlink(from);
    done = true;
  } finally {
    if (!done) await fs.unlink(to).catch(() => {});
  }
}
export async function runPreview(preview, { onProgress = () => {} } = {}) {
  const result = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), source: preview.source, destination: preview.destination, moved: [], errors: [], total: preview.operations.length, undone: false };
  for (let i = 0; i < preview.operations.length; i++) {
    const op = preview.operations[i];
    try {
      await safelyMove(op.from, op.to, { size: op.size, mtimeMs: op.mtimeMs });
      result.moved.push({ from: op.from, to: op.to, size: op.size });
    } catch (error) {
      result.errors.push({ name: op.name, error: error.code === 'EEXIST' ? 'Zieldatei existiert bereits, übersprungen.' : error.message });
    }
    if (i % 5 === 0 || i === preview.operations.length - 1) onProgress({ phase: 'move', processed: i + 1, total: preview.operations.length, message: `Dateien sortieren · ${i + 1}/${preview.operations.length}` });
  }
  return result;
}
export async function undoRun(record, { onProgress = () => {} } = {}) {
  let restored = 0;
  const errors = [];
  const items = [...record.moved].reverse();
  const pending = [];
  for (let i = 0; i < items.length; i++) {
    const op = items[i];
    try { await safelyMove(op.to, op.from, { size: op.size }); restored++; }
    catch (e) { errors.push({ name: path.basename(op.to), error: e.code === 'EEXIST' ? 'Ursprungsdatei existiert bereits.' : e.message }); pending.push(op); }
    if (i % 5 === 0 || i === items.length - 1) onProgress({ phase: 'undo', processed: i + 1, total: items.length, message: `Wiederherstellen · ${i + 1}/${items.length}` });
  }
  return { restored, errors, remaining: pending.reverse() };
}
