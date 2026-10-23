import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanFiles } from '../src/core/scanner.js';
import { findDuplicates } from '../src/core/duplicates.js';

const temporary = async fn => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'foldria-scale-'));
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
};

test('duplicate scanning can be cancelled without returning partial results', async () => temporary(async root => {
  for (let i = 0; i < 100; i++) await fs.writeFile(path.join(root, `test-${i}.bin`), 'equal');
  const ctrl = new AbortController();
  await assert.rejects(
    findDuplicates(root, { signal: ctrl.signal, onProgress: p => { if (p.phase === 'scan' && p.scanned > 0) ctrl.abort(); } }),
    error => error.name === 'AbortError'
  );
}));

test('scans more than 40,000 files and finds an exact matching pair', { skip: process.env.FOLDRIA_LARGE_TEST !== '1' }, async () => temporary(async root => {
  const n = 40010;
  for (let i = 0; i < n; i += 100) {
    await Promise.all(Array.from({ length: Math.min(100, n - i) }, (_, j) => {
      const k = i + j;
      return fs.writeFile(path.join(root, `record-${k}.txt`), `entry:${String(k).padStart(6, '0')}`);
    }));
  }
  await fs.copyFile(path.join(root, 'record-0.txt'), path.join(root, 'copy-of-zero.txt'));
  const all = await scanFiles(root);
  assert.equal(all.length, n + 1);
  const events = [];
  const result = await findDuplicates(root, { concurrency: 6, onProgress: p => { if (events.length < 15) events.push(p); } });
  assert.equal(result.scanned, n + 1);
  assert.equal(result.groups.length, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.errors, 0);
  assert.ok(events.some(p => p.phase === 'scan'));
}));
