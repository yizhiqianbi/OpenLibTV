import React, { useEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FilmGraph from './FilmGraph.jsx';
import FilmInspector from './FilmInspector.jsx';
import InteractiveFilmPage from '../InteractiveFilmPage.jsx';
import { saveFilmDocument } from '../../../services/interactive-film/repository.ts';
import {
  connectFilmNodes,
  createFilmDocument,
  createFilmNode,
  removeFilmNodes,
  validateFilmDocument,
} from '../../../services/interactive-film/document.ts';

const controls = vi.hoisted(() => ({
  pointer: {
    begin: vi.fn(),
    move: vi.fn(),
    end: vi.fn(),
    drag: vi.fn(),
    cancel: vi.fn(),
    shouldSuppressClick: vi.fn(() => false),
  },
  touch: {
    touchMode: false,
    cancel: vi.fn(),
    shouldSuppressTouchClick: vi.fn(() => false),
  },
  mediaUrls: vi.fn(),
}));
vi.mock('../../editor/useGraphPointer.js', () => ({ useGraphPointer: () => controls.pointer }));
vi.mock('../../editor/useGraphTouch.js', () => ({ useGraphTouch: () => controls.touch }));
vi.mock('../../editor/useGraphWheel.js', () => ({ useGraphWheel: vi.fn() }));
vi.mock('../../../services/interactive-film/media.ts', () => ({
  createFilmMediaUrls: controls.mediaUrls,
}));

let mediaLeases;
beforeEach(() => {
  mediaLeases = [];
  controls.mediaUrls.mockImplementation(async (media, { signal }) => {
    const lease = {
      urls: Object.fromEntries(
        media.map((item) => [item.id, `blob:preview-${mediaLeases.length}`]),
      ),
      dispose: vi.fn(),
      signal,
    };
    mediaLeases.push(lease);
    return lease;
  });
});

function graphDocument() {
  const doc = createFilmDocument('film-editor-test', '编辑器回归');
  doc.nodes[0] = { ...doc.nodes[0], id: 'opening', title: '开场' };
  doc.nodes.push(
    { ...createFilmNode('play'), id: 'clip', title: '播放片段' },
    { ...createFilmNode('ending'), id: 'ending', title: '故事结局' },
  );
  return doc;
}

function renderGraph(initialDocument) {
  const commit = vi.fn(),
    onFocusNode = vi.fn(),
    onWindowKey = vi.fn();
  let snapshot = initialDocument,
    selectedSnapshot;
  function GraphHarness() {
    const [doc, setDoc] = useState(initialDocument),
      [selected, setSelected] = useState(['ending']),
      [linking, setLinking] = useState(null);
    const current = useRef(doc);
    current.current = doc;
    snapshot = doc;
    selectedSnapshot = selected;
    commit.mockImplementation((updater) => {
      const next = typeof updater === 'function' ? updater(current.current) : updater;
      current.current = next;
      setDoc(next);
      return next;
    });
    useEffect(() => {
      const key = (event) => {
        onWindowKey(event.key);
        if (event.key === 'Delete') {
          event.preventDefault();
          commit((previous) => removeFilmNodes(previous, selected));
        }
      };
      window.addEventListener('keydown', key);
      return () => window.removeEventListener('keydown', key);
    }, [selected]);
    return (
      <FilmGraph
        controller={{ document: doc, current, commit, record: vi.fn() }}
        selected={selected}
        setSelected={setSelected}
        linking={linking}
        setLinking={setLinking}
        onFocusNode={onFocusNode}
      />
    );
  }
  const page = render(<GraphHarness />);
  return {
    ...page,
    commit,
    onFocusNode,
    onWindowKey,
    document: () => snapshot,
    selected: () => selectedSnapshot,
  };
}

function pointer(element, type, { x, y, id = 7 }) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'pointerId', { value: id });
  fireEvent(element, event);
  return event;
}
function previewSurface(container) {
  const area = container.querySelector('.film-media-preview');
  let capture;
  area.getBoundingClientRect = () => ({ left: 20, top: 30, width: 200, height: 100 });
  area.setPointerCapture = vi.fn((id) => (capture = id));
  area.hasPointerCapture = vi.fn((id) => capture === id);
  area.releasePointerCapture = vi.fn(() => (capture = undefined));
  return area;
}
function hotspotDocument() {
  let doc = createFilmDocument('hotspot-editor', '热点编辑');
  const hotspot = {
    ...createFilmNode('hotspot'),
    id: 'hotspot-A',
    mediaId: 'same-image',
    displaySeconds: 5,
  };
  const ending = createFilmNode('ending');
  doc.nodes.push(hotspot, ending);
  doc.media.push({
    id: 'same-image',
    name: '背景画面',
    type: 'image',
    mimeType: 'image/png',
    bytes: 1024,
    width: 200,
    height: 100,
  });
  doc = connectFilmNodes(doc, doc.nodes[0].id, 'next', hotspot.id);
  doc = connectFilmNodes(doc, hotspot.id, 'success', ending.id);
  doc = connectFilmNodes(doc, hotspot.id, 'failure', ending.id);
  return { doc, hotspot };
}

