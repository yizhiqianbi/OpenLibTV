import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildScriptV2ImageConfirmPayload,
  changeScriptV2ImageConfigState,
  createScriptV2ImageConfigState,
  projectScriptV2ImageConfig,
  reconcileScriptV2ImageConfigState,
  resolveScriptV2ImageCatalogue,
} from './v2-image-config-model.js';

const makeSchema = (maximum = 3, overrides = {}) => ({
  displayText: 'Schema model',
  config: { settings: ['ratio', 'quality'] },
  properties: {
    modeType: { items: { image2image: [1, maximum] } },
    ratio: { default: '16:9', originalField: 'aspectRatio', enum: ['16:9', '1:1'] },
    quality: { default: 'medium', enum: ['medium', 'high'] },
  },
  ...overrides,
});
function fixture() {
  return {
    rows: [
      { id: 'row-b', hiddenUuid: 'b', shotNumber: 9, imageGenerationPrompt: 'B prompt' },
      { id: 'row-a', hiddenUuid: 'a', shotNumber: 1, imageGenerationPrompt: 'A prompt' },
    ],
    models: {
      default: { image: 'fallback' },
      imageModels: { small: makeSchema(1), large: makeSchema(5), fallback: makeSchema(10) },
    },
    support: [{ modelKey: 'small', modelName: 'Small' }, { modelKey: 'large' }],
    refCounts: new Map([
      [0, 1],
      [1, 3],
    ]),
  };
}
function initialized(context = fixture()) {
  const result = createScriptV2ImageConfigState(context);
  expect(result.valid).toBe(true);
  return { ...context, state: result.state };
}
const change = (context, command) => changeScriptV2ImageConfigState({ ...context, command });

