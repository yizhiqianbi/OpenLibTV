import { describe, expect, it } from 'vitest';
import {
  SCRIPT_V2_VIDEO_MODE,
  resolveScriptV2VideoCapability,
  extractScriptV2VideoDurationConstraint,
  isScriptV2VideoDurationSupported,
  describeScriptV2VideoDurationConstraint,
  resolveScriptV2VideoCatalogue,
  createScriptV2VideoConfigState,
  reconcileScriptV2VideoConfigState,
  changeScriptV2VideoConfigState,
  projectScriptV2VideoConfig,
  buildScriptV2VideoConfirmPayload,
} from './v2-video-config-model.js';
import publicModels from '../../../../public/data/models.json';
import publicSupport from '../../../../public/data/video-model-support.json';

const rows = [
  { id: 'row-a', hiddenUuid: 'a', shotNumber: 1, durationSeconds: 5, videoMotionPrompt: 'move A' },
  { id: 'row-b', hiddenUuid: 'b', shotNumber: 2, durationSeconds: 10, plotDescription: 'plot B' },
];
const schema = (patch = {}) => ({
  properties: {
    modeType: { items: { mixed2video: [1, 3] } },
    ratio_16_9: { originalField: 'ratio', enum: ['16:9', '1:1', '9:16'], default: '16:9' },
    quality: { enum: ['low', 'high'], default: 'low' },
    duration: { enum: [5, 10], default: 5 },
    enableSound: { originalField: 'sound', default: 'off', enable: false },
    autoCompliance: { originalField: 'auto_api', default: 0, batch: false },
    otherAdvanced: { default: 8, batch: true },
    disabled: { enum: [0, 1], default: 0, enable: false, batch: false },
    invisible: { enum: ['x', 'y'], default: 'x', visibleWhen: { quality: 'never' } },
    barOnly: { enum: [1], default: 1, barOnly: true },
    noDefault: { enum: ['first', 'second'] },
  },
  config: {
    settings: [
      'ratio_16_9',
      'quality',
      'duration',
      'enableSound',
      'disabled',
      'invisible',
      'barOnly',
      'noDefault',
      'missing',
    ],
    advancedSettings: ['autoCompliance', 'otherAdvanced'],
  },
  ...patch,
});
const models = () => ({
  default: { video: 'global' },
  videoModels: { first: schema(), second: schema(), global: schema() },
});
const support = [{ modelKey: 'first', modelName: 'First' }, { modelKey: 'second' }];
const refs = (
  values = [
    ['a', 1],
    ['b', 2],
  ],
  patch = {},
) => ({ valid: true, refCounts: new Map(values), assetReadiness: { ready: true }, ...patch });
const context = (patch = {}) => ({
  models: models(),
  support,
  referenceDescription: refs(),
  ...patch,
});
const create = (patch = {}) => createScriptV2VideoConfigState({ rows, ...context(patch) });
const project = (state, patch = {}) => projectScriptV2VideoConfig({ state, ...context(patch) });
const change = (state, command, patch = {}) =>
  changeScriptV2VideoConfigState({ state, command, ...context(patch) });

describe('v2 mixed reference capability', () => {
  it.each([undefined, null, [], [0], [0, 0], [3, 2], ['0', 4], [0, Infinity]])(
    'rejects unusable limits %j',
    (limits) => {
      expect(
        resolveScriptV2VideoCapability(
          schema({ properties: { modeType: { items: { mixed2video: limits } } } }),
          1,
        ).usable,
      ).toBe(false);
    },
  );
  it('allows zero references before selection, but rejects a positive count below minimum', () => {
    const value = schema({ properties: { modeType: { items: { mixed2video: [2, 5] } } } });
    expect(resolveScriptV2VideoCapability(value, 0).usable).toBe(true);
    expect(resolveScriptV2VideoCapability(value, 1)).toMatchObject({ usable: false, maxRefs: 5 });
  });
  it('clips imageMax but keeps excessive required refs usable for the separate panel gate', () => {
    const value = schema({
      properties: {
        modeType: { items: { mixed2video: [1, 9] }, mixed2videoConfig: { imageMax: 3 } },
      },
    });
    expect(resolveScriptV2VideoCapability(value, 4)).toEqual({
      usable: true,
      modeType: 'mixed2video',
      maxRefs: 3,
      fullCoverage: false,
      willTruncate: true,
    });
  });
  it.each([-1, NaN, undefined, '4'])(
    'source treats nonfinite/negative required count %j as zero',
    (required) => {
      expect(resolveScriptV2VideoCapability(schema(), required)).toMatchObject({
        usable: true,
        fullCoverage: true,
      });
    },
  );
});

