import { describe, expect, it, vi } from 'vitest';
import { describeScriptV2NodeToolbar } from './node-toolbar-model.js';
import { scriptWorkflowState } from './workflow-model.js';
import { resolveScriptV2VideoCatalogue } from './v2-video-config-model.js';

const row = (patch = {}) => ({
  id: 'row',
  hiddenUuid: 'hidden-row',
  shotNumber: 30,
  plotDescription: '街道上的两人',
  imageGenerationPrompt: '街道静帧',
  videoMotionPrompt: '向前跟拍',
  ...patch,
});
const node = (data = {}, patch = {}) => ({
  id: 'script',
  type: 'script-v2',
  data: {
    rows: [row()],
    assets: { scenes: [{ id: 'scene', thumbnailUrl: '/street.jpg' }] },
    ...data,
  },
  ...patch,
});
const project = (script = node(), options = {}) =>
  describeScriptV2NodeToolbar({
    node: script,
    workflow: scriptWorkflowState(script.data),
    selectionEligible: true,
    ready: true,
    videoAvailable: true,
    ...options,
  });
const enabled = (result) =>
  Object.fromEntries(Object.entries(result.actions).map(([key, action]) => [key, action.enabled]));
const none = { regenerate: false, image: false, video: false, download: false };
const all = { regenerate: true, image: true, video: true, download: true };

