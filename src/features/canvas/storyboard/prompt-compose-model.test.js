import { describe, expect, it } from 'vitest';
import {
  SCRIPT_PROMPT_UNDO_MS,
  applyScriptComposedSnapshot,
  applyScriptPromptEdit,
  buildScriptAssetIdToNameMap,
  buildScriptAssetNameMap,
  captureScriptPromptCompose,
  composeScriptPromptTracks,
  createScriptPromptUndo,
  findScriptPromptRefMatches,
  fingerprintScriptPromptBundle,
  fingerprintScriptPromptInput,
  getScriptPromptBundle,
  getScriptPromptState,
  initialScriptPromptSelection,
  parseScriptAssetMentions,
  planScriptPromptCompose,
  planScriptPromptUndo,
  readScriptPromptInput,
  reconcileScriptPromptRefsForTextEdit,
  stableScriptPromptFingerprint,
} from './prompt-compose-model.js';

const assets = {
  characters: [{ id: 'alice', name: '阿青' }],
  scenes: [{ id: 'park', name: '公园' }],
  props: [{ id: 'umbrella', name: '雨伞' }],
};
const row = (id, values = {}) => ({
  id,
  hiddenUuid: `hidden-${id}`,
  shotNumber: 1,
  plotDescription: '',
  imageGenerationPrompt: '',
  videoMotionPrompt: '',
  ...values,
});

