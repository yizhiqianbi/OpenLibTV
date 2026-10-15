// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  duplicateCanvasNodes,
  mergeCanvasProject,
  removeCanvasNodes,
  resolveCanvasRoute,
} from './model.js';
import {
  fitCanvasView,
  canvasToScreen,
  readOnlyCanvasView,
  screenToCanvas,
  selectIntersectingNodes,
  zoomCanvasView,
} from './geometry.js';

const node = {
  id: 'a',
  type: 'image',
  position: { x: 50, y: 80 },
  width: 100,
  height: 60,
  data: { name: '图', url: ['original'], params: { prompt: 'before' } },
};

describe('canvas document operations', () => {
  it('honors explicit template props and both project parameter names', () => {
    const explicit = resolveCanvasRoute('/detail/else', '?templateUuid=ignored', 'actual', true);
    expect(explicit.template).toBe('actual');
    expect(explicit.readonly).toBe(true);
    expect(resolveCanvasRoute('/canvas?project=old', '?projectId=unused').key).toBe('old');
    expect(resolveCanvasRoute('/canvas?projectId=current&project=old').key).toBe('current');
  });

  it('marks chat share and import routes independently', () => {
    expect(resolveCanvasRoute('/canvas/chat-share?shareId=share')).toMatchObject({
      readonly: true,
      chatShare: true,
      storageKey: 'libtv.canvas.share',
    });
    expect(resolveCanvasRoute('/canvas/import/blender')).toMatchObject({
      importing: true,
      readonly: false,
    });
  });

  it('duplicates selected node data without mutating the source', () => {
    const [duplicate] = duplicateCanvasNodes([node], ['a'], () => 'copy');
    expect(duplicate).toMatchObject({
      id: 'copy',
      position: { x: 86, y: 116 },
      data: { name: '图 副本' },
    });
    duplicate.data.params.prompt = 'after';
    expect(node.data.params.prompt).toBe('before');
  });

  it('removes incident edges along with selected nodes', () => {
    const remaining = { ...node, id: 'b' };
    const result = removeCanvasNodes(
      [node, remaining],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'bc', source: 'b', target: 'c' },
      ],
      ['a'],
    );
    expect(result.nodes).toEqual([remaining]);
    expect(result.edges.map((edge) => edge.id)).toEqual(['bc']);
  });

  it('keeps a project folder when the canvas updates its index', () => {
    const projects = [{ id: 'a', folder: 'folder', name: 'old' }];
    const next = mergeCanvasProject(projects, { id: 'a', name: 'new', folder: null });
    expect(next[0]).toMatchObject({ name: 'new', folder: 'folder' });
    expect(projects[0].name).toBe('old');
  });
});

describe('canvas view geometry', () => {
  it('projects a saved world anchor through the current board offset and viewport', () => {
    const bounds = { left: 20, top: 48 };
    const view = { x: -80, y: 60, z: 0.5 };
    const position = canvasToScreen({ x: 400, y: 200 }, bounds, view);
    expect(position).toEqual({ x: 140, y: 208 });
    expect(screenToCanvas({ clientX: position.x, clientY: position.y }, bounds, view)).toEqual({
      x: 400,
      y: 200,
    });
  });
  it('converts browser pointer coordinates after pan and zoom', () => {
    expect(
      screenToCanvas(
        { clientX: 420, clientY: 280 },
        { left: 20, top: 30 },
        { x: 100, y: 50, z: 2 },
      ),
    ).toEqual({ x: 150, y: 100 });
  });

  it('keeps the same graph point underneath the zoom anchor', () => {
    const view = { x: -50, y: 20, z: 0.5 },
      anchor = { x: 300, y: 200 };
    const zoomed = zoomCanvasView(view, 2, anchor);
    expect((anchor.x - zoomed.x) / zoomed.z).toBe((anchor.x - view.x) / view.z);
    expect((anchor.y - zoomed.y) / zoomed.z).toBe((anchor.y - view.y) / view.z);
    expect(zoomCanvasView(view, 1000, anchor).z).toBe(8);
    expect(zoomCanvasView(view, 0.0001, anchor).z).toBe(0.1);
  });

  it('fits nodes within the viewport margin and keeps public 10% placement', () => {
    const view = fitCanvasView([node], { width: 400, height: 300 });
    expect(view.x).toBeCloseTo(-164);
    expect(view.y).toBeCloseTo(-250.4);
    expect(view.z).toBeCloseTo(3.64);
    expect(readOnlyCanvasView([node], 1000)).toEqual({ x: 11, y: 712, z: 0.1 });
  });

  it('uses source double-tap padding and the same zoom limits for fit and gestures', () => {
    const item = { ...node, position: { x: 0, y: 0 }, width: 1000, height: 700 };
    const view = fitCanvasView([item], { width: 1000, height: 700 }, [item], { padding: 0.15 });
    expect(view).toEqual({ x: 65, y: 45.5, z: 0.87 });
    expect(fitCanvasView([{ ...item, width: 100000 }], { width: 1000, height: 700 }).z).toBe(0.1);
    expect(fitCanvasView([{ ...item, width: 1, height: 1 }], { width: 1000, height: 700 }).z).toBe(
      8,
    );
    expect(
      fitCanvasView(
        [item, { ...item, hidden: true, position: { x: 10000, y: 10000 } }],
        { width: 1000, height: 700 },
        [item],
        { padding: 0.15 },
      ),
    ).toEqual(view);
  });

  it('selects overlapping nodes and excludes a boundary-only touch', () => {
    expect(selectIntersectingNodes([node], { x: 149, y: 80, width: 3, height: 10 })).toEqual(['a']);
    expect(selectIntersectingNodes([node], { x: 150, y: 80, width: 3, height: 10 })).toEqual([]);
  });
});
