import { readFileSync, writeFileSync, renameSync } from 'node:fs';

export function readMeta(metaPath) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  if (!Array.isArray(meta.stale_units)) meta.stale_units = [];
  return meta;
}

/**
 * Merge new stale entries into meta.stale_units.
 * - If a unit already has an entry, union changed_files and keep the earlier since_sha.
 * - Returns a new object (does not mutate the input).
 */
export function mergeStale(meta, newEntries) {
  const byName = new Map();
  for (const entry of meta.stale_units || []) {
    byName.set(entry.name, {
      name: entry.name,
      since_sha: entry.since_sha,
      changed_files: [...(entry.changed_files || [])],
    });
  }
  for (const entry of newEntries || []) {
    const existing = byName.get(entry.name);
    if (existing) {
      const files = new Set([...existing.changed_files, ...(entry.changed_files || [])]);
      existing.changed_files = [...files].sort();
    } else {
      byName.set(entry.name, {
        name: entry.name,
        since_sha: entry.since_sha,
        changed_files: [...(entry.changed_files || [])].sort(),
      });
    }
  }
  return { ...meta, stale_units: [...byName.values()] };
}

export function writeMetaAtomic(metaPath, meta) {
  const tmp = metaPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  renameSync(tmp, metaPath);
}