describe('source local prompt templates', () => {
  it('uses distinct source field ordering, normalization, punctuation and spoken grouping', () => {
    const input = row('shot', {
      durationSeconds: 5,
      plotDescription: '  阿青\n站在  公园! ',
      shotSize: ' 中景 ',
      cinematics: { shotSize: '远景', lighting: '阴暗', cameraMovement: ' 缓慢  推近 ' },
      lightingAndAtmosphere: ' 暖光 ',
      characters: [{ characterAssetId: 'alice', characterName: '旧名称' }],
      sceneAssetIds: ['park'],
      propAssetIds: ['umbrella'],
      dialogueLines: [
        { kind: 'voiceover', text: ' 开始了 ', characterRef: 'alice' },
        { kind: 'dialogue', text: ' 你好？ ', characterRef: 'alice' },
      ],
      audioEffects: ' 风声 ',
      bgm: 'ignored',
    });
    const result = composeScriptPromptTracks(input, assets, ' 水彩  电影 ');
    expect(result.image.bundle.text).toBe(
      [
        '镜头规格：中景，5 秒。',
        '画面内容：阿青 站在 公园!',
        '角色：@阿青。',
        '场景：@公园。',
        '道具：@雨伞。',
        '光影氛围：暖光。',
        '运镜：缓慢 推近。',
        '对白与旁白：\n- 阿青：你好？\n- [旁白·阿青]：开始了。',
        '声音：风声。',
        '视觉风格：水彩 电影。',
      ].join('\n\n'),
    );
    expect(result.video.bundle.text).toBe(
      [
        '时序规格：5 秒。',
        '画面内容：阿青 站在 公园!',
        '角色：@阿青。',
        '场景：@公园。',
        '道具：@雨伞。',
        '运镜：缓慢 推近。',
        '对白与旁白：\n- 阿青：你好？\n- [旁白·阿青]：开始了。',
        '声音：风声。',
        '景别：中景。',
        '光影氛围：暖光。',
        '视觉风格：水彩 电影。',
      ].join('\n\n'),
    );
    expect(result.image.bundle.entityRefs).toEqual([
      { text: '阿青', assetId: 'alice' },
      { text: '公园', assetId: 'park' },
      { text: '雨伞', assetId: 'umbrella' },
    ]);
    expect(result.image.inputFingerprint).toBe(
      fingerprintScriptPromptInput(input, assets, '水彩 电影', 'image'),
    );
    expect(input.plotDescription).toBe('  阿青\n站在  公园! ');
  });

  it('dedupes structured ids, preserves character fallback and diagnoses unresolved scenes/props', () => {
    const result = readScriptPromptInput(
      row('s', {
        characters: [
          { characterAssetId: 'alice', characterName: '旧名' },
          { characterAssetId: 'alice', characterName: '重复' },
          { characterAssetId: 'missing', characterName: ' 本地  角色 ' },
          { characterAssetId: 'nameless' },
          { characterName: 'no id' },
        ],
        sceneAssetIds: ['park', 'absent', 'absent', ''],
        propAssetIds: ['lost'],
        durationSeconds: 0,
      }),
      assets,
    );
    expect(result.characters).toEqual([
      { assetId: 'alice', name: '阿青', role: 'character' },
      { assetId: 'missing', name: '本地 角色', role: 'character' },
    ]);
    expect(result.diagnostics).toEqual([
      { code: 'unresolved-asset', role: 'character', assetId: 'nameless' },
      { code: 'unresolved-asset', role: 'scene', assetId: 'absent' },
      { code: 'unresolved-asset', role: 'prop', assetId: 'lost' },
    ]);
    expect(result.durationSeconds).toBeUndefined();
  });

  it('structured dialogue suppresses legacy dialogue but missing structured voiceover falls back', () => {
    const input = row('s', {
      dialogue: 'legacy dialogue',
      voiceover: ' legacy\nvoiceover ',
      dialogueLines: [{ text: ' structured ', kind: 'dialogue', characterRef: 'unknown' }],
      cinematics: { shotSize: '远景', lighting: '冷光' },
      bgm: ' Music ',
      sfx: ' 鳥鳴 ',
    });
    const result = composeScriptPromptTracks(input, assets, undefined, ['image']);
    expect(result.image.bundle.text).toContain(
      '对白与旁白：\n- structured。\n- [旁白]：legacy voiceover。',
    );
    expect(result.image.bundle.text).not.toContain('legacy dialogue');
    expect(result.image.bundle.text).toContain('镜头规格：远景。');
    expect(result.image.bundle.text).toContain('声音：Music；鳥鳴。');
    const onlyBlankStructured = readScriptPromptInput(
      { ...input, dialogueLines: [{ text: '  ' }] },
      assets,
    );
    expect(onlyBlankStructured.dialogue).toEqual([]);
  });

  it('returns empty rather than erasing existing prompts, and emits length diagnostics without truncation', () => {
    const empty = composeScriptPromptTracks(row('s', { sceneAssetIds: ['missing'] }), assets);
    expect(empty.image).toEqual({
      status: 'empty',
      diagnostics: [{ code: 'unresolved-asset', role: 'scene', assetId: 'missing' }],
    });
    expect(empty.image).not.toHaveProperty('inputFingerprint');
    const text = '字'.repeat(5000);
    const long = composeScriptPromptTracks(row('s', { plotDescription: text }), assets).image;
    expect(long.bundle.text).toBe(`画面内容：${text}。`);
    expect(long.diagnostics).toEqual([{ code: 'prompt-too-long', length: 5006 }]);
  });

  it('resolves bare names, longest overlapping names and source suffix aliases only once per asset', () => {
    const groups = {
      characters: [
        { id: 'long', name: '张小明' },
        { id: 'short', name: '小明' },
        { id: 'alias', name: '蓝色雨伞' },
      ],
      scenes: [],
      props: [],
    };
    const result = composeScriptPromptTracks(
      row('s', { plotDescription: '张小明拿着色雨伞，张小明。' }),
      groups,
    ).image;
    expect(result.bundle.entityRefs).toEqual([
      { assetId: 'long', text: '张小明' },
      { assetId: 'alias', text: '色雨伞' },
    ]);
    const ambiguous = composeScriptPromptTracks(row('s', { plotDescription: '小明来了' }), {
      characters: [
        { id: 'a', name: '张小明' },
        { id: 'b', name: '王小明' },
      ],
    }).image;
    expect(ambiguous.bundle.entityRefs).toBeUndefined();
  });
});

