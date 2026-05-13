import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from './frontmatter.mjs';

test('returns full body and empty data when no prelude', () => {
  const { body, data } = parseFrontmatter('# hello\nnot frontmatter');
  assert.equal(body, '# hello\nnot frontmatter');
  assert.deepEqual(data, {});
});

test('parses a simple key: value block', () => {
  const input = '---\nroot: services/orders\n---\n# Order Server\nbody';
  const { body, data } = parseFrontmatter(input);
  assert.equal(body, '# Order Server\nbody');
  assert.equal(data.root, 'services/orders');
});

test('strips surrounding single or double quotes', () => {
  const { data } = parseFrontmatter('---\nroot: "services/orders"\nname: \'Svc\'\n---\nx');
  assert.equal(data.root, 'services/orders');
  assert.equal(data.name, 'Svc');
});

test('ignores commented-out lines and blank keys', () => {
  const { data } = parseFrontmatter('---\n# this is a comment\nroot:\n---\nbody');
  assert.equal(data.root, '');
  assert.ok(!('# this' in data));
});

test('unknown keys are kept but cannot affect known behaviour', () => {
  const { data } = parseFrontmatter('---\nroot: a\nowner: team\n---\nbody');
  assert.equal(data.root, 'a');
  assert.equal(data.owner, 'team');
});

test('malformed prelude (no closer) leaves body untouched', () => {
  const input = '---\nroot: a\n# never closes';
  const { body, data } = parseFrontmatter(input);
  assert.equal(body, input);
  assert.deepEqual(data, {});
});

test('handles null/undefined/non-string input without throwing', () => {
  assert.deepEqual(parseFrontmatter(null), { body: '', data: {} });
  assert.deepEqual(parseFrontmatter(undefined), { body: '', data: {} });
});

test('citation-shaped tokens inside frontmatter values are not returned as citations here', () => {
  const { body, data } = parseFrontmatter('---\ndesc: src/foo.ts\n---\nreal: src/bar.ts');
  assert.equal(data.desc, 'src/foo.ts');
  assert.equal(body, 'real: src/bar.ts');
});
