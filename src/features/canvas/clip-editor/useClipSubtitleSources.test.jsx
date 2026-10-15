import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useClipSubtitleSources } from './useClipSubtitleSources.js';
import { readClipSubtitleVtt } from '../../../services/clip-subtitle-source.js';
vi.mock('../../../services/clip-subtitle-source.js', () => ({ readClipSubtitleVtt: vi.fn() }));
const identity = (value) => value;
const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n真实字幕\n';
const controls = () => ({ onSubtitleLoaded: vi.fn(), onSubtitleLoadStatus: vi.fn() });
const sourceClip = (id, subtitleUrl, patch = {}) => ({
  id,
  type: 'video',
  sourceNodeId: 'video',
  startTime: 0,
  duration: 5,
  sourceOffset: 0,
  speed: 1,
  subtitleUrl,
  ...patch,
});

describe('subtitle source ownership', () => {
  it('deduplicates reads and maps split source windows without writing the input timeline', async () => {
    readClipSubtitleVtt.mockResolvedValueOnce(vtt);
    const state = {
      draftSession: {},
      timeline: {
        subtitles: { visible: false, cues: [], defaultStyle: { color: '#FFDC00' } },
        clips: [
          sourceClip('a', '/same.vtt'),
          sourceClip('b', '/same.vtt', { startTime: 6, sourceOffset: 2, duration: 2 }),
        ],
      },
    };
    const controller = controls();
    const { unmount } = renderHook(() => useClipSubtitleSources(state, controller, identity));
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    expect(readClipSubtitleVtt).toHaveBeenCalledTimes(1);
    const track = controller.onSubtitleLoaded.mock.calls[0][1];
    expect(track).toMatchObject({ visible: false, defaultStyle: { color: '#FFDC00' } });
    expect(track.cues.map((cue) => [cue.startTime, cue.endTime])).toEqual([
      [1, 4],
      [6, 8],
    ]);
    expect(state.timeline.subtitles.cues).toEqual([]);
    unmount();
    vi.clearAllMocks();
  });
  it('aborts an old source and ignores a transport that resolves after the new document', async () => {
    let oldResolve;
    readClipSubtitleVtt
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            oldResolve = resolve;
          }),
      )
      .mockResolvedValueOnce(vtt);
    const controller = controls(),
      draftSession = {};
    const { rerender, unmount } = renderHook(
      ({ state }) => useClipSubtitleSources(state, controller, identity),
      {
        initialProps: {
          state: { draftSession, timeline: { clips: [sourceClip('a', '/old.vtt')] } },
        },
      },
    );
    const signal = readClipSubtitleVtt.mock.calls[0][1].signal;
    rerender({ state: { draftSession: {}, timeline: { clips: [sourceClip('new', '/new.vtt')] } } });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      oldResolve(vtt);
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    expect(controller.onSubtitleLoaded).toHaveBeenCalledTimes(1);
    expect(controller.onSubtitleLoaded.mock.calls[0][1].cues[0].id).toContain('new');
    unmount();
    vi.clearAllMocks();
  });
  it('keeps a read failure visible and retries the same original without replacing saved data', async () => {
    readClipSubtitleVtt.mockRejectedValueOnce(new Error('网络失败')).mockResolvedValueOnce(vtt);
    const controller = controls(),
      state = {
        draftSession: {},
        subtitleRetry: 0,
        timeline: { clips: [], subtitles: { sourceUrl: '/retry.vtt', visible: false, cues: [] } },
      };
    const { rerender, unmount } = renderHook(
      ({ value }) => useClipSubtitleSources(value, controller, identity),
      { initialProps: { value: state } },
    );
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    expect(controller.onSubtitleLoadStatus).toHaveBeenLastCalledWith(
      expect.any(String),
      '网络失败',
    );
    expect(controller.onSubtitleLoaded).not.toHaveBeenCalled();
    rerender({ value: { ...state, subtitleRetry: 1 } });
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    expect(controller.onSubtitleLoaded.mock.calls[0][1]).toMatchObject({
      visible: false,
      sourceUrl: '/retry.vtt',
    });
    expect(state.timeline.subtitles.cues).toEqual([]);
    unmount();
    vi.clearAllMocks();
  });
});
