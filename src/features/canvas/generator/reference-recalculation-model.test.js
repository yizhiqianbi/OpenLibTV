// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { recalculateCanvasIncomingTarget } from './reference-recalculation-model.js';
import { usesMixedGeneratorReferences } from './reference-reconciliation-model.js';

// Literal expectations are independently derived from source ig/il/464913;
// the removed source's old arrays remain on target while edges are post-delete.
const node = (id, type, data = {}, extra = {}) => ({ id, type, data: { type, ...data }, ...extra });
const ref = (nodeId) => ({ nodeId, url: `/${nodeId}` });
const edge = (source, data, target = 'target') => ({ id: `e-${source}`, source, target, data });
const owner = (params = {}, data = {}, type = 'video') => node('target', type, { params, ...data });
const media = (id, type = 'image', data = {}) => node(id, type, { url: [`/${id}`], ...data });
const run = (target, sources = [], edges = sources.map((source) => edge(source.id)), extra = {}) =>
  recalculateCanvasIncomingTarget({ target, nodes: [...sources, target], edges, ...extra });
const style = (id, data = {}) =>
  node(id, 'material-style', {
    styleVersionUuid: id,
    styleName: `Style ${id}`,
    coverUrl: `/${id}.png`,
    ...data,
  });
const lens = (id, versionId, data = {}) =>
  node(id, 'material-lens', {
    lensVersionUuid: id,
    lensVersionId: versionId,
    lensName: `Lens ${id}`,
    coverUrl: `/${id}.png`,
    ...data,
  });
const expectedStyle = (id, extra = {}) => ({
  uuid: id,
  name: `Style ${id}`,
  imageUrl: `/${id}.png`,
  baseType: undefined,
  modelType: undefined,
  versionUuid: id,
  modelUuid: undefined,
  versionId: undefined,
  templateInfo: undefined,
  weight: 0.8,
  srefCode: undefined,
  _fromStyleNode: true,
  ...extra,
});
const expectedLens = (id, versionId, extra = {}) => ({
  uuid: id,
  versionId,
  name: `Lens ${id}`,
  imageUrl: `/${id}.png`,
  sourceNodeId: id,
  _fromLensNode: true,
  ...extra,
});

