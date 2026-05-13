import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

const CITATION_RE = /([\w./-]+\.\w+)(?::(\d+))?/g;

export function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * @param {string} librarianRoot - absolute path to .librarian/
 * @param {string} repoRoot      - absolute path to repo root
 * @returns {Map<string, { resolved: Map<string, number[]>, unresolved: Set<string>, total: number, root: string }>}
 *   unit name -> citation stats. `resolved` maps each repo-relative path that
 *   exists on disk to its sorted, deduplicated list of cited line numbers (empty
 *   array when only file-level citations were found). `unresolved` is the set of
 *   repo-relative paths whose citation token matched the regex but whose file
 *   does not exist on disk under the unit's base; the staleness hook intersects
 *   this with `git ls-tree` of the last refresh sha to surface citations that
 *   used to point somewhere real and now don't (deleted/renamed). `total` is
 *   the count of unique citation-shaped tokens in the unit doc (whether they
 *   resolved or not); `root` is the unit's declared base (empty string when
 *   absent).
 */
export function extractCitations(librarianRoot, repoRoot) {
  const result = new Map();
  const unitsDir = join(librarianRoot, 'units');
  if (!existsSync(unitsDir)) return result;

  for (const entry of readdirSync(unitsDir)) {
    if (!entry.endsWith('.md')) continue;
    const unitName = basename(entry, '.md');
    const raw = readFileSync(join(unitsDir, entry), 'utf8');
    const { body, data } = parseFrontmatter(raw);
    const root = (data.root ?? '').trim();
    const baseAbs = root ? join(repoRoot, root) : repoRoot;
    const basePrefix = root ? normalizePath(root.replace(/^\/+|\/+$/g, '')) : '';

    const candidatePaths = new Set();           // dedup tokens for `total`
    const linesByPath = new Map();              // repo-rel path -> Set<number>
    const unresolved = new Set();               // repo-rel paths whose file doesn't exist
    for (const match of body.matchAll(CITATION_RE)) {
      const candidate = normalizePath(match[1]);
      const lineStr = match[2];
      // Track every unique token (path-only and path:line collapse to one path key for total).
      candidatePaths.add(candidate);
      const repoRelative = basePrefix ? `${basePrefix}/${candidate}` : candidate;
      if (!existsSync(join(baseAbs, candidate))) {
        unresolved.add(repoRelative);
        continue;
      }
      let set = linesByPath.get(repoRelative);
      if (!set) {
        set = new Set();
        linesByPath.set(repoRelative, set);
      }
      if (lineStr !== undefined) {
        const n = Number(lineStr);
        if (Number.isInteger(n) && n > 0) set.add(n);
      }
    }
    const resolved = new Map();
    for (const [path, lineSet] of linesByPath) {
      resolved.set(path, [...lineSet].sort((a, b) => a - b));
    }
    result.set(unitName, { resolved, unresolved, total: candidatePaths.size, root });
  }
  return result;
}