describe('v2 source duration constraints', () => {
  it('retains numeric enum order and duplicates, excluding numeric strings', () => {
    expect(
      extractScriptV2VideoDurationConstraint({
        properties: {
          duration: {
            enum: ['5', 10, { value: 5 }, 10, { value: '2' }, Infinity],
            min: 1,
            max: 99,
          },
        },
      }),
    ).toEqual({ type: 'enum', values: [10, 5, 10] });
  });
  it('uses finite slider bounds and a positive step, otherwise source default 1', () => {
    expect(
      extractScriptV2VideoDurationConstraint({
        properties: { duration: { min: 1, max: 5, step: 0 } },
      }),
    ).toEqual({ type: 'slider', min: 1, max: 5, step: 1 });
    expect(
      extractScriptV2VideoDurationConstraint({ properties: { duration: { min: 5, max: 1 } } }),
    ).toBeNull();
  });
  it.each([NaN, Infinity, '5', null])(
    'rejects nonfinite or nonnumeric duration %j even without constraint',
    (value) => {
      expect(isScriptV2VideoDurationSupported(value, null)).toBe(false);
    },
  );
  it('uses min-based strict 1e-9 step tolerance, rather than the older 1e-6 helper', () => {
    const constraint = { type: 'slider', min: 1, max: 5, step: 0.5 };
    expect(isScriptV2VideoDurationSupported(1.5, constraint)).toBe(true);
    expect(isScriptV2VideoDurationSupported(1.50000001, constraint)).toBe(false);
    expect(isScriptV2VideoDurationSupported(0.5, constraint)).toBe(false);
  });
  it('projects exact source descriptions', () => {
    expect(describeScriptV2VideoDurationConstraint(null)).toBe('不限');
    expect(describeScriptV2VideoDurationConstraint({ type: 'enum', values: [5, 10] })).toBe(
      '5s / 10s',
    );
    expect(
      describeScriptV2VideoDurationConstraint({ type: 'slider', min: 1, max: 5, step: 1 }),
    ).toBe('1-5s，步长 1s');
  });
});

