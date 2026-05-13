import { execFileSync } from 'node:child_process';
import { normalizePath } from './citations.mjs';

const GIT_TIMEOUT_MS = 5000;

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function shaExists(sha, cwd) {
  try {
    runGit(['rev-parse', '--verify', `${sha}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

function parseFiles(stdout) {
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizePath);
}

export function changedFilesSince(sha, cwd = process.cwd()) {
  if (!shaExists(sha, cwd)) return { unknown: true };
  try {
    const out = runGit(['diff', '--name-only', '--no-renames', `${sha}..HEAD`], cwd);
    return { files: parseFiles(out) };
  } catch {
    return { unknown: true };
  }
}

export function changedFilesInCommit(sha, cwd = process.cwd()) {
  if (!shaExists(sha, cwd)) return { unknown: true };
  try {
    const out = runGit(
      ['show', '--name-only', '--no-renames', '--pretty=format:', sha],
      cwd,
    );
    return { files: parseFiles(out) };
  } catch {
    return { unknown: true };
  }
}

/**
 * List every tracked file in the tree at `sha`, repo-relative, forward-slash form.
 *
 * Uses `-z` for NUL-delimited output (legal newlines in paths don't corrupt the
 * parse) and `-c core.quotepath=false` so non-ASCII paths arrive verbatim rather
 * than C-escaped — without this, callers comparing against `Set.has(repoRel)`
 * would silently miss those paths. `maxBuffer` is raised to handle 80k-file
 * monorepos whose `ls-tree` output exceeds Node's default buffer.
 *
 * @returns {{files: string[]} | {unknown: true}} `unknown` for unreachable shas
 *   (shallow clones, history rewrites) — callers should skip the disappeared-
 *   citation flow rather than promote to a full relearn.
 */
export function treeFiles(sha, cwd = process.cwd()) {
  if (!shaExists(sha, cwd)) return { unknown: true };
  try {
    const out = execFileSync(
      'git',
      ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--name-only', sha],
      {
        cwd,
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const files = out.split('\0').filter(Boolean).map(normalizePath);
    return { files };
  } catch {
    return { unknown: true };
  }
}
