import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  VIDEO_COMPOSE_AGENT_CONFIG_ID,
  VIDEO_COMPOSE_DEFAULT_MODE_KEY,
  applyVideoComposeComposerMode,
  buildVideoComposeAgentSubmit,
  getVideoComposeMode,
  getVideoComposeModeName,
  getVideoComposeParameterSchema,
  getVideoComposeParamsForModeApply,
  isValidVideoComposeAgentConfig,
  patchVideoComposeComposer,
  patchVideoComposeParameterSettings,
  readVideoComposeComposer,
  resolveVideoComposeAgentConfig,
  validateVideoComposeComposer,
} from './agent-composer-model.js';

const fallback = JSON.parse(readFileSync('public/data/video-compose-agent-config.json', 'utf8'));
const params = { aspectRatio: '16:9', duration: 30, resolution: '720P' };
const incoming = {
  videoList: [
    { nodeId: 'v1', url: '/one.mp4' },
    { nodeId: 'v2', url: '/two.mp4' },
  ],
  imageList: [{ nodeId: 'i1', url: '/product.png' }],
  audioList: [{ nodeId: 'a1', url: '/voice.wav' }],
  textList: [{ nodeId: 't1', content: 'script' }],
};
const nodes = [
  { id: 'v1', type: 'video', data: { name: '视频一', label: 'old', type: 'wrong-raw' } },
  { id: 'v2', type: 'video', data: { label: '视频二' } },
  { id: 'i1', type: 'image', data: { name: '产品图' } },
  { id: 'a1', type: 'audio', data: { name: '声音' } },
  { id: 't1', type: 'text', data: {} },
];
function copyConfig() {
  return structuredClone(fallback);
}
function input(overrides = {}) {
  return {
    nodeId: 'clip',
    projectId: 'project',
    nodes,
    config: fallback,
    composer: { modeKey: 'default', prompt: ' 做快剪 ', params },
    incomingData: incoming,
    ...overrides,
  };
}

