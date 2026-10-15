import { describe, expect, it, vi } from 'vitest';
import {
  createScriptV2ManualPatch,
  projectScriptCompactProgress,
  projectScriptTaskBadge,
  projectScriptTaskFailure,
  projectScriptV2Card,
} from './script-card-model.js';
import { initializeStoryboardPromptState } from './prompt-state.js';
import { scriptWorkflowState } from './workflow-model.js';

const row = (patch = {}) => ({
  id: 'shot',
  hiddenUuid: 'shot-hidden',
  plotDescription: '画面',
  imageGenerationPrompt: '静帧',
  videoMotionPrompt: '移动',
  ...patch,
});
const node = (patch = {}) => ({
  id: 'script',
  type: 'script-v2',
  data: {
    type: 'script-v2',
    name: '脚本名称',
    rows: [row()],
    assets: { characters: [], scenes: [{ id: 'scene', thumbnailUrl: '/scene.png' }], props: [] },
    ...patch,
  },
});
const card = (data, context = {}) => projectScriptV2Card({ node: node(data), ...context });
function workflow(statuses, patches = {}) {
  return Object.fromEntries(
    ['shots', 'assets', 'prompts'].map((id, index) => [
      id,
      { id, status: statuses[index], isBusy: false, ...patches[id] },
    ]),
  );
}

describe('276204 source task badge projection', () => {
  it.each([
    [0, '生成中...'],
    [1, '生成中...'],
    ['0', '准备中...'],
    ['1', '准备中...'],
    [2, '准备中...'],
    [3, '准备中...'],
    [4, '准备中...'],
    [undefined, '准备中...'],
  ])('uses strict raw numeric status in the badge label: %j', (status, label) => {
    expect(projectScriptTaskBadge({ status })).toMatchObject({ valid: true, status, label });
  });

  it.each([
    [1, '1秒'],
    [1.5, '1.5秒'],
    [120, '120秒'],
    [120.1, '3分钟'],
    [180, '3分钟'],
    [181, '4分钟'],
    ['121', '0秒'],
    [Infinity, 'Infinity分钟'],
  ])('preserves queue wait-time threshold and typed formatting: %j', (remainSeconds, waitTime) => {
    const result = projectScriptTaskBadge({
      status: 0,
      delayInfo: { remainSeconds },
      progressPercent: 25,
    });
    expect(result).toMatchObject({ queueing: true, label: `排队中，预计等待${waitTime}` });
    expect(result.label).not.toContain('%');
  });

  it.each([0, -1, undefined, null, NaN])(
    'does not queue with a nonpositive or missing wait: %j',
    (remainSeconds) => {
      expect(projectScriptTaskBadge({ status: 0, delayInfo: { remainSeconds } })).toMatchObject({
        queueing: false,
        label: '生成中...',
      });
    },
  );

  it('never changes running or string-status labels to queued from delay metadata', () => {
    expect(projectScriptTaskBadge({ status: 1, delayInfo: { remainSeconds: 181 } })).toMatchObject({
      queueing: false,
      label: '生成中...',
    });
    expect(
      projectScriptTaskBadge({ status: '0', delayInfo: { remainSeconds: 181 } }),
    ).toMatchObject({ queueing: false, label: '准备中...' });
  });

  it.each([
    [0, '生成中...', 0],
    [-10, '生成中...', 0],
    [27.5, '生成中 27.5%...', 27.5],
    [120, '生成中 120%...', 100],
    ['12', '生成中 12%...', 0],
    [Infinity, '生成中 Infinity%...', 0],
    [NaN, '生成中...', 0],
  ])(
    'keeps raw positive percentage text distinct from finite fill: %j',
    (progressPercent, label, fillPercent) => {
      expect(projectScriptTaskBadge({ status: 1, progressPercent })).toMatchObject({
        label,
        progressPercent,
        fillPercent,
      });
    },
  );

  it('appends progress to preparing text with source punctuation', () => {
    expect(projectScriptTaskBadge({ status: '1', progressPercent: 10 }).label).toBe(
      '准备中 10%...',
    );
  });

  it('marks unresolved benefits without inventing member text or mutating task data', () => {
    const task = Object.freeze({
      status: 1,
      benefitTag: { futureBenefit: true },
      progressPercent: 8,
    });
    expect(projectScriptTaskBadge(task)).toMatchObject({
      label: '生成中 8%...',
      benefitUnsupported: true,
    });
    expect(projectScriptTaskBadge({ status: 1 }).benefitUnsupported).toBe(false);
  });

  it('provides normalized failure labels independently of strict badge statuses', () => {
    expect(projectScriptTaskBadge({ status: ' 4 ' })).toMatchObject({
      label: '准备中...',
      normalizedStatus: 4,
      failureLabel: '生成超时',
    });
    expect(projectScriptTaskBadge({ status: [4] }).failureLabel).toBe('生成失败');
  });

  it.each([undefined, null, [], 'task'])(
    'flags a malformed task without creating task state: %j',
    (task) => {
      expect(projectScriptTaskBadge(task)).toMatchObject({ valid: false, label: '准备中...' });
    },
  );
});

