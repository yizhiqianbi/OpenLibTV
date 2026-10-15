import { StrictMode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { createCanvasNode } from '../model.js';
import { CanvasNode } from '../components/CanvasNode.jsx';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import { useCanvasConnectionMenu } from './useCanvasConnectionMenu.js';

const anchor = (type = 'image', data = {}) => {
  const initialized = createCanvasNode({
    type,
    label: '样本',
    position: { x: 400, y: 120 },
    nodes: [],
    models,
    makeId: () => 'anchor',
  });
  return {
    ...initialized,
    width: 420,
    height: 240,
    data: { ...initialized.data, ...data },
  };
};

/** Actual menu + graph hooks: no fake connect planner or mocked graph transaction. */
function fixture({ type = 'image', data = {}, graph: patch = {}, strict = false, point } = {}) {
  const ref = {
    current: {
      documentKey: 'A',
      ready: true,
      readonly: false,
      nodes: [anchor(type, data)],
      edges: [],
      models,
      ...patch,
    },
  };
  let controls = {
    documentKey: ref.current.documentKey,
    ready: ref.current.ready,
    readonly: ref.current.readonly,
  };
  const published = [];
  const spies = {
    recordSnapshot: vi.fn(),
    setNodes: vi.fn((nodes) => published.push({ phase: 'nodes', graph: ref.current, nodes })),
    setEdges: vi.fn((edges) => published.push({ phase: 'edges', graph: ref.current, edges })),
    notify: vi.fn(),
    setSelected: vi.fn(),
    setMenu: vi.fn(),
    setContext: vi.fn(),
    setLinking: vi.fn(),
    setLinkPoint: vi.fn(),
  };
  const page = renderHook(
    (settings) => {
      const graph = ref.current;
      const graphActions = useCanvasGraphActions({
        documentKey: settings.documentKey,
        currentDocument: ref,
        recordSnapshot: spies.recordSnapshot,
        setNodes: spies.setNodes,
        setEdges: spies.setEdges,
        notify: spies.notify,
      });
      const connection = useCanvasConnectionMenu({
        ...settings,
        nodes: graph.nodes,
        edges: graph.edges,
        models: graph.models,
        getDocument: () => ref.current,
        connectNodes: graphActions.connectNodes,
        setSelected: spies.setSelected,
        setMenu: spies.setMenu,
        setContext: spies.setContext,
        setLinking: spies.setLinking,
        setLinkPoint: spies.setLinkPoint,
        point,
      });
      return { ...connection, graphActions };
    },
    {
      initialProps: controls,
      ...(strict ? { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> } : {}),
    },
  );
  const clear = () => {
    Object.values(spies).forEach((spy) => spy.mockClear());
    published.length = 0;
  };
  clear();
  return {
    ...page,
    ref,
    ...spies,
    published,
    clear,
    open: (value = {}) => {
      act(() =>
        page.result.current.open({
          nodeId: 'anchor',
          handleType: 'source',
          clientX: 300,
          clientY: 240,
          ...value,
        }),
      );
      return page.result.current.menu;
    },
    update: (graphPatch, controlPatch = {}) => {
      ref.current = { ...ref.current, ...graphPatch };
      controls = {
        ...controls,
        ...Object.fromEntries(
          Object.entries(graphPatch).filter(([key]) =>
            ['documentKey', 'ready', 'readonly'].includes(key),
          ),
        ),
        ...controlPatch,
      };
      page.rerender(controls);
    },
  };
}
const choose = (f, type, owner = f.result.current.menu) => {
  let accepted;
  act(() => {
    accepted = f.result.current.choose(type, owner);
  });
  return accepted;
};

describe('actual Canvas connected-creation menu controller', () => {
  it('captures the menu click world anchor independently of the future node position', () => {
    const point = vi.fn(({ clientX, clientY }) => ({
      x: (clientX - 100) / 2,
      y: (clientY - 50) / 2,
    }));
    const f = fixture({ point });
    const request = f.open();
    expect(request.anchorPoint).toEqual({ x: 100, y: 95 });
    expect(request.point).toBeUndefined();
    expect(f.ref.current.nodes).toHaveLength(1);
    expect(choose(f, 'text', request)).toBe(true);
    const created = f.ref.current.nodes[1];
    expect(created.position).not.toEqual(request.anchorPoint);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });

  it.each(['blur', 'hidden'])(
    'cancels the %s menu owner without persisting its blank-release preview',
    (cause) => {
      const f = fixture();
      const request = f.open({ point: { x: 1000, y: 400 } });
      const before = f.ref.current;
      const hidden =
        cause === 'hidden' ? vi.spyOn(document, 'hidden', 'get').mockReturnValue(true) : null;
      act(() =>
        (cause === 'blur' ? window : document).dispatchEvent(
          new Event(cause === 'blur' ? 'blur' : 'visibilitychange'),
        ),
      );
      expect(f.result.current.menu).toBeNull();
      expect(f.setLinking).toHaveBeenLastCalledWith(null);
      expect(f.setLinkPoint).toHaveBeenLastCalledWith(null);
      expect(choose(f, 'text', request)).toBe(false);
      expect(f.ref.current).toBe(before);
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      hidden?.mockRestore();
      f.unmount();
    },
  );

  it('derives disabled entries from new-node eligibility without writing the graph', () => {
    const f = fixture({ type: 'video' });
    const before = f.ref.current;
    f.open();
    const entries = new Map(f.result.current.entries.map((entry) => [entry.type, entry]));
    expect(entries.get('text').disabled).toBe(false);
    expect(entries.get('video').disabled).toBe(false);
    expect(entries.get('image').disabled).toBe(true);
    expect(entries.get('script-v2').disabled).toBe(true);
    expect(entries.get('reference').disabled).toBe(true);
    expect(entries.get('image').reason).toBeTruthy();
    expect(
      f.result.current.entries
        .filter((entry) => !entry.disabled)
        .every((entry) => entry.reason === undefined),
    ).toBe(true);
    expect(entries.has('script')).toBe(true);
    expect(entries.has('video-clip')).toBe(true);
    expect(f.ref.current).toBe(before);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setNodes).not.toHaveBeenCalled();
    expect(f.setEdges).not.toHaveBeenCalled();
  });

  it('keeps the reference anchor exception and target-only reference restriction', () => {
    const f = fixture({ type: 'reference' });
    f.open();
    expect(f.result.current.entries.every((entry) => !entry.disabled)).toBe(true);
    f.open({ handleType: 'target' });
    expect(f.result.current.entries.find((entry) => entry.type === 'reference').disabled).toBe(
      false,
    );
    expect(
      f.result.current.entries
        .filter((entry) => entry.type !== 'reference')
        .every((entry) => entry.disabled),
    ).toBe(true);
    expect(f.result.current.entries.some((entry) => entry.type === 'script')).toBe(false);
  });

  it('commits one new node and edge in one history item and publishes the whole graph before view setters', () => {
    const f = fixture();
    const before = f.ref.current;
    const owner = f.open();
    f.clear();
    expect(choose(f, 'image', owner)).toBe(true);
    const graph = f.ref.current;
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    const created = graph.nodes[1];
    expect(created.type).toBe('image');
    expect(created.position).toEqual({ x: 920, y: 120 + (240 - 350) / 2 });
    expect(graph.edges[0]).toMatchObject({ source: 'anchor', target: created.id });
    expect(created.data.url).toEqual([]);
    expect(f.recordSnapshot).toHaveBeenCalledExactlyOnceWith({
      nodes: before.nodes,
      edges: before.edges,
    });
    expect(f.setNodes).toHaveBeenCalledExactlyOnceWith(graph.nodes);
    expect(f.setEdges).toHaveBeenCalledExactlyOnceWith(graph.edges);
    expect(f.published.every((event) => event.graph === graph)).toBe(true);
    expect(f.setSelected).toHaveBeenCalledExactlyOnceWith([created.id]);
    expect(f.setLinking).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.setLinkPoint).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.result.current.menu).toBeNull();
    expect(choose(f, 'image', owner)).toBe(false);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });

  it.each(['source', 'target'])(
    'shows and persists the image → new text default for the %s handle',
    (handleType) => {
      const f = fixture();
      const owner = f.open({ handleType });
      expect(choose(f, 'text', owner)).toBe(true);
      const created = f.ref.current.nodes[1];
      expect(created.data.text).toBe('根据图片生成提示词');
      expect(created.data.params).toMatchObject({ prompt: '根据图片生成提示词', count: 1 });
      const view = render(
        <CanvasNode
          n={created}
          Icon={() => null}
          info={{ label: '文本' }}
          readonly
          selected={[]}
        />,
      );
      expect(view.getByRole('textbox').value).toBe('根据图片生成提示词');
      view.unmount();
      expect(created.position).toEqual({
        x: handleType === 'source' ? 920 : -50,
        y: 120 + (240 - 350) / 2,
      });
      expect(f.ref.current.edges[0]).toMatchObject(
        handleType === 'source'
          ? { source: 'anchor', target: created.id }
          : { source: created.id, target: 'anchor' },
      );
      expect(f.recordSnapshot).toHaveBeenCalledOnce();
    },
  );

  it('keeps explicit empty-drop flow coordinates including zero', () => {
    const f = fixture();
    f.open({ point: { x: 0, y: 0 } });
    expect(choose(f, 'image')).toBe(true);
    expect(f.ref.current.nodes[1].position).toEqual({ x: 0, y: 0 });
  });

  it('places a connected root node beside the grouped anchor in world coordinates', () => {
    const group = {
      id: 'group',
      type: 'group',
      position: { x: 1000, y: 500 },
      data: { type: 'group' },
    };
    const child = { ...anchor(), parentId: 'group' };
    const f = fixture({ graph: { nodes: [group, child] } });
    f.open();
    expect(choose(f, 'image')).toBe(true);
    const created = f.ref.current.nodes[2];
    expect(created.position).toEqual({ x: 1920, y: 500 + 120 + (240 - 350) / 2 });
    expect(created.parentId).toBeUndefined();
  });

  it('uses connected-creation eligibility when model config is unavailable, without claiming generation', () => {
    const f = fixture({ graph: { models: null } });
    f.open();
    expect(f.result.current.entries.find((entry) => entry.type === 'image').disabled).toBe(false);
    expect(choose(f, 'image')).toBe(true);
    expect(f.ref.current.nodes[1].data.params.model).toBe('');
    expect(f.ref.current.nodes[1].data.url).toEqual([]);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });

  it('rejects a disabled choice through the actual planner and preserves the current menu for another choice', () => {
    const f = fixture({ type: 'video' });
    const before = f.ref.current;
    const owner = f.open();
    f.clear();
    expect(choose(f, 'image', owner)).toBe(false);
    expect(f.ref.current).toBe(before);
    expect(f.result.current.menu).toBe(owner);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setSelected).not.toHaveBeenCalled();
    expect(f.setLinking).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledOnce();
    expect(choose(f, 'text', owner)).toBe(true);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });

  it('revalidates the latest source action even when the displayed entry was allowed', () => {
    const f = fixture();
    const owner = f.open();
    expect(f.result.current.entries.find((entry) => entry.type === 'image').disabled).toBe(false);
    f.ref.current = { ...f.ref.current, nodes: [anchor('video')] };
    const latestGraph = f.ref.current;
    expect(choose(f, 'image', owner)).toBe(false);
    expect(f.ref.current).toBe(latestGraph);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    f.update({ nodes: f.ref.current.nodes });
    expect(f.result.current.entries.find((entry) => entry.type === 'image').disabled).toBe(true);
  });

  it('closes only the view when preserving the old two-click source, and a normal close clears it', () => {
    const f = fixture();
    const first = f.open();
    f.clear();
    act(() => f.result.current.close(first, { preserveConnection: true }));
    expect(f.result.current.menu).toBeNull();
    expect(f.setLinking).not.toHaveBeenCalled();
    expect(f.setLinkPoint).not.toHaveBeenCalled();
    const second = f.open();
    f.clear();
    act(() => f.result.current.close(second));
    expect(f.result.current.menu).toBeNull();
    expect(f.setLinking).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.setLinkPoint).toHaveBeenCalledExactlyOnceWith(null);
    act(() => f.result.current.close(second));
    expect(f.setLinking).toHaveBeenCalledOnce();
  });

  it('rejects structurally duplicated or previous menu objects without clearing a fresh request', () => {
    const f = fixture();
    const first = f.open();
    const second = f.open();
    f.clear();
    expect(second).not.toBe(first);
    expect(choose(f, 'image', first)).toBe(false);
    expect(choose(f, 'image', { ...second })).toBe(false);
    act(() => f.result.current.close(first));
    expect(f.result.current.menu).toBe(second);
    expect(f.setLinking).not.toHaveBeenCalled();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(choose(f, 'image', second)).toBe(true);
  });

  it('invalidates a prior request synchronously when opening another menu in the same batch', () => {
    const f = fixture();
    const old = f.open();
    let accepted;
    act(() => {
      f.result.current.open({ nodeId: 'anchor', handleType: 'source', clientX: 350, clientY: 250 });
      accepted = f.result.current.choose('image', old);
      f.result.current.close(old);
    });
    expect(accepted).toBe(false);
    expect(f.result.current.menu).not.toBe(old);
    expect(f.result.current.menu.clientX).toBe(350);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });

  it('initializes legacy linking for source opens and clears it for target opens', () => {
    const group = {
      id: 'group',
      type: 'group',
      position: { x: 1000, y: 500 },
      data: { type: 'group' },
    };
    const child = { ...anchor(), parentId: 'group' };
    const f = fixture({ graph: { nodes: [group, child] } });
    f.open();
    expect(f.setLinking).toHaveBeenCalledExactlyOnceWith('anchor');
    expect(f.setLinkPoint).toHaveBeenCalledExactlyOnceWith({ x: 1820, y: 740 });
    expect(f.setMenu).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.setContext).toHaveBeenCalledExactlyOnceWith(null);
    f.clear();
    f.open({ point: { x: 0, y: 0 } });
    expect(f.setLinking).toHaveBeenCalledExactlyOnceWith('anchor');
    expect(f.setLinkPoint).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 0 });
    f.clear();
    f.open({ handleType: 'target' });
    expect(f.setLinking).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.setLinkPoint).toHaveBeenCalledExactlyOnceWith(null);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });

  it('does not reuse an old A menu after a document A → B → A round trip', () => {
    const f = fixture();
    const firstA = f.open();
    f.update({ documentKey: 'B', nodes: [anchor()] });
    const B = f.open();
    expect(choose(f, 'image', firstA)).toBe(false);
    f.update({ documentKey: 'A', nodes: [anchor()] });
    const secondA = f.open();
    expect(secondA.epoch).toBeGreaterThan(firstA.epoch);
    expect(choose(f, 'image', firstA)).toBe(false);
    expect(choose(f, 'image', B)).toBe(false);
    f.clear();
    act(() => f.result.current.close(firstA, { preserveConnection: true }));
    expect(f.result.current.menu).toBe(secondA);
    expect(f.setLinking).not.toHaveBeenCalled();
    expect(choose(f, 'image', secondA)).toBe(true);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });

  it('cancels a menu when its anchor is deleted and does not resurrect it when the ID returns', () => {
    const f = fixture();
    const owner = f.open({ point: { x: 0, y: 0 } });
    f.update({ nodes: [] });
    expect(f.result.current.menu).toBeNull();
    expect(f.setLinking).toHaveBeenCalledWith(null);
    expect(f.setLinkPoint).toHaveBeenCalledWith(null);
    expect(choose(f, 'image', owner)).toBe(false);
    f.update({ nodes: [anchor()] });
    expect(choose(f, 'image', owner)).toBe(false);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(choose(f, 'image', f.open())).toBe(true);
  });

  it.each([{ ready: false }, { readonly: true }])(
    'cancels menu and legacy linking when access changes: %j',
    (patch) => {
      const f = fixture();
      const owner = f.open();
      f.update(patch);
      expect(f.result.current.menu).toBeNull();
      expect(f.setLinking).toHaveBeenCalledWith(null);
      expect(f.setLinkPoint).toHaveBeenCalledWith(null);
      expect(f.open()).toBeNull();
      expect(choose(f, 'image', owner)).toBe(false);
      f.update({ ready: true, readonly: false });
      expect(choose(f, 'image', owner)).toBe(false);
      expect(f.recordSnapshot).not.toHaveBeenCalled();
    },
  );

  it('clears a preserved legacy source on a subsequent hand-tool ready=false transition', () => {
    const f = fixture();
    const owner = f.open();
    act(() => f.result.current.close(owner, { preserveConnection: true }));
    f.clear();
    f.update({}, { ready: false });
    expect(f.setLinking).toHaveBeenCalledWith(null);
    expect(f.setLinkPoint).toHaveBeenCalledWith(null);
    expect(f.open()).toBeNull();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });

  it.each([{ documentKey: 'B' }, { ready: false }, { readonly: true }])(
    'rejects a stale getDocument descriptor before commit: %j',
    (patch) => {
      const f = fixture();
      const owner = f.open();
      f.ref.current = { ...f.ref.current, ...patch };
      expect(choose(f, 'image', owner)).toBe(false);
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.setSelected).not.toHaveBeenCalled();
    },
  );

  it('refuses missing nodes and a mismatched source document before opening', () => {
    const f = fixture();
    expect(f.open({ nodeId: 'missing' })).toBeNull();
    f.ref.current = { ...f.ref.current, documentKey: 'B' };
    expect(f.open()).toBeNull();
    expect(f.setMenu).not.toHaveBeenCalled();
    expect(f.setContext).not.toHaveBeenCalled();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });

  it('releases a current owner on unmount and rejects its retained callbacks', () => {
    const f = fixture();
    const owner = f.open();
    const controller = f.result.current;
    const graph = f.ref.current;
    f.unmount();
    f.clear();
    expect(controller.choose('image', owner)).toBe(false);
    controller.close(owner);
    expect(f.ref.current).toBe(graph);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setSelected).not.toHaveBeenCalled();
    expect(f.setLinking).not.toHaveBeenCalled();
  });

  it('allows one successful current request through StrictMode effect replay', () => {
    const f = fixture({ strict: true });
    const owner = f.open();
    expect(choose(f, 'image', owner)).toBe(true);
    expect(f.ref.current.nodes).toHaveLength(2);
    expect(f.ref.current.edges).toHaveLength(1);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });
});