describe('archived complete video compose Agent config', () => {
  it('keeps exact config 280, the default and the three actually configured modes', () => {
    expect(VIDEO_COMPOSE_AGENT_CONFIG_ID).toBe('280');
    expect(VIDEO_COMPOSE_DEFAULT_MODE_KEY).toBe('default');
    expect(
      [fallback.defaultMode, ...fallback.modes].map(({ modeKey, name }) => ({ modeKey, name })),
    ).toEqual([
      { modeKey: 'default', name: '默认模式' },
      { modeKey: 'explainerVideo', name: '讲解视频' },
      { modeKey: 'batchAd', name: '批量广告' },
      { modeKey: 'smartMixCut', name: '素材混剪' },
    ]);
    expect(fallback.params).toEqual({
      aspectRatios: ['21:9', '16:9', '9:16', '1:1', '4:3', '3:4'],
      durationRange: { min: 0, max: 300, default: 30 },
      resolutions: ['480P', '720P', '1080P'],
      defaults: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
    });
  });

  it('keeps original preset metadata only and does not add modes from an icon registry', () => {
    expect(fallback.modes.map((mode) => mode.preset.materials.length)).toEqual([1, 2, 7]);
    expect(fallback.modes[1].preset.materials).toEqual([
      {
        slotKey: 'refVideo',
        nodeType: 'video',
        url: 'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/d7ca400a8074fbffe9c463a8c85882b82335690f.mp4',
        width: 400,
        height: 712,
      },
      {
        slotKey: 'productImage',
        nodeType: 'image',
        url: 'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/9febab9d5fc3d3cd530620a834dab4f2805cfedb.png',
        width: 400,
        height: 400,
      },
    ]);
    expect(fallback.modes.find((mode) => mode.modeKey === 'productUrlAd')).toBeUndefined();
    expect(fallback.modes.find((mode) => mode.modeKey === 'talkingVideo')).toBeUndefined();
  });

  it('accepts valid remote config without modifying or localizing it', () => {
    const remote = { ...copyConfig(), serverOnly: 8 };
    remote.defaultMode.name = 'Remote';
    expect(isValidVideoComposeAgentConfig(remote)).toBe(true);
    expect(resolveVideoComposeAgentConfig(remote, fallback)).toBe(remote);
  });

  it('uses the Chinese archived fallback after malformed remote config', () => {
    expect(resolveVideoComposeAgentConfig({ modes: [] }, fallback)).toBe(fallback);
    expect(resolveVideoComposeAgentConfig(null, fallback)).toBe(fallback);
    expect(resolveVideoComposeAgentConfig(null, null)).toBeNull();
  });

  it.each([
    [
      'modes',
      (config) => {
        config.modes = {};
      },
    ],
    [
      'default material slots',
      (config) => {
        config.defaultMode.materialSlots = null;
      },
    ],
    [
      'ratio list',
      (config) => {
        config.params.aspectRatios = '16:9';
      },
    ],
    [
      'resolution list',
      (config) => {
        config.params.resolutions = null;
      },
    ],
    [
      'string minimum',
      (config) => {
        config.params.durationRange.min = '0';
      },
    ],
    [
      'non-finite maximum',
      (config) => {
        config.params.durationRange.max = Infinity;
      },
    ],
    [
      'reversed range',
      (config) => {
        config.params.durationRange.min = 301;
      },
    ],
    [
      'out-of-range range default',
      (config) => {
        config.params.durationRange.default = -1;
      },
    ],
    [
      'bad default ratio',
      (config) => {
        config.params.defaults.aspectRatio = '2:1';
      },
    ],
    [
      'non-finite default duration',
      (config) => {
        config.params.defaults.duration = NaN;
      },
    ],
    [
      'out-of-range default duration',
      (config) => {
        config.params.defaults.duration = 301;
      },
    ],
    [
      'bad default resolution',
      (config) => {
        config.params.defaults.resolution = '4K';
      },
    ],
  ])('rejects original envelope failure: %s', (_label, mutate) => {
    const remote = copyConfig();
    mutate(remote);
    expect(isValidVideoComposeAgentConfig(remote)).toBe(false);
    expect(resolveVideoComposeAgentConfig(remote, fallback)).toBe(fallback);
  });

  it('retains the original shallow resolver and fractional defaults instead of inventing validation', () => {
    const remote = copyConfig();
    remote.modes = [{ arbitrary: true }];
    remote.params.defaults.duration = 30.5;
    remote.params.durationRange.default = 2.5;
    expect(isValidVideoComposeAgentConfig(remote)).toBe(true);
  });
});