describe('959248 source full task failure projection', () => {
  it.each([
    [3, false, '生成失败'],
    ['3', false, '生成失败'],
    [4, true, '生成超时'],
    [' 4 ', true, '生成超时'],
  ])('uses typed status normalization for failure/timeout: %j', (status, timeout, label) => {
    expect(projectScriptTaskFailure({ loading: false, status })).toMatchObject({
      valid: true,
      normalizedStatus: timeout ? 4 : 3,
      timeout,
      label,
    });
  });

  it.each([
    { status: 3 },
    { loading: true, status: 3 },
    { loading: 0, status: 3 },
    { loading: false, status: 2 },
    { loading: false, status: [4] },
    null,
  ])('does not project nonfailed tasks as a valid failure: %j', (task) => {
    expect(projectScriptTaskFailure(task).valid).toBe(false);
  });

  it('keeps full failure ID and reason raw and truthy instead of applying recompute trim/fallback', () => {
    const task = Object.freeze({
      loading: false,
      status: 4,
      taskId: ' job ',
      failedReason: ' timeout ',
    });
    expect(projectScriptTaskFailure(task)).toMatchObject({
      taskId: ' job ',
      failedReason: ' timeout ',
    });
    expect(
      projectScriptTaskFailure({ loading: false, status: 3, taskId: '', failedReason: '' }),
    ).toMatchObject({
      taskId: undefined,
      failedReason: undefined,
    });
  });
});