describe('ScriptV2 source floating toolbar projection', () => {
  it('exposes exactly the four source actions for a ready resource script', () => {
    const result = project();
    expect(result.visible).toBe(true);
    expect(result.fullGenerationBusy).toBe(false);
    expect(enabled(result)).toEqual(all);
    expect(Object.values(result.actions).every((action) => action.disabledReason === '')).toBe(
      true,
    );
  });

  it('accepts the caller selection/focus override without rescanning graph or node.selected', () => {
    const script = node({}, { selected: false });
    const nodes = new Proxy([], {
      get() {
        throw new Error('must not scan nodes');
      },
    });
    expect(project(script, { selectionEligible: true, nodes }).visible).toBe(true);
    expect(project(script, { selectionEligible: false }).visible).toBe(false);
    expect(enabled(project(script, { selectionEligible: false }))).toEqual(none);
  });

  it.each(['script', 'storyboard', 'image', 'group'])(
    'does not enable the v2 toolbar for %s',
    (type) => {
      const result = project(node({ type: 'script-v2' }, { type }));
      expect(result.visible).toBe(false);
      expect(enabled(result)).toEqual(none);
    },
  );

  it('hides an empty script with no failed full task without inspecting normalized placeholder rows', () => {
    const result = project(node({ rows: [] }));
    expect(result.visible).toBe(false);
    expect(enabled(result)).toEqual(none);
  });

  it.each([3, 4, '3', ' 4 '])(
    'shows an empty failed script when loading is explicitly false (%s)',
    (status) => {
      const result = project(node({ rows: [], taskInfo: { status, loading: false } }));
      expect(result.visible).toBe(true);
      expect(enabled(result)).toEqual({ ...none, regenerate: true });
      expect(result.actions.video.disabledReason).toBe(
        '开始批量生成前，请先完成：\n' +
          '1. 「确认镜头」— 至少 1 条镜头有画面内容\n' +
          '2. 「合成提示词」— 每镜生成分镜与视频运动提示词\n' +
          '3. 至少保留 1 个镜头',
      );
    },
  );

  it.each([undefined, null, true, 0, 'false'])(
    'does not infer failure completion from loading=%s',
    (loading) => {
      const result = project(node({ rows: [], taskInfo: { status: 3, loading } }));
      expect(result.visible).toBe(false);
    },
  );

  it.each([undefined, null, '', 'bad', NaN, Infinity, {}, false, 0, 1, 2])(
    'does not manufacture a failed toolbar for status=%s',
    (status) => {
      const result = project(node({ rows: [], taskInfo: { status, loading: false } }));
      expect(result.visible).toBe(false);
    },
  );

  it.each([0, 1, undefined, null, '1'])(
    'hides the toolbar during full generation (%s)',
    (status) => {
      const result = project(node({ taskInfo: { status, loading: true } }));
      expect(result.fullGenerationBusy).toBe(true);
      expect(result.visible).toBe(false);
      expect(enabled(result)).toEqual(none);
    },
  );

  it.each([2, 3, 4, '2', '3', '4'])(
    'does not treat terminal status %s as full generation busy',
    (status) => {
      const result = project(node({ taskInfo: { status, loading: true } }));
      expect(result.fullGenerationBusy).toBe(false);
      expect(result.visible).toBe(true);
      expect(enabled(result)).toEqual(all);
    },
  );

  it('keeps the resource toolbar during prompt recomputation and does not turn its empty failure into a resource', () => {
    const taskInfo = { status: 1, loading: true, scriptV2TaskMode: 'recompute-batch-shots' };
    const result = project(node({ taskInfo }));
    expect(result.fullGenerationBusy).toBe(false);
    expect(result.visible).toBe(true);
    expect(enabled(result)).toEqual(all);
    expect(
      project(node({ rows: [], taskInfo: { ...taskInfo, status: 3, loading: false } })).visible,
    ).toBe(false);
  });

  it('allows stale but usable prompts for image/video while retaining the stricter CSV stage gate', () => {
    const result = project(
      node({ rows: [row({ imagePromptState: 'stale', videoPromptState: 'synced' })] }),
    );
    expect(enabled(result)).toEqual({ ...all, download: false });
    expect(result.actions.download.disabledReason).toBe('');
  });

  it('requires actual prompt text for outputs even when both prompt states are synced', () => {
    const result = project(
      node({
        rows: [
          row({
            imagePromptState: 'synced',
            videoPromptState: 'synced',
            imageGenerationPrompt: '',
          }),
        ],
      }),
    );
    expect(enabled(result)).toEqual({
      regenerate: true,
      image: false,
      video: false,
      download: true,
    });
    expect(result.actions.image.disabledReason).toBe(
      '开始批量生成前，请先完成：\n1. 「合成提示词」— 每镜生成分镜与视频运动提示词',
    );
  });

  it('lists all source requirements in shots/assets/usable-prompts/model order', () => {
    const script = node({
      rows: [row({ plotDescription: ' ', videoPromptState: 'generating' })],
      assets: { characters: [{ id: 'character', thumbnailUrl: ' ' }] },
    });
    const result = project(script, { videoAvailable: false });
    const stages =
      '开始批量生成前，请先完成：\n' +
      '1. 「确认镜头」— 至少 1 条镜头有画面内容\n' +
      '2. 「准备资产」— 为角色 / 场景 / 道具准备形象图\n' +
      '3. 「合成提示词」— 每镜生成分镜与视频运动提示词';
    expect(result.actions.image.disabledReason).toBe(stages);
    expect(result.actions.video.disabledReason).toBe(
      `${stages}\n4. 切换到支持「首帧生视频」的视频模型`,
    );
    expect(enabled(result)).toEqual({ ...none, regenerate: true });
  });

  it('keeps source empty-rows and model checklist items after the stage items for a failed empty node', () => {
    const result = project(
      node({ rows: [], assets: {}, taskInfo: { status: 4, loading: false } }),
      { videoAvailable: false },
    );
    expect(result.actions.video.disabledReason).toBe(
      '开始批量生成前，请先完成：\n' +
        '1. 「确认镜头」— 至少 1 条镜头有画面内容\n' +
        '2. 「准备资产」— 为角色 / 场景 / 道具准备形象图\n' +
        '3. 「合成提示词」— 每镜生成分镜与视频运动提示词\n' +
        '4. 至少保留 1 个镜头\n' +
        '5. 切换到支持「首帧生视频」的视频模型',
    );
  });

  it('does not substitute ready linked image output for missing asset readiness', () => {
    const result = project(node({ assets: {}, linkedImageGroupId: 'image-group' }));
    expect(enabled(result)).toEqual({ ...none, regenerate: true });
    expect(result.actions.image.disabledReason).toContain('「准备资产」');
  });

  it('uses the caller workflow, never a separate row, selection, or graph readiness approximation', () => {
    const workflow = scriptWorkflowState(node().data);
    const reader = vi.fn();
    const result = project(node(), {
      workflow,
      selectedHiddenUuids: new Set(),
      getNodeUrl: reader,
    });
    expect(enabled(result)).toEqual(all);
    expect(reader).not.toHaveBeenCalled();
  });

  it('keeps image/download available while global direct video support is loading or empty', () => {
    const result = project(node(), { videoAvailable: undefined });
    expect(enabled(result)).toEqual({ ...all, video: false });
    expect(result.actions.video.disabledReason).toBe(
      '开始批量生成前，请先完成：\n1. 切换到支持「首帧生视频」的视频模型',
    );
  });

  it('does not count a mixed minimum of two as the toolbar global mixed(1) candidate', () => {
    const catalogue = resolveScriptV2VideoCatalogue({
      models: {
        videoModels: { model: { properties: { modeType: { items: { mixed2video: [2, 4] } } } } },
      },
      support: [{ modelKey: 'model' }],
      requiredRefs: 1,
    });
    expect(
      enabled(project(node(), { videoAvailable: catalogue.valid && catalogue.keys.length > 0 })),
    ).toEqual({ ...all, video: false });
  });

  it('retains source Z availability even when catalogue metadata disables the mixed(1) model', () => {
    const catalogue = resolveScriptV2VideoCatalogue({
      models: {
        videoModels: { model: { properties: { modeType: { items: { mixed2video: [1, 4] } } } } },
      },
      support: [{ modelKey: 'model', disable: true }],
      requiredRefs: 1,
    });
    expect(catalogue.options[0].disabled).toBe(true);
    expect(
      enabled(project(node(), { videoAvailable: catalogue.valid && catalogue.keys.length > 0 })),
    ).toEqual(all);
  });

  it.each([
    [{ ready: false }, '画布尚未就绪'],
    [{ tablePending: true }, '正在保存脚本，请稍后再试'],
    [{ tableError: 'quota' }, '脚本保存失败，请先重试'],
  ])('keeps source visibility but blocks local unsafe owner %j', (options, reason) => {
    const result = project(node(), options);
    expect(result.visible).toBe(true);
    expect(enabled(result)).toEqual(none);
    expect(Object.values(result.actions).map((action) => action.disabledReason)).toEqual(
      Array(4).fill(reason),
    );
  });

  it('hides readonly controls and does not grant action permission to callbacks', () => {
    const result = project(node(), { readonly: true });
    expect(result.visible).toBe(false);
    expect(enabled(result)).toEqual(none);
  });

  it('has safe defaults and does not invent a generation-service or authorization gate', () => {
    expect(enabled(describeScriptV2NodeToolbar())).toEqual(none);
    expect(
      project(node(), { generationServiceAvailable: false, authenticated: false }).actions
        .regenerate.enabled,
    ).toBe(true);
  });

  it('does not mutate script rows, assets, tasks, or the supplied workflow', () => {
    const script = node({ taskInfo: { status: 3, loading: false } });
    const workflow = scriptWorkflowState(script.data);
    const original = structuredClone({ script, workflow });
    Object.freeze(script.data.rows);
    Object.freeze(script.data.taskInfo);
    Object.freeze(workflow);
    project(script, { workflow });
    expect({ script, workflow }).toEqual(original);
  });
});
