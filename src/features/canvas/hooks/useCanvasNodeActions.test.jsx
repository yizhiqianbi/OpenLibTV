import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasNodeActions } from './useCanvasNodeActions.js';
import { readCanvasUploadNode } from '../domain/uploads.js';

vi.mock('../domain/uploads.js', () => ({ readCanvasUploadNode: vi.fn() }));
const original = { id: 'same-id', type: 'text', data: { text: '原文' } };
function mount({
  commitGraph: commitOverride,
  models = null,
  initialNodes = [original],
  initialEdges = [],
} = {}) {
  const callbacks = {
    record: vi.fn(),
    setSaved: vi.fn(),
    setSelected: vi.fn(),
    setPanel: vi.fn(),
    setMenu: vi.fn(),
    setLinking: vi.fn(),
    setLinkPoint: vi.fn(),
    notify: vi.fn(),
  };
  const page = renderHook(
    (permissions) => {
      const [nodes, setNodes] = useState(initialNodes);
      const [edges, setEdges] = useState(initialEdges);
      const currentDocument = useRef(null);
      currentDocument.current = {
        documentKey: permissions.documentKey,
        ready: permissions.ready,
        readonly: permissions.readonly,
        nodes,
        edges,
        models,
      };
      const actions = useCanvasNodeActions({
        ...permissions,
        ...callbacks,
        nodes,
        edges,
        setNodes,
        setEdges,
        currentDocument,
        commitGraph:
          commitOverride ||
          ((next) => {
            setNodes(next.nodes);
            setEdges(next.edges);
            return true;
          }),
        getNodeIncarnation: () => null,
        models,
        linking: 'same-id',
      });
      return { actions, nodes, edges, setNodes, setEdges };
    },
    { initialProps: { documentKey: 'first', ready: true, readonly: false } },
  );
  return { ...page, callbacks };
}
beforeEach(() => {
  vi.mocked(readCanvasUploadNode).mockReset();
});

