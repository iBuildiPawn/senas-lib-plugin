import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMeta, mergeStale, writeMetaAtomic } from './meta.mjs';

function setup(initial) {
  const root = mkdtempSync(join(tmpdir(), 'tl-meta-'));
  mkdirSync(join(root, '.librarian'));
  const path = join(root, '.librarian', '.meta.json');
  writeFileSync(path, JSON.stringify(initial));
  return { root, path };
}

test('readMeta returns parsed object', () => {
  const { root, path } = setup({ version: 1, last_updated_sha: 'abc' });
  try {
    const m = readMeta(path);
    assert.equal(m.last_updated_sha, 'abc');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('readMeta defaults stale_units to [] when missing', () => {
  const { root, path } = setup({ version: 1, last_updated_sha: 'abc' });
  try {
    const m = readMeta(path);
    assert.deepEqual(m.stale_units, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mergeStale adds new entries when unit not present', () => {
  const meta = { stale_units: [] };
  const updated = mergeStale(meta, [
    { name: 'Order-Server', since_sha: 'aaa', changed_files: ['src/o.ts'] },
  ]);
  assert.equal(updated.stale_units.length, 1);
  assert.equal(updated.stale_units[0].name, 'Order-Server');
});

test('mergeStale unions changed_files and keeps earlier since_sha', () => {
  const meta = {
    stale_units: [
      { name: 'Order-Server', since_sha: 'aaa', changed_files: ['src/a.ts'] },
    ],
  };
  const updated = mergeStale(meta, [
    { name: 'Order-Server', since_sha: 'bbb', changed_files: ['src/b.ts'] },
  ]);
  assert.equal(updated.stale_units.length, 1);
  assert.equal(updated.stale_units[0].since_sha, 'aaa', 'keeps earlier sha');
  assert.deepEqual(
    updated.stale_units[0].changed_files.sort(),
    ['src/a.ts', 'src/b.ts'],
  );
});

test('mergeStale ignores empty new entries', () => {
  const meta = { stale_units: [] };
  const updated = mergeStale(meta, []);
  assert.deepEqual(updated.stale_units, []);
});

test('writeMetaAtomic writes file via temp+rename and leaves no temp behind', () => {
  const { root, path } = setup({ version: 1 });
  try {
    writeMetaAtomic(path, { version: 1, last_updated_sha: 'xyz' });
    const text = readFileSync(path, 'utf8');
    assert.match(text, /"last_updated_sha"\s*:\s*"xyz"/);
    assert.equal(existsSync(path + '.tmp'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
