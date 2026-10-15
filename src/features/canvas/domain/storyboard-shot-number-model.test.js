import { describe, expect, it } from 'vitest';
import { resolveCanvasStoryboardShotNumber as resolve } from './storyboard-shot-number-model.js';

const group = (data = {}) => ({
  id: 'g',
  type: 'group',
  data: { storyboardGroupType: 'image', showStoryboardShotNumbers: true, ...data },
});
const image = (id, x, y = 0) => ({
  id,
  type: 'image',
  parentId: 'g',
  position: { x, y },
  data: {},
});

describe('source image shot overlays', () => {
  it('prefers the explicit child sequence even when graph and spatial order differ', () => {
    const a = image('a', 0),
      b = image('b', 100);
    const nodes = [group({ childNodeIds: ['b', 'a'] }), a, b];
    expect(resolve(a, nodes)).toMatchObject({ index: 2, label: '02', fontSize: 16 });
    expect(resolve(b, nodes).label).toBe('01');
  });
  it('uses the source eight-pixel row tolerance for children absent from the explicit sequence', () => {
    const a = image('a', 0, 8),
      b = image('b', 100, 0),
      c = image('c', 0, 17);
    const nodes = [group({ childNodeIds: ['missing'] }), b, c, a];
    expect(resolve(a, nodes).label).toBe('01');
    expect(resolve(b, nodes).label).toBe('02');
    expect(resolve(c, nodes).label).toBe('03');
  });
  it('scales the badge by the configured grid without numbering empty slots', () => {
    const a = image('a', 0);
    expect(
      resolve(a, [group({ storyboardManualGridCols: 5, storyboardManualGridRows: 4 }), a]),
    ).toEqual({ index: 1, label: '01', fontSize: 40 });
  });
  it.each([
    { storyboardGroupType: 'video' },
    { showStoryboardShotNumbers: false },
    { storyboardGroupType: undefined },
  ])('omits badges without eligible parent presentation %j', (data) => {
    const a = image('a', 0);
    expect(resolve(a, [group(data), a])).toBeNull();
  });
  it('retains source eligibility for explicit standalone or script flags without requiring a group type', () => {
    const a = image('a', 0);
    for (const flag of [{ standaloneStoryboardImageGrid: true }, { sourceScriptNodeId: 'script' }])
      expect(
        resolve(a, [{ ...group({ storyboardGroupType: undefined, ...flag }), type: 'legacy' }, a])
          .label,
      ).toBe('01');
  });
  it('does not treat truthy standalone strings or non-string script IDs as flags', () => {
    const a = image('a', 0);
    expect(
      resolve(a, [
        group({
          storyboardGroupType: undefined,
          standaloneStoryboardImageGrid: 'true',
          sourceScriptNodeId: 1,
        }),
        a,
      ]),
    ).toBeNull();
  });
  it('ignores non-image descendants and unparented images', () => {
    const a = image('a', 0);
    expect(resolve({ ...a, parentId: undefined }, [group(), a])).toBeNull();
    expect(resolve({ ...a, type: 'video' }, [group(), a])).toBeNull();
  });
});