describe('node command document ownership', () => {
  it('materializes stable typed and mixed media order before reporting the local service boundary', () => {
    const sourceA = {
        id: 'source-a',
        type: 'image',
        data: { type: 'image', url: ['/a.png'], name: 'A' },
      },
      sourceB = {
        id: 'source-b',
        type: 'image',
        data: { type: 'image', url: ['/b.png'], name: 'B' },
      },
      target = {
        id: 'target',
        type: 'video',
        data: {
          type: 'video',
          params: { model: 'demo', modeType: 'image2video', prompt: '生成' },
        },
      },
      models = {
        default: { video: 'demo' },
        videoModels: {
          demo: {
            properties: { modeType: { items: { image2video: [0, 4], text2video: [0, 4] } } },
            config: { textModes: ['image2video', 'text2video'] },
            rules: [],
          },
        },
      },
      page = mount({
        models,
        initialNodes: [sourceA, sourceB, target],
        initialEdges: [
          { id: 'edge-b', source: 'source-b', target: 'target' },
          { id: 'edge-a', source: 'source-a', target: 'target' },
        ],
      });
    act(() => page.result.current.actions.generateNode('target'));
    const saved = page.result.current.nodes.find((node) => node.id === 'target');
    expect(saved.data.params.imageList.map((ref) => ref.nodeId)).toEqual(['source-b', 'source-a']);
    expect(saved.data.params.imageListOrder).toEqual(['source-b', 'source-a']);
    expect(saved.data.generationError).toBe('生成服务未连接，提示词已保留。');
  });

  it('merges a late file into current edits and retains connections made during reading', async () => {
    let finish;
    vi.mocked(readCanvasUploadNode).mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );
    const page = mount();
    let task;
    act(() => {
      task = page.result.current.actions.upload([new File(['bytes'], 'image.png')]);
    });
    act(() => {
      page.result.current.actions.update('same-id', { text: '读取期间编辑' });
      page.result.current.setEdges([{ id: 'during-read', source: 'same-id', target: 'other' }]);
    });
    await act(async () => {
      finish({ id: 'uploaded', type: 'image', data: { url: ['image.png'] } });
      await task;
    });
    expect(page.result.current.nodes.map((node) => node.id)).toEqual(['same-id', 'uploaded']);
    expect(page.result.current.nodes[0].data.text).toBe('读取期间编辑');
    expect(page.result.current.edges[0].id).toBe('during-read');
    expect(page.callbacks.record).toHaveBeenCalledOnce();
  });

  it('uploads only video/audio drops and connects the new media to the target clip in one history step', async () => {
    vi.mocked(readCanvasUploadNode).mockImplementation((file) =>
      Promise.resolve({
        id: `uploaded-${file.name}`,
        type: file.type.startsWith('audio/') ? 'audio' : 'video',
        data: {
          type: file.type.startsWith('audio/') ? 'audio' : 'video',
          url: [`data:${file.name}`],
          localMediaReady: true,
        },
      }),
    );
    const page = mount();
    act(() =>
      page.result.current.setNodes([
        original,
        {
          id: 'clip',
          type: 'video-clip',
          data: { type: 'video-clip', clipTimelineData: { clips: [] } },
        },
      ]),
    );
    const video = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const audio = new File(['a'], 'voice.mp3', { type: 'audio/mpeg' });
    const image = new File(['i'], 'poster.png', { type: 'image/png' });
    await act(async () => {
      await page.result.current.actions.uploadClipFiles([video, audio, image], {
        targetId: 'clip',
        isCurrent: () => true,
      });
    });
    expect(vi.mocked(readCanvasUploadNode).mock.calls.map(([file]) => file.name)).toEqual([
      'clip.mp4',
      'voice.mp3',
    ]);
    expect(page.result.current.nodes.map((node) => node.id)).toEqual([
      'same-id',
      'clip',
      'uploaded-clip.mp4',
      'uploaded-voice.mp3',
    ]);
    expect(page.result.current.edges).toEqual([
      { id: expect.any(String), source: 'uploaded-clip.mp4', target: 'clip' },
      { id: expect.any(String), source: 'uploaded-voice.mp3', target: 'clip' },
    ]);
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.setSelected).toHaveBeenCalledWith(['clip']);
  });

  it('passes the target world position to clip uploads when the target is nested in groups', async () => {
    vi.mocked(readCanvasUploadNode).mockImplementation((file, options) => {
      expect(options.position).toEqual({ x: 150, y: 95 });
      return Promise.resolve({
        id: 'uploaded-video',
        type: 'video',
        data: { type: 'video', url: ['data:video'], localMediaReady: true },
      });
    });
    const page = mount();
    act(() =>
      page.result.current.setNodes([
        { id: 'group', type: 'group', position: { x: 100, y: 50 }, data: {} },
        {
          id: 'clip',
          type: 'video-clip',
          parentId: 'group',
          position: { x: 50, y: 45 },
          data: { type: 'video-clip', clipTimelineData: { clips: [] } },
        },
      ]),
    );
    await act(async () => {
      await page.result.current.actions.uploadClipFiles(
        [new File(['v'], 'clip.mp4', { type: 'video/mp4' })],
        { targetId: 'clip', isCurrent: () => true },
      );
    });
    expect(page.result.current.nodes.at(-1).id).toBe('uploaded-video');
  });

  it('reserves incoming video sources that have no hydrated timeline clip yet', async () => {
    vi.mocked(readCanvasUploadNode).mockResolvedValue({
      id: 'uploaded-video',
      type: 'video',
      data: { type: 'video', url: ['data:video'], localMediaReady: true },
    });
    const page = mount();
    act(() =>
      page.result.current.setNodes([
        {
          id: 'clip',
          type: 'video-clip',
          data: {
            type: 'video-clip',
            clipTimelineData: {
              clips: Array.from({ length: 29 }, (_, index) => ({
                id: `clip-${index}`,
                type: 'video',
                sourceNodeId: `hydrated-${index}`,
              })),
              videoSourceNodeIds: ['pending-source'],
            },
          },
        },
        {
          id: 'pending-source',
          type: 'video',
          data: { type: 'video', url: ['/pending.mp4'], localMediaReady: true },
        },
      ]),
    );
    const result = await act(async () =>
      page.result.current.actions.uploadClipFiles(
        [new File(['v'], 'clip.mp4', { type: 'video/mp4' })],
        { targetId: 'clip', isCurrent: () => true },
      ),
    );
    expect(result).toEqual([]);
    expect(page.result.current.nodes.map((node) => node.id)).toEqual(['clip', 'pending-source']);
    expect(page.callbacks.notify).toHaveBeenCalledWith('时间轴最多支持 30 个视频片段');
  });

  it('drops the whole batch when the graph CAS fails after reading', async () => {
    vi.mocked(readCanvasUploadNode).mockResolvedValue({
      id: 'uploaded-video',
      type: 'video',
      data: { type: 'video', url: ['data:video'], localMediaReady: true },
    });
    const commitGraph = vi.fn(() => false);
    const page = mount({ commitGraph });
    act(() =>
      page.result.current.setNodes([
        {
          id: 'clip',
          type: 'video-clip',
          data: { type: 'video-clip', clipTimelineData: { clips: [] } },
        },
      ]),
    );
    const result = await act(async () =>
      page.result.current.actions.uploadClipFiles(
        [new File(['v'], 'clip.mp4', { type: 'video/mp4' })],
        { targetId: 'clip', isCurrent: () => true },
      ),
    );
    expect(result).toEqual([]);
    expect(commitGraph).toHaveBeenCalledTimes(1);
    expect(page.result.current.nodes).toEqual([
      {
        id: 'clip',
        type: 'video-clip',
        data: { type: 'video-clip', clipTimelineData: { clips: [] } },
      },
    ]);
    expect(page.result.current.edges).toEqual([]);
    expect(page.callbacks.setSelected).not.toHaveBeenCalledWith(['clip']);
  });

  it.each([
    ['document change', { documentKey: 'second', ready: true, readonly: false }],
    ['readonly change', { documentKey: 'first', ready: true, readonly: true }],
    ['loading change', { documentKey: 'first', ready: false, readonly: false }],
  ])('cancels an upload on %s even if its reader completes late', async (_, permissions) => {
    let finish, signal;
    vi.mocked(readCanvasUploadNode).mockImplementation(
      (file, options) =>
        new Promise((resolve) => {
          signal = options.signal;
          finish = resolve;
        }),
    );
    const page = mount();
    let task;
    act(() => {
      task = page.result.current.actions.upload([new File(['bytes'], 'image.png')]);
    });
    page.rerender(permissions);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      finish({ id: 'late', data: {} });
      await task;
    });
    expect(page.result.current.nodes).toEqual([original]);
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.setSelected).not.toHaveBeenCalled();
    expect(page.callbacks.notify).not.toHaveBeenCalled();
  });

  it('rejects retained commands from an old document when the next one reuses node IDs', () => {
    const page = mount();
    const retained = page.result.current.actions;
    page.rerender({ documentKey: 'second', ready: true, readonly: false });
    act(() => {
      retained.update('same-id', { text: '旧操作' });
      retained.change([]);
      retained.connect('other');
      retained.generateNode('same-id', {}, '旧提示词');
    });
    expect(page.result.current.nodes).toEqual([original]);
    expect(page.result.current.edges).toEqual([]);
    expect(page.callbacks.record).not.toHaveBeenCalled();
    expect(page.callbacks.notify).not.toHaveBeenCalled();
  });
});
