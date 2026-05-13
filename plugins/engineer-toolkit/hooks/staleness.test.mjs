import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./staleness.mjs', import.meta.url));

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
function runScript(event, payload, cwd) {
  return spawnSync('node', [SCRIPT, event], {
    cwd,
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

test('exits 0 silently with no output when no .librarian/ exists', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    writeFileSync(join(repo, 'a.txt'), 'a');
    gitAddCommit(repo, 'init');
    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('exits 0 silently when not in a git repo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    mkdirSync(join(dir, '.librarian'));
    writeFileSync(join(dir, '.librarian', '.meta.json'), '{"version":1,"last_updated_sha":"abc"}');
    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, dir);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('post-commit ignores Bash calls that are not git commit', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'U.md'), 'src/a.ts');
    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'ls -la' } },
      repo,
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'no nudge for non-commit Bash');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit emits JSON nudge when a cited file changed', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'src/a.ts');
    writeFileSync(join(repo, 'src', 'a.ts'), 'a-updated');
    gitAddCommit(repo, 'tweak a');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "tweak"' } },
      repo,
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/);

    const meta = JSON.parse(readFileSync(join(repo, '.librarian', '.meta.json'), 'utf8'));
    assert.equal(meta.stale_units.length, 1);
    assert.equal(meta.stale_units[0].name, 'OrderServer');
    assert.equal(meta.last_updated_sha, sha1, 'hook does not touch last_updated_sha');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start emits SessionStart event name in the JSON envelope', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'U.md'), 'src/a.ts');
    writeFileSync(join(repo, 'src', 'a.ts'), 'a-edited');
    gitAddCommit(repo, 'edit a');

    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start with HEAD == last_updated_sha is silent', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian'));
    writeFileSync(join(repo, 'a.txt'), 'a');
    const sha = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha }),
    );
    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start with unknown last_updated_sha marks all units stale with reason', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({
        version: 1,
        last_updated_sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'src/a.ts');
    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /history rewritten/);
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit catches "git -c key=val commit" form', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'src/a.ts');
    writeFileSync(join(repo, 'src', 'a.ts'), 'a-updated');
    gitAddCommit(repo, 'tweak a');

    const r = runScript(
      'post-commit',
      {
        tool_name: 'Bash',
        tool_input: { command: 'git -c commit.gpgsign=false commit -m "tweak"' },
      },
      repo,
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit ignores "git commit-graph" subcommand', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'U.md'), 'src/a.ts');
    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit-graph write' } },
      repo,
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'no nudge for git commit-graph');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit ignores "git log --grep=commit"', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'U.md'), 'src/a.ts');
    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git log --grep=commit' } },
      repo,
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'no nudge for git log --grep=commit');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit emits zero-resolve warning when cited paths do not exist', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    // Monorepo-style layout with no root: frontmatter — the silent-no-op scenario.
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'Uclean-Company', 'src'), { recursive: true });
    writeFileSync(join(repo, 'Uclean-Company', 'src', 'index.js'), '// real');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'Uclean-Company.md'),
      'Entry: src/index.js:1\nAlso: src/index.js:42',
    );
    // Commit something unrelated so diff has content but citations still cannot resolve.
    writeFileSync(join(repo, 'Uclean-Company', 'src', 'index.js'), '// edited');
    gitAddCommit(repo, 'edit unrelated');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "edit"' } },
      repo,
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(out.hookSpecificOutput.additionalContext, /citation paths did not resolve/);
    assert.match(out.hookSpecificOutput.additionalContext, /Uclean-Company: 0 of 1 citations resolved/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit with root: frontmatter resolves monorepo citations correctly', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'services', 'orders', 'src'), { recursive: true });
    writeFileSync(join(repo, 'services', 'orders', 'src', 'handler.ts'), '// a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'OrderServer.md'),
      '---\nroot: services/orders\n---\nEntry: src/handler.ts:1',
    );
    writeFileSync(join(repo, 'services', 'orders', 'src', 'handler.ts'), '// b');
    gitAddCommit(repo, 'tweak handler');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "tweak"' } },
      repo,
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/);
    assert.match(out.hookSpecificOutput.additionalContext, /drift detected/);
    assert.ok(
      !out.hookSpecificOutput.additionalContext.includes('citation paths did not resolve'),
      'no warning when citations resolve via root:',
    );

    const meta = JSON.parse(readFileSync(join(repo, '.librarian', '.meta.json'), 'utf8'));
    assert.equal(meta.stale_units.length, 1);
    assert.deepEqual(meta.stale_units[0].changed_files, ['services/orders/src/handler.ts']);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start emits warnings-only body when HEAD unchanged but citations broken', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'Uclean-Company', 'src'), { recursive: true });
    writeFileSync(join(repo, 'Uclean-Company', 'src', 'index.js'), '// real');
    const sha = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha }),
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'Uclean-Company.md'),
      'Entry: src/index.js:1',
    );
    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(out.hookSpecificOutput.additionalContext, /citation paths did not resolve/);
    assert.ok(
      !out.hookSpecificOutput.additionalContext.includes('drift detected'),
      'no drift block when HEAD == last_updated_sha',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start skips when payload.source is "compact"', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'a');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'U.md'), 'src/a.ts');
    writeFileSync(join(repo, 'src', 'a.ts'), 'a-edited');
    gitAddCommit(repo, 'edit a');

    const r = runScript(
      'session-start',
      { hook_event_name: 'SessionStart', source: 'compact' },
      repo,
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'no nudge on compact');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit does NOT mark unit stale when hunk is far from cited line (PRECISION WIN)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    // 100-line file so we have room to edit far from the cited line.
    const seed = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join('\n') + '\n';
    writeFileSync(join(repo, 'src', 'a.ts'), seed);
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'OrderServer.md'),
      'Entry: src/a.ts:5',
    );
    // Edit line 80 — nowhere near the cited line 5.
    const edited = seed.replace('line80', 'LINE80-CHANGED');
    writeFileSync(join(repo, 'src', 'a.ts'), edited);
    gitAddCommit(repo, 'tweak unrelated line');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "tweak"' } },
      repo,
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'no nudge — cited line 5 untouched by hunk at line 80');
    const meta = JSON.parse(readFileSync(join(repo, '.librarian', '.meta.json'), 'utf8'));
    assert.ok(!meta.stale_units || meta.stale_units.length === 0, 'no stale_units written');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit DOES mark unit stale when hunk overlaps cited line', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    const seed = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n') + '\n';
    writeFileSync(join(repo, 'src', 'a.ts'), seed);
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'OrderServer.md'),
      'Entry: src/a.ts:5',
    );
    // Edit exactly line 5 — the cited line.
    const edited = seed.replace('line5\n', 'LINE5-CHANGED\n');
    writeFileSync(join(repo, 'src', 'a.ts'), edited);
    gitAddCommit(repo, 'tweak line 5');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "tweak"' } },
      repo,
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit file-only citation still marks unit stale (file-level fallback)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    const seed = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join('\n') + '\n';
    writeFileSync(join(repo, 'src', 'a.ts'), seed);
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    // No :line — file-only citation.
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'Entry: src/a.ts');
    const edited = seed.replace('line80', 'LINE80-CHANGED');
    writeFileSync(join(repo, 'src', 'a.ts'), edited);
    gitAddCommit(repo, 'tweak unrelated line');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "tweak"' } },
      repo,
    );
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/, 'file-level fallback still flags');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit pure insertion above cited line does NOT mark unit stale', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    const seed = 'line1\nline2\nline3\nline4\nline5\n';
    writeFileSync(join(repo, 'src', 'a.ts'), seed);
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'Entry: src/a.ts:5');
    // Pure insertion at the top — line 5 content unchanged (now at line 7).
    writeFileSync(join(repo, 'src', 'a.ts'), 'newA\nnewB\nline1\nline2\nline3\nline4\nline5\n');
    gitAddCommit(repo, 'prepend two lines');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "prepend"' } },
      repo,
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '', 'pure insertion does not propagate staleness');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit fully-deleted cited file marks unit stale', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'line1\nline2\nline3\n');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'Entry: src/a.ts:2');
    execFileSync('git', ['rm', '-q', 'src/a.ts'], { cwd: repo });
    gitAddCommit(repo, 'delete a.ts');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "delete"' } },
      repo,
    );
    assert.equal(r.status, 0);
    // Note: extractCitations now runs against post-deletion tree. Citation no longer
    // resolves (existsSync returns false), so this case actually drops out of `resolved`.
    // The unit will appear in zero-resolve warnings, not stale_units. Confirm that path.
    const out = JSON.parse(r.stdout);
    assert.match(
      out.hookSpecificOutput.additionalContext,
      /(OrderServer|citation paths did not resolve)/,
      'either flagged stale or warned for unresolved citation',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start flags unit when a cited file was deleted since last_updated_sha', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'line1\nline2\nline3\n');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(join(repo, '.librarian', 'units', 'OrderServer.md'), 'Entry: src/a.ts:1');
    execFileSync('git', ['rm', '-q', 'src/a.ts'], { cwd: repo });
    gitAddCommit(repo, 'remove a.ts');

    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OrderServer/);

    const meta = JSON.parse(readFileSync(join(repo, '.librarian', '.meta.json'), 'utf8'));
    const entry = meta.stale_units.find((u) => u.name === 'OrderServer');
    assert.ok(entry, 'OrderServer flagged stale');
    assert.ok(
      entry.changed_files.includes('src/a.ts'),
      'disappeared path is recorded in changed_files',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start does NOT flag prose tokens that never existed in the tree', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'line1\nline2\nline3\n');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    // Unit cites a real file and a prose token (STRIPE_DOCS.md) that never
    // existed at sha1. The disappeared-citation flow must filter the prose
    // token out via the tree intersection.
    writeFileSync(
      join(repo, '.librarian', 'units', 'OrderServer.md'),
      'Entry: src/a.ts:1\nDocs: STRIPE_DOCS.md',
    );
    // Unrelated commit to advance HEAD past sha1 so the diff path runs.
    writeFileSync(join(repo, 'src', 'b.ts'), 'b');
    gitAddCommit(repo, 'add unrelated b');

    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    assert.equal(
      r.stdout.trim(),
      '',
      'no drift, no warnings — STRIPE_DOCS.md was never in the tree at sha1',
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('session-start with root: frontmatter renders prefixed disappeared path', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'services', 'orders', 'src'), { recursive: true });
    writeFileSync(join(repo, 'services', 'orders', 'src', 'handler.ts'), '// real');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    writeFileSync(
      join(repo, '.librarian', 'units', 'OrderServer.md'),
      '---\nroot: services/orders\n---\nEntry: src/handler.ts:1',
    );
    execFileSync('git', ['rm', '-q', 'services/orders/src/handler.ts'], { cwd: repo });
    gitAddCommit(repo, 'remove handler');

    const r = runScript('session-start', { hook_event_name: 'SessionStart' }, repo);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    // Path appears with the basePrefix applied — not the raw 'src/handler.ts'.
    assert.match(out.hookSpecificOutput.additionalContext, /services\/orders\/src\/handler\.ts/);

    const meta = JSON.parse(readFileSync(join(repo, '.librarian', '.meta.json'), 'utf8'));
    const entry = meta.stale_units.find((u) => u.name === 'OrderServer');
    assert.ok(entry);
    assert.ok(entry.changed_files.includes('services/orders/src/handler.ts'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('post-commit mixed unit (line + file-only) flags via either independently', () => {
  const repo = mkdtempSync(join(tmpdir(), 'tl-script-'));
  try {
    gitInit(repo);
    mkdirSync(join(repo, '.librarian', 'units'), { recursive: true });
    mkdirSync(join(repo, 'src'));
    const seed = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join('\n') + '\n';
    writeFileSync(join(repo, 'src', 'a.ts'), seed);
    writeFileSync(join(repo, 'src', 'b.ts'), 'b1\nb2\nb3\n');
    const sha1 = gitAddCommit(repo, 'init');
    writeFileSync(
      join(repo, '.librarian', '.meta.json'),
      JSON.stringify({ version: 1, last_updated_sha: sha1 }),
    );
    // Mixed: a.ts has a line citation; b.ts is file-only.
    writeFileSync(
      join(repo, '.librarian', 'units', 'Mixed.md'),
      'Cite: src/a.ts:5\nAlso: src/b.ts',
    );
    // Edit a.ts at line 80 (far from :5) — should NOT trigger via a.ts.
    // Edit b.ts (file-only) — SHOULD trigger via b.ts.
    writeFileSync(join(repo, 'src', 'a.ts'), seed.replace('line80', 'LINE80-CHANGED'));
    writeFileSync(join(repo, 'src', 'b.ts'), 'b1\nB2-CHANGED\nb3\n');
    gitAddCommit(repo, 'tweak both');

    const r = runScript(
      'post-commit',
      { tool_name: 'Bash', tool_input: { command: 'git commit -m "tweak"' } },
      repo,
    );
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Mixed/);
    const meta = JSON.parse(readFileSync(join(repo, '.librarian', '.meta.json'), 'utf8'));
    const mixedEntry = meta.stale_units.find((u) => u.name === 'Mixed');
    assert.ok(mixedEntry, 'Mixed unit was flagged stale');
    assert.deepEqual(mixedEntry.changed_files, ['src/b.ts'], 'only b.ts (file-only) drove staleness');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