describe('v2 catalogue and first-open state', () => {
  it('uses the full video catalogue order with no Kling preference and excludes non-mixed schemas', () => {
    const value = models();
    value.videoModels['kling-v3-omni'] = schema();
    value.videoModels.text = { properties: { modeType: { items: { text2video: [0, 0] } } } };
    expect(
      resolveScriptV2VideoCatalogue({
        models: value,
        support: [{ modelKey: 'text' }, ...support, { modelKey: 'kling-v3-omni' }],
        requiredRefs: 1,
      }),
    ).toMatchObject({ keys: ['first', 'second', 'kling-v3-omni'], defaultModel: 'first' });
  });
  it('keeps the global fallback chip when no usable mixed model exists, without enabling confirm', () => {
    const result = create({ support: [] });
    expect(result.state.config.model).toBe('global');
    expect(project(result.state, { support: [] })).toMatchObject({
      options: [{ value: 'global' }],
      canConfirm: false,
    });
  });
  it('filters malformed source support entries and rejects duplicate local menu identity atomically', () => {
    expect(
      resolveScriptV2VideoCatalogue({
        models: models(),
        support: [null, 2, { modelKey: 4 }, support[0]],
      }).keys,
    ).toEqual(['first']);
    expect(create({ support: [support[0], support[0]] })).toMatchObject({
      valid: false,
      reason: 'duplicate-support-key',
    });
  });
  it.each([
    [true, true, undefined],
    ['  stopped ', true, 'stopped'],
    [{ zh: ' 中文 ', en: 'English' }, true, '中文'],
    [{ xx: 'none' }, true, undefined],
    [{}, false, undefined],
    ['', false, undefined],
    [false, false, undefined],
    [[], false, undefined],
  ])('resolves source support disable %j', (disable, disabled, disabledReason) => {
    expect(
      resolveScriptV2VideoCatalogue({ models: models(), support: [{ modelKey: 'first', disable }] })
        .options[0],
    ).toMatchObject({ disabled, disabledReason });
  });
  it('settles the shared chip disabled-current switch using defaults, preserving only accepted ratio', () => {
    const result = create({
      support: [{ modelKey: 'first', disable: true }, { modelKey: 'second' }],
    });
    expect(result.state.config).toMatchObject({ model: 'second', settings: { ratio: '16:9' } });
  });
  it('does not fabricate an enabled model when all support options are disabled', () => {
    const ctx = { support: support.map((entry) => ({ ...entry, disable: true })) },
      result = create(ctx);
    expect(result.state.config.model).toBe('first');
    expect(project(result.state, ctx).canConfirm).toBe(false);
  });
  it('initializes raw defaults through originalField and forces sound despite enable:false', () => {
    const { state } = create();
    expect(state.config.modeType).toBe(SCRIPT_V2_VIDEO_MODE);
    expect(state.config.settings).toMatchObject({
      ratio: '16:9',
      duration: 5,
      sound: 'on',
      disabled: 0,
    });
    expect(state.config.settings).not.toHaveProperty('noDefault');
    expect(state.config.advancedSettings).toEqual({ auto_api: 0 });
    expect(state.selectedHiddenUuids).toEqual(new Set(['a', 'b']));
    expect(state.perShotDurations).toEqual(
      new Map([
        ['a', 5],
        ['b', 10],
      ]),
    );
  });
  it('inherits only source-compatible ratio fields; actual caller passes no settings', () => {
    const value = models();
    value.videoModels.first.properties.ratio_no_default = {
      originalField: 'otherRatio',
      enum: ['1:1'],
    };
    expect(
      create({ models: value, initialImageSettings: { ratio: '1:1', resolution: '4k' } }).state
        .config.settings,
    ).toMatchObject({ ratio: '1:1' });
    expect(
      create({ models: value, initialImageSettings: { ratio: '1:1' } }).state.config.settings,
    ).not.toHaveProperty('otherRatio');
    expect(create().state.config.settings.ratio).toBe('16:9');
  });
  it('skips source rows without UUID and atomically rejects duplicates/malformed identities', () => {
    const result = createScriptV2VideoConfigState({
      rows: [...rows, { durationSeconds: 9 }],
      ...context(),
    });
    expect(result.state.selectedHiddenUuids.size).toBe(2);
    expect(createScriptV2VideoConfigState({ rows: [rows[0], rows[0]], ...context() }).reason).toBe(
      'duplicate-row-hidden-uuid',
    );
    expect(createScriptV2VideoConfigState({ rows: [{ hiddenUuid: 2 }], ...context() }).reason).toBe(
      'invalid-row-hidden-uuid',
    );
  });
});

