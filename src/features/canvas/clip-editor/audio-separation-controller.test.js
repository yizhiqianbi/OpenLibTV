import { describe, expect, it, vi } from 'vitest';
import { runDetachedAudioOperation } from './audio-separation-controller.js';

function state() {
  return {
    draftSession: 'session-1',
    initialized: true,
    ready: true,
    conflicted: false,
    mediaBySourceId: new Map([
      ['audio-source', { url: 'data:audio/wav;base64,AA==', metadata: { sourceDuration: 4 } }],
    ]),
    timeline: {
      clips: [
        {
          id: 'video-1',
          type: 'video',
          sourceNodeId: 'video-source',
          startTime: 0,
          duration: 4,
          sourceDuration: 4,
          width: 1280,
          height: 720,
          zIndex: 0,
        },
      ],
      videoTrackCount: 1,
      totalDuration: 4,
      currentTime: 0,
      audioTrackMuted: false,
      audioTrackMutedPerTrack: [],
      audioTrackHiddenPerTrack: [],
    },
  };
}

describe('audio separation controller', () => {
  it('uploads the extracted WAV and commits the linked muted audio track', async () => {
    const current = state();
    const acceptEdit = vi.fn(() => true);
    const uploaded = [
      {
        id: 'audio-source',
        type: 'audio',
        data: { url: [current.mediaBySourceId.get('audio-source').url] },
      },
    ];
    const result = await runDetachedAudioOperation({
      clipId: 'video-1',
      captured: { nodeId: 'clip-node' },
      media: { url: 'blob:video' },
      session: current.draftSession,
      signal: new AbortController().signal,
      extractAudio: vi
        .fn()
        .mockResolvedValue({ file: new File(['wav'], 'detached.wav'), durationSec: 4 }),
      uploadFiles: vi.fn().mockResolvedValue(uploaded),
      getState: () => current,
      subscribe: () => () => {},
      isCurrentSession: () => true,
      acceptEdit,
    });
    expect(result).toEqual({ ok: true });
    expect(acceptEdit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'detached', timeline: expect.any(Object) }),
    );
    expect(acceptEdit.mock.calls[0][0].timeline.clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'video-1', embedAudioMuted: true }),
        expect.objectContaining({ id: 'audio-source', linkedVideoClipId: 'video-1' }),
      ]),
    );
  });

  it('stops before upload when the session is no longer current', async () => {
    const extractAudio = vi
      .fn()
      .mockResolvedValue({ file: new File(['wav'], 'detached.wav'), durationSec: 4 });
    const uploadFiles = vi.fn();
    const result = await runDetachedAudioOperation({
      clipId: 'video-1',
      captured: { nodeId: 'clip-node' },
      media: { url: 'blob:video' },
      session: 'session-1',
      signal: new AbortController().signal,
      extractAudio,
      uploadFiles,
      getState: () => state(),
      subscribe: () => () => {},
      isCurrentSession: () => false,
      acceptEdit: vi.fn(),
    });
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(uploadFiles).not.toHaveBeenCalled();
  });
});
