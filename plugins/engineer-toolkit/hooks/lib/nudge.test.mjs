import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBody, wrap } from './nudge.mjs';

test('formatBody returns empty string when no stale units and no warnings', () => {
  assert.equal(formatBody({ sinceSha: 'abc', staleUnits: [] }), '');
  assert.equal(formatBody({ sinceSha: 'abc', staleUnits: [], warnings: [] }), '');
});

test('formatBody lists units with their changed-file counts', () => {
  const body = formatBody({
    sinceSha: 'abc1234',
    staleUnits: [
      { name: 'Order-Server', changed_files: ['a.ts', 'b.ts', 'c.ts'] },
      { name: 'Admin-Server', changed_files: ['d.ts'] },
    ],
  });
  assert.match(body, /\.librarian\/ drift detected since abc1234/);
  assert.match(body, /Order-Server: 3 files changed/);
  assert.match(body, /Admin-Server: 1 file changed/);
  assert.match(body, /tech-librarian skill in targeted-refresh mode/);
});

test('formatBody caps at 10 units and emits large-drift notice', () => {
  const staleUnits = Array.from({ length: 15 }, (_, i) => ({
    name: `U${i}`,
    changed_files: Array(i + 1).fill('x.ts'),
  }));
  const body = formatBody({ sinceSha: 'abc', staleUnits });
  assert.match(body, /U14: 15 files changed/);
  assert.match(body, /large drift — full relearn recommended/);
  assert.ok(!body.includes('U0:'));
});

test('formatBody emits "history rewritten" reason when set', () => {
  const body = formatBody({
    sinceSha: 'abc',
    staleUnits: [{ name: 'Order-Server', changed_files: ['a.ts'] }],
    reason: 'history rewritten',
  });
  assert.match(body, /history rewritten/);
});

test('wrap returns empty string when body is empty', () => {
  assert.equal(wrap('PostToolUse', ''), '');
});

test('wrap produces well-formed hookSpecificOutput JSON', () => {
  const out = wrap('SessionStart', 'hello');
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(parsed.hookSpecificOutput.additionalContext, 'hello');
});

test('formatBody emits warnings-only body when no stale units', () => {
  const body = formatBody({
    sinceSha: 'abc',
    staleUnits: [],
    warnings: [
      { name: 'Uclean-Company', total: 14 },
      { name: 'Other-Unit', total: 6 },
    ],
  });
  assert.match(body, /citation paths did not resolve/);
  assert.match(body, /Uclean-Company: 0 of 14 citations resolved/);
  assert.match(body, /root: <subdir>/);
  assert.match(body, /Other-Unit: 0 of 6 citations resolved/);
  assert.ok(!body.includes('drift detected'));
});

test('formatBody combines drift block and warnings block when both present', () => {
  const body = formatBody({
    sinceSha: 'abc',
    staleUnits: [{ name: 'Order-Server', changed_files: ['a.ts'] }],
    warnings: [{ name: 'Uclean-Company', total: 3 }],
  });
  const driftIdx = body.indexOf('drift detected');
  const warnIdx = body.indexOf('citation paths did not resolve');
  assert.ok(driftIdx !== -1 && warnIdx !== -1);
  assert.ok(driftIdx < warnIdx, 'drift comes before warnings');
});

test('formatBody caps warnings at MAX_UNITS_IN_NUDGE with summary', () => {
  const warnings = Array.from({ length: 13 }, (_, i) => ({ name: `U${i}`, total: i + 1 }));
  const body = formatBody({ sinceSha: 'abc', staleUnits: [], warnings });
  assert.match(body, /and 3 more units with zero resolves/);
  assert.ok(!body.includes('U10:'));
});

test('formatBody prints triggering line numbers when provided', () => {
  const body = formatBody({
    sinceSha: 'abc1234',
    staleUnits: [
      {
        name: 'Order-Server',
        changed_files: ['src/handler.ts', 'src/queue.ts'],
        triggering_lines: new Map([
          ['src/handler.ts', [42, 88]],
          ['src/queue.ts', []], // file-only fallback
        ]),
      },
    ],
  });
  assert.match(body, /Order-Server: 2 files changed/);
  assert.match(body, /src\/handler\.ts \(lines 42, 88\)/);
  assert.match(body, /src\/queue\.ts \(file-level\)/);
});

test('formatBody falls back to today\'s format when triggering_lines is absent', () => {
  const body = formatBody({
    sinceSha: 'abc1234',
    staleUnits: [{ name: 'Old-Style', changed_files: ['src/x.ts'] }],
  });
  assert.match(body, /Old-Style: 1 file changed/);
  assert.ok(!body.includes('(lines'), 'no per-file detail without triggering_lines');
  assert.ok(!body.includes('(file-level)'));
});

test('formatBody renders disappeared citations distinctly from triggering lines', () => {
  const body = formatBody({
    sinceSha: 'abc1234',
    staleUnits: [
      {
        name: 'Order-Server',
        changed_files: ['src/handler.ts', 'src/gone.ts'],
        triggering_lines: new Map([
          ['src/handler.ts', [42]],
          ['src/gone.ts', []],
        ]),
        disappeared_citations: ['src/gone.ts'],
      },
    ],
  });
  assert.match(body, /src\/handler\.ts \(lines 42\)/);
  assert.match(body, /src\/gone\.ts \(removed since refresh\)/);
  assert.ok(
    !body.includes('src/gone.ts (file-level)'),
    'disappeared overrides file-level fallback rendering',
  );
});

test('formatBody bubbles disappeared-heavy units past the 10-unit cap', () => {
  // 11 units: ten with a single changed file, one with 5 disappeared. The
  // disappeared-heavy unit must not get truncated.
  const staleUnits = Array.from({ length: 10 }, (_, i) => ({
    name: `U${i}`,
    changed_files: ['x.ts'],
  }));
  staleUnits.push({
    name: 'Heavy',
    changed_files: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
    disappeared_citations: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
  });
  const body = formatBody({ sinceSha: 'abc', staleUnits });
  assert.match(body, /Heavy: 5 files changed/, 'disappeared-heavy unit is in the capped output');
  assert.match(body, /and 1 more units/, 'one of the trivial units got truncated instead');
});

test('formatBody appends the fast-verification footer once', () => {
  const body = formatBody({
    sinceSha: 'abc',
    staleUnits: [{ name: 'U', changed_files: ['x.ts'] }],
  });
  assert.match(body, /Fast verification: read the cited unit doc/);
  // Footer only appears in the drift block, not duplicated when warnings are also present.
  const body2 = formatBody({
    sinceSha: 'abc',
    staleUnits: [{ name: 'U', changed_files: ['x.ts'] }],
    warnings: [{ name: 'W', total: 5 }],
  });
  const matches = body2.match(/Fast verification:/g) || [];
  assert.equal(matches.length, 1, 'footer appears exactly once when both blocks render');
});
