import { useRef, useState } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasGroupControls } from './useCanvasGroupControls.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';

const image = (id, parentId = 'g') => ({
  id,
  type: 'image',
  parentId,
  extent: 'parent',
  position: { x: id === 'a' ? 4 : 358, y: 4 },
  width: 350,
  height: 350,
  data: {
    name: id,
    type: 'image',
    url: [`/${id}.png`],
    params: { prompt: 'keep', settings: { ratio: '1:1' } },
  },
});
const initial = () => [
  {
    id: 'g',
    type: 'group',
    position: { x: 100, y: 80 },
    width: 712,
    height: 358,
    data: {
      name: '分镜组',
      type: 'group',
      storyboardGroupType: 'image',
      standaloneStoryboardImageGrid: true,
      storyboardManualGridCols: 2,
      childNodeIds: ['a', 'b'],
    },
  },
  image('a'),
  image('b'),
  { ...image('other', undefined), parentId: undefined, position: { x: 1000, y: 1000 } },
];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function mount(options = {}) {
  const notify = vi.fn(),
    focus = vi.fn();
  const hooked = renderHook(
    (props) => {
      const [nodes, setNodes] = useState(initial);
      const [edges, setEdges] = useState([{ id: 'edge', source: 'a', target: 'other' }]);
      const [selected, setSelected] = useState(['a']);
      const graphRef = useRef(null);
      graphRef.current = {
        nodes,
        edges,
        models: null,
        documentKey: props.documentKey,
        ready: props.ready,
        readonly: props.readonly,
      };
      const history = useSnapshotHistory(
        { nodes, edges },
        {
          restore: (value) => {
            setNodes(value.nodes);
            setEdges(value.edges);
          },
        },
      );
      const actions = useCanvasGraphActions({
        documentKey: props.documentKey,
        currentDocument: graphRef,
        setNodes,
        setEdges,
        recordSnapshot: history.recordSnapshot,
        notify,
      });
      const controls = useCanvasGroupControls({
        ...props,
        nodes,
        getDocument: () => graphRef.current,
        graphActions: props.rejectCommit ? { commitGraph: () => false } : actions,
        setSelected,
        notify,
        onFocusNode: focus,
      });
      return { controls, nodes, edges, selected, setNodes, history };
    },
    { initialProps: { documentKey: 'A', ready: true, readonly: false, ...options } },
  );
  return { ...hooked, notify, focus };
}