describe('r3 image model catalogue', () => {
  it('uses global image support order and filters by the selected maximum, not a sum', () => {
    const context = fixture();
    expect(resolveScriptV2ImageCatalogue({ ...context, requiredRefs: 0 }).keys).toEqual([
      'small',
      'large',
    ]);
    expect(resolveScriptV2ImageCatalogue({ ...context, requiredRefs: 1 }).keys).toEqual([
      'small',
      'large',
    ]);
    expect(resolveScriptV2ImageCatalogue({ ...context, requiredRefs: 3 }).keys).toEqual(['large']);
    const projection = projectScriptV2ImageConfig(initialized(context));
    expect(projection.requiredRefs).toBe(3);
    expect(projection.canConfirm).toBe(true);
  });

  it.each([
    [undefined, false],
    [{ image2image: '1,3' }, false],
    [{ image2image: [1] }, false],
    [{ image2image: ['1', 3] }, false],
    [{ image2image: [1, '3'] }, false],
    [{ image2image: [3, 1] }, false],
    [{ image2image: [1, NaN] }, false],
    [{ image2image: [1, 3] }, true],
    [{ image2image: [0, Infinity] }, true],
  ])('requires source typed image2image bounds for refs>0: %j', (items, eligible) => {
    const models = {
        imageModels: { test: makeSchema(3, { properties: { modeType: { items } } }) },
      },
      support = [{ modelKey: 'test' }];
    expect(resolveScriptV2ImageCatalogue({ models, support, requiredRefs: 2 }).keys).toEqual(
      eligible ? ['test'] : [],
    );
  });

  it('keeps missing schemas at zero references and does not use mixed/video or text mode gates', () => {
    const support = [{ modelKey: 'missing' }, { modelKey: 'videoOnly' }],
      models = {
        imageModels: {
          videoOnly: { properties: { modeType: { items: { mixed2video: [0, 20] } } } },
        },
      };
    expect(resolveScriptV2ImageCatalogue({ models, support, requiredRefs: 0 }).keys).toEqual([
      'missing',
      'videoOnly',
    ]);
    expect(resolveScriptV2ImageCatalogue({ models, support, requiredRefs: 1 }).keys).toEqual([]);
  });

  it('uses support modelName, then schema displayText, then key with source no-trim semantics', () => {
    const context = fixture();
    context.support = [
      { modelKey: 'small', modelName: ' ', displayText: 'Wrong metadata alias' },
      { modelKey: 'large', modelName: '' },
      { modelKey: 'unknown', modelName: 12 },
    ];
    expect(resolveScriptV2ImageCatalogue(context).options.map((entry) => entry.label)).toEqual([
      ' ',
      'Schema model',
      'unknown',
    ]);
  });

  it.each([
    [true, true, undefined],
    [' reason ', true, 'reason'],
    [{ zh: ' 中文 ', en: ' English ' }, true, '中文'],
    [{ en: ' English ' }, true, 'English'],
    [{ zh: ' ', en: ' ' }, true, undefined],
    [{ extra: 1 }, true, undefined],
    [false, false, undefined],
    [0, false, undefined],
    [' ', false, undefined],
    [{}, false, undefined],
    [[], false, undefined],
  ])('projects support disable metadata exactly: %j', (disable, disabled, reason) => {
    const option = resolveScriptV2ImageCatalogue({ support: [{ modelKey: 'one', disable }] })
      .options[0];
    expect(option).toMatchObject({ disabled, disabledReason: reason, disable });
  });

  it('falls back to English, not Chinese, for an unknown language', () => {
    const option = resolveScriptV2ImageCatalogue({
      support: [{ modelKey: 'one', disable: { zh: '中文', en: 'English' } }],
      language: 'fr',
    }).options[0];
    expect(option.disabledReason).toBe('English');
  });

  it('preserves icons and disabled entries in the candidates without inventing permissions', () => {
    const option = resolveScriptV2ImageCatalogue({
      support: [{ modelKey: 'one', icon: '/source.svg', disable: true }],
    });
    expect(option.keys).toEqual(['one']);
    expect(option.options[0]).toMatchObject({ icon: '/source.svg', disabled: true });
    expect(option.options[0]).not.toHaveProperty('vip');
  });

  it.each([
    [{ support: {} }, 'invalid-support'],
    [{ support: [null] }, 'invalid-support'],
    [{ support: [{ modelKey: 1 }] }, 'invalid-support'],
    [{ support: [{ modelKey: 'same' }, { modelKey: 'same' }] }, 'duplicate-support-key'],
    [{ requiredRefs: -1 }, 'invalid-reference-counts'],
    [{ requiredRefs: 1.5 }, 'invalid-reference-counts'],
    [{ requiredRefs: '1' }, 'invalid-reference-counts'],
  ])('rejects malformed local input atomically: %j', (overrides, reason) => {
    expect(resolveScriptV2ImageCatalogue({ ...fixture(), ...overrides })).toMatchObject({
      valid: false,
      reason,
      keys: [],
      options: [],
    });
  });

  it('loaded empty support keeps only the global initialization fallback, not a fake menu option', () => {
    const context = fixture();
    for (const support of [[], null, undefined]) {
      const catalogue = resolveScriptV2ImageCatalogue({ ...context, support });
      expect(catalogue).toMatchObject({
        valid: true,
        defaultModel: 'fallback',
        keys: [],
        options: [],
      });
    }
  });
});