describe('source fingerprints, bundles and text references', () => {
  it('uses stable object keys with source dual FNV namespaces, retaining undefined object fields', () => {
    expect(stableScriptPromptFingerprint('test', {})).toBe('test:5465b825c94aee81');
    expect(stableScriptPromptFingerprint('test', { a: 1, b: 2 })).toBe('test:5314055bd73fdb17');
    expect(fingerprintScriptPromptBundle({ text: '' })).toBe('prompt-bundle-v1:8018ce03c6e6221f');
    expect(stableScriptPromptFingerprint('test', { b: 2, a: 1 })).toBe(
      stableScriptPromptFingerprint('test', { a: 1, b: 2 }),
    );
    expect(stableScriptPromptFingerprint('test', { a: undefined })).not.toBe(
      stableScriptPromptFingerprint('test', {}),
    );
    expect(fingerprintScriptPromptBundle({ text: 'x', entityRefs: undefined })).toBe(
      fingerprintScriptPromptBundle({ text: 'x', entityRefs: [] }),
    );
    const refs = [
      { text: 'two', assetId: 'b' },
      { text: 'one', assetId: 'a' },
    ];
    expect(fingerprintScriptPromptBundle({ text: 'x', entityRefs: refs })).toBe(
      fingerprintScriptPromptBundle({ text: 'x', entityRefs: [...refs].reverse() }),
    );
    expect(refs[0].assetId).toBe('b');
  });

  it('input hashes depend on normalized semantic input and names, not prompt bundles or thumbnails', () => {
    const initial = row('s', {
      plotDescription: ' Hi  there ',
      characters: [{ characterAssetId: 'alice' }],
    });
    const changed = {
      ...initial,
      plotDescription: 'Hi\nthere',
      imageGenerationPrompt: 'manual',
      imagePromptState: 'stale',
    };
    const decorated = {
      ...assets,
      characters: [{ ...assets.characters[0], thumbnailUrl: 'other', linkedNodeId: 'node' }],
    };
    expect(fingerprintScriptPromptInput(initial, assets, '', 'image')).toBe(
      fingerprintScriptPromptInput(changed, decorated, '', 'image'),
    );
    expect(fingerprintScriptPromptInput(initial, assets, '', 'image')).not.toBe(
      fingerprintScriptPromptInput(initial, assets, '', 'video'),
    );
    expect(
      fingerprintScriptPromptInput(row('s', { sceneAssetIds: ['missing1'] }), assets, '', 'image'),
    ).toBe(
      fingerprintScriptPromptInput(row('s', { sceneAssetIds: ['missing2'] }), assets, '', 'image'),
    );
  });

  it('snapshot syncs only the requested track and manual edits preserve all state/hash fields', () => {
    const original = row('s', {
      imagePromptState: 'stale',
      videoPromptState: 'generating',
      textHash: 'keep',
      custom: true,
    });
    const bundle = { text: '@阿青', entityRefs: [{ text: '阿青', assetId: 'alice' }] };
    const composed = applyScriptComposedSnapshot(original, 'image', bundle);
    expect(getScriptPromptState(composed, 'image')).toBe('synced');
    expect(composed.videoPromptState).toBe('generating');
    expect(composed.textHash).toBe('keep');
    expect(getScriptPromptBundle(composed, 'image')).toEqual(bundle);
    const edited = applyScriptPromptEdit(composed, 'image', { text: 'manual', entityRefs: [] });
    expect(edited.imagePromptState).toBe('synced');
    expect(edited.finalImagePromptEntityRefs).toBeUndefined();
    expect(bundle.entityRefs).not.toBe(composed.finalImagePromptEntityRefs);
  });

  it('keeps old refs by substring, adds explicit mentions and excludes bare new names/emails/ASCII prefixes', () => {
    const oldRefs = [
      { text: '阿青', assetId: 'old' },
      { text: 'gone', assetId: 'gone' },
    ];
    expect(
      reconcileScriptPromptRefsForTextEdit({ oldText: 'same', newText: 'same', oldRefs, assets }),
    ).toBe(oldRefs);
    const result = reconcileScriptPromptRefsForTextEdit({
      oldText: '阿青 gone',
      newText: '阿青，@公园，@公园，雨伞',
      oldRefs,
      assets,
    });
    expect(result).toEqual([
      { text: '阿青', assetId: 'old' },
      { text: '公园', assetId: 'park' },
    ]);
    const english = { characters: [{ id: 'a', name: 'Alice' }] };
    expect(
      reconcileScriptPromptRefsForTextEdit({
        oldText: '',
        newText: 'email@Alice.com @Alice2 @Alice',
        assets: english,
      }),
    ).toEqual([{ text: 'Alice', assetId: 'a' }]);
  });

  it('exposes source maps and mention/reference ranges without collapsing asset name whitespace', () => {
    const groups = {
      characters: [
        { id: 'a', name: '  Alice  ' },
        { id: 'same-name-old', name: 'Room' },
      ],
      scenes: [{ id: 'same-name-new', name: 'Room' }],
      props: [{ id: 'space', name: '两  字' }],
    };
    expect(buildScriptAssetNameMap(groups).get('Room')).toBe('same-name-new');
    expect(buildScriptAssetNameMap(groups).has('两  字')).toBe(true);
    expect(buildScriptAssetIdToNameMap(groups).get('same-name-old')).toBe('Room');
    expect(buildScriptAssetIdToNameMap(groups).get('a')).toBe('  Alice  ');
    const spaced = composeScriptPromptTracks(
      row('s', {
        characters: [{ characterAssetId: 'space' }],
      }),
      { characters: groups.props },
    ).image;
    expect(spaced.bundle.text).toBe('角色：@两 字。');
    expect(spaced.bundle.entityRefs).toBeUndefined();
    expect(parseScriptAssetMentions('@Alice @Alice2 邮箱x@Alice @Room', groups)).toEqual([
      { type: 'mention', value: '@Alice', assetId: 'a' },
      { type: 'text', value: ' ' },
      { type: 'text', value: '@Alice2 邮箱x' },
      { type: 'text', value: '@Alice ' },
      { type: 'mention', value: '@Room', assetId: 'same-name-new' },
    ]);
    const long = { text: '阿青', assetId: 'a' };
    const short = { text: '青', assetId: 'b' };
    expect(
      findScriptPromptRefMatches('＠阿青 / 阿青 / Alice2 Alice', [
        short,
        long,
        { text: 'Alice', assetId: 'c' },
      ]),
    ).toEqual([
      { ref: long, start: 0, end: 3, sourceText: '＠阿青' },
      { ref: long, start: 6, end: 8, sourceText: '阿青' },
      { ref: { text: 'Alice', assetId: 'c' }, start: 18, end: 23, sourceText: 'Alice' },
    ]);
  });
});

