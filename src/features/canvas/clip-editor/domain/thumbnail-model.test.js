import { describe, expect, it } from 'vitest';
import { normalizeThumbnailFrames, thumbnailTimes } from './thumbnail-model.js';

describe('clip thumbnail model', () => {
  it('keeps only usable frame URLs within the visible frame budget', () => {
    expect(
      normalizeThumbnailFrames(
        { frames: ['/one.jpg', '', null, ' /two.jpg ', '/three.jpg'] },
        {
          maxFrames: 2,
        },
      ),
    ).toEqual(['/one.jpg', ' /two.jpg ']);
    expect(normalizeThumbnailFrames(null)).toEqual([]);
  });

  it('maps a clip range to source times with speed and offset', () => {
    expect(
      thumbnailTimes({ sourceOffset: 2, sourceDuration: 20, duration: 4, speed: 2 }, 3),
    ).toEqual([2, 6, 10]);
  });

  it('does not seek outside a short source or invent negative positions', () => {
    expect(
      thumbnailTimes({ sourceOffset: -2, sourceDuration: 3, duration: 10, speed: 1 }, 4),
    ).toEqual([0, 1, 2, 3]);
  });
});
