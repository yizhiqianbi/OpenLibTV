import { describe, expect, it } from 'vitest';
import models from '../../../../public/data/models.json';
import {
  countOptions,
  evaluateGeneratorRules,
  fieldKeys,
  generatorPrompt,
  generatorInputCounts,
  generatorValidation,
  generatorValues,
  resolveGeneratorParams,
  visibleProperty,
} from './schema.js';

describe('public generation model schema contracts', () => {
  it('counts usable connected media once and guards malformed or empty persisted lists', () => {
    const target = {
      id: 'target',
      data: { params: { imageList: 'malformed', audioList: [null, 'stored'] } },
    };
    const nodes = [
      { id: 'ready', type: 'image', data: { url: ['/ready.png'] } },
      { id: 'empty', type: 'image', data: { url: [] } },
      { id: 'temp', type: 'video', data: { url: ['blob:temporary'] } },
      { id: 'pending', type: 'audio', data: { url: ['/pending.mp3'], status: 'uploading' } },
    ];
    const edges = ['ready', 'ready', 'empty', 'temp', 'pending'].map((source) => ({
      source,
      target: 'target',
    }));
    expect(generatorInputCounts(target, nodes, edges)).toEqual({
      imageList: 1,
      videoList: 0,
      audioList: 1,
    });
  });
  it('uses API store keys, typed source defaults and real generation counts across model changes', () => {
    const before = {
      prompt: '镜头描述',
      count: 3,
      settings: { quality: '2K', ratio: '9:16', _source: 'kept', notAllowed: 3 },
      advancedSettings: { searchable: 1 },
      imageList: ['ref'],
    };
    const next = resolveGeneratorParams(
      { ...before, model: 'lib-image-2.5-s' },
      models.imageModels['lib-image-2.5-s'],
      'image',
    );
    expect(next).toMatchObject({
      count: 1,
      prompt: '镜头描述',
      imageList: ['ref'],
      settings: {
        quality: 'medium',
        resolution: '2K',
        ratio: '9:16',
        background: 'auto',
        _source: 'kept',
      },
      advancedSettings: {},
    });
    expect(next.settings.notAllowed).toBeUndefined();
    expect(before.settings.notAllowed).toBe(3);
    expect(countOptions(models.imageModels['lib-image-2.5-s'])).toEqual([1, 2, 4]);
    const video = resolveGeneratorParams({}, models.videoModels['star-video2'], 'video');
    expect(video).toMatchObject({
      modeType: 'text2video',
      count: 1,
      settings: { ratio: '16:9', duration: 5, resolution: '720p', enableSound: 'on' },
      advancedSettings: { search_enabled: 1, autoCompliance: 1 },
    });
  });
  it('resolves mode dictionaries and grouped speech advanced fields without flattening voice metadata', () => {
    const speech = models.audioModels['speech-2.8-hd'];
    expect(fieldKeys(speech.config.advancedSettings)).toEqual([
      'voiceCard',
      'speed',
      'voicePitch',
      'vol',
      'modifyPitch',
      'modifyIntensity',
      'modifyTimbre',
      'soundEffects',
    ]);
    const resolved = resolveGeneratorParams({}, speech, 'audio');
    expect(resolved.advancedSettings.voice_setting_voice_id).toBe('female-shaonv');
    expect(resolved.advancedSettings._voice_setting_voice_id_meta).toMatchObject({
      voiceId: 'female-shaonv',
      name: '少女音色',
    });
    const selected = resolveGeneratorParams(
      {
        advancedSettings: {
          voice_setting_voice_id: 'custom',
          _voice_setting_voice_id_meta: { voiceId: 'custom', name: 'My voice' },
        },
      },
      speech,
      'audio',
    );
    expect(selected.advancedSettings.voice_setting_voice_id).toBe('custom');
    expect(selected.advancedSettings._voice_setting_voice_id_meta.name).toBe('My voice');
    const music = models.audioModels['mureka-8'];
    expect(
      resolveGeneratorParams(
        { modeType: 'lyrics2audio', advancedSettings: { force_instrumental: 1 } },
        music,
        'audio',
      ).advancedSettings,
    ).toEqual({});
    expect(generatorPrompt(music, 'lyrics2audio')).toMatchObject({
      maxLength: 3000,
      placeholder: '输入歌词，生成的歌曲将演唱这段歌词',
    });
  });
  it('normalizes unsupported old modes when changing models while retaining supported modes', () => {
    const speech = resolveGeneratorParams(
      { modeType: 'lyrics2audio' },
      models.audioModels['speech-2.8-hd'],
      'audio',
    );
    expect(speech.modeType).toBe('text2audio');
    const video = resolveGeneratorParams(
      { modeType: 'longVideo2video', count: 4 },
      models.videoModels['kling-video-o3'],
      'video',
    );
    expect(video.modeType).toBe('text2video');
    expect(video.count).toBe(countOptions(models.videoModels['kling-video-o3'])[0]);
    expect(
      resolveGeneratorParams(
        { modeType: 'frames2video' },
        models.videoModels['kling-video-o3'],
        'video',
      ).modeType,
    ).toBe('frames2video');
  });
  it('applies true reference-dependent ranges and long video rules instead of hardcoded 5/10/15 seconds', () => {
    const omni = models.videoModels['kling-v3-omni'];
    const input = { modeType: 'mixed2video', settings: { duration: 15 } };
    expect(resolveGeneratorParams(input, omni, 'video', { videoList: 1 }).settings.duration).toBe(
      10,
    );
    expect(resolveGeneratorParams(input, omni, 'video', { videoList: 0 }).settings.duration).toBe(
      15,
    );
    const long = resolveGeneratorParams(
      { modeType: 'longVideo2video', count: 4, settings: { duration: 5 } },
      models.videoModels['star-video2.5'],
      'video',
    );
    expect(long.count).toBe(1);
    expect(long.settings.duration).toBe(30);
  });
  it('disables conflicting options and falls back atomically to a valid source choice', () => {
    const schema = models.videoModels['MiniMax-Hailuo-2.3'];
    const params = resolveGeneratorParams(
      { modeType: 'text2video', settings: { resolution: '1080P', duration: 10 } },
      schema,
      'video',
    );
    expect(params.settings.duration === 10 && params.settings.resolution === '1080P').toBe(false);
    const rules = evaluateGeneratorRules(
      schema,
      { resolution: '1080P', duration: 6 },
      'text2video',
    );
    expect(rules.disabled.duration.has(10)).toBe(true);
    expect(rules.messages.duration).toBe('1080P 分辨率下不支持 10s 时长');
  });
  it('uses current API settings to evaluate conditional visibility', () => {
    const schema = models.videoModels['topaz-video-upscaler'];
    let params = resolveGeneratorParams({}, schema, 'video');
    expect(visibleProperty(schema.properties.fps, generatorValues(params, schema))).toBe(false);
    params = resolveGeneratorParams(
      { ...params, settings: { ...params.settings, specifiedModel: 'apo-8' } },
      schema,
      'video',
    );
    expect(visibleProperty(schema.properties.fps, generatorValues(params, schema))).toBe(true);
  });
  it('validates prompt/media rules and mode-specific length before an unavailable generation service', () => {
    expect(
      generatorValidation(
        { prompt: '', modeType: 'text2image' },
        models.imageModels['lib-image-2.5-s'],
        { imageList: 1 },
      ),
    ).toBe('');
    expect(
      generatorValidation(
        { prompt: '', modeType: 'text2image' },
        models.imageModels['lib-image-2.5-s'],
      ),
    ).toMatch(/提示词或/);
    expect(
      generatorValidation(
        { prompt: 'x'.repeat(3001), modeType: 'lyrics2audio' },
        models.audioModels['mureka-8'],
      ),
    ).toBe('提示词最多 3000 字');
    expect(
      generatorValidation({ prompt: 'x' }, { rules: [{ require: ['video'] }] }, { videoList: 0 }),
    ).toMatch(/参考素材/);
    expect(
      generatorValidation({ prompt: 'x' }, { rules: [{ require: ['video'] }] }, { videoList: 1 }),
    ).toBe('');
    expect(generatorValidation({}, null)).toBe('模型配置尚未加载');
  });
});