describe('composer mode and parameter document operations', () => {
  it('resolves absent, default and unknown mode keys to actual defaultMode', () => {
    expect(getVideoComposeMode(undefined, fallback)).toBe(fallback.defaultMode);
    expect(getVideoComposeMode('default', fallback)).toBe(fallback.defaultMode);
    expect(getVideoComposeMode('unknown', fallback)).toBe(fallback.defaultMode);
    expect(getVideoComposeMode('batchAd', fallback)).toBe(fallback.modes[1]);
    expect(getVideoComposeMode('default', null)).toBeNull();
    expect(getVideoComposeModeName('unknown', fallback)).toBe('默认模式');
  });

  it('reads saved parameters and prompt without silently sanitizing old values', () => {
    expect(readVideoComposeComposer(undefined, fallback)).toEqual({
      modeKey: 'default',
      prompt: '',
      params,
    });
    const saved = {
      modeKey: 'old',
      prompt: '',
      params: { aspectRatio: 'old', duration: -1, resolution: 'old', extension: true },
    };
    expect(readVideoComposeComposer(saved, fallback)).toEqual(saved);
    expect(readVideoComposeComposer(saved, fallback).params).toBe(saved.params);
  });

  it('writes original three-field composer shape and keeps typed patch fields', () => {
    expect(
      patchVideoComposeComposer(
        { modeKey: 'batchAd', prompt: 'draft', params, oldField: true },
        { prompt: '' },
        fallback,
      ),
    ).toEqual({ modeKey: 'batchAd', prompt: '', params });
  });

  it('ordinary mode selection retains the existing parameters and non-empty original prompt', () => {
    const savedParams = { aspectRatio: '1:1', duration: 9.5, resolution: '480P', extra: 8 };
    const saved = { modeKey: 'default', prompt: '  保留这个  ', params: savedParams };
    expect(applyVideoComposeComposerMode(saved, 'batchAd', fallback)).toEqual({
      modeKey: 'batchAd',
      prompt: '  保留这个  ',
      params: savedParams,
    });
    expect(getVideoComposeParamsForModeApply(fallback.modes[1], fallback, savedParams, false)).toBe(
      savedParams,
    );
  });

  it('applies original preset prompt only when the previous prompt is blank', () => {
    expect(
      applyVideoComposeComposerMode(
        { prompt: '  ', params: { duration: 9 } },
        'explainerVideo',
        fallback,
        { withPreset: true },
      ),
    ).toEqual({
      modeKey: 'explainerVideo',
      prompt: '根据我的音色和主题，生成讲解视频。我的主题是‘神经网络发展历史科普’',
      params,
    });
    expect(
      applyVideoComposeComposerMode(
        { prompt: '保留我的提示词', params },
        'explainerVideo',
        fallback,
        { withPreset: true },
      ).prompt,
    ).toBe('保留我的提示词');
  });

  it('joins preset URL and text without introducing a separate URL field', () => {
    const config = copyConfig();
    config.modes[0].preset.urlValue = 'https://product.test';
    expect(
      applyVideoComposeComposerMode(undefined, 'explainerVideo', config, { withPreset: true })
        .prompt,
    ).toBe(
      'https://product.test 根据我的音色和主题，生成讲解视频。我的主题是‘神经网络发展历史科普’',
    );
    expect(
      applyVideoComposeComposerMode(undefined, 'explainerVideo', config).prompt,
    ).toBeUndefined();
  });

  it('validates preset mode params with typed enums, integer duration and original inclusive bounds', () => {
    const config = copyConfig();
    const mode = {
      ...config.modes[0],
      params: { aspectRatio: '1:1', duration: 0, resolution: '1080P' },
    };
    expect(getVideoComposeParamsForModeApply(mode, config, params, true)).toEqual({
      aspectRatio: '1:1',
      duration: 0,
      resolution: '1080P',
    });
    mode.params.duration = 300;
    expect(getVideoComposeParamsForModeApply(mode, config, params, true).duration).toBe(300);
    mode.params = { aspectRatio: 1, duration: 30.5, resolution: '4K' };
    expect(getVideoComposeParamsForModeApply(mode, config, params, true)).toEqual(params);
  });

  it('builds exact independent compose schema rather than ordinary model configuration', () => {
    expect(getVideoComposeParameterSchema(fallback)).toEqual({
      properties: {
        ratio: {
          displayName: '比例',
          displayNameI18nKey: 'canvas:videoComposeAspectRatio',
          enum: ['21:9', '16:9', '9:16', '1:1', '4:3', '3:4'],
          component: 'singleButton',
          default: '16:9',
        },
        duration: {
          displayName: '时长',
          displayNameI18nKey: 'canvas:videoComposeDuration',
          component: 'slider',
          min: 0,
          max: 300,
          step: 1,
          default: 30,
        },
        resolution: {
          displayName: '清晰度',
          displayNameI18nKey: 'canvas:videoComposeResolution',
          enum: ['480P', '720P', '1080P'],
          component: 'singleButton',
          default: '720P',
        },
      },
      config: { settings: ['ratio', 'duration', 'resolution'] },
    });
  });

  it('maps toolbar ratio/duration/resolution settings without changing zero or typed source semantics', () => {
    expect(
      patchVideoComposeParameterSettings(params, {
        ratio: '9:16',
        duration: 0,
        resolution: '1080P',
      }),
    ).toEqual({ aspectRatio: '9:16', duration: 0, resolution: '1080P' });
    expect(
      patchVideoComposeParameterSettings(params, { ratio: null, duration: '10', resolution: null }),
    ).toEqual(params);
    expect(patchVideoComposeParameterSettings(params, null)).toBe(params);
  });
});

