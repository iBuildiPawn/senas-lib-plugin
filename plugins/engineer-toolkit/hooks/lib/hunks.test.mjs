import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseHunksByFile, oldSideHunks } from './hunks.mjs';

function gitInit(dir) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
}
function gitAddCommit(dir, message) {
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
}

// --- parser tests (no git) ---

test('parseHunksByFile: empty input returns empty Map', () => {
  assert.equal(parseHunksByFile('').size, 0);
});

test('parseHunksByFile: standard @@ -42,5 +42,5 @@ → [42, 46]', () => {
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    'index abc..def 100644',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -42,5 +42,5 @@',
    '-old',
    '+new',
  ].join('\n');
  const result = parseHunksByFile(stdout);
  assert.deepEqual(result.get('src/x.ts'), [[42, 46]]);
});

test('parseHunksByFile: comma-omitted @@ -42 +42 @@ → [42, 42]', () => {
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -42 +42 @@',
    '-old',
    '+new',
  ].join('\n');
  assert.deepEqual(parseHunksByFile(stdout).get('src/x.ts'), [[42, 42]]);
});

test('parseHunksByFile: pure insertion @@ -42,0 +43,3 @@ is dropped', () => {
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -42,0 +43,3 @@',
    '+a',
    '+b',
    '+c',
  ].join('\n');
  // File appears with empty hunk list (no qualifying hunks).
  assert.deepEqual(parseHunksByFile(stdout).get('src/x.ts'), []);
});

test('parseHunksByFile: multi-hunk patch returns each hunk separately', () => {
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -10,2 +10,2 @@',
    '-a',
    '+A',
    '@@ -100,1 +100,1 @@',
    '-z',
    '+Z',
  ].join('\n');
  assert.deepEqual(parseHunksByFile(stdout).get('src/x.ts'), [[10, 11], [100, 100]]);
});

test('parseHunksByFile: multi-file batched patch groups hunks per file', () => {
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1,1 +1,1 @@',
    '-a',
    '+A',
    'diff --git a/src/y.ts b/src/y.ts',
    '--- a/src/y.ts',
    '+++ b/src/y.ts',
    '@@ -50,3 +50,3 @@',
    '-y',
    '+Y',
  ].join('\n');
  const result = parseHunksByFile(stdout);
  assert.deepEqual(result.get('src/x.ts'), [[1, 1]]);
  assert.deepEqual(result.get('src/y.ts'), [[50, 52]]);
});

test('parseHunksByFile: malformed @@ line is skipped, valid headers around it survive', () => {
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -1,1 +1,1 @@',
    '-a',
    '+A',
    '@@ this is garbage @@',
    '@@ -100,2 +100,2 @@',
    '-z',
    '+Z',
  ].join('\n');
  assert.deepEqual(parseHunksByFile(stdout).get('src/x.ts'), [[1, 1], [100, 101]]);
});

test('parseHunksByFile: deletion-only @@ -10,3 +10,0 @@ → [10, 12]', () => {
  // Real deletion: OLD_LEN > 0, NEW_LEN = 0. Cited lines inside are stale.
  const stdout = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -10,3 +10,0 @@',
    '-a',
    '-b',
    '-c',
  ].join('\n');
  assert.deepEqual(parseHunksByFile(stdout).get('src/x.ts'), [[10, 12]]);
});

// --- oldSideHunks integration tests (real git) ---

test('oldSideHunks: returns { ok: false } for an unknown sha', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-hunks-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    gitAddCommit(repo, 'init');
    const result = oldSideHunks(
      'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      'HEAD',
      ['a.txt'],
      repo,
    );
    assert.deepEqual(result, { ok: false });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('oldSideHunks: real two-commit fixture returns hunk ranges per file', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-hunks-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, 'src'));
    // 5-line file so we have room to edit a specific line.
    writeFileSync(join(repo, 'src', 'x.ts'), 'l1\nl2\nl3\nl4\nl5\n');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(join(repo, 'src', 'x.ts'), 'l1\nl2\nL3-CHANGED\nl4\nl5\n');
    gitAddCommit(repo, 'edit line 3');
    const result = oldSideHunks(sha1, 'HEAD', ['src/x.ts'], repo);
    assert.equal(result.ok, true);
    const ranges = result.byFile.get('src/x.ts');
    assert.ok(Array.isArray(ranges), 'src/x.ts present in byFile');
    // The exact hunk shape may be [3,3] or similar — assert it covers line 3.
    assert.ok(
      ranges.some(([s, e]) => s <= 3 && 3 <= e),
      `expected a hunk covering line 3, got ${JSON.stringify(ranges)}`,
    );
    // And does NOT cover line 5 (untouched).
    assert.ok(
      !ranges.some(([s, e]) => s <= 5 && 5 <= e),
      `expected no hunk covering line 5, got ${JSON.stringify(ranges)}`,
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('oldSideHunks: batched call across multiple files groups correctly', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-hunks-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a1\na2\na3\n');
    writeFileSync(join(repo, 'src', 'b.ts'), 'b1\nb2\nb3\n');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(join(repo, 'src', 'a.ts'), 'a1\nA2-CHANGED\na3\n');
    writeFileSync(join(repo, 'src', 'b.ts'), 'b1\nb2\nB3-CHANGED\n');
    gitAddCommit(repo, 'edit both');
    const result = oldSideHunks(sha1, 'HEAD', ['src/a.ts', 'src/b.ts'], repo);
    assert.equal(result.ok, true);
    assert.ok(result.byFile.has('src/a.ts'));
    assert.ok(result.byFile.has('src/b.ts'));
    assert.ok(result.byFile.get('src/a.ts').some(([s, e]) => s <= 2 && 2 <= e));
    assert.ok(result.byFile.get('src/b.ts').some(([s, e]) => s <= 3 && 3 <= e));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('oldSideHunks: pure insertion in real fixture yields empty hunk list for that file', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-hunks-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'x.ts'), 'l1\nl2\nl3\n');
    const sha1 = gitAddCommit(repo, 'init');
    // Append a new line — pure insertion, no edit to existing lines.
    writeFileSync(join(repo, 'src', 'x.ts'), 'l1\nl2\nl3\nl4-NEW\n');
    gitAddCommit(repo, 'append');
    const result = oldSideHunks(sha1, 'HEAD', ['src/x.ts'], repo);
    assert.equal(result.ok, true);
    // OLD_LEN=0 hunk dropped → empty array for the file.
    assert.deepEqual(result.byFile.get('src/x.ts'), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('oldSideHunks: empty files array returns ok with empty byFile', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-hunks-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    const sha = gitAddCommit(repo, 'init');
    const result = oldSideHunks(sha, 'HEAD', [], repo);
    assert.equal(result.ok, true);
    assert.equal(result.byFile.size, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
