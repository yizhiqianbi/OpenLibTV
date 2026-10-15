import { describe, expect, it, vi } from 'vitest';
import {
  resolveStoryboardBatchVideoShots,
  storyboardBatchVideoModelKeys,
  resolveStoryboardBatchVideoDefaultModel,
  resolveStoryboardBatchVideoMode,
  initialStoryboardBatchVideoConfig,
  refillStoryboardBatchVideoRatio,
  storyboardBatchVideoSettingsSchema,
  reconcileStoryboardBatchVideoConfig,
  switchStoryboardBatchVideoModel,
  buildStoryboardBatchVideoFeeRequest,
  projectStoryboardBatchVideoFee,
  storyboardBatchVideoReasonLabel,
} from './batch-video-config-model.js';
import publicModels from '../../../../public/data/models.json';
import publicSupport from '../../../../public/data/storyboard-video-support.json';

const videoSchema = (rest = {}) => ({
  modelKey: 'first',
  modelVendor: 'provider',
  properties: {
    modeType: { items: { singleImage2video: [0, 1] } },
    ratio_auto: {
      originalField: 'ratio',
      component: 'singleButton',
      enum: ['1:1', '16:9'],
      default: '1:1',
    },
    duration: { component: 'slider', min: 1, max: 10, default: 5 },
    count: { enum: [1, 2, 4] },
    advanced: { batch: true, originalField: 'advanced_api', component: 'switch', default: 1 },
    ordinary: { batch: false, component: 'singleButton', enum: ['low', 'high'], default: 'low' },
    proOnly: { batch: false, component: 'switch', default: 0 },
    disabled: { batch: true, enable: false, component: 'switch', default: 1 },
    otherMode: { batch: true, component: 'switch', default: 0 },
  },
  config: {
    settings: { singleImage2video: ['ratio_auto', 'duration', 'ordinary'] },
    advancedSettings: {
      singleImage2video: ['advanced', 'proOnly', 'disabled'],
      text2video: ['otherMode'],
    },
  },
  ...rest,
});
const models = () => ({
  default: { video: 'global' },
  videoModels: {
    first: videoSchema(),
    second: videoSchema({ modelKey: 'second' }),
    'kling-v3-omni': videoSchema({ modelKey: 'kling-v3-omni' }),
  },
});
const support = [{ modelKey: 'first' }, { modelKey: 'second' }];
const group = (data = {}) => ({
  id: 'g',
  type: 'group',
  position: { x: 0, y: 0 },
  data: { sourceScriptNodeId: 's', storyboardGroupType: 'image', ...data },
});
const script = (rows = [{ hiddenUuid: 'r2' }, { hiddenUuid: 'r1' }], data = {}) => ({
  id: 's',
  type: 'script',
  data: { rows, ...data },
});
const image = (id, row, data = {}, rest = {}) => ({
  id,
  type: 'image',
  parentId: 'g',
  data: { name: id, scriptRowHiddenUuid: row, url: ['url-' + id], ...data },
  ...rest,
});
const nodes = () => [
  group(),
  script(),
  image('Image 10', 'r1'),
  image('Image 2', 'r2', {
    params: { settings: { ratio: '4:3', resolution: '1080p' } },
    contentWidth: 800,
    contentHeight: 600,
  }),
];
const shots = (graph, phase = 'open') =>
  resolveStoryboardBatchVideoShots({ nodes: graph, groupId: 'g', phase });
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

