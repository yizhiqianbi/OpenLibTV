import { describe, expect, it, vi } from 'vitest';
import { extractVideoThumbnailFrames } from './thumbnail-service.js';

function fakeVideo() {
  const listeners = new Map();
  const video = {
    readyState: 2,
    duration: 10,
    canPlayType: () => 'probably',
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    load: vi.fn(),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
  };
  let currentTime = 0;
  Object.defineProperty(video, 'currentTime', {
    get: () => currentTime,
    set: (value) => {
      currentTime = value;
      queueMicrotask(() => listeners.get('seeked')?.());
    },
  });
  return video;
}

describe('clip thumbnail service', () => {
  it('reads real frame data URLs at source times and releases the video', async () => {
    const video = fakeVideo();
    const drawImage = vi.fn();
    const canvas = {
      getContext: () => ({ drawImage }),
      toDataURL: vi
        .fn()
        .mockReturnValueOnce('data:image/jpeg;base64,one')
        .mockReturnValueOnce('data:image/jpeg;base64,two'),
    };
    const result = await extractVideoThumbnailFrames(
      '/clip.mp4',
      {
        sourceOffset: 2,
        sourceDuration: 8,
        duration: 4,
        speed: 1,
      },
      { videoFactory: () => video, canvasFactory: () => canvas, frameCount: 2 },
    );
    expect(result).toEqual({
      status: 'ready',
      frames: ['data:image/jpeg;base64,one', 'data:image/jpeg;base64,two'],
    });
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
  });

  it('keeps unsupported browsers explicit', async () => {
    await expect(
      extractVideoThumbnailFrames(
        '/clip.mp4',
        {},
        {
          videoFactory: () => ({ canPlayType: () => '', load: vi.fn() }),
        },
      ),
    ).resolves.toEqual({ status: 'unsupported', frames: [] });
  });
});
