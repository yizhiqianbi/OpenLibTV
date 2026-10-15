import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import { createCanvasScriptNode } from './script-model.js';
import { useScriptV2ReferenceImport } from './useScriptV2ReferenceImport.js';

const file = (name = '参考.png') => new File([name], name, { type: 'image/png' });
const dataUrl = (name = 'a') => `data:image/png;base64,${name}`;
const asset = (id, url = `/${id}.png`) => ({
  id,
  name: id,
  assetData: JSON.stringify({ items: [{ data: { type: 'image', name: id, url: [url] } }] }),
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function graph(documentKey = 'doc') {
  const node = createCanvasScriptNode({ id: 'script', position: { x: 900, y: 400 } });
  node.data.params = { prompt: '原剧情', model: 'aurora-3-prime' };
  return { documentKey, nodes: [node], edges: [], models, ready: true, readonly: false };
}
function harness(overrides = {}) {
  let raw = graph();
  const history = [];
  const props = {
    documentKey: 'doc',
    nodes: raw.nodes,
    edges: raw.edges,
    ready: true,
    readonly: false,
    supportContent: { data: support, loading: false, error: null },
    getDocument: () => raw,
    readFile: vi.fn(async (value) => dataUrl(value.name)),
    commitGraph: vi.fn((next, { expectedGraph }) => {
      if (
        raw.nodes !== expectedGraph.nodes ||
        raw.edges !== expectedGraph.edges ||
        raw.models !== expectedGraph.models ||
        raw.documentKey !== expectedGraph.documentKey ||
        !raw.ready ||
        raw.readonly
      )
        return false;
      history.push(raw);
      raw = next;
      return true;
    }),
    flushGraph: vi.fn(() => true),
    notify: vi.fn(),
    enterPickMode: vi.fn(() => true),
    ...overrides,
  };
  let currentProps = props;
  const page = renderHook((value) => useScriptV2ReferenceImport(value), { initialProps: props });
  const call = (fn) => {
    let result;
    act(() => {
      result = fn(page.result.current);
    });
    return result;
  };
  const invoke = async (fn) => {
    let result;
    await act(async () => {
      try {
        result = await fn(page.result.current);
      } catch (error) {
        result = error;
      }
    });
    return result;
  };
  const settle = async (fn = () => {}) => {
    await act(async () => {
      fn();
      await Promise.resolve();
    });
  };
  const start = (files) => {
    expect(call((api) => api.open('script', 'upload'))).toBe(true);
    expect(call((api) => api.addFiles(files))).toBe(true);
  };
  return {
    ...page,
    props,
    history,
    call,
    invoke,
    settle,
    start,
    raw: () => raw,
    publish: (next) => {
      raw = next;
    },
    refresh: (patch = {}) => {
      currentProps = {
        ...currentProps,
        nodes: raw.nodes,
        edges: raw.edges,
        ready: raw.ready,
        readonly: raw.readonly,
        ...patch,
      };
      page.rerender(currentProps);
    },
  };
}

describe('ScriptV2 reference import current graph and accepted save', () => {
  it('requires an explicit fresh target action; mounting does not read, save or mutate a graph', () => {
    const owner = harness();
    expect(owner.result.current.state).toMatchObject({ reading: false, errors: [] });
    expect(owner.call((api) => api.addFiles([file()]))).toBe(false);
    expect(owner.call((api) => api.open('missing', 'upload'))).toBe(false);
    expect(owner.call((api) => api.open('script', 'unknown'))).toBe(false);
    expect(owner.props.readFile).not.toHaveBeenCalled();
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
    expect(owner.props.flushGraph).not.toHaveBeenCalled();
  });

  it('reads fresh positions and graph edits after awaiting a file, preserving immutable prompt edits', async () => {
    const pending = deferred(),
      owner = harness({ readFile: vi.fn(() => pending.promise) });
    owner.start([file()]);
    expect(owner.result.current.state.reading).toBe(true);
    const initial = owner.raw();
    const params = { ...initial.nodes[0].data.params, prompt: '读取期间改好的剧情' };
    const current = {
      ...initial,
      nodes: [
        {
          ...initial.nodes[0],
          position: { x: 1500, y: 40 },
          data: { ...initial.nodes[0].data, params },
        },
        {
          id: 'text',
          type: 'text',
          data: { type: 'text', text: '保留文本' },
          position: { x: 0, y: 0 },
        },
      ],
      edges: [{ id: 'text-edge', source: 'text', target: 'script' }],
    };
    owner.publish(current);
    owner.refresh();
    expect(owner.props.readFile.mock.calls[0][1].signal.aborted).toBe(false);
    await owner.settle(() => pending.resolve(dataUrl()));
    const image = owner.raw().nodes.find((node) => node.type === 'image');
    expect(image.position).toEqual({ x: 1070, y: 40 });
    expect(image.data).toMatchObject({
      localMediaReady: true,
      url: [dataUrl()],
      resourceMeta: { name: '参考.png', mimeType: 'image/png', size: file().size, url: dataUrl() },
    });
    expect(owner.raw().nodes.find((node) => node.id === 'text')).toBe(current.nodes[1]);
    expect(owner.raw().nodes.find((node) => node.id === 'script').data.params.prompt).toBe(
      params.prompt,
    );
    expect(owner.raw().edges[0]).toBe(current.edges[0]);
    expect(owner.history).toEqual([current]);
    expect(owner.props.commitGraph.mock.calls[0][1].expectedGraph).toBe(current);
    expect(owner.props.flushGraph).toHaveBeenCalledExactlyOnceWith(owner.raw());
    expect(owner.result.current.state.reading).toBe(false);
    expect(owner.result.current.state.errors).toEqual([]);
  });

  it('projects drafts before planning but uses raw CAS and preserves the concurrent raw graph if rejected', async () => {
    const pending = deferred();
    let owner;
    owner = harness({
      readFile: vi.fn(() => pending.promise),
      projectGraph: (raw) => {
        owner.publish({
          ...raw,
          nodes: raw.nodes.map((node) => ({ ...node, position: { x: 70, y: 80 } })),
        });
        return {
          ...raw,
          nodes: raw.nodes.map((node) => ({
            ...node,
            data: { ...node.data, params: { prompt: '草稿' } },
          })),
        };
      },
    });
    owner.start([file()]);
    await owner.settle(() => pending.resolve(dataUrl()));
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
    expect(owner.raw().nodes).toHaveLength(1);
    expect(owner.raw().nodes[0].position).toEqual({ x: 70, y: 80 });
    expect(owner.history).toHaveLength(0);
    expect(owner.props.flushGraph).not.toHaveBeenCalled();
    expect(owner.result.current.state.errors).toHaveLength(1);
  });

  it('retries only failed files and keeps accepted successes without duplicate nodes or edges', async () => {
    const readFile = vi.fn(async (value) => {
      if (
        value.name === 'b.png' &&
        readFile.mock.calls.filter(([entry]) => entry.name === 'b.png').length === 1
      )
        throw new Error('读取失败');
      return dataUrl(value.name);
    });
    const owner = harness({ readFile });
    owner.start([file('a.png'), file('b.png'), file('c.png')]);
    await owner.settle();
    expect(owner.raw().nodes).toHaveLength(3);
    expect(owner.raw().edges).toHaveLength(2);
    expect(owner.result.current.state.errors).toHaveLength(1);
    const ids = owner.raw().nodes.map((node) => node.id);
    expect(await owner.invoke((api) => api.retry())).toBe(true);
    expect(owner.raw().nodes).toHaveLength(4);
    expect(owner.raw().edges).toHaveLength(3);
    expect(new Set(owner.raw().nodes.map((node) => node.id)).size).toBe(4);
    expect(owner.raw().nodes.filter((node) => ids.includes(node.id))).toHaveLength(3);
    expect(readFile.mock.calls.map(([value]) => value.name)).toEqual([
      'a.png',
      'b.png',
      'c.png',
      'b.png',
    ]);
    expect(owner.history).toHaveLength(2);
    expect(owner.result.current.state.errors).toEqual([]);
  });

  it('retains a quota-failed accepted graph and neither retrying the reader nor header save repeats import', async () => {
    const owner = harness({ flushGraph: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    owner.start([file()]);
    await owner.settle();
    const accepted = owner.raw();
    expect(accepted.nodes).toHaveLength(2);
    expect(owner.history).toHaveLength(1);
    expect(owner.props.notify).toHaveBeenCalledWith(
      '参考图已保留，本机保存失败，请从顶部重试保存画布',
    );
    expect(await owner.invoke((api) => api.retry())).toBe(true);
    expect(owner.raw()).toBe(accepted);
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
    expect(owner.props.readFile).toHaveBeenCalledTimes(1);
    expect(owner.props.flushGraph).toHaveBeenCalledTimes(1);
    expect(owner.props.flushGraph(owner.raw())).toBe(true);
    expect(owner.raw()).toBe(accepted);
    expect(owner.history).toHaveLength(1);
  });

  it('can accept another same-target batch while the first file is being read without dropping its queue', async () => {
    const pending = deferred(),
      owner = harness({
        readFile: vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(dataUrl('b')),
      });
    owner.start([file('a.png')]);
    owner.start([file('b.png')]);
    await owner.settle(() => pending.resolve(dataUrl('a')));
    expect(owner.props.readFile.mock.calls.map(([entry]) => entry.name)).toEqual([
      'a.png',
      'b.png',
    ]);
    expect(
      owner
        .raw()
        .nodes.filter((node) => node.type === 'image')
        .map((node) => node.data.name),
    ).toEqual(['b.png', 'a.png']);
    expect(owner.history).toHaveLength(1);
    expect(owner.raw().edges).toHaveLength(2);
  });

  it('does not read rejected types or oversized files and leaves successful images accepted', async () => {
    const oversized = { name: 'huge.png', type: 'image/png', size: 30 * 1024 * 1024 + 1 },
      owner = harness();
    owner.start([new File(['x'], 'video.mp4', { type: 'video/mp4' }), oversized, file()]);
    await owner.settle();
    expect(owner.props.readFile).toHaveBeenCalledTimes(1);
    expect(owner.result.current.state.errors).toHaveLength(2);
    expect(owner.raw().nodes).toHaveLength(2);
    expect(owner.raw().edges).toHaveLength(1);
  });

  it.each(['blob:pending', '/not-a-read.png'])(
    'rejects non-data reader output %s without marking it locally ready',
    async (url) => {
      const owner = harness({ readFile: vi.fn(async () => url) });
      owner.start([file()]);
      await owner.settle();
      expect(owner.raw().nodes).toHaveLength(1);
      expect(owner.props.commitGraph).not.toHaveBeenCalled();
      expect(owner.result.current.state.errors).toHaveLength(1);
    },
  );
});

describe('ScriptV2 reference continuation ownership', () => {
  it.each(['readonly', 'not-ready', 'deleted', 'generating', 'wrong-type'])(
    'aborts and ignores delayed completion after %s target transition',
    async (transition) => {
      const pending = deferred(),
        owner = harness({ readFile: vi.fn(() => pending.promise) });
      owner.start([file()]);
      const old = owner.raw();
      if (transition === 'readonly') owner.publish({ ...old, readonly: true });
      if (transition === 'not-ready') owner.publish({ ...old, ready: false });
      if (transition === 'deleted') owner.publish({ ...old, nodes: [] });
      if (transition === 'generating')
        owner.publish({
          ...old,
          nodes: old.nodes.map((node) => ({
            ...node,
            data: { ...node.data, taskInfo: { loading: true, status: 1 } },
          })),
        });
      if (transition === 'wrong-type')
        owner.publish({
          ...old,
          nodes: old.nodes.map((node) => ({ ...node, type: 'text', data: { type: 'text' } })),
        });
      owner.refresh();
      expect(owner.props.readFile.mock.calls[0][1].signal.aborted).toBe(true);
      await owner.settle(() => pending.resolve(dataUrl()));
      expect(owner.props.commitGraph).not.toHaveBeenCalled();
      expect(owner.props.flushGraph).not.toHaveBeenCalled();
      expect(owner.result.current.state).toMatchObject({ reading: false, errors: [] });
    },
  );

  it('retires a deleted target before reusing the same ID and does not import an old read into its replacement', async () => {
    const pending = deferred(),
      owner = harness({ readFile: vi.fn(() => pending.promise) });
    owner.start([file()]);
    owner.publish({ ...owner.raw(), nodes: [] });
    owner.refresh();
    expect(owner.props.readFile.mock.calls[0][1].signal.aborted).toBe(true);
    const replacement = graph();
    owner.publish(replacement);
    owner.refresh();
    await owner.settle(() => pending.resolve(dataUrl()));
    expect(owner.raw()).toBe(replacement);
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
  });

  it('isolates document A → B → A even when IDs and keys are restored', async () => {
    const pending = deferred(),
      owner = harness({ readFile: vi.fn(() => pending.promise) });
    owner.start([file()]);
    owner.publish(graph('B'));
    owner.refresh({ documentKey: 'B' });
    expect(owner.props.readFile.mock.calls[0][1].signal.aborted).toBe(true);
    const returned = graph();
    owner.publish(returned);
    owner.refresh({ documentKey: 'doc' });
    await owner.settle(() => pending.resolve(dataUrl()));
    expect(owner.raw()).toBe(returned);
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
    expect(owner.result.current.state).toMatchObject({ reading: false, errors: [] });
  });

  it.each(['dismiss', 'unmount'])(
    'cancels reader on %s and ignores an uncooperative late reader',
    async (action) => {
      const pending = deferred(),
        owner = harness({ readFile: vi.fn(() => pending.promise) });
      owner.start([file()]);
      if (action === 'dismiss') owner.call((api) => api.dismiss());
      else owner.unmount();
      expect(owner.props.readFile.mock.calls[0][1].signal.aborted).toBe(true);
      await owner.settle(() => pending.resolve(dataUrl()));
      expect(owner.props.commitGraph).not.toHaveBeenCalled();
      expect(owner.props.flushGraph).not.toHaveBeenCalled();
    },
  );

  it('does not retarget a native file callback to a different active script', async () => {
    const owner = harness();
    const second = createCanvasScriptNode({ id: 'second', position: { x: 1700, y: 10 } });
    owner.publish({ ...owner.raw(), nodes: [...owner.raw().nodes, second] });
    owner.refresh();
    expect(owner.call((api) => api.open('script', 'upload'))).toBe(true);
    owner.refresh({ activeNodeId: 'second' });
    expect(owner.call((api) => api.addFiles([file()]))).toBe(true);
    await owner.settle();
    expect(owner.raw().edges).toHaveLength(1);
    expect(owner.raw().edges[0].target).toBe('script');
    expect(owner.raw().nodes.find((node) => node.id === 'second')).toBe(second);
  });

  it('rejects a stale native-file callback from a retired document owner', () => {
    const owner = harness();
    expect(owner.call((api) => api.open('script', 'upload'))).toBe(true);
    const oldCallback = owner.result.current.addFiles;
    owner.publish(graph('B'));
    owner.refresh({ documentKey: 'B' });
    expect(owner.call(() => oldCallback([file()]))).toBe(false);
    expect(owner.props.readFile).not.toHaveBeenCalled();
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
  });

  it('uses the local canvas actor without an auth/profile prerequisite and lets canvas picking keep its own source lifecycle', async () => {
    const owner = harness({ actor: { kind: 'local' }, profile: null });
    expect(owner.call((api) => api.open('script', 'canvas'))).toBe(true);
    expect(owner.props.enterPickMode).toHaveBeenCalledExactlyOnceWith('script');
    owner.start([file()]);
    await owner.settle();
    expect(owner.raw().edges).toHaveLength(1);
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
  });
});

describe('ScriptV2 local asset picker import', () => {
  it('finds the first usable IMAGE across v2 items and discards asset generation/proof fields', async () => {
    const owner = harness(),
      item = {
        id: 'multi',
        name: '外层名字',
        assetData: JSON.stringify({
          version: 2,
          items: [
            { data: { type: 'video', url: ['/clip.mp4'] } },
            { data: { type: 'image', url: ['', ' '], name: '空图' } },
            {
              data: {
                type: 'image',
                url: [' ', '/actual.png'],
                name: '原图',
                params: { prompt: '不要复制' },
                portraitProof: '旧证明',
              },
            },
            { data: { type: 'image', url: ['/later.png'] } },
          ],
        }),
      };
    expect(owner.result.current.isAssetDisabled(item)).toBe(false);
    expect(owner.call((api) => api.open('script', 'assets'))).toBe(true);
    const result = await owner.invoke((api) => api.pickAssets([item]));
    expect(result).toMatchObject({ valid: true, added: 1 });
    const image = owner.raw().nodes[0];
    expect(image.data).toEqual({
      type: 'image',
      name: '原图',
      alt: '原图',
      url: ['/actual.png'],
      action: 'image_resource',
      showGenerator: true,
    });
    expect(image.data).not.toHaveProperty('localMediaReady');
    expect(owner.result.current.picker).toBe(null);
  });

  it('adapts a canonical local image row without assetData but never synthesizes a video or cover reference', async () => {
    const owner = harness(),
      local = { id: 'local', name: '本机资产', mediaType: 'image', url: dataUrl() };
    expect(owner.result.current.isAssetDisabled(local)).toBe(false);
    expect(
      owner.result.current.isAssetDisabled({ id: 'video', mediaType: 'video', url: '/v.mp4' }),
    ).toBeTruthy();
    expect(
      owner.result.current.isAssetDisabled({ id: 'cover', coverUrl: '/cover.png' }),
    ).toBeTruthy();
    owner.call((api) => api.open('script', 'assets'));
    expect(await owner.invoke((api) => api.pickAssets([local]))).toMatchObject({ added: 1 });
    expect(owner.raw().nodes[0].data.url).toEqual([dataUrl()]);
    expect(owner.raw().nodes[0].data).not.toHaveProperty('localMediaReady');
  });

  it('keeps partial selection open, filters already imported IDs on retry and invokes completion once', async () => {
    const owner = harness(),
      onComplete = vi.fn(),
      a = asset('a'),
      c = asset('c'),
      invalid = { id: 'b', name: '坏图', assetData: '{bad' };
    owner.call((api) => api.open('script', 'assets', { onComplete }));
    expect(await owner.invoke((api) => api.pickAssets([a, invalid, c]))).toBeInstanceOf(Error);
    expect(owner.raw().nodes).toHaveLength(3);
    expect(owner.raw().edges).toHaveLength(2);
    expect(owner.result.current.picker).not.toBe(null);
    expect(onComplete).not.toHaveBeenCalled();
    const imported = owner
      .raw()
      .nodes.filter((node) => node.type === 'image')
      .map((node) => node.id);
    expect(await owner.invoke((api) => api.pickAssets([a, asset('b'), c]))).toMatchObject({
      added: 1,
    });
    expect(owner.raw().nodes).toHaveLength(4);
    expect(owner.raw().edges).toHaveLength(3);
    expect(owner.raw().nodes.filter((node) => imported.includes(node.id))).toHaveLength(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(owner.history).toHaveLength(2);
    expect(owner.result.current.picker).toBe(null);
  });

  it('keeps an entirely invalid selection open without mutating a graph and accepts a fresh corrected selection', async () => {
    const owner = harness(),
      raw = owner.raw();
    owner.call((api) => api.open('script', 'assets'));
    const result = await owner.invoke((api) => api.pickAssets([{ id: 'bad', data: 'bad' }]));
    expect(result).toBeInstanceOf(Error);
    expect(owner.raw()).toBe(raw);
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
    expect(owner.result.current.picker).not.toBe(null);
    expect(await owner.invoke((api) => api.pickAssets([asset('good')]))).toMatchObject({
      added: 1,
    });
  });

  it('rejects asset callbacks after cancel or a document transition without graph or completion effects', async () => {
    const owner = harness(),
      onComplete = vi.fn();
    owner.call((api) => api.open('script', 'assets', { onComplete }));
    const oldCallback = owner.result.current.pickAssets;
    owner.call((api) => api.closePicker());
    expect(await owner.invoke(() => oldCallback([asset('a')]))).toBeInstanceOf(Error);
    owner.call((api) => api.open('script', 'assets', { onComplete }));
    owner.publish(graph('B'));
    owner.refresh({ documentKey: 'B' });
    expect(await owner.invoke(() => oldCallback([asset('a')]))).toBeInstanceOf(Error);
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not run a queued successful completion in the next document', async () => {
    const owner = harness(),
      onComplete = vi.fn();
    owner.call((api) => api.open('script', 'assets', { onComplete }));
    let completed;
    act(() => {
      completed = owner.result.current.pickAssets([asset('a')]);
      owner.publish(graph('B'));
      owner.refresh({ documentKey: 'B' });
    });
    await owner.settle();
    expect(await completed).toMatchObject({ added: 1 });
    expect(owner.raw().documentKey).toBe('B');
    expect(owner.raw().nodes).toHaveLength(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