describe('v1 storyboard batch video ready projection', () => {
  it.each(['open', 'submit'])(
    'matches %s direct images in script row order, regardless of preferred IDs and hidden flags',
    (phase) => {
      const graph = freeze(nodes());
      const result = shots(graph, phase);
      expect(result).toMatchObject({ valid: true, enabled: true, readyCount: 2, reason: '' });
      expect(result.children).toEqual([graph[3], graph[2]]);
      expect(result.rows).toEqual(graph[1].data.rows);
      expect(result.shots.map(({ firstImageUrl }) => firstImageUrl)).toEqual([
        'url-Image 2',
        'url-Image 10',
      ]);
      expect(result.initialImageSettings).toBe(graph[3].data.params.settings);
      expect(result.firstChildDimensions).toEqual({ width: 800, height: 600 });
      expect(result.group).toBe(graph[0]);
      expect(result.script).toBe(graph[1]);
    },
  );

  it('keeps array some readiness distinct from url[0] output and rejects string URL readiness', () => {
    const graph = [
      group(),
      script([{ hiddenUuid: 'a' }, { hiddenUuid: 'b' }, { hiddenUuid: 'c' }, { hiddenUuid: 'd' }]),
      image('a', 'a', { url: ['', 'valid'] }),
      image('b', 'b', { url: 'valid' }),
      image('c', 'c', { url: [null, 'valid'] }),
      image('d', 'd', { url: [' ', 'valid'] }),
    ];
    const result = shots(graph);
    expect(result.rows.map((row) => row.hiddenUuid)).toEqual(['a', 'c', 'd']);
    expect(result.shots.map((shot) => shot.firstImageUrl)).toEqual(['', '', ' ']);
  });

  it('does not look through descendants, select unfinished rows, or use node width for initial dims', () => {
    const graph = [
      group(),
      script([{ hiddenUuid: 'a' }, { hiddenUuid: 'b' }, { hiddenUuid: 'c' }]),
      image('a', 'a', { url: [''] }),
      image('b', 'b', { url: ['good'] }, { parentId: 'nested' }),
      image(
        'c',
        'c',
        {},
        {
          width: 1920,
          height: 1080,
          measured: { width: 1920, height: 1080 },
          hidden: true,
          temporary: true,
        },
      ),
    ];
    const result = shots(graph);
    expect(result.readyCount).toBe(1);
    expect(result.children[0]).toBe(graph[4]);
    expect(result.firstChildDimensions).toBeUndefined();
  });

  it('retains source number-only dimensions without silently replacing NaN or Inf', () => {
    const graph = nodes();
    graph[3].data.contentWidth = NaN;
    graph[3].data.contentHeight = Infinity;
    expect(shots(graph).firstChildDimensions).toEqual({ width: NaN, height: Infinity });
    graph[3].data.contentHeight = '600';
    expect(shots(graph).firstChildDimensions).toBeUndefined();
  });

  it('permits missing/nonv2 version but disabled stale linked ID and no-ready empty states remain explicit', () => {
    const graph = nodes();
    graph[0].data.sourceScriptVersion = 'legacy';
    expect(shots(graph).enabled).toBe(true);
    graph[1].data.linkedImageGroupId = 'new';
    expect(shots(graph)).toMatchObject({
      valid: true,
      enabled: false,
      reason: 'stale-image-group',
      readyCount: 2,
    });
    expect(shots([group(), script([])])).toMatchObject({
      valid: true,
      enabled: false,
      reason: 'no-children',
      readyCount: 0,
    });
  });

  it.each([
    { sourceScriptVersion: 'v2' },
    { storyboardGroupType: 'video' },
    { sourceScriptNodeId: '' },
    { standaloneStoryboardImageGrid: 'legacy', storyboardGroupType: 'image' },
  ])('does not create a v1 caller entry for %j', (data) => {
    const graph = nodes();
    graph[0] = group(data);
    expect(shots(graph)).toMatchObject({
      valid: false,
      enabled: false,
      reason: 'not-v1-image-group',
    });
  });

  it('rejects duplicate ready hidden UUID atomically instead of scan-order-dependent image binding', () => {
    const graph = [...nodes(), image('Image 1', 'r1')];
    for (const phase of ['open', 'submit'])
      expect(shots(graph, phase)).toMatchObject({
        valid: false,
        shots: [],
        reason: 'duplicate-image-hidden-uuid',
      });
    graph[4].data.url = [''];
    expect(shots(graph).valid).toBe(true);
  });

  it('rejects duplicate script rows, malformed rows and duplicated node IDs atomically', () => {
    const graph = nodes();
    graph[1].data.rows.push({ hiddenUuid: 'r1' });
    expect(shots(graph)).toMatchObject({
      valid: false,
      shots: [],
      reason: 'duplicate-row-hidden-uuid',
    });
    graph[1].data.rows = ['bad'];
    expect(shots(graph).reason).toBe('invalid-rows');
    expect(shots([...nodes(), group()]).reason).toBe('invalid-node-identity');
    expect(shots([group()]).reason).toBe('no-script');
    expect(resolveStoryboardBatchVideoShots({}).valid).toBe(false);
  });

  it('source submit requires numeric-comparable names while open ignores irrelevant names', () => {
    const graph = nodes();
    graph[2].data.name = 10;
    expect(shots(graph, 'open').valid).toBe(true);
    expect(shots(graph, 'submit').reason).toBe('invalid-image-name');
  });
});