describe('sg compact track projection', () => {
  it.each([
    [['idle', 'idle', 'idle'], 0, ['active', 'idle', 'idle']],
    [['ready', 'idle', 'idle'], 1, ['ready', 'active', 'idle']],
    [['ready', 'ready', 'idle'], 2, ['ready', 'ready', 'active']],
    [['ready', 'ready', 'ready'], 2, ['ready', 'ready', 'ready']],
    [['idle', 'partial', 'idle'], 0, ['active', 'active', 'idle']],
    [['partial', 'ready', 'partial'], 0, ['active', 'ready', 'active']],
  ])(
    'keeps source visual priority and first-incomplete selection: %j',
    (statuses, activeIndex, visuals) => {
      const result = projectScriptCompactProgress(workflow(statuses));
      expect(result.valid).toBe(true);
      expect(result.activeIndex).toBe(activeIndex);
      expect(result.stages.map((stage) => stage.visualState)).toEqual(visuals);
      expect(result.stages.map((stage) => stage.status)).toEqual(statuses);
      expect(result.stages.map((stage) => stage.label)).toEqual([
        '确认镜头',
        '准备资产',
        '合成提示词',
      ]);
      expect(result.stages.map((stage) => stage.number)).toEqual([1, 2, 3]);
    },
  );

  it('marks a later busy stage active without making it the current step or making completed stages active', () => {
    const result = projectScriptCompactProgress(
      workflow(['idle', 'ready', 'idle'], { assets: { isBusy: true }, prompts: { isBusy: true } }),
    );
    expect(result.activeIndex).toBe(0);
    expect(result.stages.map((stage) => stage.visualState)).toEqual(['active', 'ready', 'active']);
    expect(result).not.toHaveProperty('currentStep');
    for (const stage of result.stages) {
      expect(stage).not.toHaveProperty('onClick');
      expect(stage).not.toHaveProperty('enabled');
    }
  });

  it('computes the fixed 286px track connector positions and completion from the preceding stage alone', () => {
    const result = projectScriptCompactProgress(workflow(['ready', 'idle', 'ready']));
    expect(result.connectors).toHaveLength(2);
    expect(result.connectors[0]).toMatchObject({ id: 'shots', complete: true, width: 55 });
    expect(result.connectors[1]).toMatchObject({ id: 'assets', complete: false, width: 55 });
    expect(result.connectors[0].left).toBeCloseTo(286 / 3 - 27.5);
    expect(result.connectors[1].left).toBeCloseTo((2 * 286) / 3 - 27.5);
  });

  it('uses the supplied exact workflow even when stage counts appear inconsistent', () => {
    const supplied = workflow(['ready', 'partial', 'idle']);
    supplied.shots.total = 0;
    supplied.shots.ready = 0;
    const result = projectScriptCompactProgress(supplied);
    expect(result.stages[0].visualState).toBe('ready');
    expect(result.connectors[0].complete).toBe(true);
  });

  it.each([null, {}, { shots: {} }, { shots: {}, assets: [], prompts: {} }])(
    'rejects malformed stage descriptors safely: %j',
    (value) => {
      expect(projectScriptCompactProgress(value)).toEqual({
        valid: false,
        stages: [],
        connectors: [],
        activeIndex: -1,
      });
    },
  );
});

