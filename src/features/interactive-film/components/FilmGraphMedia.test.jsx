import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FilmGraph from './FilmGraph.jsx';
import FilmNodePreview from './FilmNodePreview.jsx';
import {
  connectFilmNodes,
  createFilmDocument,
  createFilmNode,
} from '../../../services/interactive-film/document.ts';

const controls = vi.hoisted(() => ({
  pointerOptions: null,
  pointer: {
    begin: vi.fn(),
    move: vi.fn(),
    end: vi.fn(),
    drag: vi.fn(),
    cancel: vi.fn(),
    shouldSuppressClick: vi.fn(() => false),
  },
  touch: { touchMode: false, cancel: vi.fn(), shouldSuppressTouchClick: vi.fn(() => false) },
  mediaUrls: vi.fn(),
}));
vi.mock('../../editor/useGraphPointer.js', () => ({
  useGraphPointer: (options) => {
    controls.pointerOptions = options;
    return controls.pointer;
  },
}));
vi.mock('../../editor/useGraphTouch.js', () => ({ useGraphTouch: () => controls.touch }));
vi.mock('../../editor/useGraphWheel.js', () => ({ useGraphWheel: vi.fn() }));
vi.mock('../../../services/interactive-film/media.ts', () => ({
  createFilmMediaUrls: controls.mediaUrls,
}));

