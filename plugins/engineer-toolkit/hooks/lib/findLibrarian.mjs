import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * Walk upward from `startDir` looking for `.librarian/.meta.json`.
 * Returns { root, metaPath, meta } on first hit, or null.
 * Returns null if .meta.json is malformed.
 */
export function findLibrarian(startDir = process.cwd()) {
  let dir = startDir;
  const { root: fsRoot } = parse(dir);
  while (true) {
    const metaPath = join(dir, '.librarian', '.meta.json');
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
        return { root: dir, metaPath, meta };
      } catch {
        return null;
      }
    }
    if (dir === fsRoot) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * True if `dir` is inside a git work tree.
 */
export function isInsideGitRepo(dir = process.cwd()) {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return out.trim() === 'true';
  } catch {
    return false;
  }
}
