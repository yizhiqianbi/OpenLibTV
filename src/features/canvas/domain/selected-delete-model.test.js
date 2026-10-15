/**
 * Literal expected values from the selected-delete source caller contract.
 * Gold is written independently of production planners; topology recognition
 * is not an mD transaction result or permission to execute clip deletion.
 */
import { describe, expect, it } from 'vitest';
import {
  collectCanvasSelectedDeleteCandidates,
  describeCanvasSelectedDeleteRequest,
  planCanvasSelectedDeletePhases,
} from './selected-delete-model.js';

const unlinkNotice = {
  title: '断开连线',
  message: '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
  confirmText: '确定断开',
  cancelText: '取消',
  closeOnBackdrop: false,
  showCloseButton: false,
};

describe('RF selected-delete candidate source contract', () => {
  it('uses one graph-order pass, excluding blocked parents and never revisiting early children', () => {
    const nodes = [
      { id: 'early', parentId: 'p' },
      { id: 'blocked', deletable: false },
      { id: 'blocked-child', parentId: 'blocked' },
      { id: 'p', hidden: true, selectable: false },
      { id: 'late', parentId: 'p' },
      { id: 'leaf', parentId: 'late' },
    ];
    const plan = collectCanvasSelectedDeleteCandidates({
      nodes,
      selectedNodeIds: ['blocked', 'p'],
    });
    expect(plan.nodeIds).toEqual(['p', 'late', 'leaf']);
    expect(plan.edgeIds).toEqual([]);
    expect(plan.nodesToRemove[0]).toBe(nodes[3]);
    expect(plan.nodesToRemove[1]).toBe(nodes[4]);
    expect(plan.nodesToRemove[2]).toBe(nodes[5]);
  });

  it('does not turn reverse-ordered ancestry into BFS or a fixed-point closure', () => {
    const plan = collectCanvasSelectedDeleteCandidates({
      nodes: [
        { id: 'grandchild', parentId: 'child' },
        { id: 'child', parentId: 'parent' },
        { id: 'parent' },
      ],
      selectedNodeIds: ['parent'],
    });
    expect(plan.nodeIds).toEqual(['parent']);
  });

  it('keeps graph node order rather than request order and deduplicates requested membership', () => {
    const plan = collectCanvasSelectedDeleteCandidates({
      nodes: [{ id: 'first' }, { id: 'second' }],
      selectedNodeIds: ['second', 'first', 'second', 'missing'],
    });
    expect(plan.nodeIds).toEqual(['first', 'second']);
  });

  it('does not block an explicitly selected child merely because its parent is undeletable', () => {
    const plan = collectCanvasSelectedDeleteCandidates({
      nodes: [
        { id: 'parent', deletable: false },
        { id: 'child', parentId: 'parent' },
      ],
      selectedNodeIds: ['parent', 'child'],
    });
    expect(plan.nodeIds).toEqual(['child']);
  });

  it('takes incident edges first then selected edges in graph order, with no hidden/selectable gate', () => {
    const edges = [
      { id: 's1', source: 'a', target: 'b' },
      { id: 'i1', source: 'p', target: 'a' },
      { id: 'blocked', source: 'p', target: 'b', deletable: false },
      { id: 's2', source: 'a', target: 'c' },
      { id: 'i2', source: 'b', target: 'p' },
      { id: 'ih', source: 'p', target: 'c', hidden: true, selectable: false },
    ];
    const plan = collectCanvasSelectedDeleteCandidates({
      nodes: [{ id: 'p' }, { id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges,
      selectedNodeIds: ['p'],
      selectedEdgeIds: ['s2', 's1', 'blocked', 'i1', 's2'],
    });
    expect(plan.nodeIds).toEqual(['p']);
    expect(plan.edgeIds).toEqual(['i1', 'i2', 'ih', 's1', 's2']);
    expect(plan.edgesToRemove[0]).toBe(edges[1]);
    expect(plan.edgesToRemove[4]).toBe(edges[3]);
  });

  it('uses the truthy selected predicate by default, even for hidden or nonselectable records', () => {
    const plan = collectCanvasSelectedDeleteCandidates({
      nodes: [
        { id: 'hidden', selected: true, hidden: true, selectable: false },
        { id: 'blocked', selected: true, deletable: false },
        { id: 'not-selected', selected: false },
      ],
      edges: [
        { id: 'truthy', source: 'other', target: 'other', selected: 1, hidden: true },
        { id: 'blocked-edge', source: 'hidden', target: 'other', selected: true, deletable: false },
        { id: 'incident', source: 'hidden', target: 'other', selected: false },
      ],
    });
    expect(plan.nodeIds).toEqual(['hidden']);
    expect(plan.edgeIds).toEqual(['incident', 'truthy']);
  });

  it('does not invent endpoint-existence validation or include missing requested edge IDs', () => {
    const plan = collectCanvasSelectedDeleteCandidates({
      edges: [{ id: 'existing', source: 'missing-source', target: 'missing-target' }],
      selectedEdgeIds: ['missing-edge', 'existing'],
    });
    expect(plan.edgeIds).toEqual(['existing']);
  });
});

describe('initial node warning source contract', () => {
  const nodes = [
    { id: 'v2', type: 'script-v2', data: { type: 'image' } },
    { id: 'old', type: 'group', data: { type: 'video', sourceScriptNodeId: 'x' } },
    { id: 'open', type: 'video', data: { openingUsed: true } },
  ];

  it('gives flow SCRIPT_V2 priority over old group and opening warnings, with exact Mac text', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes,
      selectedNodeIds: ['open', 'old', 'v2'],
      isMac: true,
    });
    expect(request.candidates.nodeIds).toEqual(['v2', 'old', 'open']);
    expect(request.nodeConfirmation).toEqual({
      notice: {
        title: '确认删除',
        message: '删除当前节点后，数据可能会丢失，也可通过 ⌘Z 撤销。确定要删除吗？',
        confirmText: '确定删除',
        cancelText: '取消',
      },
      takeSnapshotOnAcceptance: true,
      onAcceptFlags: { isConfirmedDelete: true, isScriptDeleteConfirmed: true },
      onCancel: 'cancel-all-removal-callbacks',
    });
  });

  it('gives an old group priority over opening, while ignoring its raw data.type for flow qualification', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes,
      selectedNodeIds: ['old', 'open'],
    });
    expect(request.nodeConfirmation.notice).toEqual({
      title: '删除分镜图组',
      message: '删除分镜图组后，组内所有分镜图及其与脚本的关联关系将消失。确定要删除吗？',
      confirmText: '确定删除',
      cancelText: '取消',
    });
  });

  it('uses opening only when there is no script or old-group warning', () => {
    const request = describeCanvasSelectedDeleteRequest({ nodes, selectedNodeIds: ['open'] });
    expect(request.nodeConfirmation.notice).toEqual({
      title: '确认删除该节点？',
      message:
        '删除该视频节点后，与「创意片头」相关的生成内容也将被永久删除，已发送到画布的内容不受影响',
      confirmText: '确定删除',
      cancelText: '取消',
    });
  });

  it('does not replace flow type with raw SCRIPT or add generated-content menu warnings', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes: [{ id: 'fake', type: 'image', data: { type: 'script', url: ['real.png'] } }],
      selectedNodeIds: ['fake'],
    });
    expect(request.nodeConfirmation).toBeNull();
  });

  it('accepts a whitespace script ID for legacy groups without trimming', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes: [
        { id: 'g', type: 'group', data: { sourceScriptNodeId: ' ', storyboardGroupType: 'video' } },
      ],
      selectedNodeIds: ['g'],
    });
    expect(request.nodeConfirmation.notice.title).toBe('删除分镜视频组');
  });

  it('does not warn for a v2-linked group even with generated content', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes: [
        {
          id: 'g',
          type: 'group',
          data: { sourceScriptNodeId: 's', sourceScriptVersion: 'v2', url: ['real.png'] },
        },
      ],
      selectedNodeIds: ['g'],
    });
    expect(request.nodeConfirmation).toBeNull();
  });

  it('does not treat a numeric sourceScriptNodeId as a legacy group warning', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes: [{ id: 'g', type: 'group', data: { sourceScriptNodeId: 123 } }],
      selectedNodeIds: ['g'],
    });
    expect(request.nodeConfirmation).toBeNull();
  });

  it('does not manufacture initial node warning or confirmed flags for edge-only selection', () => {
    const request = describeCanvasSelectedDeleteRequest({
      nodes: [
        { id: 'script', type: 'script' },
        { id: 'group', type: 'group' },
      ],
      edges: [{ id: 'link', source: 'script', target: 'group' }],
      selectedEdgeIds: ['link'],
    });
    expect(request.candidates.nodeIds).toEqual([]);
    expect(request.candidates.edgeIds).toEqual(['link']);
    expect(request.nodeConfirmation).toBeNull();
  });
});