describe('r3 initialization, effects and index selection', () => {
  it('initially selects all raw indices with independent expansion and text2image defaults', () => {
    const context = initialized();
    expect(context.state.selectedIndices).toEqual(new Set([0, 1]));
    expect(context.state.expandedIndices).toEqual(new Set());
    expect(context.state.config).toEqual({
      model: 'large',
      modeType: 'text2image',
      settings: { ratio: '16:9', quality: 'medium' },
    });
    expect(context.state.config).not.toHaveProperty('modelSchema');
    expect(context.state.config).not.toHaveProperty('advancedSettings');
  });

  it('initialSelected maps its length to raw prefix indices rather than matching UUID or row identity', () => {
    const context = fixture();
    const result = createScriptV2ImageConfigState({
      ...context,
      initialSelected: [context.rows[1]],
    });
    expect(result.state.selectedIndices).toEqual(new Set([0]));
    expect(result.state.config.model).toBe('small');
  });

  it('settles a fresh-open zero-ref first model before all-selected filtering, retaining it if none remain', () => {
    const context = fixture();
    context.refCounts = new Map([
      [0, 15],
      [1, 15],
    ]);
    const result = createScriptV2ImageConfigState(context);
    expect(result.state.config.model).toBe('small');
    expect(result.state.config.model).not.toBe(context.models.default.image);
    expect(projectScriptV2ImageConfig({ ...context, state: result.state })).toMatchObject({
      options: [],
      requiredRefs: 15,
      canConfirm: false,
    });
  });

  it('applies the independent selector disabled fallback after capability filtering', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.support[0].disable = true;
    const result = createScriptV2ImageConfigState(context);
    expect(result.state.config.model).toBe('large');
    expect(result.state.config.settings).toEqual({ ratio: '16:9', quality: 'medium' });
  });

  it('keeps an all-disabled current model and disables confirmation without inventing a fallback', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.support.forEach((entry) => {
      entry.disable = true;
    });
    const initializedContext = initialized(context);
    expect(initializedContext.state.config.model).toBe('small');
    expect(projectScriptV2ImageConfig(initializedContext).canConfirm).toBe(false);
  });

  it('model switches reset all prior settings and mode rather than inheriting ratio or advanced configuration', () => {
    const context = initialized({ ...fixture(), refCounts: new Map() });
    context.state.config = {
      ...context.state.config,
      modeType: 'image2image',
      settings: { ratio: '1:1', private: 'retain?' },
      advancedSettings: { seed: 10 },
    };
    const result = change(context, { type: 'model', value: 'large' });
    expect(result.state.config).toEqual({
      model: 'large',
      modeType: 'text2image',
      settings: { ratio: '16:9', quality: 'medium' },
    });
  });

  it('selecting a reference-heavy row resets an incompatible model to first candidate defaults', () => {
    const context = initialized({ ...fixture(), initialSelected: [0] });
    context.state.config.settings.ratio = '1:1';
    const result = change(context, { type: 'toggleRow', index: 1 });
    expect(result.state.config.model).toBe('large');
    expect(result.state.config.settings.ratio).toBe('16:9');
    expect(context.state.selectedIndices).toEqual(new Set([0]));
  });

  it('unselecting all makes refs zero without switching an already compatible model', () => {
    const context = initialized(),
      result = change(context, { type: 'toggleAll' });
    const projection = projectScriptV2ImageConfig({ ...context, state: result.state });
    expect(result.state.selectedIndices).toEqual(new Set());
    expect(result.state.config.model).toBe('large');
    expect(projection).toMatchObject({ requiredRefs: 0, selectedCount: 0, canConfirm: false });
    expect(projection.options.map((entry) => entry.value)).toEqual(['small', 'large']);
  });

  it('row selection and expansion are separate copy-on-write Sets and survive row reordering', () => {
    let context = initialized();
    context = { ...context, state: change(context, { type: 'toggleExpanded', index: 0 }).state };
    context = { ...context, state: change(context, { type: 'toggleRow', index: 1 }).state };
    const nextRows = [...context.rows].reverse(),
      result = reconcileScriptV2ImageConfigState({ ...context, rows: nextRows });
    expect(result.state.selectedIndices).toBe(context.state.selectedIndices);
    expect(result.state.expandedIndices).toBe(context.state.expandedIndices);
    expect(result.state.selectedIndices).toEqual(new Set([0]));
    expect(result.state.rows[0].hiddenUuid).toBe('a');
    expect(
      projectScriptV2ImageConfig({ ...context, state: result.state }).rowDisplay[0],
    ).toMatchObject({ index: 0, selected: true, expanded: true, prompt: 'A prompt' });
  });

  it('does not prune stale raw indices or count stale references after rows shrink', () => {
    const context = initialized();
    context.state.expandedIndices.add(1);
    const result = reconcileScriptV2ImageConfigState({
        ...context,
        rows: [context.rows[0]],
        refCounts: new Map([
          [0, 1],
          [1, 20],
        ]),
      }),
      projection = projectScriptV2ImageConfig({
        ...context,
        state: result.state,
        refCounts: new Map([
          [0, 1],
          [1, 20],
        ]),
      });
    expect(result.state.selectedIndices).toEqual(new Set([0, 1]));
    expect(result.state.expandedIndices).toEqual(new Set([1]));
    expect(projection).toMatchObject({
      selectedCount: 2,
      totalCount: 1,
      allSelected: false,
      someSelected: false,
      requiredRefs: 1,
    });
  });

  it('keeps Sets while an open empty table makes toggle-all a source no-op', () => {
    const context = initialized();
    const reconciled = reconcileScriptV2ImageConfigState({ ...context, rows: [] });
    const result = change(
      { ...context, rows: reconciled.state.rows, state: reconciled.state },
      { type: 'toggleAll' },
    );
    expect(result.state).toBe(reconciled.state);
    expect(result.state.selectedIndices).toEqual(new Set([0, 1]));
  });

  it('uses Set size for toggle-all even if same-sized historical indices do not match current rows', () => {
    const context = initialized();
    context.state.selectedIndices = new Set([20, 21]);
    expect(projectScriptV2ImageConfig(context).allSelected).toBe(true);
    expect(change(context, { type: 'toggleAll' }).state.selectedIndices).toEqual(new Set());
  });

  it('settlement and same-value commands preserve state identity without serialization', () => {
    const context = initialized();
    context.rows[0].toJSON = () => {
      throw new Error('No serialization');
    };
    expect(reconcileScriptV2ImageConfigState(context).state).toBe(context.state);
    expect(change(context, { type: 'model', value: 'large' }).state).toBe(context.state);
    expect(change(context, { type: 'setting', field: 'ratio', value: '16:9' }).state).toBe(
      context.state,
    );
  });

  it.each([
    [{ type: 'model', value: 'missing' }, 'unavailable-model'],
    [{ type: 'toggleRow', index: 2 }, 'missing-row'],
    [{ type: 'toggleExpanded', index: -1 }, 'missing-row'],
    [{ type: 'duration', value: 5 }, 'invalid-command'],
  ])('invalid commands keep the original state: %j', (command, reason) => {
    const context = initialized(),
      result = change(context, command);
    expect(result).toMatchObject({ valid: false, reason });
    expect(result.state).toBe(context.state);
  });
});