describe('film graph keyboard actions', () => {
  it('deletes only the focused edge and stops Delete before the window node-deletion handler', () => {
    let doc = graphDocument();
    doc = connectFilmNodes(doc, 'opening', 'next', 'clip');
    doc = connectFilmNodes(doc, 'clip', 'next', 'ending');
    const page = renderGraph(doc);
    fireEvent.keyDown(screen.getByLabelText('剧情画布'), { key: 'ArrowRight' });
    expect(page.onWindowKey).toHaveBeenCalledWith('ArrowRight');
    page.onWindowKey.mockClear();
    const edge = screen.getByRole('button', { name: '删除跳转 播放片段 到 故事结局' });
    edge.focus();
    expect(fireEvent.keyDown(edge, { key: 'Delete' })).toBe(false);
    expect(page.onWindowKey).not.toHaveBeenCalled();
    expect(page.commit).toHaveBeenCalledOnce();
    expect(page.document().nodes).toBe(doc.nodes);
    expect(page.document().edges).toEqual(doc.edges.filter((item) => item.source === 'opening'));
    expect(screen.getByRole('article', { name: '结局节点 故事结局' })).toBeTruthy();
  });

  it('activates an output port with Enter without opening properties and connects with article Enter', async () => {
    const user = userEvent.setup(),
      page = renderGraph(graphDocument());
    const port = screen.getByRole('button', { name: '连接 开场 继续' });
    port.focus();
    await user.keyboard('{Enter}');
    expect(port.getAttribute('aria-pressed')).toBe('true');
    expect(page.onFocusNode).not.toHaveBeenCalled();
    expect(page.selected()).toEqual(['ending']);
    const target = screen.getByRole('article', { name: '播放节点 播放片段' });
    target.focus();
    await user.keyboard('{Enter}');
    expect(page.document().edges).toEqual([
      expect.objectContaining({ source: 'opening', sourcePort: 'next', target: 'clip' }),
    ]);
    expect(port.getAttribute('aria-pressed')).toBe('false');
    expect(page.onFocusNode).not.toHaveBeenCalled();
    expect(page.selected()).toEqual(['ending']);
    await user.keyboard('{Enter}');
    expect(page.selected()).toEqual(['clip']);
    expect(page.onFocusNode).toHaveBeenCalledOnce();
  });
});