let leases;
beforeEach(() => {
  vi.clearAllMocks();
  leases = [];
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  controls.mediaUrls.mockImplementation(async (media, { signal }) => {
    const lease = {
      urls: Object.fromEntries(media.map((item) => [item.id, `blob:graph-${leases.length}`])),
      dispose: vi.fn(),
      signal,
    };
    leases.push(lease);
    return lease;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function filmFixture(type = 'video') {
  let doc = createFilmDocument('film-graph-media', '媒体画布');
  doc.nodes[0] = { ...doc.nodes[0], id: 'start', title: '开场', position: { x: 0, y: 0 } };
  const play = {
    ...createFilmNode('play', { x: 320, y: 100 }),
    id: 'clip',
    title: '播放片段',
    mediaId: 'asset',
    ...(type === 'video' ? { trimIn: 0.5, trimOut: 2 } : { displaySeconds: 3 }),
  };
  const hotspot = {
    ...createFilmNode('hotspot', { x: 640, y: 100 }),
    id: 'hotspot',
    title: '检查画面',
    region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  };
  doc.nodes.push(play, hotspot);
  doc.media.push({
    id: 'asset',
    name: '真实本机素材',
    type,
    mimeType: type === 'video' ? 'video/mp4' : 'image/png',
    bytes: 1024,
    width: 200,
    height: 100,
    ...(type === 'video' ? { duration: 3 } : {}),
  });
  doc = connectFilmNodes(doc, 'start', 'next', 'clip');
  doc = connectFilmNodes(doc, 'clip', 'next', 'hotspot');
  return { doc, play, hotspot };
}

function renderGraph(doc, extra = {}) {
  const current = { current: doc },
    commit = vi.fn((value) => {
      current.current = typeof value === 'function' ? value(current.current) : value;
      return current.current;
    }),
    record = vi.fn();
  const props = {
    controller: { document: doc, current, commit, record },
    selected: ['clip'],
    setSelected: vi.fn(),
    linking: null,
    setLinking: vi.fn(),
    ...extra,
  };
  return { ...render(<FilmGraph {...props} />), ...props, current, commit, record };
}

describe('film canvas media presentation', () => {
  it('uses stored video URLs and trim metadata with the same body and edge geometry', async () => {
    const { doc } = filmFixture();
    renderGraph(doc);
    const play = screen.getByRole('article', { name: '播放节点 播放片段' });
    const video = await within(play).findByLabelText('真实本机素材缩略画面');
    expect(video.getAttribute('src')).toBe('blob:graph-0');
    expect(video.controls).toBe(true);
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 1 },
      duration: { configurable: true, value: 3 },
    });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0.5);
    expect(play.style.width).toBe('280px');
    expect(play.style.height).toBe('184px');
    expect(play.querySelector('.film-node-title strong').textContent).toBe('播放片段');
    expect(within(play).getByRole('button', { name: '连接到 播放片段' }).style.top).toBe('92px');
    expect(within(play).getByRole('button', { name: '连接 播放片段 继续' }).style.top).toBe('92px');
    expect(
      screen.getByRole('button', { name: '删除跳转 播放片段 到 检查画面' }).getAttribute('d'),
    ).toBe('M600,192 C690,192 550,192 640,192');
    const inherited = screen.getByRole('article', { name: '热点节点 检查画面' });
    const inheritedVideo = await within(inherited).findByLabelText('真实本机素材缩略画面');
    Object.defineProperties(inheritedVideo, {
      readyState: { configurable: true, value: 1 },
      duration: { configurable: true, value: 3 },
    });
    fireEvent.loadedMetadata(inheritedVideo);
    expect(inheritedVideo.currentTime).toBe(2);
    expect(inheritedVideo.controls).toBe(false);
    const ports = within(inherited).getAllByRole('button', { name: /^连接 检查画面/ });
    expect(parseFloat(ports[0].style.top)).toBeCloseTo(184 / 3);
    expect(parseFloat(ports[1].style.top)).toBeCloseTo((184 * 2) / 3);
  });

  it('projects an inherited image and hotspot through its visible contain box without editing references', async () => {
    const { doc, hotspot } = filmFixture('image');
    const before = structuredClone(doc);
    render(<FilmNodePreview document={doc} node={hotspot} selected />);
    const image = await screen.findByRole('img', { name: '真实本机素材' });
    expect(image.parentElement.getAttribute('data-inherited')).toBe('true');
    const region = image.closest('.film-node-content').querySelector('.film-node-hotspot-preview');
    expect(parseFloat(region.style.left)).toBeCloseTo(10);
    expect(parseFloat(region.style.width)).toBeCloseTo(30);
    expect(parseFloat(region.style.top)).toBeCloseTo((50 / 184) * 100);
    expect(parseFloat(region.style.height)).toBeCloseTo((56 / 184) * 100);
    expect(doc).toEqual(before);
    expect(Object.hasOwn(hotspot, 'mediaId')).toBe(false);
  });

  it('leaves ambiguous inherited backgrounds as an explicit state without guessing a media URL', () => {
    let { doc, hotspot } = filmFixture('image');
    const condition = { ...createFilmNode('condition'), id: 'branch' };
    const second = { ...createFilmNode('play'), id: 'second', mediaId: 'other', displaySeconds: 3 };
    doc.nodes.push(condition, second);
    doc.media.push({ ...doc.media[0], id: 'other', name: '另一画面' });
    doc = connectFilmNodes(doc, 'start', 'next', 'branch');
    doc = connectFilmNodes(doc, 'branch', 'yes', 'clip');
    doc = connectFilmNodes(doc, 'branch', 'no', 'second');
    doc = connectFilmNodes(doc, 'second', 'next', 'hotspot');
    render(<FilmNodePreview document={doc} node={hotspot} selected />);
    expect(screen.getByText('画面由剧情路径决定')).toBeTruthy();
    expect(controls.mediaUrls).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('reports a missing stored Blob and retries the same media without a document mutation', async () => {
    const { doc, play } = filmFixture();
    const before = structuredClone(doc);
    controls.mediaUrls.mockRejectedValueOnce(new Error('本机素材不存在，请重新导入'));
    render(<FilmNodePreview document={doc} node={play} selected />);
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('本机素材不存在'),
    );
    fireEvent.click(screen.getByRole('button', { name: '重新读取素材' }));
    const video = await screen.findByLabelText('真实本机素材缩略画面');
    expect(video.getAttribute('src')).toBe('blob:graph-0');
    expect(controls.mediaUrls).toHaveBeenCalledTimes(2);
    expect(controls.mediaUrls.mock.calls[0][1].signal.aborted).toBe(true);
    expect(doc).toEqual(before);
  });

  it('aborts old-document reads, disposes late leases, and releases the displayed media on unmount', async () => {
    const { doc, play } = filmFixture();
    let finish;
    const lateDispose = vi.fn();
    controls.mediaUrls.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const page = render(<FilmNodePreview document={doc} node={play} selected />);
    const oldSignal = controls.mediaUrls.mock.calls[0][1].signal;
    const next = { ...doc, id: 'other-document' };
    page.rerender(<FilmNodePreview document={next} node={play} selected />);
    const video = await screen.findByLabelText('真实本机素材缩略画面');
    expect(oldSignal.aborted).toBe(true);
    await act(async () =>
      finish({ urls: { asset: 'blob:obsolete-document' }, dispose: lateDispose }),
    );
    expect(lateDispose).toHaveBeenCalledOnce();
    expect(video.getAttribute('src')).toBe('blob:graph-0');
    page.unmount();
    expect(leases[0].signal.aborted).toBe(true);
    expect(leases[0].dispose).toHaveBeenCalledOnce();
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.pause).toHaveBeenCalled();
    expect(video.load).toHaveBeenCalled();
  });
});

