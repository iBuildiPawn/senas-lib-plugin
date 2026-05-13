const PRELUDE = '---\n';
const CLOSER = '\n---\n';

export function parseFrontmatter(text) {
  if (typeof text !== 'string' || !text.startsWith(PRELUDE)) {
    return { body: text ?? '', data: {} };
  }
  const end = text.indexOf(CLOSER, PRELUDE.length);
  if (end === -1) return { body: text, data: {} };

  const block = text.slice(PRELUDE.length, end);
  const body = text.slice(end + CLOSER.length);
  const data = {};
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.replace(/^['"](.*)['"]$/, '$1');
    data[key] = value;
  }
  return { body, data };
}