describe('r2 defaults and r3 enum-only chips', () => {
  it('writes defaults and changes using raw schema keys, preserving falsy defaults and no originalField remap', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small = makeSchema(1, {
      config: { settings: ['ratio_custom', 'zero', 'false', 'nullable', 'missing'] },
      properties: {
        ratio_custom: { originalField: 'aspectRatio', default: '1:1', enum: ['1:1', '16:9'] },
        zero: { default: 0 },
        false: { default: false },
        nullable: { default: null },
        missing: {},
      },
    });
    const initializedContext = initialized(context);
    expect(initializedContext.state.config.settings).toEqual({
      ratio_custom: '1:1',
      zero: 0,
      false: false,
      nullable: null,
    });
    const projection = projectScriptV2ImageConfig(initializedContext);
    expect(projection.fields[0]).toMatchObject({
      key: 'ratio_custom',
      originalField: 'aspectRatio',
      isAspect: true,
      currentValue: '1:1',
    });
    expect(projection.fields[3].currentValue).toBe('');
    const result = change(initializedContext, {
      type: 'setting',
      field: 'ratio_custom',
      value: '16:9',
    });
    expect(result.state.config.settings.ratio_custom).toBe('16:9');
    expect(result.state.config.settings).not.toHaveProperty('aspectRatio');
  });

  it('supports r2 mode-object defaults but does not invent visible mode-object chips', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.config.settings = {
      text2image: ['ratio'],
      image2image: ['quality'],
    };
    const initializedContext = initialized(context),
      projection = projectScriptV2ImageConfig(initializedContext);
    expect(initializedContext.state.config.settings).toEqual({ ratio: '16:9' });
    expect(projection).toMatchObject({
      fields: [],
      visibleSettingsSupported: false,
      canConfirm: true,
    });
  });

  it('uses config.setting only for initialization, while missing config.settings has no visible chips', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.config = { setting: ['quality'] };
    const initializedContext = initialized(context);
    expect(initializedContext.state.config.settings).toEqual({ quality: 'medium' });
    expect(projectScriptV2ImageConfig(initializedContext)).toMatchObject({
      fields: [],
      visibleSettingsSupported: true,
    });
  });

  it('empty text2image mode defaults mask the image2image fallback via nullish precedence', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.config.settings = { text2image: [], image2image: ['quality'] };
    expect(initialized(context).state.config.settings).toEqual({});
  });

  it('does not synthesize enum defaults or normalize default values through generic generator rules', () => {
    const context = fixture();
    context.refCounts = new Map();
    delete context.models.imageModels.small.properties.ratio.default;
    context.models.imageModels.small.properties.quality.default = 'not-in-enum';
    expect(initialized(context).state.config.settings).toEqual({ quality: 'not-in-enum' });
  });

  it('renders all source-listed fields, including disabled/barOnly/conditional and numeric fields as chips', () => {
    const context = fixture();
    context.refCounts = new Map();
    Object.assign(context.models.imageModels.small.properties.quality, {
      enable: false,
      barOnly: true,
      type: 'number',
      min: 1,
      max: 10,
      visibleWhen: { ratio: 'never' },
    });
    const projection = projectScriptV2ImageConfig(initialized(context));
    expect(projection.fields.map((field) => field.key)).toEqual(['ratio', 'quality']);
    expect(projection.fields[1].type).toBe('number');
    expect(projection.fields[1]).not.toHaveProperty('slider');
  });

  it('preserves source primitive-string versus object typed enum values and label fallback precedence', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.properties.quality.enum = [
      'raw',
      7,
      true,
      null,
      { value: 7, displayName: '显示', label: 'ignored', name: 'ignored' },
      { value: false, displayName: '', label: 'label' },
      { key: 0, name: 'name' },
      { value: null, key: 'key' },
      {},
    ];
    const values = projectScriptV2ImageConfig(initialized(context)).fields[1].values;
    expect(values).toEqual([
      { value: 'raw', label: 'raw' },
      { value: '7', label: '7' },
      { value: 'true', label: 'true' },
      { value: 'null', label: 'null' },
      { value: 7, label: '显示' },
      { value: false, label: 'label' },
      { value: 0, label: 'name' },
      { value: 'key', label: 'key' },
      { value: '[object Object]', label: '[object Object]' },
    ]);
  });

  it('uses translated i18n keys only when translation is truthy and differs from the key', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.properties.quality.enum = [
      { value: 'a', displayName: 'Fallback A', displayNameI18nKey: 'a-key' },
      { value: 'b', displayName: 'Fallback B', displayNameI18nKey: 'b-key' },
      { value: 'c', displayName: '', displayNameI18nKey: 'c-key', label: 'Label C' },
    ];
    const translate = (key) => (key === 'a-key' ? 'Translated' : key === 'b-key' ? key : '');
    expect(
      projectScriptV2ImageConfig({ ...initialized(context), translate }).fields[1].values.map(
        (entry) => entry.label,
      ),
    ).toEqual(['Translated', 'Fallback B', 'Label C']);
  });

  it('does not copy option-level disable/rules into setting menus or refill settings', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.properties.quality.enum = [
      { value: 'medium', disable: true },
      { value: 'high' },
    ];
    context.models.imageModels.small.settingsRules = [
      { when: { ratio: '16:9' }, disable: { quality: ['medium'] }, fallback: { quality: 'high' } },
    ];
    const initializedContext = initialized(context),
      projection = projectScriptV2ImageConfig(initializedContext);
    expect(initializedContext.state.config.settings.quality).toBe('medium');
    expect(projection.fields[1].values).toEqual([
      { value: 'medium', label: 'medium' },
      { value: 'high', label: 'high' },
    ]);
  });

  it('setting changes require a displayed typed value and preserve unrelated settings', () => {
    const context = initialized({ ...fixture(), refCounts: new Map() });
    context.models.imageModels.small.properties.quality.enum = [{ value: 7 }, true];
    context.state.config.settings.private = 'keep';
    expect(
      change(context, { type: 'setting', field: 'quality', value: 7 }).state.config.settings,
    ).toMatchObject({ quality: 7, private: 'keep' });
    expect(change(context, { type: 'setting', field: 'quality', value: true }).valid).toBe(false);
    expect(change(context, { type: 'setting', field: 'private', value: 'other' }).valid).toBe(
      false,
    );
  });
});

