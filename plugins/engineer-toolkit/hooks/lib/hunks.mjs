import { execFileSync } from 'node:child_process';
import { normalizePath } from './citations.mjs';

const GIT_TIMEOUT_MS = 5000;
const FILE_HEADER_RE = /^diff --git a\/(\S+) b\/\S+$/;
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/;

function shaExists(sha, cwd) {
  try {
    execFileSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GIT_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse the stdout of `git diff -U0 ... -- <files>` into per-file old-side hunk ranges.
 *
 * Returns Map<file, Array<[oldStart, oldEnd]>>. Hunks with OLD_LEN === 0 (pure insertions)
 * are dropped per the design rule (insertions don't propagate staleness to downstream
 * citations). Files appear in the Map with an empty array when the only hunks were
 * insertions; absent files had no diff section at all.
 *
 * @param {string} stdout
 * @returns {Map<string, Array<[number, number]>>}
 */
export function parseHunksByFile(stdout) {
  const result = new Map();
  let currentFile = null;
  for (const rawLine of stdout.split('\n')) {
    const fileMatch = rawLine.match(FILE_HEADER_RE);
    if (fileMatch) {
      currentFile = normalizePath(fileMatch[1]);
      if (!result.has(currentFile)) result.set(currentFile, []);
      continue;
    }
    if (!currentFile) continue;
    const hunkMatch = rawLine.match(HUNK_RE);
    if (!hunkMatch) continue;
    const oldStart = Number(hunkMatch[1]);
    const oldLen = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2]);
    if (oldLen === 0) continue; // pure insertion, dropped
    result.get(currentFile).push([oldStart, oldStart + oldLen - 1]);
  }
  return result;
}

/**
 * @param {string} sinceSha
 * @param {string} headSha          - usually 'HEAD' or a resolved sha
 * @param {string[]} files          - repo-relative paths to scope the diff
 * @param {string} cwd              - repo root
 * @returns {{ ok: true, byFile: Map<string, Array<[number, number]>> }
 *          | { ok: false }}
 */
export function oldSideHunks(sinceSha, headSha, files, cwd) {
  if (!shaExists(sinceSha, cwd)) return { ok: false };
  if (headSha !== 'HEAD' && !shaExists(headSha, cwd)) return { ok: false };
  if (files.length === 0) return { ok: true, byFile: new Map() };
  let stdout;
  try {
    stdout = execFileSync(
      'git',
      ['diff', '-U0', '--no-renames', `${sinceSha}..${headSha}`, '--', ...files],
      {
        cwd,
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024, // 32 MiB cap for very large patches
      },
    );
  } catch {
    return { ok: false };
  }
  return { ok: true, byFile: parseHunksByFile(stdout) };
}