describe('ordinary postgraph source ig recalculation', () => {
  it('uses the original raw mapping and latest prompt, updating only four lists and prompt', () => {
    const settings = { duration: 5 };
    const magicList = { unused: { suggestions: ['not pruned by store ig itself'] } };
    const params = {
      prompt: '{{Image 1}} {{Image 2}} {{Portrait 2}} {{Text 1}} {{Element 1}} {{magic:unused:0}}',
      modeType: 'image2video',
      model: 'model',
      imageList: [ref('a'), ref('b')],
      videoList: [],
      audioList: [],
      imageListOrder: ['b', 'a'],
      mixedListOrder: ['a', 'b'],
      mixedList: ['retained raw field'],
      settings,
      advancedSettings: { precision: 2.5 },
      magicList,
    };
    const target = owner(params, { name: 'original target' });
    const a = media('a'),
      b = media('b');
    const next = run(target, [a, b], [edge('b')]);
    expect(next.data.params).toEqual({
      ...params,
      prompt: '{{Image 1}} {{Portrait 1}} {{Text 1}} {{Element 1}} {{magic:unused:0}}',
      textList: [],
      imageList: [{ nodeId: 'b', url: '/b', label: undefined }],
      videoList: [],
      audioList: [],
    });
    expect(next.data.params.settings).toBe(settings);
    expect(next.data.params.magicList).toBe(magicList);
    expect(next.data.params.imageListOrder).toBe(params.imageListOrder);
    expect(next.data.params.mixedList).toBe(params.mixedList);
    expect(target.data.params).toBe(params);
    expect(target.data.params.prompt).toContain('{{Image 2}}');
    expect([a, b].map((value) => value.data.url)).toEqual([['/a'], ['/b']]);
  });

  it('does not apply old typed order before looking up old indices', () => {
    const target = owner({
      prompt: '{{Image 1}} {{Image 2}}',
      imageList: [ref('a'), ref('b')],
      imageListOrder: ['b', 'a'],
    });
    expect(run(target, [media('a')]).data.params.prompt).toBe('{{Image 1}}');
    expect(target.data.params.imageListOrder).toEqual(['b', 'a']);
  });

  it('uses old Mixed mode for typed-to-Mixed conversion and retains existing Mixed bindings', () => {
    const target = owner({
      model: 'ordinary',
      modeType: 'mixed2video',
      prompt: '{{Image 2}} {{Video 1}} {{Mixed 3}}',
      imageList: [ref('a'), ref('b')],
      videoList: [ref('v')],
      audioList: [],
      mixedListOrder: ['v', 'a', 'b'],
    });
    const next = run(target, [media('b'), media('v', 'video')], [edge('b'), edge('v')]);
    expect(next.data.params.prompt).toBe('{{Mixed 2}} {{Mixed 1}} {{Mixed 2}}');
    expect(next.data.params.modeType).toBe('mixed2video');
  });

  it('never guesses old indices from a postgraph list, but permits an explicit pregraph local fallback', () => {
    const absent = owner({ prompt: '{{Image 2}}' });
    const sources = [media('b')];
    expect(run(absent, sources).data.params.prompt).toBe('');
    expect(
      run(absent, sources, [edge('b')], { fallbackReferences: { imageList: [ref('a'), ref('b')] } })
        .data.params.prompt,
    ).toBe('{{Image 1}}');
    const empty = owner({ prompt: '{{Image 2}}', imageList: [] });
    expect(
      run(empty, sources, [edge('b')], { fallbackReferences: { imageList: [ref('a'), ref('b')] } })
        .data.params.prompt,
    ).toBe('');
  });

  it('keeps retained asset:// references independently of graph edges and uses normalized new URLs', () => {
    const asset = { nodeId: 'asset://saved', url: ['/saved', '/ignored'] };
    const target = owner({
      prompt: '{{Image 1}} {{Image 2}}',
      imageList: [ref('gone'), asset],
      imageListOrder: ['asset://saved', 'gone'],
    });
    expect(run(target).data.params).toEqual({
      ...target.data.params,
      prompt: '{{Image 1}}',
      textList: [],
      imageList: [{ nodeId: 'asset://saved', url: '/saved' }],
      videoList: [],
      audioList: [],
    });
  });

  it('counts postgraph duplicate direct references and maps to the last current ID position', () => {
    const target = owner({ prompt: '{{Image 1}}', imageList: [ref('a')] });
    const edges = [
      { ...edge('a'), id: 'first' },
      { ...edge('a'), id: 'second' },
    ];
    const next = run(target, [media('a')], edges);
    expect(next.data.params.imageList).toHaveLength(2);
    expect(next.data.params.prompt).toBe('{{Image 2}}');
  });

  it('leaves a target without params alone, including IMAGE style sources; SCRIPT has its own earlier branch', () => {
    const target = node('target', 'image', { name: 'no params' });
    expect(run(target, [style('s')])).toBe(target);
    expect(recalculateCanvasIncomingTarget({ target: null })).toBeNull();
    const empty = { id: 'target', type: 'image' };
    expect(recalculateCanvasIncomingTarget({ target: empty })).toBe(empty);
  });
});