describe('source material, prompt and disabled gates', () => {
  it('orders slot failures before URL and prompt failure using original boundaries', () => {
    const config = copyConfig();
    config.defaultMode.urlInput = { required: true };
    expect(
      validateVideoComposeComposer(input({ config, composer: { prompt: '' }, incomingData: {} }))
        .errors,
    ).toEqual([
      { key: 'canvas:videoComposeMissingSlot', slotKey: 'video', min: 1 },
      { key: 'canvas:videoComposeMissingUrl' },
      { key: 'canvas:videoComposePromptRequired' },
    ]);
  });

  it('requires batch product image and one reference video separately', () => {
    const state = input({
      composer: { modeKey: 'batchAd', prompt: '广告', params },
      incomingData: { videoList: [], imageList: [] },
    });
    expect(validateVideoComposeComposer(state).errors).toEqual([
      { key: 'canvas:videoComposeMissingSlot', slotKey: 'productImage', min: 1 },
      { key: 'canvas:videoComposeMissingSlot', slotKey: 'refVideo', min: 1 },
    ]);
    state.incomingData = {
      videoList: [{ nodeId: 'v1' }, { nodeId: 'v2' }],
      imageList: [{ nodeId: 'i1' }],
    };
    expect(validateVideoComposeComposer(state).errors).toEqual([
      { key: 'canvas:videoComposeTooManySlot', slotKey: 'refVideo', max: 1 },
    ]);
  });

  it('counts actual incoming items without inventing a per-material remote URL gate', () => {
    expect(
      validateVideoComposeComposer(
        input({ incomingData: { videoList: [{ nodeId: 'without-url' }] } }),
      ).canSend,
    ).toBe(true);
  });

  it('requires five mixed-cut videos and allows the exact thirty-video limit', () => {
    const composer = { modeKey: 'smartMixCut', prompt: '卡点', params };
    expect(
      validateVideoComposeComposer(
        input({ composer, incomingData: { videoList: Array(4).fill({}) } }),
      ).errors,
    ).toEqual([{ key: 'canvas:videoComposeMissingSlot', slotKey: 'generatedVideo', min: 5 }]);
    expect(
      validateVideoComposeComposer(
        input({ composer, incomingData: { videoList: Array(30).fill({}) } }),
      ).canSend,
    ).toBe(true);
    expect(
      validateVideoComposeComposer(
        input({ composer, incomingData: { videoList: Array(31).fill({}) } }),
      ).errors,
    ).toEqual([{ key: 'canvas:videoComposeTooManySlot', slotKey: 'generatedVideo', max: 30 }]);
  });

  it('enforces optional-slot maximum but does not enforce its minimum when not required', () => {
    const config = copyConfig();
    config.modes[0].materialSlots[1].min = 5;
    const composer = { modeKey: 'explainerVideo', prompt: '讲解', params };
    expect(
      validateVideoComposeComposer(
        input({ config, composer, incomingData: { audioList: [{}], textList: [] } }),
      ).canSend,
    ).toBe(true);
    expect(
      validateVideoComposeComposer(
        input({
          config,
          composer,
          incomingData: { audioList: [{}], textList: Array(11).fill({}) },
        }),
      ).errors,
    ).toEqual([{ key: 'canvas:videoComposeTooManySlot', slotKey: 'text', max: 10 }]);
  });

  it('requires prompt regardless of a remote promptRequired false', () => {
    const config = copyConfig();
    config.defaultMode.promptRequired = false;
    expect(
      validateVideoComposeComposer(input({ config, composer: { prompt: '  ' } })).errors,
    ).toEqual([{ key: 'canvas:videoComposePromptRequired' }]);
  });

  it('uses unanchored case-insensitive original URL regex', () => {
    const config = copyConfig();
    config.defaultMode.urlInput = { required: true };
    expect(
      validateVideoComposeComposer(
        input({ config, composer: { prompt: '产品 HTTP://EXAMPLE.TEST 介绍' } }),
      ).canSend,
    ).toBe(true);
    expect(
      validateVideoComposeComposer(input({ config, composer: { prompt: 'www.example.test' } }))
        .errors,
    ).toEqual([{ key: 'canvas:videoComposeMissingUrl' }]);
    expect(
      validateVideoComposeComposer(input({ config, composer: { prompt: 'https:// ' } })).errors,
    ).toEqual([{ key: 'canvas:videoComposeMissingUrl' }]);
  });

  it.each(['readonly', 'collabReadonly', 'pending', 'agentEditingActive'])(
    'disables valid send for %s without fabricating task state',
    (flag) => {
      const result = buildVideoComposeAgentSubmit(input({ [flag]: true }));
      expect(result.status).toBe('blocked');
      expect(result.payload).toBeNull();
      expect(result.validation.errors).toEqual([]);
      expect(result.validation.disabled).toBe(true);
    },
  );

  it('keeps missing configuration explicitly unavailable', () => {
    expect(validateVideoComposeComposer(input({ config: null }))).toEqual({
      mode: null,
      errors: [{ key: 'config-unavailable' }],
      disabled: false,
      canSend: false,
    });
  });
});