describe('v1 source catalogue and initial configuration', () => {
  it('prefers support Kling3omni, then first entry, then explicit global video fallback without schema filtering', () => {
    expect(
      resolveStoryboardBatchVideoDefaultModel({
        models: models(),
        support: [{ modelKey: 'unknown' }, { modelKey: 'kling-v3-omni' }],
      }),
    ).toBe('kling-v3-omni');
    expect(
      resolveStoryboardBatchVideoDefaultModel({
        models: models(),
        support: [{ modelKey: 'unknown' }],
      }),
    ).toBe('unknown');
    expect(resolveStoryboardBatchVideoDefaultModel({ models: models(), support: [] })).toBe(
      'global',
    );
    expect(resolveStoryboardBatchVideoDefaultModel({ models: models() })).toBe('global');
    expect(storyboardBatchVideoModelKeys([{ modelKey: 'unknown' }])).toEqual(['unknown']);
    expect(
      storyboardBatchVideoModelKeys([{ modelKey: 'first' }, { modelKey: 'first' }]),
    ).toBeNull();
    expect(storyboardBatchVideoModelKeys([{ modelKey: '' }])).toBeNull();
  });

  it.each([
    [{ ratio: 'auto', ratio_secondary: ' 4:3 ', aspectRatio: '16:9' }, '4:3'],
    [{ ratio: ' 9:16 ', ratio_secondary: '4:3' }, '9:16'],
    [{ ratio: 'auto', ratio_secondary: 'auto', aspectRatio: '3:4' }, '3:4'],
    [{ ratio: '', ratio_secondary: 'auto' }, '16:9'],
  ])(
    'extracts settings-only ratio %j to raw schema key without enum or originalField filtering',
    (initialImageSettings, expected) => {
      const result = initialStoryboardBatchVideoConfig({
        models: models(),
        support,
        initialImageSettings,
        firstChildDimensions: { width: 1920, height: 1080 },
      });
      expect(result).toEqual({
        model: 'first',
        modeType: 'singleImage2video',
        settings: { ratio_auto: expected },
      });
      expect(result.advancedSettings).toBeUndefined();
      expect(result.count).toBeUndefined();
      expect(result.prompt).toBeUndefined();
    },
  );

  it('inherits only truthy resolution and ignores unrelated initial settings', () => {
    expect(
      initialStoryboardBatchVideoConfig({
        models: models(),
        support,
        initialImageSettings: { resolution: '1080p', duration: 10, prompt: 'other' },
      }).settings,
    ).toEqual({ resolution: '1080p' });
    expect(
      initialStoryboardBatchVideoConfig({
        models: models(),
        support,
        initialImageSettings: { resolution: '' },
      }).settings,
    ).toEqual({});
    expect(
      initialStoryboardBatchVideoConfig({ models: models(), support, initialImageSettings: 'bad' }),
    ).toBeNull();
  });

  it.each([
    [1, 1, '1:1'],
    [16, 9, '16:9'],
    [9, 16, '9:16'],
    [4, 3, '4:3'],
    [3, 4, '3:4'],
    [3, 2, '3:2'],
    [2, 3, '2:3'],
    [4, 1, undefined],
    [0, 4, undefined],
  ])('initializes closest seven ratio for %s/%s', (width, height, expected) => {
    const result = initialStoryboardBatchVideoConfig({
      models: models(),
      support,
      firstChildDimensions: { width, height },
    });
    expect(result.settings.ratio_auto).toBe(expected);
  });

  it.each([
    [{ singleImage2video: [0, 0], image2video: [0, 5] }, 'singleImage2video'],
    [{ image2video: [0, 0] }, 'image2video'],
    [{ text2video: [0, 1] }, 'text2video'],
    [{}, 'text2video'],
  ])('selects mode by key presence %j', (items, expected) => {
    expect(
      resolveStoryboardBatchVideoMode(videoSchema({ properties: { modeType: { items } } })),
    ).toBe(expected);
  });

  it('refills ratio only when enum explicitly includes dimensions ratio and never overwrites truthy raw value', () => {
    const config = { model: 'first', settings: {} },
      dimensions = { width: 16, height: 9 };
    const base = { config, firstChildDimensions: dimensions };
    expect(refillStoryboardBatchVideoRatio({ ...base, schema: videoSchema() }).settings).toEqual({
      ratio_auto: '16:9',
    });
    expect(
      refillStoryboardBatchVideoRatio({
        ...base,
        schema: videoSchema({ properties: { ratio: { component: 'singleButton' } } }),
      }),
    ).toBe(config);
    expect(
      refillStoryboardBatchVideoRatio({
        ...base,
        schema: videoSchema({ properties: { ratio: { enum: ['1:1'] } } }),
      }),
    ).toBe(config);
    const existing = { ...config, settings: { ratio_auto: 'auto' } };
    expect(
      refillStoryboardBatchVideoRatio({
        config: existing,
        schema: videoSchema(),
        firstChildDimensions: dimensions,
      }),
    ).toBe(existing);
    const typed = videoSchema({ properties: { ratio: { enum: [{ value: '16:9' }] } } });
    expect(refillStoryboardBatchVideoRatio({ ...base, schema: typed }).settings).toEqual({
      ratio: '16:9',
    });
  });

  it('normalizes source effects without restarting from changed image settings or replacing current model on empty support', () => {
    const config = freeze({
      model: 'second',
      modeType: 'wrong',
      settings: { ratio_auto: '1:1', resolution: 'saved' },
    });
    expect(reconcileStoryboardBatchVideoConfig({ config, models: models(), support: [] })).toEqual({
      ...config,
      modeType: 'singleImage2video',
    });
    expect(
      reconcileStoryboardBatchVideoConfig({
        config,
        models: models(),
        support: [{ modelKey: 'first' }],
      }).model,
    ).toBe('first');
    expect(
      reconcileStoryboardBatchVideoConfig({ config, models: models(), support: [] }).settings,
    ).toBe(config.settings);
  });
});