describe('v2 local configuration lifecycle', () => {
  it('reconciles with stable references when unchanged', () => {
    const ctx = context(),
      { state } = createScriptV2VideoConfigState({ rows, ...ctx });
    expect(reconcileScriptV2VideoConfigState({ state, ...ctx }).state).toBe(state);
    expect(
      changeScriptV2VideoConfigState({ state, command: { type: 'model', value: 'first' }, ...ctx })
        .state,
    ).toBe(state);
    expect(
      changeScriptV2VideoConfigState({
        state,
        command: { type: 'duration', hiddenUuid: 'a', value: 5 },
        ...ctx,
      }).state,
    ).toBe(state);
  });
  it('keeps NaN source row duration stable while showing its validation failure', () => {
    const badRows = [{ ...rows[0], durationSeconds: NaN }],
      ctx = context(),
      { state } = createScriptV2VideoConfigState({ rows: badRows, ...ctx });
    expect(reconcileScriptV2VideoConfigState({ state, ...ctx }).state).toBe(state);
    expect(project(state).durationValidationByRow.get('a').supported).toBe(false);
  });
  it('reorders the duration map with current row order without reordering the surviving selected Set', () => {
    const { state } = create();
    const next = reconcileScriptV2VideoConfigState({
      state,
      rows: [...rows].reverse(),
      ...context(),
    }).state;
    expect([...next.perShotDurations.keys()]).toEqual(['b', 'a']);
    expect([...next.selectedHiddenUuids]).toEqual(['a', 'b']);
    expect(reconcileScriptV2VideoConfigState({ state: next, ...context() }).state).toBe(next);
  });
  it('retains edited durations/selection for surviving rows and does not select newly added rows', () => {
    let { state } = create();
    state = change(state, { type: 'duration', hiddenUuid: 'b', value: 5 }).state;
    state = change(state, { type: 'toggleRow', hiddenUuid: 'a' }).state;
    const nextRows = [
      { ...rows[1], durationSeconds: 10 },
      { ...rows[0], hiddenUuid: 'c' },
    ];
    const result = reconcileScriptV2VideoConfigState({ state, rows: nextRows, ...context() });
    expect(result.state.selectedHiddenUuids).toEqual(new Set(['b']));
    expect(result.state.perShotDurations).toEqual(
      new Map([
        ['b', 5],
        ['c', 5],
      ]),
    );
    expect(state.perShotDurations.get('b')).toBe(5);
  });
  it('model switch resets other settings/advanced, keeps allowed canonical ratio and keeps per-shot map', () => {
    let { state } = create();
    state = change(state, { type: 'setting', field: 'quality', value: 'high' }).state;
    state = change(state, { type: 'setting', field: 'ratio_16_9', value: '1:1' }).state;
    const result = change(
      { ...state, config: { ...state.config, advancedSettings: { private: 9 } } },
      { type: 'model', value: 'second' },
    );
    expect(result.state.config).toMatchObject({
      model: 'second',
      settings: { ratio: '1:1', quality: 'low' },
      advancedSettings: { auto_api: 0 },
    });
    expect(result.state.ratioEdited).toBe(true);
    expect(result.state.perShotDurations).toBe(state.perShotDurations);
  });
  it('does not copy noncanonical ratio aliases across a model switch', () => {
    const { state } = create();
    const result = change(
      { ...state, config: { ...state.config, settings: { ratio_old: '1:1' } } },
      { type: 'model', value: 'second' },
    );
    expect(result.state.config.settings.ratio).toBe('16:9');
  });
  it('marks ratio-only edits, not quality/duration/selection, as source ratio dirty', () => {
    const { state } = create();
    expect(
      change(state, { type: 'setting', field: 'quality', value: 'high' }).state.ratioEdited,
    ).toBe(false);
    expect(change(state, { type: 'duration', hiddenUuid: 'a', value: 10 }).state.ratioEdited).toBe(
      false,
    );
    expect(change(state, { type: 'toggleAll' }).state.ratioEdited).toBe(false);
    expect(
      change(state, { type: 'setting', field: 'ratio_16_9', value: '16:9' }).state.ratioEdited,
    ).toBe(true);
  });
  it('selection changes recompute min-reference model eligibility from the all-row refCounts', () => {
    const value = models();
    value.videoModels.first.properties.modeType.items.mixed2video = [2, 4];
    const ctx = { models: value },
      { state } = create(ctx);
    expect(state.config.model).toBe('first');
    const next = change(state, { type: 'toggleRow', hiddenUuid: 'b' }, ctx).state;
    expect(next.config.model).toBe('second');
    expect(project(next, ctx).requiredRefs).toBe(1);
  });
  it('source empty-string duration callback converts to zero without UI display normalization', () => {
    const { state } = create();
    expect(
      change(state, { type: 'duration', hiddenUuid: 'a', value: '' }).state.perShotDurations.get(
        'a',
      ),
    ).toBe(0);
    expect(change(state, { type: 'duration', hiddenUuid: 'a', value: 'no' }).valid).toBe(false);
  });
  it('rejects unavailable model/missing rows/unknown commands without mutation', () => {
    const { state } = create();
    for (const command of [
      { type: 'model', value: 'no' },
      { type: 'toggleRow', hiddenUuid: 'no' },
      { type: 'duration', hiddenUuid: 'no', value: 4 },
      { type: 'oops' },
    ]) {
      const result = change(state, command);
      expect(result.valid).toBe(false);
      expect(result.state).toBe(state);
    }
  });
});