describe('original ey send payload without original service execution', () => {
  it('builds full literal default payload with original prefix/parts and tracking', () => {
    const built = buildVideoComposeAgentSubmit(input());
    expect(built.payload).toEqual({
      type: 'agent-prompt',
      parts: [
        { type: 'text', text: '{{ node:v1 }} {{ node:v2 }} 做快剪，参数是 16:9 · 30s · 720P' },
        {
          type: 'node',
          id: 'v1',
          nodeKey: 'v1',
          projectId: 'project',
          name: '视频一',
          nodeType: 'video',
          url: '/one.mp4',
          mediaType: 'video',
        },
        {
          type: 'node',
          id: 'v2',
          nodeKey: 'v2',
          projectId: 'project',
          name: '视频二',
          nodeType: 'video',
          url: '/two.mp4',
          mediaType: 'video',
        },
      ],
      extra: {
        currentNodeKey: 'clip',
        entryItemKey: 'video_compose',
        videoComposeSubmitTracking: {
          nodeUuid: 'clip',
          projectUuid: 'project',
          functionKey: 'default',
          useAt: false,
          nodeReferenceList: [
            { node_uuid: 'v1', node_type: 'video' },
            { node_uuid: 'v2', node_type: 'video' },
          ],
        },
      },
    });
    expect(built.skillUseMeta).toEqual([]);
    expect(built.status).toBe('ready');
  });

  it('resolves repeated mentions at their ordinals and adds each node part once in encounter order', () => {
    const built = buildVideoComposeAgentSubmit(
      input({ composer: { prompt: ' {{Image 1}}与{{Video 2}}再{{Video 2}} ', params } }),
    );
    expect(built.payload.parts).toEqual([
      {
        type: 'text',
        text: '{{ node:v1 }} {{ node:i1 }}与{{ node:v2 }}再{{ node:v2 }}，参数是 16:9 · 30s · 720P',
      },
      {
        type: 'node',
        id: 'i1',
        nodeKey: 'i1',
        projectId: 'project',
        name: '产品图',
        nodeType: 'image',
        url: '/product.png',
        mediaType: 'image',
      },
      {
        type: 'node',
        id: 'v2',
        nodeKey: 'v2',
        projectId: 'project',
        name: '视频二',
        nodeType: 'video',
        url: '/two.mp4',
        mediaType: 'video',
      },
      {
        type: 'node',
        id: 'v1',
        nodeKey: 'v1',
        projectId: 'project',
        name: '视频一',
        nodeType: 'video',
        url: '/one.mp4',
        mediaType: 'video',
      },
    ]);
    expect(built.payload.extra.videoComposeSubmitTracking.useAt).toBe(true);
  });

  it('places mention nodes before Skill parts while Skill text prefixes precede implicit nodes', () => {
    const built = buildVideoComposeAgentSubmit(
      input({ composer: { modeKey: 'explainerVideo', prompt: '{{Audio 1}}讲解', params } }),
    );
    expect(built.payload).toEqual({
      type: 'agent-prompt',
      parts: [
        {
          type: 'text',
          text: '{{ skill:libtv-user-generated/faceless-commentary-video-5ef327e771bd41dd9256289dd7127f5a }} {{ node:t1 }} {{ node:a1 }}讲解，参数是 16:9 · 30s · 720P',
        },
        {
          type: 'node',
          id: 'a1',
          nodeKey: 'a1',
          projectId: 'project',
          name: '声音',
          nodeType: 'audio',
          url: '/voice.wav',
          mediaType: undefined,
        },
        {
          type: 'skill',
          id: 'libtv-user-generated/faceless-commentary-video-5ef327e771bd41dd9256289dd7127f5a',
          name: '讲解视频',
        },
        {
          type: 'node',
          id: 't1',
          nodeKey: 't1',
          projectId: 'project',
          name: 'text',
          nodeType: 'text',
          url: undefined,
          mediaType: undefined,
        },
      ],
      extra: {
        currentNodeKey: 'clip',
        entryItemKey: 'video_compose',
        videoComposeSubmitTracking: {
          nodeUuid: 'clip',
          projectUuid: 'project',
          functionKey: 'explainerVideo',
          useAt: true,
          nodeReferenceList: [
            { node_uuid: 'a1', node_type: 'audio' },
            { node_uuid: 't1', node_type: 'text' },
          ],
        },
      },
    });
    expect(built.skillUseMeta).toEqual([
      {
        id: 'libtv-user-generated/faceless-commentary-video-5ef327e771bd41dd9256289dd7127f5a',
        metadata: {
          skillKey: 'faceless-commentary-video-5ef327e771bd41dd9256289dd7127f5a',
          templateUuid: undefined,
          name: '讲解视频',
          version: undefined,
        },
      },
    ]);
  });

  it('removes supported-regex missing/unsupported tokens, preserves unknown tokens and records no false useAt', () => {
    const built = buildVideoComposeAgentSubmit(
      input({
        composer: {
          prompt:
            '{{Video 99}}{{Image 0}}{{Portrait 1}}{{Mixed 2}}{{Element 1}}{{CameraPreset 1}} {{Text 1}}{{video 1}}',
          params,
        },
      }),
    );
    expect(built.payload.parts[0].text).toBe(
      '{{ node:v1 }} {{ node:v2 }}  {{Text 1}}{{video 1}}，参数是 16:9 · 30s · 720P',
    );
    expect(built.payload.extra.videoComposeSubmitTracking.useAt).toBe(false);
  });

  it('skips nodes absent from the live document rather than creating references from stale incoming metadata', () => {
    const built = buildVideoComposeAgentSubmit(
      input({
        nodes: nodes.filter((node) => node.id !== 'v2'),
        composer: { prompt: '{{Video 2}}快剪', params },
      }),
    );
    expect(built.payload.parts).toEqual([
      { type: 'text', text: '{{ node:v1 }} 快剪，参数是 16:9 · 30s · 720P' },
      {
        type: 'node',
        id: 'v1',
        nodeKey: 'v1',
        projectId: 'project',
        name: '视频一',
        nodeType: 'video',
        url: '/one.mp4',
        mediaType: 'video',
      },
    ]);
    expect(built.payload.extra.videoComposeSubmitTracking.useAt).toBe(false);
  });

  it('uses mode slot type order and deduplicates overlapping nodeTypes/material nodes', () => {
    const config = copyConfig();
    config.defaultMode.materialSlots = [
      { slotKey: 'mixed', nodeTypes: ['image', 'video'], required: true, min: 1, max: 20 },
      { slotKey: 'repeated', nodeTypes: ['video', 'image'], required: false, min: 0, max: 20 },
    ];
    const built = buildVideoComposeAgentSubmit(input({ config }));
    expect(built.payload.parts[0].text).toBe(
      '{{ node:i1 }} {{ node:v1 }} {{ node:v2 }} 做快剪，参数是 16:9 · 30s · 720P',
    );
    expect(built.payload.parts.slice(1).map((part) => part.id)).toEqual(['i1', 'v1', 'v2']);
  });

  it('omits project tracking when no project exists and retains original undefined project references', () => {
    const built = buildVideoComposeAgentSubmit(input({ projectId: null }));
    expect(built.payload.extra).toEqual({ currentNodeKey: 'clip', entryItemKey: 'video_compose' });
    expect(built.payload.parts[1].projectId).toBeUndefined();
  });

  it('does not invent node type from data.type and preserves zero/unset media fields', () => {
    const built = buildVideoComposeAgentSubmit(
      input({
        nodes: [{ id: 'v1', data: { type: 'video' } }],
        incomingData: { videoList: [{ nodeId: 'v1', url: '' }] },
        composer: {
          prompt: 'test',
          params: { aspectRatio: '1:1', duration: 0, resolution: '480P' },
        },
      }),
    );
    expect(built.payload.parts).toEqual([
      { type: 'text', text: '{{ node:v1 }} test，参数是 1:1 · 0s · 480P' },
      {
        type: 'node',
        id: 'v1',
        nodeKey: 'v1',
        projectId: 'project',
        name: 'node',
        nodeType: 'node',
        url: undefined,
        mediaType: undefined,
      },
    ]);
  });

  it('accepts injected locale suffix without changing protocol tokens', () => {
    const built = buildVideoComposeAgentSubmit(input(), {
      formatParamsSuffix: (text) => `; parameters: ${text}`,
    });
    expect(built.payload.parts[0].text).toBe(
      '{{ node:v1 }} {{ node:v2 }} 做快剪; parameters: 16:9 · 30s · 720P',
    );
  });

  it('caps tracking at fifty unique node references while retaining all original prompt parts', () => {
    const config = copyConfig();
    config.defaultMode.materialSlots[0].max = 100;
    const live = Array.from({ length: 55 }, (_, index) => ({
      id: `n${index}`,
      type: index === 0 ? 'director-studio' : 'video',
      data: {},
    }));
    const built = buildVideoComposeAgentSubmit(
      input({
        config,
        nodes: live,
        incomingData: { videoList: live.map((node) => ({ nodeId: node.id })) },
      }),
    );
    expect(built.payload.parts).toHaveLength(56);
    expect(built.payload.extra.videoComposeSubmitTracking.nodeReferenceList).toHaveLength(50);
    expect(built.payload.extra.videoComposeSubmitTracking.nodeReferenceList[0]).toEqual({
      node_uuid: 'n0',
      node_type: 'director_studio',
    });
    expect(built.payload.extra.videoComposeSubmitTracking.nodeReferenceList.at(-1)).toEqual({
      node_uuid: 'n49',
      node_type: 'video',
    });
  });

  it('uses actual resolved mode key for tracking after unknown saved mode fallback', () => {
    const built = buildVideoComposeAgentSubmit(
      input({ composer: { modeKey: 'unknown', prompt: 'test', params } }),
    );
    expect(built.payload.extra.videoComposeSubmitTracking.functionKey).toBe('default');
  });

  it('preserves source inputs completely without storing pending/task or consuming preset assets', () => {
    const original = input();
    const captured = structuredClone(original);
    buildVideoComposeAgentSubmit(original);
    expect(original).toEqual(captured);
    expect(Object.hasOwn(original.composer, 'pending')).toBe(false);
    expect(Object.hasOwn(original.composer, 'taskInfo')).toBe(false);
  });
});