describe('pictureEditLock last-video reset', () => {
  it('replaces the entire params object while retaining data and new text/image/audio lists', () => {
    const target = owner(
      {
        pictureEditLock: true,
        model: 'kling-v3-omni',
        modeType: 'videoEdit2video',
        prompt: 'old',
        count: 4,
        settings: { duration: 8 },
        advancedSettings: { old: true },
        magicList: { old: true },
        imageListOrder: ['i'],
        videoList: [ref('removed')],
        segmentRemakeLock: false,
      },
      { name: 'locked output', extraConfig: { keep: true } },
    );
    const next = run(target, [
      media('i'),
      media('a', 'audio'),
      node('t', 'text', { content: ['one', 2, 'two'] }),
    ]);
    expect(next.data).toEqual({
      ...target.data,
      params: {
        prompt: '',
        model: 'kling-v3-omni',
        modeType: '',
        count: 1,
        settings: {},
        textList: [{ nodeId: 't', content: ['one', 'two'] }],
        imageList: [{ nodeId: 'i', url: '/i', label: undefined }],
        videoList: [],
        audioList: [{ nodeId: 'a', url: '/a', label: undefined }],
      },
    });
    expect(target.data.params.pictureEditLock).toBe(true);
  });

  it('uses an empty model fallback and the source truthy picture-lock predicate', () => {
    expect(run(owner({ pictureEditLock: 1, prompt: 'old' })).data.params).toEqual({
      prompt: '',
      model: '',
      modeType: '',
      count: 1,
      settings: {},
      textList: [],
      imageList: [],
      videoList: [],
      audioList: [],
    });
  });

  it('does not reset if a real or retained asset video remains, even with an empty URL on the graph resource', () => {
    const graphTarget = owner({
      pictureEditLock: true,
      prompt: 'keep',
      settings: { duration: 9 },
      videoList: [ref('v')],
    });
    expect(run(graphTarget, [media('v', 'video', { url: [] })]).data.params).toMatchObject({
      pictureEditLock: true,
      prompt: 'keep',
      settings: { duration: 9 },
    });
    const assetTarget = owner({
      pictureEditLock: true,
      prompt: 'keep',
      videoList: [{ nodeId: 'asset://video', url: '/v' }],
    });
    expect(run(assetTarget).data.params).toMatchObject({
      pictureEditLock: true,
      prompt: 'keep',
      videoList: [{ nodeId: 'asset://video', url: '/v' }],
    });
  });

  it('runs lens effects after reset, injecting current source versions and extraConfig.effectId', () => {
    const target = owner(
      {
        pictureEditLock: true,
        model: 'm',
        effects: [99],
        lensModels: [{ uuid: 'old', versionId: 99 }],
      },
      { extraConfig: { effectId: '5' } },
    );
    const next = run(target, [lens('new', 7)]);
    expect(next.data.params).toEqual({
      prompt: '',
      model: 'm',
      modeType: '',
      count: 1,
      settings: {},
      textList: [],
      imageList: [],
      videoList: [],
      audioList: [],
      effects: [5, 7],
      lensModels: [expectedLens('new', 7)],
    });
  });
});

describe('submitted segment-remake source loss', () => {
  const submitted = (extra = {}) =>
    owner({
      model: 'm',
      modeType: 'image2video',
      prompt: '  x {{SegmentRange:one}} {{SegmentRange:two}} {{SegmentRange:bad id}} y  ',
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'submitted', sourceNodeId: 'v', ranges: ['saved'] },
      settings: { duration: 8 },
      imageListOrder: ['a'],
      ...extra,
    });

  it('removes lock/draft and real range tokens without running a second whitespace cleanup', () => {
    const target = submitted();
    expect(run(target).data.params).toEqual({
      model: 'm',
      modeType: 'image2video',
      prompt: '  x   {{SegmentRange:bad id}} y  ',
      settings: { duration: 8 },
      imageListOrder: ['a'],
      textList: [],
      imageList: [],
      videoList: [],
      audioList: [],
    });
    expect(target.data.params.segmentRemakeLock).toBe(true);
  });

  it('submitted loss takes priority over picture reset and preserves the other old params', () => {
    const next = run(
      submitted({ pictureEditLock: true, count: 4, advancedSettings: { retained: true } }),
    );
    expect(next.data.params).toMatchObject({
      pictureEditLock: true,
      count: 4,
      settings: { duration: 8 },
      advancedSettings: { retained: true },
    });
    expect(next.data.params).not.toHaveProperty('segmentRemakeDraft');
    expect(next.data.params).not.toHaveProperty('segmentRemakeLock');
  });

  it.each([{ portraitVirtual: true }, { assetVirtual: true }])(
    'virtual source edges do not keep a submitted continuation locked (%j)',
    (data) => {
      const next = run(submitted(), [media('v', 'video')], [edge('v', data)]);
      expect(next.data.params).not.toHaveProperty('segmentRemakeLock');
    },
  );

  it('a REFERENCE source edge does not count, while a remaining ordinary duplicate source edge keeps the lock', () => {
    expect(run(submitted(), [node('v', 'reference')]).data.params).not.toHaveProperty(
      'segmentRemakeLock',
    );
    const next = run(
      submitted(),
      [media('v', 'video')],
      [{ ...edge('v'), id: 'remaining-second' }],
    );
    expect(next.data.params.segmentRemakeLock).toBe(true);
    expect(next.data.params.segmentRemakeDraft.sourceNodeId).toBe('v');
    expect(next.data.params.prompt).toContain('{{SegmentRange:one}}');
  });

  it('source presence is a filtered direct edge test, not the expanded group leaf media list', () => {
    const group = node('g', 'group');
    const video = { ...media('v', 'video'), parentId: 'g' };
    const next = run(submitted(), [group, video], [edge('g')]);
    expect(next.data.params.videoList.map((value) => value.nodeId)).toEqual(['v']);
    expect(next.data.params).not.toHaveProperty('segmentRemakeLock');
  });

  it('a dangling ordinary direct edge still satisfies the source predicate; outer graph deletion owns edge removal', () => {
    const next = run(submitted(), [], [edge('v')]);
    expect(next.data.params.segmentRemakeLock).toBe(true);
  });

  it('editing phase and non-boolean segment lock do not invoke submitted degradation or cascade here', () => {
    const editing = submitted({ segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'v' } });
    expect(run(editing).data.params.segmentRemakeDraft).toBe(
      editing.data.params.segmentRemakeDraft,
    );
    expect(run(editing).data.params.prompt).toContain('{{SegmentRange:one}}');
    const nonBoolean = submitted({ segmentRemakeLock: 1 });
    expect(run(nonBoolean).data.params.segmentRemakeLock).toBe(1);
  });
});

