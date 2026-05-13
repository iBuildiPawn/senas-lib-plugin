#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { findLibrarian, isInsideGitRepo } from './lib/findLibrarian.mjs';
import { extractCitations } from './lib/citations.mjs';
import { oldSideHunks } from './lib/hunks.mjs';
import { changedFilesSince, changedFilesInCommit, treeFiles } from './lib/diff.mjs';
import { mergeStale, writeMetaAtomic } from './lib/meta.mjs';
import { formatBody, wrap } from './lib/nudge.mjs';

const COMMIT_RE = /\bgit\b[^|;&]*?(?<![=.])\bcommit(?:\s|$)/;

function readStdinSync() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function intersect(citationsByUnit, changedSet, sinceSha, headSha, cwd) {
  // First pass: classify each (unit, citedFile) into file-only fallback vs.
  // line-aware. Collect the union of files needing hunks across all units so we
  // can issue a single batched git diff.
  const perUnit = [];
  const filesNeedingHunks = new Set();
  for (const [name, entry] of citationsByUnit) {
    const fileLevelHits = [];
    const lineAware = []; // [{ path, lines }]
    for (const [path, lines] of entry.resolved) {
      if (!changedSet.has(path)) continue;
      if (lines.length === 0) {
        fileLevelHits.push(path);
      } else {
        lineAware.push({ path, lines });
        filesNeedingHunks.add(path);
      }
    }
    perUnit.push({ name, fileLevelHits, lineAware });
  }

  // Second pass: one batched git invocation for all line-aware files.
  let hunkResult = { ok: true, byFile: new Map() };
  if (filesNeedingHunks.size > 0) {
    hunkResult = oldSideHunks(sinceSha, headSha, [...filesNeedingHunks], cwd);
  }

  // Third pass: assemble stale list per unit, recording which lines triggered each hit.
  const stale = [];
  for (const { name, fileLevelHits, lineAware } of perUnit) {
    const hits = new Set(fileLevelHits);
    const triggeringLines = new Map();
    for (const path of fileLevelHits) triggeringLines.set(path, []); // file-level marker
    for (const { path, lines } of lineAware) {
      if (!hunkResult.ok) {
        // Fail-safe: git broke; degrade to today's behavior for line-aware files too.
        hits.add(path);
        triggeringLines.set(path, []); // fail-safe, no line attribution available
        continue;
      }
      const ranges = hunkResult.byFile.get(path) ?? [];
      const matched = lines.filter((L) => ranges.some(([s, e]) => s <= L && L <= e));
      if (matched.length > 0) {
        hits.add(path);
        triggeringLines.set(path, matched);
      }
    }
    if (hits.size > 0) {
      stale.push({
        name,
        changed_files: [...hits],
        triggering_lines: triggeringLines,
      });
    }
  }
  return stale;
}

function collectZeroResolveWarnings(citationsByUnit, disappearedByUnit = new Map()) {
  const warnings = [];
  for (const [name, entry] of citationsByUnit) {
    if (entry.total > 0 && entry.resolved.size === 0) {
      // Suppress the misleading "add root: <subdir>" hint when the disappeared-
      // citation flow fully accounts for the unresolved tokens — in that case
      // the dedicated "removed since refresh" lines tell the truer story.
      const disappeared = disappearedByUnit.get(name);
      const unresolvedSize = entry.unresolved?.size ?? 0;
      if (disappeared && disappeared.length >= unresolvedSize && unresolvedSize > 0) continue;
      warnings.push({ name, total: entry.total });
    }
  }
  return warnings;
}

/**
 * For each unit, intersect its `unresolved` set with the tree at `lastSha`.
 * The intersection is "citations that pointed to a real file at the last
 * refresh and now point nowhere" — i.e. files deleted or renamed since.
 * Tokens that never existed (prose noise like a stray "Cargo.toml" mention)
 * naturally don't appear in the tree and so aren't surfaced.
 *
 * Returns a Map<unitName, string[]> of disappeared repo-relative paths, sorted.
 * Empty map when there's no `lastSha`, the sha is unreachable (shallow clone),
 * or no unit has any unresolved tokens.
 */
function detectDisappearedCitations(citationsByUnit, lastSha, cwd) {
  const result = new Map();
  if (!lastSha) return result;
  let needsTree = false;
  for (const [, entry] of citationsByUnit) {
    if ((entry.unresolved?.size ?? 0) > 0) { needsTree = true; break; }
  }
  if (!needsTree) return result;
  const tree = treeFiles(lastSha, cwd);
  if (tree.unknown) return result;
  const treeSet = new Set(tree.files);
  for (const [name, entry] of citationsByUnit) {
    if (!entry.unresolved || entry.unresolved.size === 0) continue;
    const disappeared = [];
    for (const path of entry.unresolved) {
      if (treeSet.has(path)) disappeared.push(path);
    }
    if (disappeared.length > 0) {
      disappeared.sort();
      result.set(name, disappeared);
    }
  }
  return result;
}

