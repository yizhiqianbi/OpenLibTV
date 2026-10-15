import { describe, expect, it } from 'vitest';
import { skillDiffDecorations, skillDiffLines, skillDiffStats } from './editor-diff.js';

const oldText = (lines) =>
  lines
    .filter((line) => line.originalLineNum !== null)
    .map((line) => line.text)
    .join('\n');
const newText = (lines) =>
  lines
    .filter(
      (line) =>
        line.status !== 'removed' && !(line.status === 'modified' && line.originalLineNum !== null),
    )
    .map((line) => line.text)
    .join('\n');

describe('Skill Markdown line comparisons', () => {
  it.each([
    ['', 'first\nsecond', 2, 0],
    ['first\nsecond', '', 0, 2],
    ['same\nold\ntail', 'same\nnew\ntail', 1, 1],
    ['a\nb\na\nc', 'a\na\nb\nc', 1, 1],
    ['same\n', 'same\n', 0, 0],
  ])(
    'reconstructs both documents without dropping lines (%s → %s)',
    (before, after, added, removed) => {
      const lines = skillDiffLines(before, after);
      expect(oldText(lines)).toBe(before);
      expect(newText(lines)).toBe(after);
      expect(skillDiffStats(lines)).toEqual({
        addedLines: added,
        removedLines: removed,
        hasChanges: added + removed > 0,
      });
    },
  );

  it('positions deleted blocks before their next surviving line and at the trailing edge', () => {
    const { changedLines, removed } = skillDiffDecorations(
      skillDiffLines('old\nsame\ntail', 'new\nsame'),
    );
    expect([...changedLines]).toEqual([1]);
    expect(
      removed.map((block) => [block.beforeNewLineNum, block.lines.map((line) => line.text)]),
    ).toEqual([
      [1, ['old']],
      [null, ['tail']],
    ]);
  });

  it('handles a near-limit document with a small edit without a quadratic matrix', () => {
    const before = Array.from({ length: 4000 }, (_, index) => `${index}`).join('\n');
    const after = before.replace('\n2000\n', '\nedit\n');
    const lines = skillDiffLines(before, after);
    expect(oldText(lines)).toBe(before);
    expect(newText(lines)).toBe(after);
    expect(skillDiffStats(lines)).toMatchObject({ addedLines: 1, removedLines: 1 });
  });
});