describe('shared settings and local model switch', () => {
  it('keeps ordinary groups and all properties/count while only advanced batchtrue and enabled fields participate', () => {
    const schema = freeze(videoSchema());
    const filtered = storyboardBatchVideoSettingsSchema(schema, 'singleImage2video');
    expect(filtered.config.settings).toBe(schema.config.settings);
    expect(filtered.properties).toBe(schema.properties);
    expect(filtered.properties.count).toEqual({ enum: [1, 2, 4] });
    expect(filtered.config.advancedSettings).toEqual([{ fields: ['advanced'] }]);
    expect(storyboardBatchVideoSettingsSchema(schema, 'missing').config.advancedSettings).toEqual([
      { fields: [] },
    ]);
  });

  it('resolves local public Flight advanced aliases through shared fieldGroups without fallback from a missing mode', () => {
    const schema = videoSchema();
    schema.config.advancedSettings.singleImage2video =
      '$a:props:schema:video:first:config:advancedSettings:text2video';
    expect(
      storyboardBatchVideoSettingsSchema(schema, 'singleImage2video').config.advancedSettings,
    ).toEqual([{ fields: ['otherMode'] }]);
    expect(storyboardBatchVideoSettingsSchema(schema, 'missing').config.advancedSettings).toEqual([
      { fields: [] },
    ]);
  });

  it('optional shared normalization preserves ordinary batchfalse values and uses zero actual media inputs', () => {
    const schema = videoSchema();
    schema.settingsRules = [
      {
        inputWhen: { imageList: 'notEmpty' },
        disable: { ordinary: ['high'] },
        fallback: { ordinary: 'low' },
      },
    ];
    const data = models();
    data.videoModels.first = schema;
    const config = {
      model: 'first',
      modeType: 'singleImage2video',
      settings: { ordinary: 'high', duration: 99, ratio_auto: 'raw' },
      advancedSettings: { unknown: 'keep', proOnly: 1, otherMode: 1 },
    };
    const result = reconcileStoryboardBatchVideoConfig({
      config,
      models: data,
      support,
      normalize: true,
    });
    expect(result.settings).toEqual({
      ordinary: 'high',
      duration: 10,
      ratio_auto: 'raw',
      ratio: '1:1',
    });
    expect(result.advancedSettings).toEqual({ unknown: 'keep', advanced_api: 1 });
    expect(result.count).toBeUndefined();
    expect(result.prompt).toBeUndefined();
    expect(config.settings.duration).toBe(99);
  });

  it('switches only local model by default and preserves section references until explicit normalization', () => {
    const config = freeze({
      model: 'first',
      modeType: 'singleImage2video',
      settings: { ordinary: 'high' },
      advancedSettings: { advanced_api: 0 },
    });
    const result = switchStoryboardBatchVideoModel({
      config,
      model: 'second',
      models: models(),
      support,
    });
    expect(result).toEqual({ ...config, model: 'second' });
    expect(result.settings).toBe(config.settings);
    expect(result.advancedSettings).toBe(config.advancedSettings);
    expect(
      switchStoryboardBatchVideoModel({ config, model: 'outside', models: models(), support })
        .model,
    ).toBe('first');
  });

  it.each([[0, 0], null])(
    'keeps source key-present mode %j for normalization and mode-specific rules',
    (limits) => {
      const schema = videoSchema();
      schema.properties.modeType.items.singleImage2video = limits;
      schema.config.settings = ['duration', 'ordinary'];
      schema.config.textModes = ['text2video'];
      schema.settingsRules = [
        { forModeTypes: ['singleImage2video'], override: { duration: { max: 3 } } },
        { forModeTypes: ['text2video'], override: { duration: { max: 9 } } },
      ];
      freeze(schema);
      const data = models();
      data.videoModels.first = schema;
      const config = {
        model: 'first',
        modeType: 'singleImage2video',
        settings: { duration: 8, ordinary: 'high' },
        advancedSettings: {},
      };
      const result = reconcileStoryboardBatchVideoConfig({
        config,
        models: data,
        support,
        normalize: true,
      });
      expect(result.modeType).toBe('singleImage2video');
      expect(result.settings).toEqual({ duration: 3, ordinary: 'high' });
      expect(result.advancedSettings).toEqual({ advanced_api: 1 });
      expect(schema.config.textModes).toEqual(['text2video']);
      expect(
        reconcileStoryboardBatchVideoConfig({
          config: result,
          models: data,
          support,
          normalize: true,
        }),
      ).toBe(result);
    },
  );

  it('resets source resetOnModelSwitch advanced keys while preserving unrelated metadata', () => {
    const data = models();
    data.videoModels.second.properties.advanced.resetOnModelSwitch = true;
    const config = {
      model: 'first',
      modeType: 'singleImage2video',
      settings: {},
      advancedSettings: { advanced_api: 0, _advanced_api_meta: 'stale', unknown: 'keep' },
    };
    const result = switchStoryboardBatchVideoModel({
      config,
      model: 'second',
      models: data,
      support,
      normalize: true,
    });
    expect(result.advancedSettings).toEqual({ advanced_api: 1, unknown: 'keep' });
  });

  it('preserves batch voice metadata and restores source voice default after model switch', () => {
    const voice = { voiceId: 'default', name: 'Default' },
      schema = videoSchema();
    schema.properties.voice = {
      component: 'voiceCard',
      originalField: 'voice_api',
      batch: true,
      default: voice,
      resetOnModelSwitch: true,
    };
    schema.config.advancedSettings.singleImage2video.push('voice');
    const data = models();
    data.videoModels.second = schema;
    const old = { voiceId: 'old', name: 'Old' };
    const config = {
      model: 'first',
      modeType: 'singleImage2video',
      settings: {},
      advancedSettings: { voice_api: 'old', _voice_api_meta: old },
    };
    const result = switchStoryboardBatchVideoModel({
      config,
      model: 'second',
      models: data,
      support,
      normalize: true,
    });
    expect(result.advancedSettings.voice_api).toBe('default');
    expect(result.advancedSettings._voice_api_meta).toBe(voice);
  });

  it('uses all 19 real source support entries without inventing model or entitlement fallback', () => {
    expect(storyboardBatchVideoModelKeys(publicSupport.items)).toHaveLength(19);
    expect(
      resolveStoryboardBatchVideoDefaultModel({
        models: publicModels,
        support: publicSupport.items,
      }),
    ).toBe('kling-v3-omni');
    const initial = initialStoryboardBatchVideoConfig({
      models: publicModels,
      support: publicSupport.items,
    });
    expect(initial.model).toBe('kling-v3-omni');
    expect(initial.settings).toEqual({});
  });

  it('works with current real Kling3omni schema without filtering normal duration or creating media inputs', () => {
    const config = initialStoryboardBatchVideoConfig({
      models: publicModels,
      support: [{ modelKey: 'kling-v3-omni' }],
      initialImageSettings: { ratio: '16:9' },
    });
    const result = reconcileStoryboardBatchVideoConfig({
      config,
      models: publicModels,
      support: [{ modelKey: 'kling-v3-omni' }],
      normalize: true,
    });
    expect(result.model).toBe('kling-v3-omni');
    expect(result.modeType).toBe('singleImage2video');
    expect(result.settings.duration).toBeDefined();
    expect(result.imageList).toBeUndefined();
  });

  it('normalization is a reference no-op once defaults are synced and preserves shared unknown metadata', () => {
    const config = {
      model: 'first',
      modeType: 'singleImage2video',
      settings: { ordinary: 'high', duration: 5, ratio: '1:1' },
      advancedSettings: { advanced_api: 1, unknown: { stable: true } },
    };
    const result = reconcileStoryboardBatchVideoConfig({
      config,
      models: models(),
      support,
      normalize: true,
    });
    expect(result).toBe(config);
    expect(result.settings).toBe(config.settings);
    expect(result.advancedSettings.unknown).toBe(config.advancedSettings.unknown);
    const initial = initialStoryboardBatchVideoConfig({ models: models(), support });
    const first = reconcileStoryboardBatchVideoConfig({
      config: initial,
      models: models(),
      support,
      normalize: true,
    });
    expect(
      reconcileStoryboardBatchVideoConfig({
        config: first,
        models: models(),
        support,
        normalize: true,
      }),
    ).toBe(first);
  });

  it('retains independent config sections when only the other section changes', () => {
    const config = {
      model: 'first',
      modeType: 'singleImage2video',
      settings: { ordinary: 'high', duration: 5, ratio: '1:1' },
      advancedSettings: {},
    };
    const result = reconcileStoryboardBatchVideoConfig({
      config,
      models: models(),
      support,
      normalize: true,
    });
    expect(result.settings).toBe(config.settings);
    expect(result.advancedSettings).toEqual({ advanced_api: 1 });
  });

  it('rejects damaged config/catalogues without fabricating defaults', () => {
    expect(
      reconcileStoryboardBatchVideoConfig({ config: { settings: [] }, models: models(), support }),
    ).toBeNull();
    expect(
      reconcileStoryboardBatchVideoConfig({ config: {}, models: models(), support: ['bad'] }),
    ).toBeNull();
    expect(switchStoryboardBatchVideoModel({ config: {}, model: '' })).toBeNull();
  });
});