/**
 * Fold disappeared-citation findings into the existing `stale` array. A unit
 * already flagged by `intersect()` has its `changed_files` unioned and gains a
 * `disappeared_citations` field for nudge rendering. A unit with only
 * disappeared findings (no git-diff overlap) gets a fresh entry so the nudge
 * surfaces it.
 */
function mergeDisappearedIntoStale(stale, disappearedByUnit) {
  if (disappearedByUnit.size === 0) return stale;
  const byName = new Map(stale.map((s) => [s.name, s]));
  for (const [name, paths] of disappearedByUnit) {
    const existing = byName.get(name);
    if (existing) {
      const files = new Set([...existing.changed_files, ...paths]);
      existing.changed_files = [...files].sort();
      existing.disappeared_citations = paths;
    } else {
      byName.set(name, {
        name,
        changed_files: [...paths],
        triggering_lines: new Map(),
        disappeared_citations: paths,
      });
    }
  }
  return [...byName.values()];
}

function currentHeadSha(cwd) {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  }).trim();
}

function handlePostCommit(payload) {
  const lib = findLibrarian();
  if (!lib) return '';
  if (!isInsideGitRepo(lib.root)) return '';

  const command = payload?.tool_input?.command || '';
  if (!COMMIT_RE.test(command)) return '';

  const headSha = currentHeadSha(lib.root);
  const diff = changedFilesInCommit(headSha, lib.root);
  if (diff.unknown) return '';

  const citations = extractCitations(`${lib.root}/.librarian`, lib.root);
  const sinceSha = lib.meta.last_updated_sha || headSha;
  const stale = intersect(citations, new Set(diff.files), sinceSha, 'HEAD', lib.root);
  const warnings = collectZeroResolveWarnings(citations);

  if (stale.length > 0) {
    const entries = stale.map((s) => ({
      name: s.name,
      since_sha: sinceSha,
      changed_files: s.changed_files,
    }));
    const merged = mergeStale(lib.meta, entries);
    writeMetaAtomic(lib.metaPath, merged);

    const body = formatBody({ sinceSha, staleUnits: stale, warnings });
    return wrap('PostToolUse', body);
  }

  if (warnings.length > 0) {
    const body = formatBody({
      sinceSha,
      staleUnits: [],
      warnings,
    });
    return wrap('PostToolUse', body);
  }

  return '';
}

function handleSessionStart(payload) {
  if (payload?.source === 'compact') return '';
  const lib = findLibrarian();
  if (!lib) return '';
  if (!isInsideGitRepo(lib.root)) return '';

  const headSha = currentHeadSha(lib.root);
  const lastSha = lib.meta.last_updated_sha;
  const citations = extractCitations(`${lib.root}/.librarian`, lib.root);

  if (!lastSha || lastSha === headSha) {
    // No activity since the last refresh — keep this path quiet. Disappeared-
    // citation detection only runs when there's drift between lastSha and HEAD,
    // so a freshly-refreshed repo doesn't get re-nudged for prose tokens that
    // happen to coincide with real paths.
    const warnings = collectZeroResolveWarnings(citations);
    if (warnings.length === 0) return '';
    const body = formatBody({ sinceSha: lastSha || headSha, staleUnits: [], warnings });
    return wrap('SessionStart', body);
  }

  const diff = changedFilesSince(lastSha, lib.root);

  let stale;
  let reason;
  let disappearedByUnit = new Map();
  if (diff.unknown) {
    // History-rewrite path already over-flags everything; layering disappeared-
    // citation lines on top would be noise, so we deliberately skip the flow.
    reason = 'history rewritten';
    stale = [...citations].map(([name, entry]) => ({
      name,
      changed_files: [...entry.resolved.keys()],
    }));
  } else {
    stale = intersect(citations, new Set(diff.files), lastSha, 'HEAD', lib.root);
    disappearedByUnit = detectDisappearedCitations(citations, lastSha, lib.root);
    stale = mergeDisappearedIntoStale(stale, disappearedByUnit);
  }
  const warnings = collectZeroResolveWarnings(citations, disappearedByUnit);

  if (stale.length === 0 && warnings.length === 0) return '';

  if (stale.length > 0) {
    const entries = stale.map((s) => ({
      name: s.name,
      since_sha: lastSha,
      changed_files: s.changed_files,
    }));
    const merged = mergeStale(lib.meta, entries);
    writeMetaAtomic(lib.metaPath, merged);
  }

  const body = formatBody({ sinceSha: lastSha, staleUnits: stale, reason, warnings });
  return wrap('SessionStart', body);
}

function main() {
  const event = process.argv[2];
  const raw = readStdinSync();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  let out = '';
  if (event === 'post-commit') out = handlePostCommit(payload);
  else if (event === 'session-start') out = handleSessionStart(payload);
  if (out) process.stdout.write(out);
  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(`[tech-librarian-staleness] ${err?.stack || err}\n`);
  process.exit(0);
}
