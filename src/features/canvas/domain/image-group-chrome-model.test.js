import { describe, expect, it } from 'vitest';
import { canvasImageGroupChrome } from './image-group-chrome-model.js';
const image = { type: 'image', data: {} };
const group = (data) => ({ type: 'group', data });
describe('source image parent title and independent handle gates', () => {
  it('hides titles and both handles only for ordinary standalone image group children', () => {
    expect(
      canvasImageGroupChrome(
        image,
        group({ storyboardGroupType: 'image', standaloneStoryboardImageGrid: true }),
      ),
    ).toEqual({ hideTitleBar: true, hideTargetHandle: true, hideSourceHandle: true });
  });
  it('preserves the target handle on the explicit character static-preview exception', () => {
    expect(
      canvasImageGroupChrome(
        { ...image, data: { _characterLibraryStaticPreview: true } },
        group({ storyboardGroupType: 'image', standaloneStoryboardImageGrid: true }),
      ),
    ).toEqual({ hideTitleBar: true, hideTargetHandle: false, hideSourceHandle: true });
  });
  it.each([
    {
      storyboardGroupType: 'image',
      sourceScriptNodeId: 'script',
      standaloneStoryboardImageGrid: true,
    },
    { sourceScriptNodeId: 'script' },
    { storyboardGroupType: 'image' },
  ])('hides a derived title without claiming standalone handles for %j', (data) => {
    expect(canvasImageGroupChrome(image, group(data))).toEqual({
      hideTitleBar: true,
      hideTargetHandle: false,
      hideSourceHandle: false,
    });
  });
  it.each([
    undefined,
    group({}),
    group({ storyboardGroupType: 'video', standaloneStoryboardImageGrid: true }),
    { type: 'image', data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true } },
  ])('keeps ordinary/non-group/video group titles', (parent) => {
    expect(canvasImageGroupChrome(image, parent).hideTitleBar).toBe(false);
  });
  it('does not apply image chrome rules to a video or text node', () => {
    for (const type of ['video', 'text'])
      expect(
        canvasImageGroupChrome(
          { type },
          group({ storyboardGroupType: 'image', standaloneStoryboardImageGrid: true }),
        ),
      ).toEqual({ hideTitleBar: false, hideTargetHandle: false, hideSourceHandle: false });
  });
});