describe('source single-video fee request and scaled display', () => {
  it('builds exact calculator payload, count1 without advanced/URLs/schema/totalCount/benefit', () => {
    const config = freeze({
      model: 'first',
      modeType: 'wrong',
      settings: { duration: 5 },
      advancedSettings: { advanced_api: 1 },
      imageList: ['input'],
      count: 50,
    });
    const request = buildStoryboardBatchVideoFeeRequest({
      config,
      schema: videoSchema(),
      nodeId: 'g',
      projectId: 'p',
      requestId: 'injected-id',
    });
    expect(request).toEqual({
      params: {
        prompt: '',
        model: 'first',
        modeType: 'singleImage2video',
        count: 1,
        settings: config.settings,
      },
      metadata: { node_id: 'g', project_id: 'p' },
      provider: 'provider',
      model: 'first',
      taskType: 'video',
      requestId: 'injected-id',
    });
    expect(request.params.settings).toBe(config.settings);
    expect(buildStoryboardBatchVideoFeeRequest({ config, requestId: 'id' })).toMatchObject({
      provider: '',
      metadata: { node_id: '', project_id: '' },
    });
  });

  it('does not supply request IDs or fake calculator responses', () => {
    expect(buildStoryboardBatchVideoFeeRequest({ config: { model: 'first' } })).toBeNull();
    expect(
      buildStoryboardBatchVideoFeeRequest({
        config: { model: 'first', settings: [] },
        requestId: 'id',
      }),
    ).toBeNull();
    expect(projectStoryboardBatchVideoFee({ feeResult: null, totalCount: 2 })).toEqual({
      cost: '-',
      originalCost: undefined,
    });
  });

  it.each([
    [{ power: 2, originalPrice: 4 }, 3, { cost: 6, originalCost: 12 }],
    [{ power: 0, originalPrice: 2 }, 3, { cost: 0, originalCost: 6 }],
    [{ power: 2, originalPrice: 2 }, 3, { cost: 6, originalCost: undefined }],
    [{ power: 2 }, 3, { cost: 6, originalCost: undefined }],
    [{ power: 'unknown', originalPrice: 4 }, 3, { cost: 'unknown', originalCost: undefined }],
    [{ power: 2, originalPrice: '4' }, 1, { cost: 2, originalCost: '4' }],
    [{ power: 2, originalPrice: '4' }, '1', { cost: 2, originalCost: 4 }],
    [{ power: 2, originalPrice: 4 }, 0, { cost: 0, originalCost: undefined }],
  ])(
    'projects %j x %s with source coercion/equal-price display',
    (feeResult, totalCount, expected) => {
      expect(projectStoryboardBatchVideoFee({ feeResult, totalCount })).toEqual(expected);
    },
  );

  it('retains shared large media payloads and never invokes toJSON', () => {
    const toJSON = vi.fn(() => {
      throw new Error('Do not serialize');
    });
    const graph = nodes();
    graph.push({ id: 'other', data: { toJSON } });
    expect(shots(graph).valid).toBe(true);
    expect(toJSON).not.toHaveBeenCalled();
    const settings = { duration: 5, toJSON };
    expect(
      buildStoryboardBatchVideoFeeRequest({ config: { model: 'first', settings }, requestId: 'id' })
        .params.settings,
    ).toBe(settings);
    expect(toJSON).not.toHaveBeenCalled();
  });
});

