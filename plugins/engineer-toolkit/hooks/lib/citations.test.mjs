import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractCitations, normalizePath } from './citations.mjs';

function setup() {
  const repo = mkdtempSync(join(tmpdir(), 'tl-cite-'));
  mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
  mkdirSync(join(repo, 'src', 'orders'), { recursive: true });
  mkdirSync(join(repo, 'src', 'admin'), { recursive: true });
  writeFileSync(join(repo, 'src', 'orders', 'handler.ts'), '// real');
  writeFileSync(join(repo, 'src', 'admin', 'app.ts'), '// real');
  return repo;
}

test('extractCitations returns empty map when units/ is empty', () => {
  const repo = setup();
  try {
    const result = extractCitations(join(repo, '.librarian'), repo);
    assert.equal(result.size, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('extractCitations finds file:line citations and normalizes them', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      `Entry point: src/orders/handler.ts:42
Also see src/orders/handler.ts and the admin app at src/admin/app.ts`,
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    assert.equal(result.size, 1);
    const entry = result.get('Order-Server');
    assert.ok(entry.resolved.has('src/orders/handler.ts'));
    assert.ok(entry.resolved.has('src/admin/app.ts'));
    assert.equal(entry.resolved.size, 2);
    assert.equal(entry.root, '');
    // New shape: line numbers preserved per path.
    assert.deepEqual(entry.resolved.get('src/orders/handler.ts'), [42]);
    // File-only citation (no :line) → empty lines array.
    assert.deepEqual(entry.resolved.get('src/admin/app.ts'), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('extractCitations skips tokens that do not resolve to real files', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      `See README.md for setup. Real file: src/orders/handler.ts`,
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.ok(!entry.resolved.has('README.md'));
    assert.ok(entry.resolved.has('src/orders/handler.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('extractCitations indexes one entry per unit file', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      'src/orders/handler.ts',
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'Admin-Server.md'),
      'src/admin/app.ts',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    assert.equal(result.size, 2);
    assert.ok(result.get('Order-Server').resolved.has('src/orders/handler.ts'));
    assert.ok(result.get('Admin-Server').resolved.has('src/admin/app.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('normalizePath converts Windows backslashes to forward slashes', () => {
  assert.equal(normalizePath('src\\orders\\handler.ts'), 'src/orders/handler.ts');
  assert.equal(normalizePath('src/orders/handler.ts'), 'src/orders/handler.ts');
});

test('honours `root:` frontmatter for monorepo paths', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-cite-'));
  try {
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'services', 'orders', 'src'), { recursive: true });
    writeFileSync(join(repo, 'services', 'orders', 'src', 'handler.ts'), '// real');
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      '---\nroot: services/orders\n---\nEntry: src/handler.ts:1',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.equal(entry.total, 1);
    assert.equal(entry.root, 'services/orders');
    // Resolved paths are repo-relative so they match git-diff output downstream.
    assert.ok(entry.resolved.has('services/orders/src/handler.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('absent frontmatter still resolves from repo root (backward compatible)', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      'Entry: src/orders/handler.ts',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.equal(entry.root, '');
    assert.ok(entry.resolved.has('src/orders/handler.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('reports `total` count including unresolved tokens', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      'real: src/orders/handler.ts\ntypo: src/orders/typo.ts\nmissing: src/ghost/app.ts',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.equal(entry.total, 3);
    assert.equal(entry.resolved.size, 1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('ignores citation-shaped tokens inside frontmatter body', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      '---\nroot:\ndescription: src/admin/app.ts\n---\nBody cite: src/orders/handler.ts',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.equal(entry.total, 1, 'only body citations count toward total');
    assert.ok(entry.resolved.has('src/orders/handler.ts'));
    assert.ok(!entry.resolved.has('src/admin/app.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('unit with 0 of N resolved reports total but empty resolved set', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-cite-'));
  try {
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    // Monorepo-style paths but no root: frontmatter — classic silent-no-op setup.
    mkdirSync(join(repo, 'Uclean-Company', 'src'), { recursive: true });
    writeFileSync(join(repo, 'Uclean-Company', 'src', 'index.js'), '// real');
    writeFileSync(
      join(repo, '.librarian', 'units', 'Uclean-Company.md'),
      'Entry: src/index.js:1\nAlso: src/index.js:42',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Uclean-Company');
    assert.equal(entry.total, 1);
    assert.equal(entry.resolved.size, 0, 'zero-resolve case surfaces via total > 0 && resolved.size === 0');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('extractCitations merges multiple :line citations to the same path', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      `Entry: src/orders/handler.ts:5
Also: src/orders/handler.ts:42
Bare: src/orders/handler.ts
Dup: src/orders/handler.ts:42`,
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    const lines = entry.resolved.get('src/orders/handler.ts');
    assert.deepEqual([...lines].sort((a, b) => a - b), [5, 42], 'dedups; bare mention does not add a line');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('extractCitations populates unresolved set for tokens with no file backing', () => {
  const repo = setup();
  try {
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      `Real: src/orders/handler.ts
Gone: src/orders/typo.ts
Prose mention: README.md`,
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.ok(entry.unresolved instanceof Set, 'unresolved is a Set');
    assert.ok(entry.unresolved.has('src/orders/typo.ts'));
    assert.ok(entry.unresolved.has('README.md'));
    assert.equal(entry.unresolved.size, 2);
    assert.ok(entry.resolved.has('src/orders/handler.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('unresolved set stores repo-relative paths under monorepo root: frontmatter', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-cite-'));
  try {
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'services', 'orders', 'src'), { recursive: true });
    writeFileSync(join(repo, 'services', 'orders', 'src', 'handler.ts'), '// real');
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      '---\nroot: services/orders\n---\nReal: src/handler.ts\nGone: src/missing.ts',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    // Unresolved paths must carry the basePrefix so they line up with git ls-tree output.
    assert.ok(entry.unresolved.has('services/orders/src/missing.ts'));
    assert.ok(!entry.unresolved.has('src/missing.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('extractCitations preserves lines under monorepo root: frontmatter', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-cite-'));
  try {
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'services', 'orders', 'src'), { recursive: true });
    writeFileSync(join(repo, 'services', 'orders', 'src', 'handler.ts'), '// real');
    writeFileSync(
      join(repo, '.librarian', 'units', 'Order-Server.md'),
      '---\nroot: services/orders\n---\nEntry: src/handler.ts:7',
    );
    const result = extractCitations(join(repo, '.librarian'), repo);
    const entry = result.get('Order-Server');
    assert.deepEqual(entry.resolved.get('services/orders/src/handler.ts'), [7]);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
