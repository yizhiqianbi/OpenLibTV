// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildCanvasMentionRows,
  canvasMentionBounds,
  canvasMentionViewport,
  canvasNodeReference,
  isCanvasMentionNode,
  orderCanvasMentionNodeIds,
} from './agent-node-catalogue.js';
import {
  firstMentionRow,
  nextMentionRow,
  normalizeAgentMentionRows,
} from './agent-mention-rows.js';

const node = (id, x = 0, data = {}, extra = {}) => ({
  id,
  type: 'image',
  position: { x, y: 0 },
  width: 100,
  height: 100,
  data: { type: 'image', name: id, ...data },
  ...extra,
});
const itemRefs = (rows, type) =>
  rows.filter((row) => row.reference?.type === type).map((row) => row.reference);

describe('source-backed Canvas mention catalogue', () => {
  it('excludes temporary, missing-identity and pending-upload nodes without inventing identity', () => {
    const nodes = [
      node('ok'),
      node('__temp_connection_node__'),
      node('temp', 0, { type: 'temp' }),
      node('overlay'),
      node('review', 0, { uploadStatus: 'reviewing' }),
      node('blob', 0, { url: ['blob:pending'] }),
      node('data', 0, { url: ['data:image/png;base64,x'] }),
      node('', 0),
      node(' trim ', 0),
    ];
    const rows = buildCanvasMentionRows({ nodes, pendingNodeIds: new Set(['overlay']) });
    expect(itemRefs(rows, 'node').map((ref) => ref.id)).toEqual(['ok']);
    expect(isCanvasMentionNode(node('legit', 0, { url: ['https://example.test/a.png'] }))).toBe(
      true,
    );
    expect(
      isCanvasMentionNode(
        node('local', 0, { url: ['data:image/png;base64,x'], localMediaReady: true }),
      ),
    ).toBe(true);
    expect(
      isCanvasMentionNode(node('blob', 0, { url: ['blob:pending'], localMediaReady: true })),
    ).toBe(false);
    expect(
      isCanvasMentionNode(node('blob-string', 0, { url: 'blob:pending', localMediaReady: true })),
    ).toBe(false);
    expect(
      isCanvasMentionNode(node('old-data', 0, { originalUrl: 'data:image/png;base64,x' })),
    ).toBe(false);
    expect(
      isCanvasMentionNode(
        node('pending', 0, { url: ['data:image/png;base64,x'], localMediaReady: true }),
        new Set(['pending']),
      ),
    ).toBe(false);
  });
  it('keeps image-only wire previews and actual node identity instead of attachment sources', () => {
    const image = canvasNodeReference(
      node('image-1', 0, { name: '  图片标题 ', url: ['', ' /a.png '] }),
      'project',
    );
    expect(image).toEqual({
      type: 'node',
      id: 'image-1',
      nodeKey: 'image-1',
      name: '图片标题',
      projectId: 'project',
      nodeType: 'image',
      url: '/a.png',
      mediaType: 'image',
    });
    expect(image).not.toHaveProperty('source');
    expect(
      canvasNodeReference(node('fallback', 0, { name: '', url: [], originalUrl: '/original.png' })),
    ).toHaveProperty('url', '/original.png');
    const video = canvasNodeReference(
      node('video', 0, { type: 'video', name: '', url: '/v.mp4' }, { type: 'video' }),
    );
    expect(video.name).toBe('视频');
    expect(video).not.toHaveProperty('url');
    expect(canvasNodeReference(node('unknown', 0, { type: 'unverified', name: '' })).name).toBe(
      '节点',
    );
  });
  it('resolves parent-relative positions and includes direct children for a group hit', () => {
    const group = node('group', -1000, {}, { type: 'group', height: 20, width: 20 });
    const child = node('child', 1050, {}, { parentId: 'group' });
    const nodes = [node('outside', 2000), group, child];
    expect(canvasMentionBounds(child, nodes)).toEqual({
      left: 50,
      top: 0,
      right: 150,
      bottom: 100,
    });
    expect(orderCanvasMentionNodeIds(nodes, { x: 0, y: 0, width: 200, height: 100 })).toEqual([
      'group',
      'child',
      'outside',
    ]);
    const cycle = [node('a', 5, {}, { parentId: 'b' }), node('b', 10, {}, { parentId: 'a' })];
    expect(canvasMentionBounds(cycle[0], cycle).left).toBe(15);
  });
  it('uses source zoom conversion, strict edge intersections and measured dimensions', () => {
    expect(canvasMentionViewport({ x: -200, y: 100, z: 2 }, { width: 800, height: 600 })).toEqual({
      x: 100,
      y: -50,
      width: 400,
      height: 300,
    });
    expect(canvasMentionViewport({ z: 0 }, { width: 800, height: 600 })).toBeNull();
    const nodes = [
      node('edge', 100),
      node('inside', 95, {}, { measured: { width: 2, height: 3 } }),
      node('left', -101),
    ];
    expect(orderCanvasMentionNodeIds(nodes, { x: 0, y: 0, width: 100, height: 100 })).toEqual([
      'inside',
      'edge',
      'left',
    ]);
  });
  it('shows three ordered nodes, loads more and searches all nodes in document order up to48', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => node(`node-${i}`, i < 3 ? 1000 : 0));
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    const initial = buildCanvasMentionRows({ nodes, viewport });
    expect(itemRefs(initial, 'node').map((ref) => ref.id)).toEqual(['node-3', 'node-4', 'node-5']);
    expect(initial.find((row) => row.rowKind === 'loadMore')).toHaveProperty('label', '加载更多');
    expect(
      itemRefs(buildCanvasMentionRows({ nodes, viewport, nodeLimit: 6 }), 'node'),
    ).toHaveLength(6);
    const search = itemRefs(buildCanvasMentionRows({ nodes, viewport, query: 'NODE-' }), 'node');
    expect(search).toHaveLength(48);
    expect(search[0].id).toBe('node-0');
    expect(
      buildCanvasMentionRows({ nodes, query: 'absent' }).some((row) => row.rowKind === 'loadMore'),
    ).toBe(false);
  });
  it('retains source model ordering, disable reason and existing resources while excluding Skills/nodes', () => {
    const models = {
      image: [
        { modelKey: 'image', modelName: '图片模型', disabled: true, disabledReason: '维护中' },
      ],
      text: [{ modelKey: 'text', modelName: '文本模型' }],
      video: [{ modelKey: 'video', modelName: '视频模型', vip: true }],
    };
    const references = [
      { type: 'node', id: 'n', name: '节点' },
      { type: 'skill', id: 's', name: 'Skill' },
      { type: 'image', id: 'r', name: '参考图', status: 'ready', source: { value: '/r.png' } },
      { type: 'image', id: 'r', name: '重复' },
      { type: 'image', id: 'p', name: '未就绪', status: 'uploading' },
    ];
    const rows = buildCanvasMentionRows({ models, references });
    expect(itemRefs(rows, 'model').map((ref) => ref.id)).toEqual(['text', 'image', 'video']);
    expect(rows.find((row) => row.reference?.id === 'image')).toMatchObject({
      disabled: true,
      disabledReason: '维护中',
    });
    expect(
      rows.filter((row) => row.id.startsWith('__tag__')).map((row) => row.reference.id),
    ).toEqual(['r', 'p']);
    expect(rows.filter((row) => row.rowKind === 'header').map((row) => row.label)).toEqual([
      '节点',
      '模型',
      '资源',
    ]);
  });
  it('never selects headers/empty/disabled/unknown rows and includes keyboard load-more', () => {
    const rows = normalizeAgentMentionRows([
      { rowKind: 'header', id: 'h', label: '节点' },
      { rowKind: 'item', id: 'bad', label: '未知', reference: { type: 'unknown', id: 'fake' } },
      {
        rowKind: 'item',
        id: 'off',
        label: '维护',
        disabled: true,
        reference: { type: 'model', id: 'off' },
      },
      { rowKind: 'loadMore', id: 'more', label: '加载更多' },
      { type: 'model', id: 'real', name: '模型' },
      { rowKind: 'empty', id: 'e', label: '无匹配' },
    ]);
    expect(rows).toHaveLength(5);
    expect(firstMentionRow(rows)).toBe(2);
    expect(nextMentionRow(rows, 2, 1)).toBe(3);
    expect(nextMentionRow(rows, 3, 1)).toBe(2);
    expect(nextMentionRow(rows, 2, -1)).toBe(3);
    expect(firstMentionRow(rows, 'model:real')).toBe(3);
  });
});
