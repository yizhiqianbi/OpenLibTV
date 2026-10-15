// @vitest-environment node
import { describe, expect, it } from 'vitest';
import models from '../../../../public/data/models.json';
import {
  collectGeneratorMediaInputs,
  generatorMediaModes,
  generatorSettingLocks,
  ignoredGeneratorMediaTypes,
  inferGeneratorMediaMode,
  mergeGeneratorMediaSchema,
  validateGeneratorMediaInputs,
} from './media-input-model.js';

const videos = models.videoModels;
const refs = (type, amount, metadata = {}) =>
  Array.from({ length: amount }, (_, index) => ({
    nodeId: `${type}-${index}`,
    url: `https://assets.test/${type}-${index}.${type === 'image' ? 'png' : type === 'video' ? 'mp4' : 'mp3'}`,
    ...metadata,
  }));
const mode = (result, key) => result.all.find((entry) => entry.key === key);

describe('source media references and actual model mode contracts', () => {
  it('collects current edges once, preserves verified resource metadata and never treats graph dimensions as media dimensions', () => {
    const target = { id: 'target', data: { params: { videoList: refs('video', 1) } } };
    const nodes = [
      {
        id: 'video-0',
        type: 'video',
        width: 350,
        height: 230,
        data: {
          name: '视频',
          url: ['https://assets.test/video-0.mp4'],
          width: 350,
          height: 230,
          duration: 15,
        },
        resourceMeta: {
          items: [
            {
              kind: 'video',
              sourceUrl: 'https://assets.test/old.mp4',
              width: 9,
              height: 9,
              durationSec: 99,
            },
            {
              kind: 'video',
              sourceUrl: 'https://assets.test/video-0.mp4',
              width: 1920,
              height: 1080,
              durationSec: 8.25,
              byteSize: 12500,
            },
          ],
        },
      },
      {
        id: 'image',
        type: 'image',
        data: {
          url: ['https://assets.test/preview.png'],
          originalUrl: ['https://assets.test/full.png'],
        },
      },
    ];
    const before = structuredClone(nodes);
    const inputs = collectGeneratorMediaInputs({
      target,
      nodes,
      edges: [
        { source: 'video-0', target: 'target' },
        { source: 'video-0', target: 'target' },
        { source: 'image', target: 'target' },
      ],
    });
    expect(inputs.videoList).toHaveLength(1);
    expect(inputs.videoList[0]).toMatchObject({
      width: 1920,
      height: 1080,
      durationSec: 8.25,
      byteSize: 12500,
    });
    expect(inputs.imageList[0].url).toBe('https://assets.test/full.png');
    expect(inputs.imageList[0].width).toBeUndefined();
    expect(nodes).toEqual(before);
  });

  it('expands group children with exclusions and rejects pending/blob/unmarked local media without losing ready persisted references', () => {
    const target = {
      id: 'target',
      data: {
        groupRefExcludedNodeIds: ['excluded'],
        params: { audioList: [null, 'https://assets.test/stored.mp3'] },
      },
    };
    const nodes = [
      { id: 'group', type: 'group', data: {} },
      ...['excluded', 'blob', 'pending', 'unmarked', 'ready'].map((id) => ({
        id,
        type: 'image',
        parentId: 'group',
        data: {
          url: [
            id === 'blob'
              ? 'blob:temporary'
              : id === 'excluded'
                ? '/excluded.png'
                : 'data:image/png;base64,AA==',
          ],
          ...(id === 'pending' ? { localMediaReady: true, status: 'uploading' } : {}),
          ...(id === 'ready' ? { localMediaReady: true } : {}),
        },
      })),
    ];
    const inputs = collectGeneratorMediaInputs({
      target,
      nodes,
      edges: [{ source: 'group', target: 'target' }],
    });
    expect(inputs.imageList.map((ref) => ref.nodeId)).toEqual(['ready']);
    expect(inputs.audioList.map((ref) => ref.url)).toEqual(['https://assets.test/stored.mp3']);
  });

  it('keeps source video menu ordering, hidden audio mode and explicit director mixed-audio option distinct', () => {
    const inputs = { audioList: refs('audio', 1) };
    const ordinary = generatorMediaModes(videos['star-video2'], inputs);
    expect(mode(ordinary, 'audio2video').enabled).toBe(true);
    expect(mode(ordinary, 'mixed2video').enabled).toBe(false);
    expect(ordinary.visible.some((entry) => entry.key === 'audio2video')).toBe(false);
    expect(ordinary.visible.map((entry) => entry.key).slice(0, 2)).toEqual([
      'text2video',
      'mixed2video',
    ]);
    expect(inferGeneratorMediaMode(videos['star-video2'], inputs)).toBe('audio2video');
    expect(
      inferGeneratorMediaMode(videos['star-video2'], inputs, { includeAudioInMixedList: true }),
    ).toBe('mixed2video');
  });

  it('applies combo-wide caps and chooses mixed for image+video but video edit for video-only input', () => {
    const schema = videos['kling-v3-omni'];
    const combined = { imageList: refs('image', 1), videoList: refs('video', 1) };
    expect(inferGeneratorMediaMode(schema, combined)).toBe('mixed2video');
    expect(inferGeneratorMediaMode(schema, { videoList: refs('video', 1) })).toBe(
      'videoEdit2video',
    );
    const overflow = generatorMediaModes(schema, { ...combined, videoList: refs('video', 2) });
    expect(overflow.compatible).toBe(false);
    expect(mode(overflow, 'frames2video')).toMatchObject({
      enabled: false,
      disabledReason: '当前模型不支持已连接的媒体组合',
    });
  });

  it('retains an enabled zero-min non-text mode with no media, while an excluded text mode still requires references', () => {
    expect(
      inferGeneratorMediaMode(
        videos['MiniMax-Hailuo-2.3'],
        {},
        { currentModeType: 'singleImage2video' },
      ),
    ).toBe('singleImage2video');
    const schema = videos['MiniMax-Hailuo-2.3-Fast'];
    const inferred = inferGeneratorMediaMode(schema, {});
    expect(inferred).toBe('singleImage2video');
    expect(mode(generatorMediaModes(schema, {}), inferred).enabled).toBe(false);
    expect(validateGeneratorMediaInputs(schema, inferred, {}, { prompt: '描述' }).valid).toBe(
      false,
    );
  });

  it('gates long video by the actual schema flag and keeps first-frame labels for one-image frame modes', () => {
    const source = videos['star-video2.5'];
    expect(mode(generatorMediaModes(source), 'longVideo2video')).toMatchObject({
      visible: true,
      enabled: true,
      badge: 'Beta',
    });
    const unsupported = {
      ...source,
      properties: { ...source.properties, supportLongVideo: false },
    };
    expect(mode(generatorMediaModes(unsupported), 'longVideo2video').visible).toBe(false);
    expect(
      mode(
        generatorMediaModes(videos['motion-3-rapid'], { imageList: refs('image', 1) }),
        'frames2video',
      ).label,
    ).toBe('首帧');
  });

  it('returns ignored media warnings without silently removing saved references', () => {
    const inputs = {
      imageList: refs('image', 1),
      videoList: refs('video', 1),
      audioList: refs('audio', 1),
    };
    const before = structuredClone(inputs);
    expect(ignoredGeneratorMediaTypes(videos['star-video2.5'], 'videoEdit2video', inputs)).toEqual(
      [],
    );
    expect(ignoredGeneratorMediaTypes(videos['star-video2'], 'singleImage2video', inputs)).toEqual([
      'video',
      'audio',
    ]);
    expect(
      mode(generatorMediaModes(videos['star-video2'], inputs), 'singleImage2video').warningReason,
    ).toContain('视频');
    expect(inputs).toEqual(before);
  });

  it('uses image count and audio image-first inference, preserves legal lyrics mode and rejects mixed audio inputs', () => {
    const image = models.imageModels['qwen-edit'];
    expect(inferGeneratorMediaMode(image, { imageList: refs('image', 1) }, { type: 'image' })).toBe(
      'image2image',
    );
    expect(
      generatorMediaModes(image, { imageList: refs('image', 3) }, { type: 'image' }).compatible,
    ).toBe(false);
    const audio = models.audioModels['seed-audio-1.0'];
    expect(
      inferGeneratorMediaMode(
        audio,
        { imageList: refs('image', 1), audioList: refs('audio', 1) },
        { type: 'audio' },
      ),
    ).toBe('image2audio');
    expect(
      generatorMediaModes(
        audio,
        { imageList: refs('image', 1), audioList: refs('audio', 1) },
        { type: 'audio' },
      ).compatible,
    ).toBe(false);
    expect(
      inferGeneratorMediaMode(
        models.audioModels['mureka-8'],
        {},
        { type: 'audio', currentModeType: 'lyrics2audio' },
      ),
    ).toBe('lyrics2audio');
    expect(
      inferGeneratorMediaMode(
        models.audioModels['speech-2.8-hd'],
        {},
        { type: 'audio', currentModeType: 'lyrics2audio' },
      ),
    ).toBe('text2audio');
  });
});

