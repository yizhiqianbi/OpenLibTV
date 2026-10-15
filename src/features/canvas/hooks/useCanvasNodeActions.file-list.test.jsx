import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasNodeActions } from './useCanvasNodeActions.js';

let readers;
beforeEach(() => {
  readers = [];
  class ControlledReader {
    readAsDataURL(file) {
      this.file = file;
      readers.push(this);
    }
    abort = vi.fn(() => this.onabort?.());
  }
  vi.stubGlobal('FileReader', ControlledReader);
});
afterEach(() => vi.unstubAllGlobals());

/** Browser input.value='' empties the same FileList; an ordinary Array would hide this bug. */
function liveFileList(files) {
  let current = [...files];
  const value = {
    get length() {
      return current.length;
    },
    item: (index) => current[index] ?? null,
    *[Symbol.iterator]() {
      let index = 0;
      while (index < current.length) yield current[index++];
    },
  };
  return {
    value,
    clear: () => {
      current = [];
    },
  };
}
const file = (name) => new File([name], name, { type: 'image/png' });

function page() {
  const callbacks = { record: vi.fn(), notify: vi.fn(), setSaved: vi.fn() };
  const histories = [];
  const original = { id: 'original', type: 'text', data: { text: '原内容' } };
  const hook = renderHook(
    (permissions) => {
      const [nodes, setNodes] = useState([original]);
      const [edges, setEdges] = useState([]);
      const [selected, setSelected] = useState([]);
      const actions = useCanvasNodeActions({
        ...permissions,
        ...callbacks,
        nodes,
        edges,
        setNodes,
        setEdges,
        setSelected,
        record: () => {
          histories.push({ nodes, edges });
          callbacks.record();
        },
      });
      return { actions, nodes, edges, selected, setNodes, setEdges };
    },
    { initialProps: { documentKey: 'live-file-list', ready: true, readonly: false } },
  );
  return {
    ...hook,
    callbacks,
    histories,
    original,
    start: (list) => {
      let task;
      act(() => {
        task = hook.result.current.actions.upload(list.value, { x: 0, y: 0 });
        list.clear();
      });
      expect(list.value.length).toBe(0);
      expect([...list.value]).toEqual([]);
      return task;
    },
  };
}
async function finish(index, error = false) {
  await act(async () => {
    const reader = readers[index];
    if (error) reader.onerror();
    else {
      reader.result = `data:image/png;base64,${btoa(reader.file.name)}`;
      reader.onload();
    }
    await Promise.resolve();
  });
}

describe('ordinary canvas upload snapshots a live browser FileList', () => {
  it('retains every original File before clearing and merges the batch into graph edits made between its reads', async () => {
    const first = file('first.png'),
      second = file('second.png');
    const canvas = page();
    const task = canvas.start(liveFileList([first, second]));
    expect(readers).toHaveLength(1);
    expect(readers[0].file).toBe(first);
    act(() => {
      canvas.result.current.actions.update('original', { text: '首张读取中的新内容' });
      canvas.result.current.setEdges([{ id: 'during-first', source: 'original', target: 'other' }]);
    });
    await finish(0);
    expect(readers).toHaveLength(2);
    expect(readers[1].file).toBe(second);
    expect(canvas.result.current.nodes).toHaveLength(1);
    expect(canvas.callbacks.record).not.toHaveBeenCalled();
    const newNode = { id: 'during-second', type: 'text', data: { text: '第二次读取中的新增节点' } };
    const latestEdge = { id: 'during-second-edge', source: 'original', target: 'during-second' };
    act(() => {
      canvas.result.current.actions.update('original', { text: '第二张读取中的最终内容' });
      canvas.result.current.setNodes((nodes) => [...nodes, newNode]);
      canvas.result.current.setEdges((edges) => [...edges, latestEdge]);
    });
    await finish(1);
    await act(async () => task);
    const { nodes, edges, selected } = canvas.result.current;
    expect(nodes.map((node) => node.id).slice(0, 2)).toEqual(['original', 'during-second']);
    expect(nodes[0].data.text).toBe('第二张读取中的最终内容');
    expect(nodes[1]).toBe(newNode);
    const added = nodes.slice(2);
    expect(added.map((node) => node.data.name)).toEqual(['first.png', 'second.png']);
    expect(added.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 370, y: 0 },
    ]);
    expect(added.map((node) => node.resourceMeta.items[0])).toEqual(
      [first, second].map((item) => ({
        kind: 'image',
        sourceUrl: `data:image/png;base64,${btoa(item.name)}`,
        byteSize: item.size,
        extension: 'png',
        mimeType: item.type,
      })),
    );
    expect(edges.map((edge) => edge.id)).toEqual(['during-first', 'during-second-edge']);
    expect(edges[1]).toBe(latestEdge);
    expect(selected).toEqual(added.map((node) => node.id));
    expect(canvas.callbacks.record).toHaveBeenCalledOnce();
    expect(canvas.histories[0].nodes.map((node) => node.id)).toEqual(['original', 'during-second']);
    expect(canvas.histories[0].edges).toBe(edges);
    expect(canvas.callbacks.notify).not.toHaveBeenCalled();
  });

  it('continues with the retained second File after the first read fails, accepting only the successful node once', async () => {
    const first = file('broken.png'),
      second = file('good.png');
    const canvas = page();
    const task = canvas.start(liveFileList([first, second]));
    await finish(0, true);
    expect(readers).toHaveLength(2);
    expect(readers[1].file).toBe(second);
    expect(canvas.callbacks.notify).toHaveBeenCalledOnce();
    expect(canvas.callbacks.notify).toHaveBeenCalledWith('broken.png：读取失败，请重新选择文件');
    await finish(1);
    await act(async () => task);
    const { nodes, selected } = canvas.result.current;
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toBe(canvas.original);
    expect(nodes[1]).toMatchObject({
      type: 'image',
      position: { x: 0, y: 0 },
      data: { name: 'good.png', localMediaReady: true },
    });
    expect(selected).toEqual([nodes[1].id]);
    expect(canvas.callbacks.record).toHaveBeenCalledOnce();
    expect(canvas.histories[0].nodes).toEqual([canvas.original]);
  });

  it('can reselect the same File objects using a new live FileList, with one history entry per complete batch and distinct new nodes', async () => {
    const first = file('same-first.png'),
      second = file('same-second.png');
    const canvas = page();
    const batchOne = canvas.start(liveFileList([first, second]));
    await finish(0);
    await finish(1);
    await act(async () => batchOne);
    const firstBatch = canvas.result.current.nodes.slice(1);
    expect(canvas.callbacks.record).toHaveBeenCalledTimes(1);
    const batchTwo = canvas.start(liveFileList([first, second]));
    await finish(2);
    await finish(3);
    await act(async () => batchTwo);
    expect(readers.map((reader) => reader.file)).toEqual([first, second, first, second]);
    expect(readers[0].file).toBe(readers[2].file);
    expect(readers[1].file).toBe(readers[3].file);
    const { nodes, selected } = canvas.result.current;
    expect(nodes.slice(1).map((node) => node.data.name)).toEqual([
      'same-first.png',
      'same-second.png',
      'same-first.png',
      'same-second.png',
    ]);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(5);
    expect(nodes.slice(1, 3)).toEqual(firstBatch);
    expect(selected).toEqual(nodes.slice(3).map((node) => node.id));
    expect(canvas.callbacks.record).toHaveBeenCalledTimes(2);
    expect(canvas.histories.map((entry) => entry.nodes.length)).toEqual([1, 3]);
    expect(canvas.callbacks.notify).not.toHaveBeenCalled();
  });
});