describe('r3 prompts, display and confirm payload', () => {
  it.each(['', null, undefined, false, 0])(
    'falsy image prompt blocks selected rows even with plot fallback: %j',
    (prompt) => {
      const context = fixture();
      context.rows[0] = {
        ...context.rows[0],
        imageGenerationPrompt: prompt,
        plotDescription: 'Plot only',
      };
      const projection = projectScriptV2ImageConfig(initialized(context));
      expect(projection).toMatchObject({
        canConfirm: false,
        emptyPromptIndices: [0],
        confirmTooltip: '请先合成提示词后再创建分镜图生成器组',
      });
      expect(projection.rowDisplay[0].prompt).toBe('Plot only');
    },
  );

  it('does not trim whitespace prompts, require assets ready, or substitute video prompts', () => {
    const context = fixture();
    context.rows[0] = {
      ...context.rows[0],
      imageGenerationPrompt: '   ',
      videoMotionPrompt: '',
      promptState: 'stale',
    };
    const projection = projectScriptV2ImageConfig(initialized(context));
    expect(projection.canConfirm).toBe(true);
    expect(projection.rowDisplay[0].prompt).toBe('   ');
  });

  it('unselected empty prompts do not block confirmation and display source empty marker', () => {
    const context = fixture();
    context.rows[1].imageGenerationPrompt = '';
    const initializedContext = initialized({ ...context, initialSelected: [0] }),
      projection = projectScriptV2ImageConfig(initializedContext);
    expect(projection).toMatchObject({
      canConfirm: true,
      emptyPromptIndices: [],
      confirmLabel: '确认并创建生成器组 (1)',
    });
    expect(projection.rowDisplay[1].prompt).toBe('（空）');
  });

  it('keeps success instruction tooltip when empty selection or no model prevents confirming', () => {
    const context = initialized(),
      empty = change(context, { type: 'toggleAll' }).state;
    for (const next of [
      { ...context, state: empty },
      { ...context, support: [] },
    ]) {
      expect(projectScriptV2ImageConfig(next)).toMatchObject({
        canConfirm: false,
        confirmTooltip: '创建分镜图生成器组后，可在画布中整组执行批量生图',
      });
      expect(buildScriptV2ImageConfirmPayload(next)).toBeNull();
    }
  });

  it('payload uses ascending raw row order rather than shot number, UUID or Set insertion order', () => {
    const context = initialized();
    context.state.selectedIndices = new Set([1, 0]);
    const payload = buildScriptV2ImageConfirmPayload(context);
    expect(payload.selectedIndices).toEqual([0, 1]);
    expect(payload.config).toEqual(context.state.config);
    expect(payload.config).not.toBe(context.state.config);
    expect(payload.config.settings).not.toBe(context.state.config.settings);
    expect(payload.config).not.toHaveProperty('modelSchema');
  });

  it('retains source stale-index caption and empty payload which caller must treat as no selected rows', () => {
    const context = initialized();
    context.state.selectedIndices = new Set([99]);
    expect(projectScriptV2ImageConfig(context)).toMatchObject({
      selectedCount: 1,
      requiredRefs: 0,
      canConfirm: true,
    });
    expect(buildScriptV2ImageConfirmPayload(context).selectedIndices).toEqual([]);
  });
});

