import { describe, expect, it } from 'vitest';
import {
  VOCAL_SPLIT_CHOICES,
  vocalSplitBlockReason,
  vocalSplitChoice,
} from './vocal-separation-model.js';

describe('vocal separation source contract', () => {
  it('keeps the source choice order and normalizes unknown values', () => {
    expect(VOCAL_SPLIT_CHOICES.map((choice) => choice.value)).toEqual([
      'vocals',
      'background',
      'sfx',
    ]);
    expect(vocalSplitChoice('background')).toBe('background');
    expect(vocalSplitChoice('unknown')).toBeNull();
  });

  it('gates missing audio, duplicate processing and the three-minute limit', () => {
    const clip = { type: 'video', sourceDuration: 20 };
    expect(vocalSplitBlockReason()).toBe('请先选中视频片段');
    expect(
      vocalSplitBlockReason({
        clip,
        sourceNode: { data: { videoHasAudioTrack: false } },
        media: { url: 'blob:video', metadata: { sourceDuration: 20 } },
      }),
    ).toBe('当前视频无音轨，无法使用人声分离');
    expect(
      vocalSplitBlockReason({
        clip: { ...clip, embedAudioMuted: true },
        media: { url: 'blob:video', metadata: { sourceDuration: 20 } },
      }),
    ).toBe('该片段已做人声分离或音视频分离');
    expect(
      vocalSplitBlockReason({
        clip,
        media: { url: 'blob:video', metadata: { sourceDuration: 181 } },
      }),
    ).toBe('视频时长超过 3 分钟，暂不支持人声分离');
  });
});