describe('panorama special targets bypass ordinary params, assets and token remapping', () => {
  it.each(['space-scene-720', 'director-console-3d'])(
    'sets the first raw incoming image URL for %s while preserving params by identity',
    (type) => {
      const params = {
        prompt: '{{Image 99}}',
        imageList: [{ nodeId: 'asset://old', url: '/old' }],
        settings: { keep: true },
      };
      const target = owner(params, { refImages: ['/local'], panoramaUrl: '/previous' }, type);
      const virtual = media('virtual');
      const a = media('a', 'image', { url: ['/display'], originalUrl: ['  /original  '] });
      const b = media('b');
      const next = run(
        target,
        [virtual, a, b],
        [edge('virtual', { portraitVirtual: true }), edge('a'), edge('b')],
      );
      expect(next.data.panoramaUrl).toBe('/original');
      expect(next.data.params).toBe(params);
      expect(target.data.panoramaUrl).toBe('/previous');
    },
  );

  it('does not skip an empty first image in favor of later images, characterRef or retained assets', () => {
    const target = owner(
      { imageList: [{ nodeId: 'asset://asset', url: '/asset' }] },
      {},
      'space-scene-720',
    );
    const next = run(
      target,
      [media('empty', 'image', { url: [] }), media('later')],
      [edge('empty', { characterRef: { mainReferenceImageUrl: '/character' } }), edge('later')],
    );
    expect(next.data).toHaveProperty('panoramaUrl', undefined);
  });

  it('honors group leaf order, exclusions and protected display URL rather than applying typed order', () => {
    const target = owner(
      { imageListOrder: ['b', 'a'] },
      { groupRefExcludedNodeIds: ['excluded'] },
      'director-console-3d',
    );
    const group = node('g', 'group');
    const excluded = { ...media('excluded'), parentId: 'g' };
    const a = {
      ...media('a', 'image', {
        protectionType: 'watermark',
        url: [' /shown '],
        originalUrl: ['/hidden'],
      }),
      parentId: 'g',
    };
    const b = { ...media('b'), parentId: 'g' };
    expect(run(target, [group, excluded, a, b], [edge('g')]).data.panoramaUrl).toBe('/shown');
  });
});