describe('v2 settings rules and projection', () => {
  it('keeps ordinary enable:false/batch:false/visibleWhen fields and hides only exact source fields', () => {
    const { state } = create();
    expect(project(state).fields.map((field) => field.key)).toEqual([
      'ratio_16_9',
      'quality',
      'disabled',
      'invisible',
      'noDefault',
    ]);
    expect(project(state).fields[0]).toMatchObject({
      storedKey: 'ratio',
      value: '16:9',
      ratio: true,
    });
  });
  it('uses image1 rule context, typed disabled values, overrides and non-ratio enum fallback', () => {
    const value = models();
    value.videoModels.first.settingsRules = [
      {
        inputWhen: { imageList: 'notEmpty' },
        disable: { quality: ['low'], disabled: [0] },
        override: { quality: { min: 2, max: 8 } },
        message: 'source',
      },
    ];
    const { state } = create({ models: value }),
      view = project(state, { models: value });
    expect(state.config.settings).toMatchObject({ quality: 'high', disabled: 1 });
    expect(view.rules.disabledMap.disabled).toEqual(new Set([0]));
    expect(view.fields.find((field) => field.key === 'quality').override).toEqual({
      min: 2,
      max: 8,
    });
    expect(reconcileScriptV2VideoConfigState({ state, ...context({ models: value }) }).state).toBe(
      state,
    );
  });
  it('ignores forMode-only rules under the actual source sanitizer', () => {
    const value = models();
    value.videoModels.first.settingsRules = [
      {
        forModeTypes: ['mixed2video'],
        disable: { quality: ['low'] },
        override: { quality: { max: 0 } },
      },
    ];
    const { state } = create({ models: value });
    expect(state.config.settings.quality).toBe('low');
    expect(project(state, { models: value }).rules.overrides).toEqual({});
  });
  it('source fallback finder takes the first matching fallback even from another mode', () => {
    const value = models();
    value.videoModels.first.settingsRules = [
      {
        when: {},
        forModeTypes: ['other'],
        disable: { quality: ['low'] },
        fallback: { quality: 'first-fallback' },
      },
      { when: {}, disable: { quality: ['low'] }, fallback: { quality: 'second-fallback' } },
    ];
    expect(create({ models: value }).state.config.settings.quality).toBe('first-fallback');
  });
  it('conflict expansion drops original inputWhen and override as in source', () => {
    const value = models();
    value.videoModels.first.settingsRules = [
      {
        inputWhen: { audioList: 'notEmpty' },
        conflict: [
          { field: 'quality', values: ['low'] },
          { field: 'disabled', values: [0] },
        ],
        fallback: { quality: 'high' },
        override: { quality: { max: 0 } },
      },
    ];
    const { state } = create({ models: value });
    expect(state.config.settings.quality).toBe('high');
    expect(project(state, { models: value }).rules.overrides).toEqual({});
  });
  it('does not auto-fallback ratio even when its current value is disabled', () => {
    const value = models();
    value.videoModels.first.settingsRules = [
      { when: {}, disable: { ratio_16_9: ['16:9', '9:16'] }, fallback: { ratio_16_9: '1:1' } },
    ];
    const { state } = create({ models: value }),
      view = project(state, { models: value });
    expect(state.config.settings.ratio).toBe('16:9');
    expect(view.ratioLocked).toBe(true);
    expect(view.ratioHint).toBe('该模型固定为 16:9');
  });
  it('settles source chained effects and rejects cyclic malformed settings atomically', () => {
    const value = models();
    value.videoModels.first.settingsRules = [
      { when: { quality: 'low' }, disable: { quality: ['low'] }, fallback: { quality: 'medium' } },
      {
        when: { quality: 'medium' },
        disable: { quality: ['medium'] },
        fallback: { quality: 'high' },
      },
    ];
    expect(create({ models: value }).state.config.settings.quality).toBe('high');
    value.videoModels.first.settingsRules[1].fallback.quality = 'low';
    expect(create({ models: value })).toMatchObject({
      valid: false,
      reason: 'cyclic-settings-rules',
    });
  });
  it('preserves edited invalid duration across model switch and reports original script duration', () => {
    let { state } = create();
    state = change(state, { type: 'duration', hiddenUuid: 'a', value: 7 }).state;
    state = change(state, { type: 'model', value: 'second' }).state;
    const view = project(state);
    expect(state.perShotDurations.get('a')).toBe(7);
    expect(view.durationValidationByRow.get('a')).toEqual({
      supported: false,
      message: '当前模型支持 5s / 10s，脚本表格为 5s，请调整后再生成',
    });
    expect(view.confirmTooltip).toBe('镜头1 时长超过模型限制，请调整时长或切换模型');
  });
  it('only disables fixed duration controls when the particular row is already valid', () => {
    const value = models();
    value.videoModels.first.properties.duration.enum = [5];
    const view = project(create({ models: value }).state, { models: value });
    expect(view).toMatchObject({ durationFixed: true, durationFixedValue: 5 });
    expect(view.durationValidationByRow.get('a').supported).toBe(true);
    expect(view.durationValidationByRow.get('b').supported).toBe(false);
  });
  it('counts current modal selection independently from the script table selection', () => {
    let { state } = create();
    state = change(state, { type: 'toggleRow', hiddenUuid: 'a' }).state;
    expect(project(state)).toMatchObject({
      selectedCount: 1,
      totalCount: 2,
      allSelected: false,
      someSelected: true,
      canConfirm: true,
    });
    state = change(state, { type: 'toggleAll' }).state;
    expect(project(state)).toMatchObject({ selectedCount: 2, allSelected: true });
    state = change(state, { type: 'toggleAll' }).state;
    expect(project(state)).toMatchObject({ selectedCount: 0, canConfirm: false });
  });
  it('blocks selected missing references, then over-limit, then all-assets readiness, then prompt', () => {
    const { state } = create();
    const missing = project(state, {
      referenceDescription: refs(
        [
          ['a', 0],
          ['b', 4],
        ],
        { assetsReady: false },
      ),
    });
    expect(missing.confirmTooltip).toContain('镜头 1 缺少');
    const over = project(state, {
      referenceDescription: refs(
        [
          ['a', 1],
          ['b', 4],
        ],
        { assetsReady: false },
      ),
    });
    expect(over.confirmTooltip).toContain('最多 3 张');
    expect(over.capability).toMatchObject({ usable: true, willTruncate: true });
    const pending = project(state, {
      referenceDescription: refs(undefined, { assetsReady: false }),
    });
    expect(pending.confirmTooltip).toBe('请先生成所有资产图后再创建视频生成器组');
    const emptyState = {
      ...state,
      rows: [{ ...rows[0], videoMotionPrompt: '', plotDescription: '  ' }, rows[1]],
    };
    expect(project(emptyState).confirmTooltip).toBe('请先合成提示词后再创建视频生成器组');
    expect(project(emptyState).canConfirm).toBe(false);
  });
  it('keeps warnings for unselected rows but does not let their invalid refs/duration/prompt block submit', () => {
    let { state } = create();
    state = change(state, { type: 'toggleRow', hiddenUuid: 'b' }).state;
    state = {
      ...state,
      rows: [rows[0], { ...rows[1], durationSeconds: 99, plotDescription: '' }],
      perShotDurations: new Map([
        ['a', 5],
        ['b', 99],
      ]),
    };
    const view = project(state, {
      referenceDescription: refs([
        ['a', 1],
        ['b', 0],
      ]),
    });
    expect(view.rowWarnings.get('b')).toMatchObject({ missingReferences: true, emptyPrompt: true });
    expect(view.canConfirm).toBe(true);
  });
  it('does not treat thumbnail-ready assets as actual row references', () => {
    const { state } = create(),
      view = project(state, {
        referenceDescription: refs(
          [
            ['a', 0],
            ['b', 1],
          ],
          { assetReadiness: { ready: true, total: 2 } },
        ),
      });
    expect(view.assetsReady).toBe(true);
    expect(view.missingReferenceRows.map((row) => row.hiddenUuid)).toEqual(['a']);
    expect(view.canConfirm).toBe(false);
  });
  it('missing descriptor never fabricates ready refs/assets', () => {
    const { state } = create(),
      view = project(state, { referenceDescription: undefined });
    expect(view.canConfirm).toBe(false);
    expect(view.assetsReady).toBe(false);
  });
  it('rejects a malformed state projection without reading missing config fields', () => {
    expect(
      project({ rows, selectedHiddenUuids: new Set(), perShotDurations: new Map() }),
    ).toMatchObject({ valid: false, canConfirm: false });
  });
});