describe('sT source surface and task protocol', () => {
  it('uses raw rows for resource state regardless of incomplete workflow data', () => {
    const result = card({
      rows: [row({ plotDescription: '', imageGenerationPrompt: '', videoMotionPrompt: '' })],
    });
    expect(result).toMatchObject({
      valid: true,
      kind: 'resource',
      canOpen: true,
      showOpenButton: true,
    });
    expect(result.workflow.shots.status).toBe('idle');
    expect(result.workflow.prompts.status).toBe('idle');
  });

  it.each([
    [{ loading: true, status: 0 }, 'generating', true],
    [{ loading: true, status: 1 }, 'generating', true],
    [{ loading: true }, 'generating', true],
    [{ loading: true, status: null }, 'generating', true],
    [{ loading: true, status: 2 }, 'resource', false],
    [{ loading: true, status: '2' }, 'resource', false],
    [{ loading: true, status: 3 }, 'resource', false],
    [{ loading: true, status: 4 }, 'resource', false],
    [{ loading: false, status: 3 }, 'failed', false],
    [{ loading: false, status: ' 4 ' }, 'failed', false],
    [{ status: 3 }, 'resource', false],
    [{ loading: 1, status: 0 }, 'resource', false],
    [{ loading: 'true', status: 1 }, 'resource', false],
    [{ loading: false, status: 2 }, 'resource', false],
    [{ loading: true, status: [2] }, 'generating', true],
    [{ loading: false, status: [3] }, 'resource', false],
  ])('honors strict loading and typed terminal task status: %j', (taskInfo, kind, busy) => {
    expect(card({ taskInfo })).toMatchObject({ kind, fullGenerationBusy: busy });
  });

  it.each([
    { loading: true, status: 0 },
    { loading: false, status: 3 },
    { loading: false, status: 4 },
  ])('recompute never becomes the full-generation or full-failure surface: %j', (task) => {
    const taskInfo = { ...task, scriptV2TaskMode: 'recompute-batch-shots' };
    expect(card({ taskInfo })).toMatchObject({ kind: 'resource', fullGenerationBusy: false });
    expect(card({ taskInfo, rows: [] })).toMatchObject({ kind: 'empty_generate', canOpen: false });
  });

  it('full generation or failure takes priority over both rows and connections', () => {
    const edges = [{ source: 'script', target: 'other' }];
    expect(card({ taskInfo: { loading: true } }, { edges }).kind).toBe('generating');
    expect(card({ rows: [], taskInfo: { loading: false, status: 3 } }, { edges }).kind).toBe(
      'failed',
    );
  });

  it('empty source surfaces distinguish actual incoming/outgoing edges without marking pending as a task', () => {
    expect(card({ rows: [] })).toMatchObject({
      kind: 'empty_generate',
      canOpen: false,
      showOpenButton: false,
    });
    for (const edge of [
      { source: 'script', target: 'other' },
      { source: 'other', target: 'script' },
    ]) {
      expect(card({ rows: [] }, { edges: [edge] })).toMatchObject({
        kind: 'pending',
        canOpen: false,
        fullGenerationBusy: false,
      });
    }
    expect(card({ rows: [] }, { edges: [{ source: 'unrelated', target: 'other' }] }).kind).toBe(
      'empty_generate',
    );
  });

  it('resource has the only explicit open button; failed may open on double-click, and readonly opens neither', () => {
    expect(card({})).toMatchObject({ canOpen: true, showOpenButton: true });
    expect(card({ rows: [], taskInfo: { loading: false, status: 3 } })).toMatchObject({
      canOpen: true,
      showOpenButton: false,
    });
    expect(card({ taskInfo: { loading: true } })).toMatchObject({
      canOpen: false,
      showOpenButton: false,
    });
    expect(card({}, { readonly: true })).toMatchObject({
      kind: 'resource',
      canOpen: false,
      showOpenButton: false,
    });
  });

  it('resolves the source external title title→name→label→脚本 using truthy no-trim fallback', () => {
    expect(card({ title: '题目', name: '名称', label: '标签' }).title).toBe('题目');
    expect(card({ title: '', name: '名称', label: '标签' }).title).toBe('名称');
    expect(card({ title: '', name: '', label: '标签' }).title).toBe('标签');
    expect(card({ title: '', name: '', label: '' }).title).toBe('脚本');
    expect(card({ title: ' ' }).title).toBe(' ');
  });

  it('reuses the caller workflow instead of rescanning or deriving a second availability protocol', () => {
    const supplied = workflow(['ready', 'idle', 'partial']),
      data = node().data;
    data.rows[0].plotDescription = '';
    const result = projectScriptV2Card({
      node: { ...node(), data },
      workflow: supplied,
      assetProgress: { inProgress: false },
    });
    expect(result.workflow).toBe(supplied);
    expect(result.compact.stages[0].visualState).toBe('ready');
  });
});

