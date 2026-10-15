import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';

const nodesWith = (prompt) => [{ id: 'node', data: { params: { prompt, model: 'original' } } }];
const documentWith = (prompt) => ({ storageKey: 'first', nodes: nodesWith(prompt) });
const pendingDraft = () => ({ writable: true, basePrompt: 'A', value: 'B' });
const scriptNode = (rowPatch = {}) => ({
  id: 'script',
  type: 'script-v2',
  data: {
    title: '分镜',
    assets: { characters: [], scenes: [{ id: 'coast', name: '海岸' }], props: [] },
    rows: [
      {
        id: 'shot',
        hiddenUuid: 'stable',
        plotDescription: '晨光',
        imageGenerationPrompt: '旧图',
        videoMotionPrompt: '旧视频',
        imagePromptState: 'stale',
        videoPromptState: 'synced',
        ...rowPatch,
      },
    ],
  },
});
const scriptDocument = (node = scriptNode()) => ({ storageKey: 'first', nodes: [node] });
const scriptDraft = (node = scriptNode()) => ({
  writable: true,
  scriptPrompts: ['image', 'video'].map((track) => ({
    rowId: 'shot',
    track,
    value: track === 'image' ? '@海岸 晨光' : '新视频',
    baseFingerprint: fingerprintScriptPromptBundle(getScriptPromptBundle(node.data.rows[0], track)),
  })),
});

it('applies source script prompt cleanup to the final debounce draft in snapshots and retries', () => {
  const page = renderHook(() => useCanvasDrafts());
  const base = scriptNode();
  base.data.params = {
    prompt: '原剧情',
    cameraPresets: [{ id: 'one' }, { id: 'two' }],
    magicList: { used: { value: 1 }, unused: { value: 2 } },
  };
  page.result.current.register(
    'first',
    'script',
    () => ({
      writable: true,
      basePrompt: '原剧情',
      value: '{{CameraPreset 2}} {{magic:used:1}} {{Video 1}}',
    }),
    'script-generator',
  )();
  const projected = page.result.current.project(scriptDocument(base));
  expect(projected.nodes[0].data.params).toEqual({
    prompt: '{{CameraPreset 1}} {{magic:used:1}} {{Video 1}}',
    cameraPresets: [{ id: 'two' }],
    magicList: { used: { value: 1 } },
  });
  expect(page.result.current.project(scriptDocument(base))).toEqual(projected);
  expect(base.data.params.prompt).toBe('原剧情');
  page.result.current.acknowledge(projected);
  expect(page.result.current.project(scriptDocument(base)).nodes[0]).toBe(base);
});

it('retains independent generator and final-shot drafts for the same script across removal, retry and save acknowledgement', () => {
  const page = renderHook(() => useCanvasDrafts());
  const base = scriptNode();
  base.data.params = { prompt: '原剧情', model: 'script-model' };
  const finalRows = page.result.current.register('first', 'script', () => scriptDraft(base));
  const generator = page.result.current.register(
    'first',
    'script',
    () => ({
      writable: true,
      basePrompt: '原剧情',
      value: '最后150ms剧情',
    }),
    'script-generator',
  );
  finalRows();
  generator();
  const document = scriptDocument(base);
  const projected = page.result.current.project(document);
  expect(projected.nodes[0].data.params).toEqual({
    prompt: '最后150ms剧情',
    model: 'script-model',
  });
  expect(projected.nodes[0].data.rows[0].imageGenerationPrompt).toBe('@海岸 晨光');
  expect(projected.nodes[0].data.rows[0].videoMotionPrompt).toBe('新视频');
  expect(page.result.current.project(document)).toEqual(projected);
  page.result.current.acknowledge(projected);
  expect(page.result.current.project(document)).toBe(document);
});

it('does not let one channel cleanup remove another channel or replace a newer reader', () => {
  const page = renderHook(() => useCanvasDrafts());
  const base = scriptNode();
  base.data.params = { prompt: '原剧情' };
  const stale = page.result.current.register(
    'first',
    'script',
    () => ({ writable: true, basePrompt: '原剧情', value: '过期' }),
    'script-generator',
  );
  page.result.current.register(
    'first',
    'script',
    () => ({ writable: true, basePrompt: '原剧情', value: '当前' }),
    'script-generator',
  );
  const final = page.result.current.register('first', 'script', () => scriptDraft(base));
  stale();
  final();
  const projected = page.result.current.project(scriptDocument(base));
  expect(projected.nodes[0].data.params.prompt).toBe('当前');
  expect(projected.nodes[0].data.rows[0].videoMotionPrompt).toBe('新视频');
});