describe('material-style il updates IMAGE params or SCRIPT imageGenConfig only', () => {
  it('places connected styles first in edge order, then unique manual entries, preserving complete source fields', () => {
    const manual = { uuid: 'manual', name: 'Manual', weight: 0.3, custom: true };
    const target = owner(
      {
        prompt: 'keep',
        fineTuneType: 'old',
        fineTuneModels: [
          manual,
          { uuid: 'b', name: 'manual duplicate' },
          { uuid: 'gone', _fromStyleNode: true },
        ],
      },
      {},
      'image',
    );
    const b = style('b', {
      fineTuneType: 'new',
      styleAssetUuid: 'asset-b',
      styleVersionId: 4,
      baseType: ['x', 'y'],
      modelType: 'lora',
      templateInfo: [{ name: 'strength', default: 2 }],
      weight: 0,
      srefCode: 'code',
    });
    const a = style('a');
    const next = run(
      target,
      [a, b],
      [edge('b'), edge('a'), { ...edge('b'), id: 'duplicate-edge' }],
    );
    expect(next.data.params.fineTuneModels).toEqual([
      expectedStyle('b', {
        modelUuid: 'asset-b',
        versionId: 4,
        baseType: ['x', 'y'],
        modelType: 'lora',
        templateInfo: [{ name: 'strength', default: 2 }],
        weight: 0,
        srefCode: 'code',
      }),
      expectedStyle('a'),
      manual,
    ]);
    expect(next.data.params.fineTuneModels[2]).toBe(manual);
    expect(next.data.params.fineTuneType).toBe('new');
    expect(next.data.params.prompt).toBe('keep');
  });

  it('falls back to styleAssetUuid/name and retains fineTuneType when every old style is removed', () => {
    const target = owner(
      {
        fineTuneType: 'keep-source-spread',
        fineTuneModels: [{ uuid: 'old', _fromStyleNode: true }],
      },
      {},
      'image',
    );
    const removed = run(target);
    expect(removed.data.params.fineTuneModels).toEqual([]);
    expect(removed.data.params.fineTuneType).toBe('keep-source-spread');
    const source = style('unused', {
      styleVersionUuid: '',
      styleAssetUuid: 'asset-only',
      styleName: '',
      name: 'Fallback',
    });
    expect(run(owner({}, {}, 'image'), [source]).data.params.fineTuneModels).toEqual([
      expectedStyle('asset-only', {
        name: 'Fallback',
        imageUrl: '/unused.png',
        versionUuid: undefined,
        modelUuid: 'asset-only',
      }),
    ]);
  });

  it('uses the first connected style fineTuneType even when that first style has no usable UUID', () => {
    const target = owner(
      { fineTuneType: 'old', fineTuneModels: [{ uuid: 'manual' }] },
      {},
      'image',
    );
    const invalid = style('invalid', { styleVersionUuid: '', fineTuneType: 'first-type' });
    expect(run(target, [invalid, style('valid')]).data.params).toMatchObject({
      fineTuneType: 'first-type',
      fineTuneModels: [expectedStyle('valid'), { uuid: 'manual' }],
    });
  });

  it('source signature equality retains old model objects and does not mark a completed IMAGE task stale for irrelevant metadata', () => {
    const old = { ...expectedStyle('same'), ignoredExtra: 'retained' };
    const target = owner(
      { fineTuneModels: [old] },
      { taskInfo: { taskId: 'done', loading: false }, staleVersion: 3 },
      'image',
    );
    const next = run(target, [style('same', { ignoredExtra: 'different' })]);
    expect(next.data.params.fineTuneModels).toBe(target.data.params.fineTuneModels);
    expect(next.data.params.fineTuneModels[0]).toBe(old);
    expect(next.data).not.toHaveProperty('isStale');
    expect(next.data.staleVersion).toBe(3);
  });

  it.each([
    [{ taskInfo: { taskId: 'done', loading: false }, staleVersion: 3 }, true, 4],
    [{ taskInfo: { taskId: 'done' } }, true, 1],
    [{ taskInfo: { taskId: 'running', loading: true }, staleVersion: 3 }, undefined, 3],
    [{ taskInfo: { taskId: 'done' }, isStale: true, staleVersion: 3 }, true, 3],
    [{ taskInfo: { taskId: '' }, staleVersion: 3 }, undefined, 3],
  ])(
    'changes IMAGE stale state only under the source task predicate (%#)',
    (data, stale, version) => {
      const next = run(
        owner({ fineTuneModels: [{ uuid: 'old', _fromStyleNode: true }] }, data, 'image'),
      );
      expect(next.data.isStale).toBe(stale);
      expect(next.data.staleVersion).toBe(version);
    },
  );

  it('SCRIPT writes only imageGenConfig and skips ordinary token/list remapping and task stale changes', () => {
    const params = { prompt: '{{Image 99}}', imageList: [ref('old')] };
    const target = owner(
      params,
      {
        imageGenConfig: { prompt: 'image prompt', fineTuneModels: [], settings: { size: 2 } },
        taskInfo: { taskId: 'done' },
        staleVersion: 7,
      },
      'script',
    );
    const next = run(target, [style('s')]);
    expect(next.data.params).toBe(params);
    expect(next.data.imageGenConfig).toEqual({
      prompt: 'image prompt',
      settings: { size: 2 },
      fineTuneModels: [expectedStyle('s')],
    });
    expect(next.data).not.toHaveProperty('isStale');
    expect(next.data.staleVersion).toBe(7);
    const withoutConfig = node('target', 'script');
    expect(run(withoutConfig, [style('s')]).data.imageGenConfig).toEqual({
      fineTuneModels: [expectedStyle('s')],
    });
  });

  it('style edges are direct only, but source il includes virtual edges and does not apply the ordinary media filter', () => {
    const virtual = style('virtual');
    const target = owner({}, {}, 'image');
    expect(
      run(target, [virtual], [edge('virtual', { assetVirtual: true })]).data.params.fineTuneModels,
    ).toEqual([expectedStyle('virtual')]);
    const g = node('g', 'group');
    const nested = { ...style('child'), parentId: 'g' };
    expect(run(target, [g, nested], [edge('g')]).data.params).not.toHaveProperty('fineTuneModels');
  });
});