describe('actual cl edge-phase descriptors', () => {
  const editingNodes = [
    { id: 's', type: 'image', data: { type: 'script' } },
    {
      id: 't',
      type: 'audio',
      data: {
        type: 'group',
        sourceScriptNodeId: 's',
        params: {
          segmentRemakeLock: true,
          segmentRemakeDraft: { phase: 'editing', sourceNodeId: 's' },
        },
      },
    },
  ];
  const editingEdges = [
    { id: 'e1', source: 's', target: 't' },
    { id: 'e2', source: 's', target: 't' },
  ];

  it('prioritizes type-agnostic editing targets over associations and deduplicates target IDs only', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: editingNodes,
      edges: editingEdges,
      edgeIds: ['e2', 'e1', 'e2'],
    });
    expect(plan.editingTargetIds).toEqual(['t']);
    expect(plan.storyboardEdgeIds).toEqual([]);
    expect(plan.ordinaryEdgeIds).toEqual([]);
    expect(plan.phases).toEqual([
      {
        kind: 'editing-targets',
        nodeIds: ['t'],
        atomicGroups: [['t']],
        ui: false,
        execution: 'start-async',
        awaitBeforeNext: false,
        takeSnapshot: true,
      },
    ]);
  });

  it('requires segmentRemakeLock strictly true; numeric 1 keeps duplicate association edge IDs', () => {
    const nodes = [
      editingNodes[0],
      {
        ...editingNodes[1],
        data: {
          ...editingNodes[1].data,
          params: { ...editingNodes[1].data.params, segmentRemakeLock: 1 },
        },
      },
    ];
    const plan = planCanvasSelectedDeletePhases({
      nodes,
      edges: editingEdges,
      edgeIds: ['e2', 'e1', 'e2'],
    });
    expect(plan.editingTargetIds).toEqual([]);
    expect(plan.storyboardEdgeIds).toEqual(['e2', 'e1', 'e2']);
    expect(plan.phases).toEqual([
      {
        kind: 'storyboard-associations',
        edgeIds: ['e2', 'e1', 'e2'],
        execution: 'offer-confirmation-and-continue',
        awaitBeforeNext: false,
        notice: unlinkNotice,
        takeSnapshotOnAcceptance: true,
        onCancel: 'preserve-association-edges-only',
      },
    ]);
  });

  it('preserves requested ordinary/association order and duplicate missing IDs without expanding raw SCRIPT_V2', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: [
        { id: 's', type: 'image', data: { type: 'script' } },
        { id: 'v2', type: 'script', data: { type: 'script-v2' } },
        {
          id: 'g',
          type: 'image',
          data: { type: 'group', sourceScriptNodeId: 'nonexistent-other-script' },
        },
      ],
      edges: [
        { id: 'sg', source: 's', target: 'g' },
        { id: 'gs', source: 'g', target: 's' },
        { id: 'vg', source: 'v2', target: 'g' },
      ],
      edgeIds: ['sg', 'gs', 'vg', 'absent', 'sg', 'absent'],
    });
    expect(plan.storyboardEdgeIds).toEqual(['sg', 'gs', 'sg']);
    expect(plan.ordinaryEdgeIds).toEqual(['vg', 'absent', 'absent']);
    expect(plan.editingTargetIds).toEqual([]);
    expect(plan.phases.map((phase) => phase.kind)).toEqual([
      'ordinary-edges',
      'storyboard-associations',
    ]);
    expect(plan.phases[1].edgeIds).toEqual(['sg', 'gs', 'sg']);
  });

  it('chooses GROUP source-side owner first, needs existence rather than SCRIPT type, and does not exclude v2', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: [
        { id: 'owner', type: 'image', data: { type: 'image' } },
        {
          id: 'left',
          data: { type: 'group', sourceScriptNodeId: 'missing', sourceScriptVersion: 'v2' },
        },
        {
          id: 'right',
          data: { type: 'group', sourceScriptNodeId: 'owner', sourceScriptVersion: 'v2' },
        },
        { id: 'rc', parentId: 'right', data: { scriptRowHiddenUuid: 'row' } },
      ],
      edges: [
        { id: 'lr', source: 'left', target: 'right' },
        { id: 'rl', source: 'right', target: 'left' },
      ],
      edgeIds: ['lr', 'rl'],
    });
    expect(plan.ordinaryEdgeIds).toEqual(['lr']);
    expect(plan.storyboardEdgeIds).toEqual(['rl']);
  });

  it('does not replace the required direct hidden-row child with a grandchild search', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: [
        { id: 'owner', type: 'image' },
        { id: 'left', data: { type: 'group', sourceScriptNodeId: 'missing' } },
        { id: 'right', data: { type: 'group', sourceScriptNodeId: 'owner' } },
        { id: 'nested', parentId: 'right' },
        { id: 'rc', parentId: 'nested', data: { scriptRowHiddenUuid: 'row' } },
      ],
      edges: [
        { id: 'lr', source: 'left', target: 'right' },
        { id: 'rl', source: 'right', target: 'left' },
      ],
      edgeIds: ['lr', 'rl'],
    });
    expect(plan.ordinaryEdgeIds).toEqual(['lr', 'rl']);
    expect(plan.storyboardEdgeIds).toEqual([]);
  });

  it.each(['video', 'audio'])(
    'marks unconfirmed %s -> video-clip as unresolved mD work, never raw ordinary',
    (type) => {
      const plan = planCanvasSelectedDeletePhases({
        nodes: [
          { id: 'media', type },
          { id: 'clip', type: 'video-clip' },
        ],
        edges: [{ id: 'c', source: 'media', target: 'clip' }],
        edgeIds: ['c'],
      });
      expect(plan.ordinaryEdgeIds).toEqual([]);
      expect(plan.clipCandidateEdgeIds).toEqual(['c']);
      expect(plan.clipPreflight).toEqual({
        kind: 'mD',
        edgeIds: ['c'],
        resolved: false,
        before: 'ordinary-edges',
        requires: ['timeline-disconnect-model', 'clip-async-controller'],
      });
      expect(plan.phases).toEqual([
        {
          kind: 'clip-disconnect',
          candidateEdgeIds: ['c'],
          execution: 'start-async',
          awaitBeforeNext: false,
          takeSnapshot: 'before-apply',
          requiresPreflight: 'mD',
        },
      ]);
      expect(plan).not.toHaveProperty('clipTransactions');
      expect(plan).not.toHaveProperty('blockedEdgeIds');
    },
  );

  it('follows mD nullish flow/raw typing only for clip topology, not a logical-OR override', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: [
        { id: 'fallback', data: { type: 'audio' } },
        { id: 'flow-image', type: 'image', data: { type: 'video' } },
        { id: 'empty-flow', type: '', data: { type: 'video' } },
        { id: 'clip', type: 'video-clip' },
      ],
      edges: [
        { id: 'a', source: 'fallback', target: 'clip' },
        { id: 'i', source: 'flow-image', target: 'clip' },
        { id: 'empty', source: 'empty-flow', target: 'clip' },
      ],
      edgeIds: ['i', 'a', 'empty'],
    });
    expect(plan.ordinaryEdgeIds).toEqual(['i', 'empty']);
    expect(plan.clipCandidateEdgeIds).toEqual(['a']);
  });

  it('uses confirmed-delete for the source raw clip bypass without conflating the script-confirmed flag', () => {
    const input = {
      nodes: [
        { id: 'media', type: 'video' },
        { id: 'clip', type: 'video-clip' },
      ],
      edges: [{ id: 'c', source: 'media', target: 'clip' }],
      edgeIds: ['c'],
    };
    const confirmed = planCanvasSelectedDeletePhases({ ...input, isConfirmedDelete: true });
    expect(confirmed.ordinaryEdgeIds).toEqual(['c']);
    expect(confirmed.clipCandidateEdgeIds).toEqual([]);
    expect(confirmed.clipPreflight).toBeNull();
    expect(confirmed.phases).toEqual([
      { kind: 'ordinary-edges', edgeIds: ['c'], execution: 'synchronous', takeSnapshot: false },
    ]);
    const scriptOnly = planCanvasSelectedDeletePhases({ ...input, isScriptDeleteConfirmed: true });
    expect(scriptOnly.ordinaryEdgeIds).toEqual([]);
    expect(scriptOnly.clipCandidateEdgeIds).toEqual(['c']);
    expect(scriptOnly.clipPreflight.resolved).toBe(false);
  });

  it('keeps two confirmed flags independent for ordinary snapshot and aggregate association confirmation', () => {
    const input = {
      nodes: [
        { id: 's', data: { type: 'script' } },
        { id: 'g', data: { type: 'group', sourceScriptNodeId: 's' } },
      ],
      edges: [{ id: 'linked', source: 's', target: 'g' }],
      edgeIds: ['absent', 'linked'],
    };
    const scriptOnly = planCanvasSelectedDeletePhases({ ...input, isScriptDeleteConfirmed: true });
    expect(scriptOnly.phases).toEqual([
      { kind: 'ordinary-edges', edgeIds: ['absent'], execution: 'synchronous', takeSnapshot: true },
      {
        kind: 'storyboard-associations',
        edgeIds: ['linked'],
        execution: 'synchronous',
        awaitBeforeNext: false,
        notice: null,
        takeSnapshotOnAcceptance: false,
        onCancel: 'preserve-association-edges-only',
      },
    ]);
    const ordinaryOnly = planCanvasSelectedDeletePhases({ ...input, isConfirmedDelete: true });
    expect(ordinaryOnly.phases[0].takeSnapshot).toBe(false);
    expect(ordinaryOnly.phases[1].execution).toBe('offer-confirmation-and-continue');
    expect(ordinaryOnly.phases[1].notice).toEqual(unlinkNotice);
    expect(ordinaryOnly.phases[1].takeSnapshotOnAcceptance).toBe(true);
  });

  it('declares ordinary commit before async clip/editing starts, association offer, and node callback', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: [
        ...editingNodes,
        { id: 's2', data: { type: 'script' } },
        { id: 'g2', data: { type: 'group', sourceScriptNodeId: 's2' } },
        { id: 'media', type: 'video' },
        { id: 'clip', type: 'video-clip' },
        { id: 'selected-image', type: 'image' },
      ],
      edges: [
        ...editingEdges,
        { id: 'linked', source: 's2', target: 'g2' },
        { id: 'c', source: 'media', target: 'clip' },
      ],
      nodeIds: ['selected-image'],
      edgeIds: ['linked', 'c', 'e1', 'absent'],
    });
    expect(plan.ordinaryEdgeIds).toEqual(['absent']);
    expect(plan.editingTargetIds).toEqual(['t']);
    expect(plan.storyboardEdgeIds).toEqual(['linked']);
    expect(plan.clipCandidateEdgeIds).toEqual(['c']);
    expect(plan.phases.map((phase) => phase.kind)).toEqual([
      'ordinary-edges',
      'clip-disconnect',
      'editing-targets',
      'storyboard-associations',
      'selected-nodes',
    ]);
    expect(plan.clipPreflight.resolved).toBe(false);
    expect(plan.clipPreflight.before).toBe('ordinary-edges');
    expect(plan.phases[2].takeSnapshot).toBe(false);
    expect(plan.phases[3].awaitBeforeNext).toBe(false);
    expect(plan.phases[3].onCancel).toBe('preserve-association-edges-only');
    expect(plan.phases[4]).toEqual({
      kind: 'selected-nodes',
      nodeIds: ['selected-image'],
      ui: true,
      execution: 'start-async',
      awaitBeforeNext: false,
      skipLegacyNodeConfirmation: false,
      takeSnapshot: true,
    });
  });

  it('suppresses duplicate editing/node snapshots and association warning only after both node-accept flags', () => {
    const plan = planCanvasSelectedDeletePhases({
      nodes: [
        ...editingNodes,
        { id: 's2', data: { type: 'script' } },
        { id: 'g2', data: { type: 'group', sourceScriptNodeId: 's2' } },
      ],
      edges: [...editingEdges, { id: 'linked', source: 's2', target: 'g2' }],
      nodeIds: ['s2'],
      edgeIds: ['e1', 'linked'],
      isConfirmedDelete: true,
      isScriptDeleteConfirmed: true,
    });
    expect(plan.phases.map((phase) => phase.kind)).toEqual([
      'editing-targets',
      'storyboard-associations',
      'selected-nodes',
    ]);
    expect(plan.phases[0].takeSnapshot).toBe(false);
    expect(plan.phases[1].execution).toBe('synchronous');
    expect(plan.phases[1].notice).toBeNull();
    expect(plan.phases[1].takeSnapshotOnAcceptance).toBe(false);
    expect(plan.phases[2].skipLegacyNodeConfirmation).toBe(true);
    expect(plan.phases[2].takeSnapshot).toBe(false);
  });

  it('does not mutate graph, request ID arrays or selection while describing phases', () => {
    const nodes = Object.freeze([Object.freeze({ id: 'node', type: 'image', selected: true })]);
    const edges = Object.freeze([]);
    const nodeIds = Object.freeze(['node']);
    const edgeIds = Object.freeze(['missing', 'missing']);
    const plan = planCanvasSelectedDeletePhases({ nodes, edges, nodeIds, edgeIds });
    expect(plan.ordinaryEdgeIds).toEqual(['missing', 'missing']);
    expect(plan.phases[1].nodeIds).toEqual(['node']);
    expect(nodes).toEqual([{ id: 'node', type: 'image', selected: true }]);
    expect(edges).toEqual([]);
    expect(nodeIds).toEqual(['node']);
    expect(edgeIds).toEqual(['missing', 'missing']);
    expect(plan.phases[1].nodeIds).not.toBe(nodeIds);
    expect(plan).not.toHaveProperty('nodes');
    expect(plan).not.toHaveProperty('edges');
    expect(plan).not.toHaveProperty('history');
  });
});
