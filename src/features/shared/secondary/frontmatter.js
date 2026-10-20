const FRONTMATTER = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function parseFrontmatter(content = '') {
  const source = String(content),
    match = FRONTMATTER.exec(source);
  if (!match) return { data: [], body: source };
  const headerLines = match[1].split(/\r?\n/),
    data = [];
  for (let index = 0; index < headerLines.length;) {
    const line = headerLines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const field = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!field) {
      index += 1;
      continue;
    }
    const key = field[1],
      value = field[2].trim();
    if (/^[>|][+-]?$/.test(value)) {
      const folded = value[0] === '>',
        valueLines = [];
      index += 1;
      while (
        index < headerLines.length &&
        (!headerLines[index].trim() || /^\s/.test(headerLines[index]))
      ) {
        valueLines.push(headerLines[index].trim() ? headerLines[index].replace(/^\s+/, '') : '');
        index += 1;
      }
      while (valueLines.at(-1) === '') valueLines.pop();
      data.push({
        key,
        value: folded ? valueLines.filter(Boolean).join(' ') : valueLines.join('\n'),
      });
      continue;
    }
    data.push({ key, value: value.replace(/^['"]|['"]$/g, '') });
    index += 1;
  }
  return { data, body: source.slice(match[0].length) };
}

export { parseFrontmatter };