describe('source and local reason labels', () => {
  it('uses verified stale/no-ready source strings and no label for a valid empty reason', () => {
    expect(storyboardBatchVideoReasonLabel('stale-image-group')).toBe(
      '当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组',
    );
    expect(storyboardBatchVideoReasonLabel('no-children')).toBe('没有可用于生成视频的分镜图');
    expect(storyboardBatchVideoReasonLabel('')).toBeUndefined();
    expect(storyboardBatchVideoReasonLabel(undefined)).toBeUndefined();
  });
  it.each([
    'invalid-input',
    'invalid-node-identity',
    'invalid-rows',
    'invalid-image-data',
    'invalid-image-name',
    'duplicate-image-hidden-uuid',
    'duplicate-row-hidden-uuid',
  ])('presents malformed reason %s as a local actionable diagnostic', (reason) => {
    expect(storyboardBatchVideoReasonLabel(reason)).toMatch(/^分镜数据无效，请检查/);
    expect(storyboardBatchVideoReasonLabel(reason)).not.toContain(reason);
  });
  it('does not expose unknown internal error codes or assume source/version support', () => {
    expect(storyboardBatchVideoReasonLabel('new-error')).toBe('批量生成视频组失败，请稍后重试');
    expect(storyboardBatchVideoReasonLabel('not-v1-image-group')).toBe(
      '当前分组不支持此批量视频配置',
    );
    expect(storyboardBatchVideoReasonLabel('no-script')).toBe(
      '未找到分镜组关联的脚本，请检查分组关联',
    );
  });
});