describe('storyboard controls use the real graph history boundary', () => {
  it('applies aspect changes once, preserving outside nodes, edges and one undo/redo', () => {
    const page = mount();
    const original = page.result.current.nodes;
    act(() =>
      expect(page.result.current.controls.command('g', { type: 'aspect', value: '9:16' })).toBe(
        true,
      ),
    );
    const changed = page.result.current.nodes;
    expect(changed.find((node) => node.id === 'a').data.params.settings.ratio).toBe('9:16');
    expect(changed.find((node) => node.id === 'other')).toBe(
      original.find((node) => node.id === 'other'),
    );
    expect(page.result.current.history.history.current).toHaveLength(1);
    expect(page.focus).not.toHaveBeenCalled();
    act(() => page.result.current.history.undo());
    expect(page.result.current.nodes).toEqual(original);
    act(() => page.result.current.history.redo());
    expect(page.result.current.nodes).toEqual(changed);
  });

  it('confirms the actual group children rather than the currently selected child', async () => {
    const page = mount();
    act(() => page.result.current.controls.command('g', { type: 'clear' }));
    expect(page.result.current.history.history.current).toHaveLength(0);
    act(() => page.result.current.controls.cancel());
    expect(page.result.current.nodes).toHaveLength(4);
    act(() => page.result.current.controls.command('g', { type: 'clear' }));
    await act(async () => expect(await page.result.current.controls.confirm()).toBe(true));
    expect(page.result.current.nodes.map((node) => node.id)).toEqual(['g', 'other']);
    expect(page.result.current.edges).toEqual([]);
    expect(page.result.current.selected).toEqual([]);
    expect(page.result.current.history.history.current).toHaveLength(1);
    act(() => page.result.current.history.undo());
    expect(page.result.current.nodes).toHaveLength(4);
  });

  it('does not let an old confirmation cancel or submit a replacement request', async () => {
    const page = mount();
    act(() => page.result.current.controls.command('g', { type: 'clear' }));
    const oldCancel = page.result.current.controls.cancel;
    const oldConfirm = page.result.current.controls.confirm;
    act(() => page.result.current.controls.command('g', { type: 'convertToNormal' }));
    act(oldCancel);
    await act(async () => expect(await oldConfirm()).toBe(false));
    expect(page.result.current.controls.confirmation.command.type).toBe('convertToNormal');
  });

  it('keeps rejected graph commits reviewable and retryable in the confirmation', async () => {
    const page = mount({ rejectCommit: true });
    act(() => page.result.current.controls.command('g', { type: 'clear' }));
    await act(async () => expect(await page.result.current.controls.confirm()).toBe(false));
    expect(page.result.current.controls.confirmation).toBeTruthy();
    expect(page.result.current.controls.error).toContain('未提交修改');
    expect(page.result.current.history.history.current).toHaveLength(0);
    expect(page.result.current.nodes).toHaveLength(4);
  });

  it('detaches fixed-grid overflow with a single snapshot and source group fit', () => {
    const flushGraph = vi.fn(() => true);
    const page = mount({ flushGraph });
    act(() =>
      expect(page.result.current.controls.command('g', { type: 'grid', cols: 1, rows: 1 })).toBe(
        true,
      ),
    );
    expect(page.result.current.nodes.find((node) => node.id === 'b').parentId).toBeUndefined();
    expect(page.result.current.history.history.current).toHaveLength(1);
    expect(page.focus).toHaveBeenCalledWith('g', page.result.current.nodes);
    expect(flushGraph).toHaveBeenCalledOnce();
    expect(flushGraph.mock.calls[0][0].nodes).toBe(page.result.current.nodes);
  });

  it('reads natural dimensions concurrently and commits against the latest unrelated edit', async () => {
    const reads = [deferred(), deferred()];
    const readImage = vi.fn((url) => reads[url === '/a.png' ? 0 : 1].promise);
    const page = mount({ readImage });
    act(() => page.result.current.controls.command('g', { type: 'convertToNormal' }));
    let conversion;
    act(() => {
      conversion = page.result.current.controls.confirm();
    });
    expect(readImage).toHaveBeenCalledTimes(2);
    act(() =>
      page.result.current.setNodes((nodes) =>
        nodes.map((node) =>
          node.id === 'other'
            ? { ...node, data: { ...node.data, name: 'new unrelated edit' } }
            : node,
        ),
      ),
    );
    await act(async () => {
      reads[0].resolve({ width: 4000, height: 1000 });
      reads[1].reject(new Error('unreadable'));
      expect(await conversion).toBe(true);
    });
    expect(page.result.current.nodes.find((node) => node.id === 'a')).toMatchObject({
      width: 1400,
      height: 350,
    });
    expect(page.result.current.nodes.find((node) => node.id === 'b')).toMatchObject({
      width: 350,
      height: 350,
    });
    expect(page.result.current.nodes.find((node) => node.id === 'other').data.name).toBe(
      'new unrelated edit',
    );
    expect(page.result.current.nodes[0].data.standaloneStoryboardImageGrid).toBeUndefined();
    expect(page.result.current.history.history.current).toHaveLength(1);
    expect(page.focus).not.toHaveBeenCalled();
  });

  it.each(['document', 'readonly', 'not ready', 'changed image'])(
    'ignores late natural dimensions after %s changes',
    async (kind) => {
      const work = deferred();
      const readImage = vi.fn(() => work.promise);
      const page = mount({ readImage });
      act(() => page.result.current.controls.command('g', { type: 'convertToNormal' }));
      let conversion;
      act(() => {
        conversion = page.result.current.controls.confirm();
      });
      if (kind === 'changed image')
        act(() =>
          page.result.current.setNodes((nodes) =>
            nodes.map((node) =>
              node.id === 'a' ? { ...node, data: { ...node.data, url: ['/new.png'] } } : node,
            ),
          ),
        );
      else
        page.rerender({
          documentKey: kind === 'document' ? 'B' : 'A',
          readonly: kind === 'readonly',
          ready: kind !== 'not ready',
          readImage,
        });
      expect(readImage.mock.calls[0][1].signal.aborted).toBe(true);
      await act(async () => {
        work.resolve({ width: 900, height: 600 });
        expect(await conversion).toBe(false);
      });
      expect(page.result.current.nodes[0].data.standaloneStoryboardImageGrid).toBe(true);
      expect(page.result.current.history.history.current).toHaveLength(0);
    },
  );

  it('cancels conversion without removing its draft when the dialog closes', async () => {
    const work = deferred();
    const readImage = vi.fn(() => work.promise);
    const page = mount({ readImage });
    act(() => page.result.current.controls.command('g', { type: 'convertToNormal' }));
    let conversion;
    act(() => {
      conversion = page.result.current.controls.confirm();
    });
    act(() => page.result.current.controls.cancel());
    expect(page.result.current.controls.busyGroupIds).toEqual([]);
    expect(readImage.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      work.resolve({ width: 100, height: 100 });
      await conversion;
    });
    expect(page.result.current.nodes).toEqual(initial());
    expect(page.result.current.history.history.current).toHaveLength(0);
  });

  it('creates a local root image from the actual composed File, without inventing upload state', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'stitch.png', { type: 'image/png' });
    const compose = vi.fn(async () => ({ file, width: 2048, height: 1024 }));
    const flushGraph = vi.fn(() => true);
    const page = mount({ compose, flushGraph });
    await act(async () =>
      expect(
        await page.result.current.controls.command('g', { type: 'stitch', resolution: '2k' }),
      ).toBe(true),
    );
    const created = page.result.current.nodes.at(-1);
    expect(created.type).toBe('image');
    expect(created.parentId).toBeUndefined();
    expect(created.data).toMatchObject({
      localMediaReady: true,
      action: 'image_resource',
      generatorType: 'default',
      _explicitContentDims: true,
      url: ['data:image/png;base64,AAEC/w=='],
    });
    expect(created.resourceMeta.items[0]).toMatchObject({ byteSize: 4, mimeType: 'image/png' });
    expect(page.notify).toHaveBeenLastCalledWith('已在本机创建拼接图');
    expect(page.result.current.selected).toEqual([created.id]);
    expect(created.data.contentWidth).toBe(created.width);
    expect(created.data.contentHeight).toBe(created.height);
    expect(flushGraph).toHaveBeenCalledOnce();
    expect(flushGraph.mock.calls[0][0].nodes).toBe(page.result.current.nodes);
    expect(page.result.current.history.history.current).toHaveLength(1);
    act(() => page.result.current.history.undo());
    expect(page.result.current.nodes).toHaveLength(4);
  });

  it('isolates a replaced stitch source before it can publish a late node', async () => {
    const work = deferred();
    const create = vi.fn(() => work.promise);
    const compose = vi.fn(async () => ({ file: new File(['x'], 'x.png', { type: 'image/png' }) }));
    const page = mount({ compose, stitchSource: { create } });
    let task;
    act(() => {
      task = page.result.current.controls.command('g', { type: 'stitch', resolution: '2k' });
    });
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    page.rerender({
      documentKey: 'A',
      readonly: false,
      ready: true,
      compose,
      stitchSource: { create: vi.fn() },
    });
    expect(create.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      work.resolve({ ...image('server', undefined), parentId: undefined });
      expect(await task).toBe(false);
    });
    expect(page.result.current.nodes).toHaveLength(4);
    expect(page.result.current.history.history.current).toHaveLength(0);
    expect(page.notify).not.toHaveBeenCalledWith('已创建拼接图');
  });

  it('reports composition failure and allows a fresh retry without history pollution', async () => {
    const compose = vi
      .fn()
      .mockRejectedValueOnce(new Error('canvas failed'))
      .mockResolvedValueOnce({ file: new File(['x'], 'x.png', { type: 'image/png' }) });
    const page = mount({ compose });
    await act(async () =>
      expect(await page.result.current.controls.command('g', { type: 'stitch' })).toBe(false),
    );
    expect(page.notify).toHaveBeenLastCalledWith('canvas failed');
    expect(page.result.current.history.history.current).toHaveLength(0);
    expect(page.result.current.controls.busyGroupIds).toEqual([]);
    await act(async () =>
      expect(await page.result.current.controls.command('g', { type: 'stitch' })).toBe(true),
    );
    expect(page.result.current.nodes).toHaveLength(5);
    expect(page.result.current.history.history.current).toHaveLength(1);
  });
  it('keeps the composed graph and clearly reports an immediate persistence failure', async () => {
    const compose = vi.fn(async () => ({ file: new File(['x'], 'x.png', { type: 'image/png' }) }));
    const page = mount({ compose, flushGraph: () => false });
    await act(async () =>
      expect(await page.result.current.controls.command('g', { type: 'stitch' })).toBe(true),
    );
    expect(page.result.current.nodes).toHaveLength(5);
    expect(page.notify).toHaveBeenLastCalledWith('已在本机创建拼接图，保存失败，请导出画布后重试');
    expect(page.result.current.history.history.current).toHaveLength(1);
  });
});