describe('film canvas tools and pointer adapter', () => {
  it('keeps Canvas tool order, library triggers, keyboard shortcuts, and zoom actions', async () => {
    const { doc } = filmFixture('image');
    const onAddNode = vi.fn(),
      onOpenLibrary = vi.fn(),
      onUpload = vi.fn();
    const page = renderGraph(doc, { onAddNode, onOpenLibrary, onUpload });
    const tools = screen.getByLabelText('画布工具');
    expect(
      within(tools)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      '选择工具',
      '手型工具',
      '添加播放节点',
      '添加选择节点',
      '添加热点节点',
      '添加QTE节点',
      '添加节点',
      '素材库',
      '剧情变量',
      '上传素材',
    ]);
    for (const [name, kind] of [
      ['添加播放节点', 'play'],
      ['添加选择节点', 'choice'],
      ['添加热点节点', 'hotspot'],
      ['添加QTE节点', 'qte'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(onAddNode).toHaveBeenLastCalledWith(kind);
    }
    for (const [name, tab] of [
      ['添加节点', 'nodes'],
      ['素材库', 'media'],
      ['剧情变量', 'variables'],
    ]) {
      const button = screen.getByRole('button', { name, exact: true });
      expect(button.hasAttribute('data-film-library-trigger')).toBe(true);
      fireEvent.click(button);
      expect(onOpenLibrary).toHaveBeenLastCalledWith(tab);
    }
    fireEvent.click(screen.getByRole('button', { name: '上传素材' }));
    expect(onUpload).toHaveBeenCalledOnce();
    const board = screen.getByLabelText('剧情画布');
    board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600 });
    fireEvent.keyDown(board, { key: 'h' });
    expect(screen.getByRole('button', { name: '手型工具' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.keyDown(board, { key: 'v' });
    expect(screen.getByRole('button', { name: '选择工具' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '缩放选项' }));
    fireEvent.click(
      within(screen.getByLabelText('画布缩放')).getByRole('button', { name: '150%' }),
    );
    expect(page.current.current.view.z).toBe(1.5);
    expect(page.commit).toHaveBeenLastCalledWith(expect.any(Function), { history: false });
    expect(screen.queryByLabelText('画布缩放')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '适应全部节点' }));
    expect(page.current.current.view.z).toBeGreaterThan(0);
    await waitFor(() => expect(leases).toHaveLength(2));
  });

  it('keeps one history commit for Alt-copy with internal edges and rejects a stale gesture', () => {
    const { doc } = filmFixture();
    const page = renderGraph(doc);
    const options = controls.pointerOptions;
    expect(options.nodes).toBe(doc.nodes);
    expect(options.record).toBe(page.record);
    expect(
      options.selectIntersectingNodes(doc.nodes, { x: 321, y: 230, width: 10, height: 10 }),
    ).toEqual(['clip']);
    const copied = options.createDragCopy({
      sourceIds: ['clip', 'hotspot'],
      expectedNodes: doc.nodes,
      documentKey: doc.id,
    });
    expect(copied.newAllIds).toHaveLength(2);
    expect(page.commit).toHaveBeenCalledOnce();
    expect(page.current.current.nodes.slice(0, doc.nodes.length)).toEqual(doc.nodes);
    expect(page.current.current.edges).toContainEqual(
      expect.objectContaining({
        source: copied.newAllIds[0],
        sourcePort: 'next',
        target: copied.newAllIds[1],
      }),
    );
    expect(
      options.createDragCopy({
        sourceIds: ['clip'],
        expectedNodes: doc.nodes,
        documentKey: doc.id,
      }),
    ).toBeNull();
    expect(
      options.createDragCopy({
        sourceIds: ['clip'],
        expectedNodes: page.current.current.nodes,
        documentKey: 'other-document',
      }),
    ).toBeNull();
    expect(page.commit).toHaveBeenCalledOnce();
  });
});
