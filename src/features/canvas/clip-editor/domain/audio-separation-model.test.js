import { describe, expect, it } from 'vitest';
import { attachDetachedAudio, audioSeparationBlockReason } from './audio-separation-model.js';

const timeline = {
  clips: [
    {
      id: 'video-1',
      type: 'video',
      sourceNodeId: 'source-1',
      startTime: 2,
      duration: 4,
      sourceDuration: 4,
      width: 1280,
      height: 720,
      zIndex: 0,
    },
  ],
  videoTrackCount: 1,
  totalDuration: 6,
  currentTime: 2,
  audioTrackMuted: false,
  audioTrackMutedPerTrack: [],
  audioTrackHiddenPerTrack: [],
};

describe('clip audio separation model', () => {
  it('gates missing, muted and unsupported embedded audio states', () => {
    expect(audioSeparationBlockReason()).toBe('请先选中视频片段');
    expect(audioSeparationBlockReason({ clip: { ...timeline.clips[0], loading: true } })).toBe(
      '请等待视频片段加载完成',
    );
    expect(
      audioSeparationBlockReason({
        clip: { ...timeline.clips[0], embedAudioMuted: true },
        media: { url: 'blob:video' },
      }),
    ).toBe('该片段已分离过音轨，无法再次分离');
    expect(
      audioSeparationBlockReason({
        clip: timeline.clips[0],
        sourceNode: { data: { videoHasAudioTrack: false } },
        media: { url: 'blob:video' },
      }),
    ).toBe('当前视频无音轨，无法分离音视频');
  });

  it('adds a linked audio clip and mutes the original embedded track atomically', () => {
    const result = attachDetachedAudio(timeline, {
      videoClipId: 'video-1',
      audioId: 'audio-1',
      audioSourceNodeId: 'audio-source-1',
      url: 'data:audio/wav;base64,AA==',
      durationSec: 4,
    });
    expect(result.status).toBe('detached');
    expect(result.timeline.clips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'video-1', embedAudioMuted: true }),
        expect.objectContaining({
          id: 'audio-1',
          type: 'audio',
          linkedVideoClipId: 'video-1',
          startTime: 2,
          duration: 4,
        }),
      ]),
    );
  });
});