describe('source compact generating label and recompute footer metadata', () => {
  it('derives asset loading and average progress from actual linked task loading, retaining duplicate IDs', () => {
    const result = card(
      {
        assets: {
          scenes: [
            { id: 'a', linkedNodeId: 'image' },
            { id: 'b', linkedNodeId: 'image' },
          ],
          props: [{ id: 'c', linkedNodeId: 'prop' }],
        },
      },
      {
        nodes: [
          { id: 'image', data: { taskInfo: { loading: true, status: 2, progressPercent: 41.9 } } },
          { id: 'prop', data: { taskInfo: { loading: true, progressPercent: 10 } } },
        ],
      },
    );
    expect(result.generatingLabel).toBe('资产生成中 31%...');
    expect(result.workflow.assets).toMatchObject({
      isBusy: true,
      ready: 0,
      total: 3,
      status: 'idle',
    });
  });

  it('does not derive asset busy state from task status alone or a fake percentage', () => {
    const result = card(
      { assets: { scenes: [{ id: 'scene', linkedNodeId: 'image' }] } },
      {
        nodes: [
          { id: 'image', data: { taskInfo: { loading: false, status: 1, progressPercent: 40 } } },
        ],
      },
    );
    expect(result.generatingLabel).toBeUndefined();
  });

  it.each([0, 27, '27', undefined])(
    'running recompute with no volatile row progress does not substitute task percent: %j',
    (progressPercent) => {
      expect(
        card({
          taskInfo: {
            loading: true,
            status: 1,
            scriptV2TaskMode: 'recompute-batch-shots',
            progressPercent,
          },
        }).generatingLabel,
      ).toBe('合成提示词中...');
    },
  );

  it.each([
    [{ a: 0, b: 0 }, '合成提示词中 0%...'],
    [{ a: 20, b: 41.8 }, '合成提示词中 30%...'],
    [{ a: -20 }, '合成提示词中 0%...'],
    [{ a: 140 }, '合成提示词中 100%...'],
    [{}, '合成提示词中...'],
  ])('uses source floor/clamp of live progressByShot only: %j', (progressByShot, expected) => {
    expect(card({}, { promptProgress: { inProgress: true, progressByShot } }).generatingLabel).toBe(
      expected,
    );
  });

  it('joins simultaneous asset and prompt activity in source order with source punctuation', () => {
    const result = card(
      {},
      {
        assetProgress: { inProgress: true, progressPercent: 25 },
        promptProgress: { inProgress: true, progressByShot: { shot: 50 } },
      },
    );
    expect(result.generatingLabel).toBe('资产生成中 25%，合成提示词中 50%...');
  });

  it.each([NaN, Infinity, '50'])(
    'does not display nonfinite/nonnumber supplied asset percent: %j',
    (progressPercent) => {
      expect(
        card({}, { assetProgress: { inProgress: true, progressPercent } }).generatingLabel,
      ).toBe('资产生成中...');
    },
  );

  it('reports recompute failure footer only on a resource surface with trimmed source task ID/reason', () => {
    const taskInfo = {
      loading: false,
      status: 3,
      scriptV2TaskMode: 'recompute-batch-shots',
      taskId: ' job ',
      failedReason: ' failure ',
    };
    expect(card({ taskInfo }).notice).toEqual({ kind: 'failed', taskId: 'job', reason: 'failure' });
    expect(card({ taskInfo, rows: [] }).notice).toBeNull();
    expect(
      card({ taskInfo: { ...taskInfo, scriptV2TaskMode: 'generate-full' } }).notice,
    ).toBeNull();
  });

  it('uses source cancellation substring and source missing-ID placeholder without inventing task success', () => {
    expect(
      card({
        taskInfo: {
          loading: false,
          status: '4',
          scriptV2TaskMode: 'recompute-batch-shots',
          failedReason: '任务已取消',
        },
      }).notice,
    ).toEqual({ kind: 'cancelled' });
    expect(
      card({
        taskInfo: {
          loading: false,
          status: 4,
          scriptV2TaskMode: 'recompute-batch-shots',
          taskId: ' ',
        },
      }).notice,
    ).toEqual({ kind: 'failed', taskId: '--', reason: undefined });
    expect(
      card({ taskInfo: { loading: false, status: 2, scriptV2TaskMode: 'recompute-batch-shots' } })
        .notice,
    ).toBeNull();
    expect(
      card({ taskInfo: { status: 3, scriptV2TaskMode: 'recompute-batch-shots' } }).notice,
    ).toBeNull();
  });
});

