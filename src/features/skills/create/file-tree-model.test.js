import { describe, expect, it } from 'vitest';
import { relocateSkillEntry, skillDirectories } from './file-tree-model.js';

const files = [
  { path: 'SKILL.md', content: '# Main', primary: true },
  { path: 'guide/deep/notes.md', content: 'Keep this text', custom: 'preserved' },
  { path: 'outside.md', content: 'Other text' },
];

describe('Skill tree path operations', () => {
  it('moves an entire directory and maps only selection within its subtree', () => {
    const result = relocateSkillEntry(files, ['guide/empty', 'target'], 'guide', 'target/guide');
    expect(result.files[1]).toEqual({
      path: 'target/guide/deep/notes.md',
      content: 'Keep this text',
      custom: 'preserved',
    });
    expect(result.dirs).toEqual(['target/guide/empty', 'target']);
    expect(result.mapPath('guide/deep/notes.md')).toBe('target/guide/deep/notes.md');
    expect(result.mapPath('outside.md')).toBe('outside.md');
    expect(files[1].path).toBe('guide/deep/notes.md');
  });

  it('supports root moves while retaining implicit ancestors and empty directories', () => {
    const result = relocateSkillEntry(
      files,
      ['guide/empty/nested'],
      'guide/deep/notes.md',
      'notes.md',
    );
    expect(result.files[1].path).toBe('notes.md');
    expect(skillDirectories(result.files, result.dirs)).toEqual([
      'guide',
      'guide/empty',
      'guide/empty/nested',
    ]);
  });

  it('rejects collisions, cycles, stale entries and primary moves without changing input', () => {
    const before = JSON.stringify(files);
    expect(() => relocateSkillEntry(files, [], 'guide', 'guide/deep/guide')).toThrow('自身');
    expect(() => relocateSkillEntry(files, [], 'outside.md', 'guide')).toThrow('同名');
    expect(() => relocateSkillEntry(files, [], 'outside.md', 'missing/outside.md')).toThrow(
      '目标文件夹',
    );
    expect(() => relocateSkillEntry(files, [], 'missing.md', 'new.md')).toThrow('已不存在');
    expect(() => relocateSkillEntry(files, [], 'SKILL.md', 'main.md')).toThrow('主文件');
    expect(JSON.stringify(files)).toBe(before);
  });
});