describe('film editor delayed preview focus', () => {
  it('keeps the opener focused while media loads, ignores reentry, then restores focus on close', async () => {
    const user = userEvent.setup();
    let doc = createFilmDocument('film-preview-focus', '延迟试玩');
    const ending = createFilmNode('ending');
    doc.nodes.push(ending);
    doc = connectFilmNodes(doc, doc.nodes[0].id, 'next', ending.id);
    saveFilmDocument(doc);
    let finishMedia;
    const dispose = vi.fn();
    controls.mediaUrls.mockImplementationOnce(
      () => new Promise((resolve) => (finishMedia = resolve)),
    );
    controls.mediaUrls.mockClear();
    render(
      <InteractiveFilmPage
        search="?projectId=film-preview-focus"
        navigate={vi.fn()}
        toast={vi.fn()}
      />,
    );
    const opener = screen.getByRole('button', { name: '试玩' });
    await user.click(opener);
    expect(opener.getAttribute('aria-disabled')).toBe('true');
    expect(opener.disabled).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(screen.queryByRole('dialog', { name: '影游试玩' })).toBeNull();
    await user.keyboard('{Enter}');
    await user.click(opener);
    expect(controls.mediaUrls).toHaveBeenCalledOnce();
    await act(async () => finishMedia({ urls: {}, dispose }));
    const dialog = await screen.findByRole('dialog', { name: '影游试玩' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.click(screen.getByRole('button', { name: '关闭', exact: true }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole('dialog', { name: '影游试玩' })).toBeNull();
    expect(opener.getAttribute('aria-disabled')).toBe('false');
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe('film inspector hotspot drawing', () => {
  it('draws over an inherited image while submitting only region and preserving all media references', async () => {
    let { doc, hotspot } = hotspotDocument();
    delete hotspot.mediaId;
    delete hotspot.trimIn;
    delete hotspot.trimOut;
    delete hotspot.displaySeconds;
    const play = {
      ...createFilmNode('play'),
      id: 'image-source',
      mediaId: doc.media[0].id,
      displaySeconds: 4,
    };
    doc.nodes.push(play);
    doc = connectFilmNodes(doc, doc.nodes[0].id, 'next', play.id);
    doc = connectFilmNodes(doc, play.id, 'next', hotspot.id);
    const before = structuredClone(doc),
      mediaReferences = doc.media,
      onDrawStart = vi.fn();
    let edited = doc;
    const change = vi.fn((patch) => {
      edited = {
        ...edited,
        nodes: edited.nodes.map((node) => (node.id === hotspot.id ? { ...node, ...patch } : node)),
      };
    });
    const page = render(
      <FilmInspector doc={doc} node={hotspot} change={change} onDrawStart={onDrawStart} />,
    );
    const preview = await screen.findByRole('img', { name: '背景画面' });
    expect(preview.getAttribute('src')).toBe('blob:preview-0');
    expect(controls.mediaUrls.mock.calls[0][0]).toEqual([doc.media[0]]);
    expect(screen.getByLabelText('节点素材').value).toBe('');
    expect(screen.queryByLabelText('片段起点')).toBeNull();
    expect(screen.queryByLabelText('片段终点')).toBeNull();
    const area = previewSurface(page.container);
    pointer(area, 'pointerdown', { x: 40, y: 50 });
    pointer(area, 'pointerup', { x: 100, y: 90 });
    expect(onDrawStart).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
    const [patch, options] = change.mock.lastCall;
    expect(Object.keys(patch)).toEqual(['region']);
    expect(options).toEqual({ history: false });
    expect(patch.region.x).toBeCloseTo(0.1);
    expect(patch.region.y).toBeCloseTo(0.2);
    expect(patch.region.width).toBeCloseTo(0.3);
    expect(patch.region.height).toBeCloseTo(0.4);
    const updated = edited.nodes.find((node) => node.id === hotspot.id);
    for (const key of ['mediaId', 'trimIn', 'trimOut'])
      expect(Object.hasOwn(updated, key)).toBe(false);
    expect(edited.media).toBe(mediaReferences);
    expect(edited.nodes.find((node) => node.id === play.id).mediaId).toBe(doc.media[0].id);
    expect(validateFilmDocument(edited)).toEqual([]);
    expect(doc).toEqual(before);
    expect(doc.media).toBe(mediaReferences);
  });
  it('cancels a drawing and its media lease when switching nodes that share the same media', async () => {
    const { doc, hotspot } = hotspotDocument();
    const second = { ...hotspot, id: 'hotspot-B', title: '第二热点' };
    doc.nodes.push(second);
    const firstChange = vi.fn(),
      secondChange = vi.fn(),
      onDrawStart = vi.fn();
    const page = render(
      <FilmInspector doc={doc} node={hotspot} change={firstChange} onDrawStart={onDrawStart} />,
    );
    await screen.findByRole('img', { name: '背景画面' });
    const firstArea = previewSurface(page.container);
    pointer(firstArea, 'pointerdown', { x: 50, y: 50 });
    expect(onDrawStart).toHaveBeenCalledOnce();
    page.rerender(
      <FilmInspector doc={doc} node={second} change={secondChange} onDrawStart={onDrawStart} />,
    );
    await waitFor(() => expect(controls.mediaUrls).toHaveBeenCalledTimes(2));
    expect(mediaLeases[0].signal.aborted).toBe(true);
    expect(mediaLeases[0].dispose).toHaveBeenCalledOnce();
    const secondArea = previewSurface(page.container);
    expect(secondArea).not.toBe(firstArea);
    pointer(secondArea, 'pointermove', { x: 180, y: 100 });
    pointer(secondArea, 'pointerup', { x: 180, y: 100 });
    expect(firstChange).not.toHaveBeenCalled();
    expect(secondChange).not.toHaveBeenCalled();
    pointer(secondArea, 'pointerdown', { x: 40, y: 40, id: 8 });
    pointer(secondArea, 'pointermove', { x: 80, y: 80, id: 8 });
    expect(secondChange).toHaveBeenCalledOnce();
    expect(onDrawStart).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      label: 'the lower-right boundary',
      origin: { x: 220, y: 130 },
      destination: { x: 260, y: 170 },
      region: { x: 0.99, y: 0.99, width: 0.01, height: 0.01 },
    },
    {
      label: 'an outside upper-left origin',
      origin: { x: -20, y: -20 },
      destination: { x: 40, y: 50 },
      region: { x: 0, y: 0, width: 0.1, height: 0.2 },
    },
    {
      label: 'a reversed drawing beyond the upper-left edge',
      origin: { x: 210, y: 120 },
      destination: { x: -100, y: -100 },
      region: { x: 0, y: 0, width: 0.95, height: 0.9 },
    },
  ])('normalizes $label into a valid hotspot region', async ({ origin, destination, region }) => {
    const { doc, hotspot } = hotspotDocument(),
      change = vi.fn(),
      onDrawStart = vi.fn();
    const page = render(
      <FilmInspector doc={doc} node={hotspot} change={change} onDrawStart={onDrawStart} />,
    );
    await screen.findByRole('img', { name: '背景画面' });
    const area = previewSurface(page.container);
    pointer(area, 'pointerdown', origin);
    pointer(area, 'pointerup', destination);
    expect(onDrawStart).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
    const [patch, options] = change.mock.lastCall;
    expect(options).toEqual({ history: false });
    for (const key of ['x', 'y', 'width', 'height'])
      expect(patch.region[key]).toBeCloseTo(region[key], 10);
    expect(
      validateFilmDocument({
        ...doc,
        nodes: doc.nodes.map((node) => (node.id === hotspot.id ? { ...node, ...patch } : node)),
      }),
    ).toEqual([]);
    expect(area.releasePointerCapture).toHaveBeenCalledWith(7);
  });
});
