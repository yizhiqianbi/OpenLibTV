import { useRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasScriptGroupControls } from './useCanvasScriptGroupControls.js';

const group = {
  id: 'g',
  type: 'group',
  data: { sourceScriptNodeId: 's', storyboardGroupType: 'image' },
};
function mount() {
  return renderHook(
    (props) => {
      const graph = useRef();
      graph.current = { ...props, nodes: [props.group], edges: [] };
      return useCanvasScriptGroupControls({ ...props, getDocument: () => graph.current });
    },
    { initialProps: { documentKey: 'A', ready: true, readonly: false, group } },
  );
}
describe('linked confirmation ownership', () => {
  it('leaves the document idle until a confirmation is opened', () => {
    const graph = { documentKey: 'A', ready: true, readonly: false, nodes: [group], edges: [] };
    const getDocument = vi.fn(() => graph);
    const page = renderHook((props) => useCanvasScriptGroupControls(props), {
      initialProps: { documentKey: 'A', ready: true, readonly: false, getDocument },
    });
    page.rerender({ documentKey: 'A', ready: true, readonly: false, getDocument });
    expect(getDocument).not.toHaveBeenCalled();
    act(() => expect(page.result.current.open('g')).toBe(true));
    expect(page.result.current.request.title).toBe('生成分镜图');
    expect(getDocument).toHaveBeenCalled();
    act(() => page.result.current.cancel(page.result.current.request));
    getDocument.mockClear();
    page.rerender({ documentKey: 'A', ready: true, readonly: false, getDocument });
    expect(getDocument).not.toHaveBeenCalled();
  });
  it('binds cancellation to its exact request and does not write graph data', () => {
    const page = mount();
    act(() => page.result.current.open('g'));
    const old = page.result.current.request;
    act(() => page.result.current.open('g'));
    const current = page.result.current.request;
    act(() => page.result.current.cancel(old));
    expect(page.result.current.request).toBe(current);
    expect(group.data).toEqual({ sourceScriptNodeId: 's', storyboardGroupType: 'image' });
    act(() => page.result.current.cancel(current));
    expect(page.result.current.request).toBeNull();
  });

  it('rejects old document callbacks even when the next document reuses the group ID', () => {
    const page = mount();
    const oldOpen = page.result.current.open;
    page.rerender({ documentKey: 'B', ready: true, readonly: false, group });
    act(() => expect(oldOpen('g')).toBe(false));
    expect(page.result.current.request).toBeNull();
    act(() => expect(page.result.current.open('g')).toBe(true));
    page.rerender({ documentKey: 'B', ready: false, readonly: false, group });
    expect(page.result.current.request).toBeNull();
    act(() => expect(page.result.current.open('g')).toBe(false));
  });

  it('hides a replaced source and readonly view without creating a local task', () => {
    const page = mount();
    act(() => page.result.current.open('g'));
    page.rerender({
      documentKey: 'A',
      ready: true,
      readonly: false,
      group: { ...group, data: { ...group.data, sourceScriptNodeId: 'new-script' } },
    });
    expect(page.result.current.request).toBeNull();
    page.rerender({ documentKey: 'A', ready: true, readonly: true, group });
    act(() => expect(page.result.current.open('g')).toBe(false));
  });
});