describe('material-lens 464913 effects and model ownership', () => {
  it('removes old lens-owned effect IDs, preserves other positive numeric effects, injects config first and then unique connected versions', () => {
    const target = owner(
      {
        prompt: 'keep',
        effects: [2, 9, 2, -1, '3', 0],
        lensModels: [{ uuid: 'old', versionId: 9 }],
      },
      { extraConfig: { effectId: '6' } },
    );
    const sources = [lens('a', 10), lens('b', 10), lens('c', 11)];
    const next = run(target, sources);
    expect(next.data.params.effects).toEqual([6, 2, 2, 10, 11]);
    expect(next.data.params.lensModels).toEqual([
      expectedLens('a', 10),
      expectedLens('b', 10),
      expectedLens('c', 11),
    ]);
    expect(next.data.params.prompt).toBe('keep');
  });

  it('removes obsolete effects/lensModels fields rather than retaining empty arrays, but keeps unrelated settings', () => {
    const target = owner({
      effects: [7],
      lensModels: [{ uuid: 'old', versionId: 7 }],
      settings: { keep: true },
    });
    const next = run(target);
    expect(next.data.params).not.toHaveProperty('effects');
    expect(next.data.params).not.toHaveProperty('lensModels');
    expect(next.data.params.settings).toBe(target.data.params.settings);
  });

  it('does not update same-UUID model metadata when both source equality guards pass', () => {
    const old = expectedLens('same', 4, { name: 'Original name' });
    const target = owner({ effects: [4], lensModels: [old] });
    const next = run(target, [lens('same', 4, { lensName: 'New name', coverUrl: '/new' })]);
    expect(next.data.params.lensModels).toBe(target.data.params.lensModels);
    expect(next.data.params.lensModels[0]).toBe(old);
  });

  it('takes the first duplicate lens UUID while preserving distinct numeric version IDs, even zero or negative ones', () => {
    const a = lens('a', 0, { lensVersionUuid: 'same' });
    const b = lens('b', -2, { lensVersionUuid: 'same' });
    const next = run(owner({}), [a, b]);
    expect(next.data.params.effects).toEqual([0, -2]);
    expect(next.data.params.lensModels).toEqual([expectedLens('a', 0, { uuid: 'same' })]);
  });

  it('does not infer a numeric effect from a string version ID, but still retains a UUID model with undefined version', () => {
    const next = run(owner({}), [lens('string', '5')]);
    expect(next.data.params).not.toHaveProperty('effects');
    expect(next.data.params.lensModels).toEqual([expectedLens('string', undefined)]);
  });

  it('includes direct virtual lens edges, excludes nested group lenses, and skips non-VIDEO targets', () => {
    const source = lens('direct', 5);
    expect(
      run(owner({}), [source], [edge('direct', { portraitVirtual: true })]).data.params.effects,
    ).toEqual([5]);
    const g = node('g', 'group');
    const child = { ...lens('child', 6), parentId: 'g' };
    expect(run(owner({}), [g, child], [edge('g')]).data.params).not.toHaveProperty('effects');
    const image = owner(
      { effects: [3], lensModels: [{ uuid: 'manual', versionId: 3 }] },
      {},
      'image',
    );
    expect(run(image, [source]).data.params.effects).toBe(image.data.params.effects);
    expect(run(image, [source]).data.params.lensModels).toBe(image.data.params.lensModels);
  });
});

describe('shared source Mixed predicate includes model objects', () => {
  it.each([
    ['star-video2.5', true],
    ['star-video2.5-draft', true],
    ['other', false],
    [{ modelKey: 'star-video2.5' }, true],
    [{ modelKey: 'star-video2.5-draft' }, true],
    [{ modelVendor: 'star-video2.5' }, true],
    [{ modelVendor: 'other' }, false],
    [null, false],
  ])('videoEdit old model %j uses Mixed = %j', (model, mixed) => {
    expect(usesMixedGeneratorReferences('videoEdit2video', model)).toBe(mixed);
    expect(usesMixedGeneratorReferences('image2video', model)).toBe(false);
  });
});