describe('selection, guarded replacement and undo projections', () => {
  it('selects by row.id with source default missing-prompt selection and current-id intersection', () => {
    const rows = [
      row('a'),
      row('b', { imageGenerationPrompt: 'yes', videoMotionPrompt: ' \n' }),
      row('c', { imageGenerationPrompt: 'yes', videoMotionPrompt: 'yes' }),
    ];
    expect([...initialScriptPromptSelection(rows)]).toEqual(['a', 'b']);
    expect([...initialScriptPromptSelection(rows, ['hidden-a', 'c', 'c', 'missing'])]).toEqual([
      'c',
    ]);
    expect([...initialScriptPromptSelection(rows, [])]).toEqual([]);
  });

  it('captures nonempty overwrite counts independent of state and ignores absent selected ids', () => {
    const rows = [
      row('a', { imageGenerationPrompt: 'existing', imagePromptState: 'none' }),
      row('b', {
        imageGenerationPrompt: '   ',
        videoMotionPrompt: 'existing',
        videoPromptState: 'generating',
      }),
    ];
    const request = captureScriptPromptCompose({
      rows,
      rowIds: ['b', 'hidden-a', 'a', 'missing', 'a'],
      tracks: ['image', 'video'],
    });
    expect(request.rowIds).toEqual(['a', 'b']);
    expect(request.overwrite).toEqual({ shotCount: 2, trackCount: 2 });
    expect(request.bundleFingerprints.a.image).toBe(
      fingerprintScriptPromptBundle(getScriptPromptBundle(rows[0], 'image')),
    );
  });

  it('composes latest input but fails the whole row on any selected prompt bundle change', () => {
    const before = [
      row('a', { plotDescription: 'old' }),
      row('b', { plotDescription: 'old' }),
      row('deleted', { plotDescription: 'old' }),
    ];
    const request = captureScriptPromptCompose({
      rows: before,
      rowIds: before.map((row) => row.id),
      tracks: ['image', 'video'],
    });
    const latest = [
      { ...before[0], plotDescription: 'new', custom: 'latest' },
      { ...before[1], videoMotionPrompt: 'external' },
      row('unselected', { custom: true }),
    ];
    const plan = planScriptPromptCompose({ rows: latest, assets, visualStyle: '新风格', request });
    expect(plan).toMatchObject({
      status: 'applied',
      successful: 1,
      skipped: 0,
      failed: 2,
      undoEntries: [],
    });
    expect(plan.rows[0].imageGenerationPrompt).toBe('画面内容：new。\n\n视觉风格：新风格。');
    expect(plan.rows[0].custom).toBe('latest');
    expect(plan.rows[1]).toBe(latest[1]);
    expect(plan.rows[2]).toBe(latest[2]);
    expect(latest[0].imageGenerationPrompt).toBe('');
  });

  it('skips empty input without clearing existing contents or changing row identities', () => {
    const rows = [row('a', { imageGenerationPrompt: 'keep', imagePromptState: 'stale' })];
    const request = captureScriptPromptCompose({ rows, rowIds: ['a'], tracks: ['image'] });
    const plan = planScriptPromptCompose({ rows, assets, request });
    expect(plan).toMatchObject({
      status: 'empty',
      successful: 0,
      skipped: 1,
      failed: 0,
      undoEntries: [],
    });
    expect(plan.rows).toBe(rows);
  });

  it('counts an invalid source input as a failed row and still composes independent rows', () => {
    const rows = [
      row('invalid', { plotDescription: 42 }),
      row('valid', { plotDescription: 'usable' }),
    ];
    const request = captureScriptPromptCompose({
      rows,
      rowIds: ['invalid', 'valid'],
      tracks: ['image'],
    });
    const plan = planScriptPromptCompose({ rows, assets, request });
    expect(plan).toMatchObject({ status: 'applied', successful: 1, failed: 1, skipped: 0 });
    expect(plan.rows[0]).toBe(rows[0]);
    expect(plan.rows[1].imageGenerationPrompt).toBe('画面内容：usable。');
  });

  it('undo restores only overwritten nonempty tracks, preserving new tracks and unrelated latest edits', () => {
    const rows = [
      row('a', {
        plotDescription: 'plot',
        imageGenerationPrompt: 'manual',
        imagePromptState: 'stale',
        finalImagePromptEntityRefs: [{ text: 'manual', assetId: 'm' }],
      }),
      row('b', { custom: true }),
    ];
    const request = captureScriptPromptCompose({ rows, rowIds: ['a'], tracks: ['image', 'video'] });
    const plan = planScriptPromptCompose({ rows, assets, request });
    expect(plan.undoEntries).toHaveLength(1);
    expect(plan.undoEntries[0]).toMatchObject({ rowId: 'a', track: 'image', beforeState: 'stale' });
    const cache = createScriptPromptUndo(plan.undoEntries, 100);
    expect(cache.expiresAt).toBe(100 + SCRIPT_PROMPT_UNDO_MS);
    const latest = [{ ...plan.rows[0], plotDescription: 'external plot' }, plan.rows[1]];
    const undo = planScriptPromptUndo({ rows: latest, undo: cache, now: 19999 });
    expect(undo.status).toBe('applied');
    expect(getScriptPromptBundle(undo.rows[0], 'image')).toEqual(
      getScriptPromptBundle(rows[0], 'image'),
    );
    expect(undo.rows[0].imagePromptState).toBe('stale');
    expect(undo.rows[0].videoMotionPrompt).toBe(plan.rows[0].videoMotionPrompt);
    expect(undo.rows[0].plotDescription).toBe('external plot');
    expect(undo.rows[1]).toBe(latest[1]);
    expect(createScriptPromptUndo([], 100)).toBeUndefined();
  });

  it('undo is all-or-nothing on any deleted/changed bundle, and expires exactly at 20 seconds', () => {
    const rows = ['a', 'b'].map((id) =>
      row(id, { plotDescription: 'plot', imageGenerationPrompt: `old ${id}` }),
    );
    const request = captureScriptPromptCompose({ rows, rowIds: ['a', 'b'], tracks: ['image'] });
    const plan = planScriptPromptCompose({ rows, assets, request });
    const cache = createScriptPromptUndo(plan.undoEntries, 0);
    const changed = [
      plan.rows[0],
      { ...plan.rows[1], finalImagePromptEntityRefs: [{ text: 'new', assetId: 'new' }] },
    ];
    expect(planScriptPromptUndo({ rows: changed, undo: cache, now: 1 })).toEqual({
      status: 'conflict',
      rows: changed,
    });
    const deleted = [plan.rows[0]];
    expect(planScriptPromptUndo({ rows: deleted, undo: cache, now: 1 })).toEqual({
      status: 'conflict',
      rows: deleted,
    });
    expect(planScriptPromptUndo({ rows: plan.rows, undo: cache, now: 20000 })).toEqual({
      status: 'missing',
      rows: plan.rows,
    });
    expect(planScriptPromptUndo({ rows: plan.rows, undo: cache, now: 19999 }).status).toBe(
      'applied',
    );
  });
});
