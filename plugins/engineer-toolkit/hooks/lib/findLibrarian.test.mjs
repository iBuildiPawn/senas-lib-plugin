import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findLibrarian, isInsideGitRepo } from './findLibrarian.mjs';

function makeTempRepo() {
  return mkdtempSync(join(tmpdir(), 'tl-find-'));
}

test('findLibrarian returns null when no .librarian exists upward', () => {
  const root = makeTempRepo();
  try {
    assert.equal(findLibrarian(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLibrarian finds .librarian/.meta.json at the start dir', () => {
  const root = makeTempRepo();
  try {
    mkdirSync(join(root, '.librarian'));
    writeFileSync(
      join(root, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: 'abc' }),
    );
    const result = findLibrarian(root);
    assert.ok(result);
    assert.equal(result.root, root);
    assert.equal(result.meta.last_updated_sha, 'abc');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLibrarian walks up to find .librarian in an ancestor', () => {
  const root = makeTempRepo();
  try {
    mkdirSync(join(root, '.librarian'));
    writeFileSync(join(root, '.librarian', '.meta.json'), '{"version":1}');
    const nested = join(root, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });
    const result = findLibrarian(nested);
    assert.ok(result);
    assert.equal(result.root, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('findLibrarian returns null when meta.json is malformed JSON', () => {
  const root = makeTempRepo();
  try {
    mkdirSync(join(root, '.librarian'));
    writeFileSync(join(root, '.librarian', '.meta.json'), '{not json');
    assert.equal(findLibrarian(root), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('isInsideGitRepo is false in a non-git temp dir', () => {
  const root = makeTempRepo();
  try {
    assert.equal(isInsideGitRepo(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
