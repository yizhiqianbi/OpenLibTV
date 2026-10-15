import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  missingVideoComposePresetMaterials,
  planVideoComposePresetGraph,
  videoComposePresetDisplaySize,
  videoComposePresetPosition,
} from './preset-graph-model.js';

const config = JSON.parse(readFileSync('public/data/video-compose-agent-config.json', 'utf8'));
const batch = config.modes.find((mode) => mode.modeKey === 'batchAd');
const clip = () => ({
  id: 'clip',
  type: 'video-clip',
  position: { x: 1000, y: 200 },
  measured: { width: 350, height: 350 },
  data: { type: 'video-clip', name: '剪辑', unknown: { preserve: true } },
});
const source = (id, type, extra = {}) => ({
  id,
  type,
  position: { x: -3000, y: 2000 },
  data: { type, url: [] },
  ...extra,
});
const ids = () => {
  let serial = 0;
  return (kind) => `${kind}-${++serial}`;
};

describe('source 46997 / 44980 / 44676 compose preset graph literals', () => {
  it.each([
    [
      { nodeType: 'audio', width: 10000, height: 2 },
      { width: 350, height: 148 },
    ],
    [
      { nodeType: 'video', width: 400, height: 712 },
      { width: 350, height: 623 },
    ],
    [
      { nodeType: 'image', width: 400, height: 400 },
      { width: 350, height: 350 },
    ],
    [
      { width: 400, height: 225 },
      { width: 622, height: 350 },
    ],
    [
      { width: 100000, height: 1 },
      { width: 5600, height: 350 },
    ],
    [
      { width: 1, height: 100000 },
      { width: 350, height: 5600 },
    ],
    [
      { width: 0, height: 720 },
      { width: 350, height: 350 },
    ],
    [
      { width: -1, height: 720 },
      { width: 350, height: 350 },
    ],
    [{}, { width: 350, height: 350 }],
  ])(
    'uses source natural display dimensions, without creating media metadata: %j',
    (input, gold) => {
      expect(videoComposePresetDisplaySize(input)).toEqual(gold);
      expect(input).not.toHaveProperty('sourceDuration');
    },
  );

  it('filters by direct source flow type even when the source has no media URL', () => {
    const nodes = [
      clip(),
      source('empty-video', 'video'),
      source('data-only-image', 'custom', { data: { type: 'image' } }),
    ];
    const edges = [
      { id: 'v', source: 'empty-video', target: 'clip' },
      { id: 'i', source: 'data-only-image', target: 'clip' },
      { id: 'broken', source: 'missing-source', target: 'clip' },
    ];
    expect(missingVideoComposePresetMaterials(batch, 'clip', nodes, edges)).toEqual([
      {
        slotKey: 'productImage',
        nodeType: 'image',
        url: 'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/9febab9d5fc3d3cd530620a834dab4f2805cfedb.png',
        width: 400,
        height: 400,
      },
    ]);
    expect(missingVideoComposePresetMaterials(config.defaultMode, 'clip', nodes, edges)).toEqual(
      [],
    );
  });

  it('keeps all seven same-kind smartMixCut presets when absent, and skips all seven once one source exists', () => {
    const mode = config.modes.find((entry) => entry.modeKey === 'smartMixCut');
    expect(missingVideoComposePresetMaterials(mode, 'clip', [clip()], [])).toHaveLength(7);
    expect(
      missingVideoComposePresetMaterials(
        mode,
        'clip',
        [clip(), source('v', 'video')],
        [{ source: 'v', target: 'clip' }],
      ),
    ).toEqual([]);
  });

  it('uses world position and contentWidth for collisions and prefers vertical on equal distances', () => {
    const target = { ...clip(), parentId: 'outer', position: { x: 300, y: 100 } };
    const parent = {
      id: 'outer',
      type: 'group',
      position: { x: 700, y: 100 },
      measured: { width: 0, height: 0 },
    };
    expect(
      videoComposePresetPosition(target, [target, parent], { width: 350, height: 350 }),
    ).toEqual({ x: 530, y: 200 });
    const obstruction = {
      ...source('occupied', 'video'),
      position: { x: 530, y: 200 },
      measured: { width: 1, height: 623 },
      data: { contentWidth: 350 },
    };
    expect(
      videoComposePresetPosition(clip(), [clip(), obstruction], { width: 350, height: 350 }),
    ).toEqual({ x: 530, y: -200 });
  });

  it('creates the entire source-shaped batch graph with 40px and 36px group padding', () => {
    const original = clip();
    const nodes = [original];
    const edges = [
      { id: 'broken', source: 'missing-source', target: 'clip', unknown: { keep: 1 } },
    ];
    const plan = planVideoComposePresetGraph({
      nodes,
      edges,
      nodeId: 'clip',
      mode: batch,
      prepared: [
        { material: batch.preset.materials[0], size: { width: 350, height: 623 } },
        { material: batch.preset.materials[1], size: { width: 350, height: 350 } },
      ],
      makeId: ids(),
    });
    expect(plan).toEqual({
      nodes: [
        {
          id: 'clip',
          type: 'video-clip',
          position: { x: 510, y: 476 },
          measured: { width: 350, height: 350 },
          data: { type: 'video-clip', name: '剪辑', unknown: { preserve: true } },
          parentId: 'group-5',
        },
        {
          id: 'video-1',
          type: 'video',
          position: { x: 40, y: 476 },
          sourcePosition: 'right',
          targetPosition: 'left',
          measured: { width: 350, height: 623 },
          data: {
            type: 'video',
            name: '参考视频',
            label: '视频',
            url: [
              'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/d7ca400a8074fbffe9c463a8c85882b82335690f.mp4',
            ],
            action: 'video_resource',
            generatorType: 'default',
            contentWidth: 350,
            contentHeight: 623,
          },
          parentId: 'group-5',
        },
        {
          id: 'image-3',
          type: 'image',
          position: { x: 40, y: 76 },
          sourcePosition: 'right',
          targetPosition: 'left',
          measured: { width: 350, height: 350 },
          data: {
            type: 'image',
            name: '产品图',
            label: '图片',
            url: [
              'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/9febab9d5fc3d3cd530620a834dab4f2805cfedb.png',
            ],
            action: 'image_resource',
            generatorType: 'default',
            contentWidth: 350,
            contentHeight: 350,
          },
          parentId: 'group-5',
        },
        {
          id: 'group-5',
          type: 'group',
          position: { x: 490, y: -276 },
          zIndex: -1001,
          style: {
            background: 'var(--canvas-group-bg)',
            border: '1px solid var(--canvas-group-border)',
          },
          data: {
            type: 'group',
            name: '预设 - 批量广告',
            childNodeIds: ['video-1', 'image-3', 'clip'],
          },
          width: 900,
          height: 1139,
          measured: { width: 900, height: 1139 },
        },
      ],
      edges: [
        { id: 'broken', source: 'missing-source', target: 'clip', unknown: { keep: 1 } },
        {
          id: 'edge-2',
          source: 'video-1',
          sourceHandle: 'source',
          target: 'clip',
          targetHandle: 'target',
        },
        {
          id: 'edge-4',
          source: 'image-3',
          sourceHandle: 'source',
          target: 'clip',
          targetHandle: 'target',
        },
      ],
      addedNodeIds: ['video-1', 'image-3'],
      groupId: 'group-5',
    });
    expect(nodes).toEqual([
      {
        id: 'clip',
        type: 'video-clip',
        position: { x: 1000, y: 200 },
        measured: { width: 350, height: 350 },
        data: { type: 'video-clip', name: '剪辑', unknown: { preserve: true } },
      },
    ]);
    expect(edges).toEqual([
      { id: 'broken', source: 'missing-source', target: 'clip', unknown: { keep: 1 } },
    ]);
  });

  it('rechecks fresh connections after metadata preparation and preserves graph identity on no-op', () => {
    const nodes = [clip(), source('video-existing', 'video'), source('image-existing', 'image')];
    const edges = [
      { source: 'video-existing', target: 'clip' },
      { source: 'image-existing', target: 'clip' },
    ];
    const makeId = () => {
      throw new Error('no-op must not allocate');
    };
    const plan = planVideoComposePresetGraph({
      nodes,
      edges,
      nodeId: 'clip',
      mode: batch,
      prepared: batch.preset.materials.map((material) => ({
        material,
        size: { width: 350, height: 350 },
      })),
      makeId,
    });
    expect(plan).toEqual({ nodes, edges, addedNodeIds: [], groupId: null });
    expect(plan.nodes).toBe(nodes);
    expect(plan.edges).toBe(edges);
  });

  it('does not nest an already grouped target and leaves parent/child positions intact', () => {
    const parent = {
      id: 'parent',
      type: 'group',
      position: { x: 700, y: 100 },
      measured: { width: 0, height: 0 },
      data: { childNodeIds: ['clip'] },
    };
    const target = { ...clip(), parentId: 'parent', position: { x: 300, y: 100 } };
    const mode = config.modes.find((entry) => entry.modeKey === 'explainerVideo');
    const plan = planVideoComposePresetGraph({
      nodes: [parent, target],
      edges: [],
      nodeId: 'clip',
      mode,
      prepared: [{ material: mode.preset.materials[0], size: { width: 350, height: 148 } }],
      makeId: ids(),
    });
    expect(plan.groupId).toBeNull();
    expect(plan.nodes).toEqual([
      parent,
      target,
      {
        id: 'audio-1',
        type: 'audio',
        position: { x: 530, y: 200 },
        sourcePosition: 'right',
        targetPosition: 'left',
        measured: { width: 350, height: 148 },
        data: {
          type: 'audio',
          name: '音频',
          label: '音频',
          url: [
            'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/d1ddfc1be40a56892133fb1090683a265c431273.wav',
          ],
          action: 'audio_resource',
          generatorType: 'default',
        },
      },
    ]);
    expect(plan.edges).toEqual([
      {
        id: 'edge-2',
        source: 'audio-1',
        sourceHandle: 'source',
        target: 'clip',
        targetHandle: 'target',
      },
    ]);
  });

  it.each(['clip', 'edge-existing', ''])('rejects ID collision atomically: %s', (collision) => {
    const nodes = [clip()];
    const edges = [{ id: 'edge-existing', source: 'missing', target: 'clip' }];
    const before = structuredClone({ nodes, edges });
    const makeId = (kind) =>
      kind === (collision === 'edge-existing' ? 'edge' : 'video') ? collision : `${kind}-safe`;
    expect(
      planVideoComposePresetGraph({
        nodes,
        edges,
        nodeId: 'clip',
        mode: batch,
        prepared: [{ material: batch.preset.materials[0], size: { width: 350, height: 623 } }],
        makeId,
      }),
    ).toBeNull();
    expect({ nodes, edges }).toEqual(before);
  });

  it('rejects missing/wrong target while retaining existing edges and arbitrary source fields', () => {
    expect(
      planVideoComposePresetGraph({
        nodes: [source('clip', 'video')],
        edges: [],
        nodeId: 'clip',
        mode: batch,
        prepared: [],
        makeId: ids(),
      }),
    ).toBeNull();
  });
});
