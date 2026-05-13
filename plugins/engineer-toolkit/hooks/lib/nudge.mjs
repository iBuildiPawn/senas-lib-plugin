const MAX_UNITS_IN_NUDGE = 10;

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'} changed`;
}

function unitDriftWeight(u) {
  // Sort key for capping: bubble disappeared-heavy units up so they don't get
  // truncated past MAX_UNITS_IN_NUDGE — a removed citation is the strongest
  // staleness signal we have.
  return (u.changed_files?.length || 0) + (u.disappeared_citations?.length || 0);
}

function renderDriftBlock(sinceSha, staleUnits, reason) {
  const sorted = [...staleUnits].sort((a, b) => unitDriftWeight(b) - unitDriftWeight(a));
  const capped = sorted.slice(0, MAX_UNITS_IN_NUDGE);
  const truncated = sorted.length > MAX_UNITS_IN_NUDGE;

  const lines = [`[tech-librarian] .librarian/ drift detected since ${sinceSha}:`];
  if (reason) lines.push(`  reason: ${reason}`);
  for (const u of capped) {
    const fileCount = (u.changed_files || []).length;
    lines.push(`  - ${u.name}: ${plural(fileCount, 'file')}`);
    const disappeared = new Set(u.disappeared_citations || []);
    if (u.triggering_lines instanceof Map) {
      for (const path of u.changed_files || []) {
        if (disappeared.has(path)) {
          lines.push(`      ${path} (removed since refresh)`);
          continue;
        }
        const lineNums = u.triggering_lines.get(path) ?? [];
        if (lineNums.length > 0) {
          lines.push(`      ${path} (lines ${lineNums.join(', ')})`);
        } else {
          lines.push(`      ${path} (file-level)`);
        }
      }
    } else {
      // No triggering_lines map (e.g. history-rewritten branch). Still surface
      // disappeared paths if any happen to be present.
      for (const path of disappeared) {
        lines.push(`      ${path} (removed since refresh)`);
      }
    }
  }
  if (truncated) {
    lines.push(
      `  ...and ${sorted.length - MAX_UNITS_IN_NUDGE} more units — large drift — full relearn recommended`,
    );
  }
  lines.push('Run the tech-librarian skill in targeted-refresh mode to update these units.');
  lines.push('Fast verification: read the cited unit doc, then Grep changed files for the affected symbols before rewriting.');
  return lines.join('\n');
}

function renderWarningsBlock(warnings) {
  const capped = warnings.slice(0, MAX_UNITS_IN_NUDGE);
  const truncated = warnings.length > MAX_UNITS_IN_NUDGE;

  const lines = ['[tech-librarian] warning: citation paths did not resolve for:'];
  capped.forEach((w, i) => {
    const total = w.total ?? 0;
    const hint =
      i === 0
        ? " — add 'root: <subdir>' to the unit's frontmatter if this is a monorepo"
        : '';
    lines.push(`  - ${w.name}: 0 of ${total} citations resolved${hint}`);
  });
  if (truncated) {
    lines.push(`  ...and ${warnings.length - MAX_UNITS_IN_NUDGE} more units with zero resolves`);
  }
  return lines.join('\n');
}

export function formatBody({ sinceSha, staleUnits, reason, warnings }) {
  const hasStale = Array.isArray(staleUnits) && staleUnits.length > 0;
  const hasWarnings = Array.isArray(warnings) && warnings.length > 0;
  if (!hasStale && !hasWarnings) return '';

  const blocks = [];
  if (hasStale) blocks.push(renderDriftBlock(sinceSha, staleUnits, reason));
  if (hasWarnings) blocks.push(renderWarningsBlock(warnings));
  return blocks.join('\n\n');
}

export function wrap(hookEventName, body) {
  if (!body) return '';
  return JSON.stringify({
    hookSpecificOutput: { hookEventName, additionalContext: body },
  });
}
