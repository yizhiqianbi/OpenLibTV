import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter.js';

describe('Markdown frontmatter', () => {
  it('parses scalar and folded/literal values and removes the header from the body', () => {
    expect(
      parseFrontmatter(
        '\uFEFF---\n' +
          'title: "教程标题"\n' +
          'summary: >\n' +
          '  第一行\n' +
          '  第二行\n' +
          'notes: |\n' +
          '  第一段\n' +
          '\n' +
          '  第二段\n' +
          '---\n\n## 正文',
      ),
    ).toEqual({
      data: [
        { key: 'title', value: '教程标题' },
        { key: 'summary', value: '第一行 第二行' },
        { key: 'notes', value: '第一段\n\n第二段' },
      ],
      body: '\n## 正文',
    });
  });

  it('leaves ordinary Markdown unchanged and skips malformed metadata lines', () => {
    expect(parseFrontmatter('## 标题\n\n正文')).toEqual({
      data: [],
      body: '## 标题\n\n正文',
    });
    expect(parseFrontmatter('---\nnot valid\ntitle: ok\n---\n正文')).toEqual({
      data: [{ key: 'title', value: 'ok' }],
      body: '正文',
    });
  });
});