describe('local invalid-data boundary and actual public support', () => {
  it.each([null, {}, [null]])('invalid rows fail without index coercion: %j', (rows) => {
    expect(createScriptV2ImageConfigState({ ...fixture(), rows }).valid).toBe(false);
  });

  it('permits duplicate or missing hidden UUID because this panel is an index protocol', () => {
    const context = fixture();
    context.rows = [
      { imageGenerationPrompt: 'A' },
      { hiddenUuid: 'same', imageGenerationPrompt: 'B' },
      { hiddenUuid: 'same', imageGenerationPrompt: 'C' },
    ];
    expect(initialized(context).state.selectedIndices).toEqual(new Set([0, 1, 2]));
  });

  it('rejects invalid state/refcount input without modifying the state', () => {
    const context = initialized(),
      invalidCounts = new Map([[0, -1]]);
    expect(
      reconcileScriptV2ImageConfigState({ ...context, refCounts: invalidCounts }),
    ).toMatchObject({ valid: false, reason: 'invalid-reference-counts', state: context.state });
    expect(projectScriptV2ImageConfig({ ...context, refCounts: [] }).canConfirm).toBe(false);
    expect(
      reconcileScriptV2ImageConfigState({
        ...context,
        state: { ...context.state, selectedIndices: new Set(['0']) },
      }).valid,
    ).toBe(false);
  });

  it('rejects malformed default lists and enum lists instead of executing the source crash', () => {
    const context = fixture();
    context.refCounts = new Map();
    context.models.imageModels.small.config.settings = { text2image: 'ratio' };
    expect(createScriptV2ImageConfigState(context)).toMatchObject({
      valid: false,
      reason: 'invalid-default-fields',
    });
    context.models.imageModels.small.config.settings = ['ratio'];
    context.models.imageModels.small.properties.ratio.enum = {};
    const initializedContext = initialized(context);
    expect(projectScriptV2ImageConfig(initializedContext)).toMatchObject({
      valid: false,
      reason: 'invalid-setting-enum',
      canConfirm: false,
    });
  });

  it('uses the archived global image20 exactly, not v1 scriptImage or video catalogues', () => {
    const models = JSON.parse(readFileSync('public/data/models.json', 'utf8')),
      source = JSON.parse(readFileSync('research/source/api/config-182.json', 'utf8')),
      sourceSupport = JSON.parse(source.data.linkUrl).image,
      publicSupport = JSON.parse(
        readFileSync('public/data/image-model-support.json', 'utf8'),
      ).items;
    expect(publicSupport).toEqual(sourceSupport);
    expect(publicSupport).toHaveLength(20);
    const context = {
      rows: [{ imageGenerationPrompt: 'Real schema configuration' }],
      models,
      support: publicSupport,
      refCounts: new Map(),
    };
    const initializedContext = initialized(context);
    expect(initializedContext.state.config.model).toBe('lib-image-2.5-s');
    expect(projectScriptV2ImageConfig(initializedContext).options).toHaveLength(20);
    for (const model of ['nebula-2.1', 'nebula-2-flash']) {
      const switched = change(initializedContext, { type: 'model', value: model });
      expect(switched.valid).toBe(true);
      expect(Object.keys(switched.state.config.settings).length).toBeGreaterThan(0);
      expect(projectScriptV2ImageConfig({ ...context, state: switched.state })).toMatchObject({
        visibleSettingsSupported: false,
        fields: [],
        canConfirm: true,
      });
    }
  });
});