it('projects both final-prompt drafts on immediate editor removal while preserving script fields, states and entity references', () => {
  const page = renderHook(() => useCanvasDrafts());
  const unregister = page.result.current.register('first', 'script', () => scriptDraft());
  unregister();
  const projected = page.result.current.project(scriptDocument()).nodes[0];
  expect(projected.data.rows[0]).toMatchObject({
    imageGenerationPrompt: '@海岸 晨光',
    videoMotionPrompt: '新视频',
    imagePromptState: 'stale',
    videoPromptState: 'synced',
    hiddenUuid: 'stable',
    plotDescription: '晨光',
    finalImagePromptEntityRefs: [{ assetId: 'coast', text: '海岸' }],
  });
  expect(projected.data.title).toBe('分镜');
  expect(
    page.result.current.project({ ...scriptDocument(), storageKey: 'second' }).nodes[0],
  ).toEqual(scriptNode());
});

it('does not overwrite a changed track while retaining the other pending prompt through failed-save retries', () => {
  const page = renderHook(() => useCanvasDrafts());
  page.result.current.register('first', 'script', () => scriptDraft())();
  const external = scriptNode({ imageGenerationPrompt: '其他位置新图', durationSeconds: 8 });
  const first = page.result.current.project(scriptDocument(external));
  expect(first.nodes[0].data.rows[0]).toMatchObject({
    imageGenerationPrompt: '其他位置新图',
    videoMotionPrompt: '新视频',
    durationSeconds: 8,
  });
  expect(page.result.current.project(scriptDocument(external))).toEqual(first);
  page.result.current.acknowledge(first);
  expect(page.result.current.project(scriptDocument()).nodes[0]).toEqual(scriptNode());
});

it('consumes each applied script draft before undo can restore its original baseline or a deleted shot can reappear', () => {
  const page = renderHook((nodes) => useCanvasDrafts({ storageKey: 'first', ready: true, nodes }), {
    initialProps: [scriptNode()],
  });
  page.result.current.register('first', 'script', () => scriptDraft())();
  page.rerender([scriptNode({ imageGenerationPrompt: '@海岸 晨光' })]);
  page.rerender([scriptNode()]);
  expect(page.result.current.project(scriptDocument()).nodes[0].data.rows[0]).toMatchObject({
    imageGenerationPrompt: '旧图',
    videoMotionPrompt: '新视频',
  });
  page.rerender([{ ...scriptNode(), data: { ...scriptNode().data, rows: [] } }]);
  page.rerender([scriptNode()]);
  expect(page.result.current.project(scriptDocument()).nodes[0]).toEqual(scriptNode());
});

it('retains a removed editor draft for immediate persistence but does not undo a later external restore', () => {
  const page = renderHook((nodes) => useCanvasDrafts({ storageKey: 'first', nodes, ready: true }), {
    initialProps: nodesWith('A'),
  });
  let unregister;
  act(() => {
    unregister = page.result.current.register('first', 'node', pendingDraft);
  });
  act(() => unregister());
  expect(page.result.current.project(documentWith('A')).nodes[0].data.params.prompt).toBe('B');
  page.rerender(nodesWith('B'));
  page.rerender(nodesWith('A'));
  expect(page.result.current.project(documentWith('A')).nodes[0].data.params.prompt).toBe('A');
});

it('keeps drafts available for a failed save retry and consumes them only after a successful acknowledgement', () => {
  const page = renderHook(() => useCanvasDrafts());
  const unregister = page.result.current.register('first', 'node', pendingDraft);
  unregister();
  expect(page.result.current.project(documentWith('A')).nodes[0].data.params.prompt).toBe('B');
  expect(page.result.current.project(documentWith('A')).nodes[0].data.params.prompt).toBe('B');
  page.result.current.acknowledge(documentWith('B'));
  expect(page.result.current.project(documentWith('A')).nodes[0].data.params.prompt).toBe('A');
});

it('does not revive a deleted node draft when the same id is created again or affect another document', () => {
  const page = renderHook((nodes) => useCanvasDrafts({ storageKey: 'first', nodes, ready: true }), {
    initialProps: nodesWith('A'),
  });
  const unregister = page.result.current.register('first', 'node', pendingDraft);
  unregister();
  expect(
    page.result.current.project({ ...documentWith('A'), storageKey: 'second' }).nodes[0].data.params
      .prompt,
  ).toBe('A');
  page.rerender([]);
  page.rerender(nodesWith('A'));
  expect(page.result.current.project(documentWith('A')).nodes[0].data.params.prompt).toBe('A');
});