describe('v2 actual confirm payload and public representative catalogue', () => {
  it('passes modelSchema, finite selected duration map and selected order without a fake request', () => {
    const { state } = create();
    const selected = new Set(['b', 'a']),
      durations = new Map([
        ['a', 5],
        ['b', Infinity],
        ['other', 10],
      ]);
    const value = models().videoModels.first,
      payload = buildScriptV2VideoConfirmPayload({
        state: { ...state, selectedHiddenUuids: selected, perShotDurations: durations },
        schema: value,
        requiredRefs: 2,
      });
    expect(payload.config).toEqual({ ...state.config, modelSchema: value });
    expect(payload.perShotDurations).toEqual(new Map([['a', 5]]));
    expect([...payload.selectedHiddenUuids]).toEqual(['b', 'a']);
    expect(payload.selectedHiddenUuids).not.toBe(selected);
    expect(payload.config.advancedSettings).toBe(state.config.advancedSettings);
    expect(payload).not.toHaveProperty('fee');
  });
  it('retains current mode when mixed capability is unavailable at the actual helper boundary', () => {
    const { state } = create();
    expect(
      buildScriptV2VideoConfirmPayload({
        state: { ...state, config: { ...state.config, modeType: 'other' } },
        schema: {},
        requiredRefs: 1,
      }).config.modeType,
    ).toBe('other');
  });
  it('uses exactly the public full video34 catalogue independently of storyboardVideo19', () => {
    expect(publicSupport.items).toHaveLength(34);
    const result = createScriptV2VideoConfigState({
      rows,
      models: publicModels,
      support: publicSupport.items,
      referenceDescription: refs(),
    });
    expect(result.valid).toBe(true);
    const view = projectScriptV2VideoConfig({
      state: result.state,
      models: publicModels,
      support: publicSupport.items,
      referenceDescription: refs(),
    });
    expect(view.catalogue.keys.length).toBeGreaterThan(0);
    expect(view.config.model).toBe(view.catalogue.keys[0]);
    expect(
      reconcileScriptV2VideoConfigState({
        state: result.state,
        models: publicModels,
        support: publicSupport.items,
        referenceDescription: refs(),
      }).state,
    ).toBe(result.state);
  });
});