describe('workflow parity and manual tO initialization', () => {
  it('counts source asset identities/readiness and paired prompt states without equating allReady with usable stale prompts', () => {
    const value = node({
      rows: [row({ imagePromptState: 'stale', videoPromptState: 'synced' })],
      assets: {
        characters: [null, { id: ' ', thumbnailUrl: '/bad.png' }],
        scenes: [{ id: 'scene', linkedNodeId: ' image ' }],
        props: [],
      },
    });
    const nodes = [{ id: 'image', data: { url: ['/actual.png', '/unused.png'] } }];
    const projected = projectScriptV2Card({ node: value, nodes });
    expect(projected.workflow).toMatchObject({
      readyCount: 2,
      allReady: false,
      promptsUsableForGeneration: true,
      outputGenerationReady: true,
    });
    expect(projected.workflow.assets).toMatchObject({ total: 1, ready: 1, status: 'ready' });
    expect(projected.workflow.prompts).toMatchObject({ total: 1, ready: 0, status: 'idle' });
  });

  it('does not search later linked URL values when source url[0] is blank', () => {
    const value = node({ assets: { scenes: [{ id: 'scene', linkedNodeId: 'image' }] } });
    const result = projectScriptV2Card({
      node: value,
      nodes: [{ id: 'image', data: { url: ['', '/second.png'] } }],
    });
    expect(result.workflow.assets).toMatchObject({ ready: 0, status: 'idle' });
  });

  it('creates the exact blank row schema and empty assets/view patch, leaving unrelated graph data to caller merge', () => {
    const makeId = vi.fn().mockReturnValueOnce('row-id').mockReturnValueOnce('hidden-id'),
      patch = createScriptV2ManualPatch({ makeId });
    expect(patch).toEqual({
      rows: [
        initializeStoryboardPromptState({
          id: 'row-id',
          hiddenUuid: 'hidden-id',
          shotNumber: 1,
          durationSeconds: 5,
          plotDescription: '',
          characters: [],
          shotSize: '',
          emotion: '',
          sceneAssetIds: [],
          propTags: '',
          propAssetIds: [],
          lightingAndAtmosphere: '',
          audioEffects: '',
          dialogue: '',
          imageGenerationPrompt: '',
          videoMotionPrompt: '',
          imageToVideoMotionPrompt: '',
        }),
      ],
      assets: { characters: [], scenes: [], props: [] },
      viewMode: 'table',
      activeViewId: 'default',
    });
    expect(makeId).toHaveBeenCalledTimes(2);
    expect(patch.rows[0]).toMatchObject({
      imagePromptState: 'none',
      videoPromptState: 'none',
      textHash: expect.any(String),
      payloadHash: expect.any(String),
    });
    for (const key of [
      'title',
      'params',
      'taskInfo',
      'views',
      'selectedIds',
      'currentStep',
      'isFullScreen',
    ])
      expect(patch).not.toHaveProperty(key);
  });

  it('manual initialization uses independent fresh containers and requires an injected ID factory', () => {
    let count = 0;
    const makeId = () => `id-${count++}`,
      first = createScriptV2ManualPatch({ makeId }),
      second = createScriptV2ManualPatch({ makeId });
    expect(first.rows[0].id).not.toBe(second.rows[0].id);
    expect(first.assets.characters).not.toBe(second.assets.characters);
    expect(() => createScriptV2ManualPatch()).toThrow('创建镜头需要标识生成器');
  });

  it('projection never mutates node/task/rows/assets or supplied stage data and never serializes the graph', () => {
    const value = node();
    value.data.toJSON = () => {
      throw new Error('No serialization');
    };
    Object.freeze(value.data.rows[0]);
    Object.freeze(value.data.rows);
    Object.freeze(value.data);
    Object.freeze(value);
    const supplied = scriptWorkflowState(value.data);
    Object.freeze(supplied);
    expect(
      projectScriptV2Card({ node: value, workflow: supplied, assetProgress: { inProgress: false } })
        .workflow,
    ).toBe(supplied);
  });

  it.each([
    [{ node: {} }, 'not-v2-script'],
    [{ node: { ...node(), data: null } }, 'invalid-input'],
    [{ node: node({ rows: {} }) }, 'invalid-rows'],
    [{ node: node({ rows: [null] }) }, 'invalid-rows'],
    [{ node: node(), nodes: [null] }, 'invalid-input'],
    [{ node: node(), workflow: {} }, 'invalid-workflow'],
  ])('guards malformed local inputs without inventing a ready surface: %j', (context, reason) => {
    expect(projectScriptV2Card(context)).toMatchObject({
      valid: false,
      reason,
      canOpen: false,
      showOpenButton: false,
    });
  });
});
