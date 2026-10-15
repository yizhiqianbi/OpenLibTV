import { StrictMode, useCallback, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import * as mediaModel from './media-input-model.js';
import { useNodeGenerator } from './useNodeGenerator.js';

const initialNode = () => ({
  id: 'target',
  type: 'video',
  data: { params: { model: 'kling-v3-omni', modeType: 'text2video', prompt: '原提示词' } },
});
const image = (index, url = `/image-${index}.png`) => ({
  id: `image-${index}`,
  type: 'image',
  data: { url: [url] },
});
const edgesFor = (resources) => resources.map((item) => ({ source: item.id, target: 'target' }));
function useDocumentGenerator({
  resources = [],
  edges = [],
  readonly = false,
  ready = true,
  catalogue = models,
  onUpdate,
}) {
  const [node, setNode] = useState(initialNode);
  const update = useCallback(
    (id, patch) => {
      onUpdate?.(id, patch);
      setNode((previous) =>
        id === previous.id ? { ...previous, data: { ...previous.data, ...patch } } : previous,
      );
    },
    [onUpdate],
  );
  const generator = useNodeGenerator({
    node,
    nodes: resources,
    edges,
    models: catalogue,
    readonly,
    ready,
    update,
  });
  return { ...generator, node };
}

describe('ordinary generator incoming lifecycle', () => {
  it('commits incoming initialization once when React replays effects in StrictMode', () => {
    const resources = [image(0), image(1)];
    const onUpdate = vi.fn();
    const hook = renderHook(useDocumentGenerator, {
      initialProps: { resources, edges: edgesFor(resources), onUpdate },
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    expect(hook.result.current.node.data.params.modeType).toBe('mixed2video');
    expect(onUpdate).toHaveBeenCalledOnce();
  });
  it('infers on initial connected resources but never reruns automatic inference for explicit mode, settings, prompt or node renames', () => {
    const infer = vi.spyOn(mediaModel, 'inferGeneratorMediaMode');
    const resources = [image(0), image(1)];
    const props = { resources, edges: edgesFor(resources) };
    const hook = renderHook(useDocumentGenerator, { initialProps: props });
    expect(hook.result.current.params.modeType).toBe('mixed2video');
    const initializationCalls = infer.mock.calls.length;
    expect(initializationCalls).toBeGreaterThan(0);
    act(() => hook.result.current.changeParams({ modeType: 'frames2video' }));
    act(() =>
      hook.result.current.changeParams({
        prompt: '用户的显式提示词',
        settings: { ...hook.result.current.params.settings, duration: 8 },
      }),
    );
    hook.rerender({
      ...props,
      resources: resources.map((item) => ({ ...item, data: { ...item.data, name: '仅改名' } })),
    });
    expect(infer).toHaveBeenCalledTimes(initializationCalls);
    expect(hook.result.current.node.data.params).toMatchObject({
      modeType: 'frames2video',
      prompt: '用户的显式提示词',
      settings: { duration: 8 },
    });
  });

  it('synchronizes actual connections and resource replacement, preserves usable explicit modes and synchronizes model changes', () => {
    const infer = vi.spyOn(mediaModel, 'inferGeneratorMediaMode');
    const hook = renderHook(useDocumentGenerator, { initialProps: {} });
    expect(hook.result.current.params.modeType).toBe('text2video');
    const resources = [image(0), image(1)];
    hook.rerender({ resources, edges: edgesFor(resources) });
    expect(hook.result.current.node.data.params.modeType).toBe('mixed2video');
    act(() => hook.result.current.changeParams({ modeType: 'frames2video' }));
    const calls = infer.mock.calls.length;
    const replaced = [image(0, '/replacement.png'), image(1)];
    hook.rerender({ resources: replaced, edges: edgesFor(replaced) });
    expect(hook.result.current.inputMedia.imageList[0].url).toBe('/replacement.png');
    expect(hook.result.current.params.modeType).toBe('frames2video');
    const three = [...replaced, image(2)];
    hook.rerender({ resources: three, edges: edgesFor(three) });
    expect(hook.result.current.node.data.params.modeType).toBe('mixed2video');
    expect(infer.mock.calls.length).toBeGreaterThan(calls);
    hook.rerender({ resources: [image(0)], edges: edgesFor([image(0)]) });
    act(() => hook.result.current.changeParams({ model: 'MiniMax-Hailuo-2.3' }));
    expect(hook.result.current.node.data.params).toMatchObject({
      model: 'MiniMax-Hailuo-2.3',
      modeType: 'singleImage2video',
    });
    hook.rerender({ resources: [], edges: [] });
    // Source bestEnabled preserves this legal non-text mode without media.
    expect(hook.result.current.params.modeType).toBe('singleImage2video');
  });

  it('does not mutate readonly, not-yet-loaded or schema-unavailable documents', () => {
    const onUpdate = vi.fn();
    const resources = [image(0), image(1)];
    const props = { resources, edges: edgesFor(resources), onUpdate };
    const hook = renderHook(useDocumentGenerator, { initialProps: { ...props, readonly: true } });
    act(() => expect(hook.result.current.changeParams({ prompt: '不能写' })).toBe(false));
    hook.rerender({ ...props, ready: false });
    act(() => expect(hook.result.current.changeParams({ prompt: '尚未加载' })).toBe(false));
    hook.rerender({ ...props, catalogue: null });
    act(() => expect(hook.result.current.changeParams({ prompt: '模型失败' })).toBe(false));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(hook.result.current.node.data.params).toEqual(initialNode().data.params);
    hook.rerender(props);
    expect(hook.result.current.node.data.params.modeType).toBe('mixed2video');
    expect(onUpdate).toHaveBeenCalledOnce();
  });
});