describe('source media constraints, rule gates and locked settings', () => {
  it('honors whenHas and mode-scoped input rules instead of applying audio-only warnings to empty input', () => {
    const schema = videos['MiniMax-Hailuo-H3'];
    expect(
      validateGeneratorMediaInputs(schema, 'text2video', {}, { prompt: '描述' }).blockMessages,
    ).toEqual([]);
    expect(
      validateGeneratorMediaInputs(
        schema,
        'mixed2video',
        { audioList: refs('audio', 1) },
        { prompt: '描述', includeAudioInMixedList: true },
      ).blockMessages,
    ).toContain('全能参考不可仅输入音频，须至少包含 1 个参考视频或图片');
    expect(
      validateGeneratorMediaInputs(
        videos['kling-v3-motion-control'],
        'mixed2video',
        { imageList: refs('image', 1) },
        { prompt: '描述' },
      ).blockMessages,
    ).toContain('请同时添加参考图片和视频');
  });

  it('checks real per-mode duration/format constraints, keeps height violations as warnings and treats exact limits as inclusive', () => {
    const schema = videos['kling-v3-omni'];
    const valid = validateGeneratorMediaInputs(
      schema,
      'videoEdit2video',
      { videoList: refs('video', 1, { durationSec: 3, width: 1280, height: 720 }) },
      { prompt: '描述' },
    );
    expect(valid).toMatchObject({
      valid: true,
      complete: true,
      blockMessages: [],
      warnMessages: [],
    });
    const invalid = validateGeneratorMediaInputs(
      schema,
      'videoEdit2video',
      {
        videoList: [
          {
            nodeId: 'bad',
            url: 'https://assets.test/a.WEBM?signature=1',
            durationSec: 10.01,
            height: 400,
            width: 640,
          },
        ],
      },
      { prompt: '描述' },
    );
    expect(invalid.blockMessages).toEqual([
      '输入视频仅支持MP4和MOV格式',
      '输入视频需要在3s-10s之间,可使用【剪辑工具】进行快捷剪辑',
    ]);
    expect(invalid.warnMessages).toHaveLength(1);
    expect(invalid.complete).toBe(true);
  });

  it('returns missing metadata as unresolved without asserting that a source-skipped probe means validated media', () => {
    const result = validateGeneratorMediaInputs(
      videos['kling-v3-omni'],
      'videoEdit2video',
      { videoList: [{ nodeId: 'unknown', url: 'https://assets.test/opaque' }] },
      { prompt: '描述' },
    );
    expect(result).toMatchObject({
      valid: false,
      sourceAccepted: true,
      complete: false,
      blockMessages: [],
    });
    expect(result.unresolved.map((item) => item.field)).toEqual(['formats', 'duration', 'height']);
    expect(result.unresolved.every((item) => item.nodeId === 'unknown')).toBe(true);
  });

  it('checks global upscaler side/size constraints using verified values and deduplicates identical source messages', () => {
    const result = validateGeneratorMediaInputs(videos['volcano-video-upscaler'], 'video2video', {
      videoList: refs('video', 2, { width: 3000, height: 1600, byteSize: 10737418241 }),
    });
    expect(result.complete).toBe(true);
    expect(result.blockMessages.filter((message) => message.includes('超过 2K'))).toHaveLength(1);
    expect(result.blockMessages).toContain('视频文件超过 10GB，暂不支持超分');
  });

  it('merges real template schema overrides without erasing compliance or config and reports the template lock separately', () => {
    const schema = videos['star-video2'];
    const before = structuredClone(schema);
    const extra = {
      scene: 'saved-template',
      models: [{ modelKey: 'star-video2', modelName: 'StarVideo 2.0' }],
      schema: {
        config: false,
        properties: {
          portrait: false,
          autoCompliance: { default: 0 },
          duration: { component: 'slider', min: 4, max: 12 },
        },
        defaultProperity: { duration: 8 },
      },
    };
    const result = mergeGeneratorMediaSchema(schema, extra);
    expect(result).toMatchObject({ configLocked: true, modelKeys: ['star-video2'] });
    expect(result.schema.config).toEqual(schema.config);
    expect(result.schema.properties.portrait).toBe(true);
    expect(result.schema.properties.autoCompliance).toEqual(schema.properties.autoCompliance);
    expect(result.schema.properties.duration).toMatchObject({ max: 12, default: 8 });
    expect(schema).toEqual(before);
    expect(mergeGeneratorMediaSchema(schema, { schema: {}, models: [] })).toEqual({
      schema,
      configLocked: false,
      modelKeys: null,
    });
  });

  it('locks only schema ratio fields, hides remake ratios and enforces long-video count without modifying existing params', () => {
    const schema = videos['kling-v3-omni'];
    const params = { modeType: 'frames2video', count: 4, segmentRemakeLock: true };
    const locks = generatorSettingLocks(schema, params, {
      lockRatioOnly: true,
      hiddenKeys: ['duration'],
    });
    expect(locks.hiddenKeys).toContain('ratio_auto');
    expect(locks.hiddenKeys).toContain('duration');
    expect(locks.lockedKeys).toEqual(['ratio_auto']);
    expect(locks.lockedStoreKeys).toEqual(['ratio']);
    expect(locks.modeLocked).toBe(true);
    expect(
      generatorSettingLocks(videos['star-video2.5'], { modeType: 'longVideo2video', count: 4 })
        .count,
    ).toBe(1);
    expect(params.count).toBe(4);
  });

  it('derives motion-control duration from actual maximum source duration and keeps unknown inputs unresolved', () => {
    const schema = videos['kling-v3-motion-control'];
    const params = { modeType: 'mixed2video', settings: { duration: 20 } };
    const result = generatorSettingLocks(schema, params, {
      inputs: {
        videoList: refs('video', 1, { durationSec: 6.9 }),
        mixedList: [{ nodeId: 'other', url: '/other.mp4', mediaType: 'video', durationSec: 9.9 }],
      },
    });
    expect(result.settingsPatch).toEqual({ duration: 9 });
    const unknown = generatorSettingLocks(schema, params, {
      inputs: { videoList: [{ nodeId: 'unknown', url: '/unknown.mp4' }] },
    });
    expect(unknown.settingsPatch).toEqual({});
    expect(unknown.unresolved).toEqual([
      { nodeId: 'unknown', url: '/unknown.mp4', field: 'duration' },
    ]);
    expect(params.settings.duration).toBe(20);
  });
});
