import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { changedFilesSince, changedFilesInCommit, treeFiles } from './diff.mjs';

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

test('changedFilesSince returns files changed in a sha range', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    const sha1 = gitAddCommit(repo, 'add a');
    writeFileSync(join(repo, 'b.txt'), 'b');
    gitAddCommit(repo, 'add b');
    const result = changedFilesSince(sha1, repo);
    assert.deepEqual(result, { files: ['b.txt'] });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('changedFilesSince returns {unknown: true} for an unknown sha', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    gitAddCommit(repo, 'add a');
    const result = changedFilesSince('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', repo);
    assert.deepEqual(result, { unknown: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('changedFilesInCommit returns files in a single commit', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    gitAddCommit(repo, 'add a');
    mkdirSync(join(repo, 'sub'));
    writeFileSync(join(repo, 'sub', 'c.txt'), 'c');
    const sha = gitAddCommit(repo, 'add sub/c');
    const result = changedFilesInCommit(sha, repo);
    assert.deepEqual(result, { files: ['sub/c.txt'] });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('changedFilesInCommit always returns forward-slash paths', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    const sha = gitAddCommit(repo, 'add a');
    const result = changedFilesInCommit(sha, repo);
    assert.ok(Array.isArray(result.files));
    for (const f of result.files) assert.ok(!f.includes('\\'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('treeFiles lists every tracked file at the given sha', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    mkdirSync(join(repo, 'sub'));
    writeFileSync(join(repo, 'sub', 'c.txt'), 'c');
    const sha = gitAddCommit(repo, 'init');
    const result = treeFiles(sha, repo);
    assert.ok(Array.isArray(result.files));
    assert.ok(result.files.includes('a.txt'));
    assert.ok(result.files.includes('sub/c.txt'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('treeFiles returns {unknown: true} for an unknown sha', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    gitAddCommit(repo, 'init');
    const result = treeFiles('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', repo);
    assert.deepEqual(result, { unknown: true });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('treeFiles delivers non-ASCII paths verbatim (core.quotepath=false)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    // Path contains a non-ASCII character. Without core.quotepath=false,
    // ls-tree would escape this as e.g. "caf\303\251.txt", breaking Set lookups.
    writeFileSync(join(repo, 'café.txt'), 'x');
    const sha = gitAddCommit(repo, 'init');
    const result = treeFiles(sha, repo);
    assert.ok(result.files.includes('café.txt'), 'non-ASCII path must appear unescaped');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('changedFilesInCommit reports renames as delete+add (--no-renames)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-diff-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'old.txt'), 'identical content');
    gitAddCommit(repo, 'add old.txt');
    execFileSync('git', ['mv', 'old.txt', 'new.txt'], { cwd: repo });
    const sha = gitAddCommit(repo, 'rename');
    const result = changedFilesInCommit(sha, repo);
    assert.ok(result.files.includes('old.txt'), 'old path must appear');
    assert.ok(result.files.includes('new.txt'), 'new path must appear');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
