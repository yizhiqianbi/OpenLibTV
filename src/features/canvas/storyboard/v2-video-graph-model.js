import {
  cloneStoryboardVideoValue,
  collectStoryboardVideoRowReferences,
  createStoryboardVideoReferenceContext,
  projectStoryboardVideoPrompt,
  resolveStoryboardVideoAutoPosition,
  resolveStoryboardVideoReferenceMode,
} from './batch-video-graph-model.js';
import { normalizeScriptAssets } from './script-assets-model.js';
import { hasScriptAssetMedia } from './workflow-model.js';
import {
  extractScriptV2VideoDurationConstraint,
  resolveScriptV2VideoCapability,
} from './v2-video-config-model.js';
import {
  computeStoryboardNodeDimensionsFromRatio,
  extractStoryboardRatioFromNodeParams,
} from '../domain/storyboard-grid-model.js';

const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => Number.isFinite(value) && value > 0;
const positionValid = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const fresh = (time, now) => positive(time) && time <= now && now - time < 5_184_000_000;
const messages = {
  'invalid-graph': '画布数据无效，未创建视频组',
  'invalid-script': '当前脚本数据无效，未创建视频组',
  'no-script': '脚本已删除，未创建视频组',
  'not-v2-script': '当前节点不是新版脚本，未创建视频组',
  'invalid-selection': '镜头选择已变化，请重新选择',
  'no-children': '请至少选择一个镜头',
  'assets-not-ready': '请先准备全部脚本资产图片，未创建视频组',
  'missing-refs': '选中镜头缺少可用的资产参考图，未创建视频组',
  'unsupported-mode': '当前模型不支持这些镜头的参考图模式，请切换模型',
  'over-ref-limit': '选中镜头的参考图超过模型限制，请调整资产或切换模型',
  'invalid-config': '视频模型配置无效，未创建视频组',
  'invalid-duration': '镜头时长无效，未创建视频组',
  'empty-prompt': '请先完成选中镜头的提示词，未创建视频组',
  'invalid-position': '视频组位置无效，未创建视频组',
  'portrait-owner-changed': '人像审核结果与当前资产图片不匹配，请重新检查',
  'portrait-unverified': '该模型需要人像审核，审核服务尚未连接或证书已失效，未创建视频组',
};
const failure = (reason, blocked = false) => ({
  ok: false,
  reason,
  blocked,
  message: messages[reason] || '脚本数据或新节点标识无效，未创建视频组',
  addedNodes: [],
  addedEdges: [],
  nodePatches: [],
  warnings: [],
  portraitRequired: [],
  submitted: false,
});

function referenceGetter(nodes) {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  return (id) => {
    const node = lookup.get(id),
      data = node?.data,
      url = data?.url?.[0];
    if (!url) return undefined;
    if (typeof url !== 'string') throw new Error('Invalid primary URL');
    return {
      url,
      ...(typeof data.portraitAssetId === 'string' && data.portraitAssetId
        ? { assetId: data.portraitAssetId }
        : {}),
      ...(data.portraitCompliantExempt === true ? { compliantExempt: true } : {}),
      ...(data.portraitComplianceCheckedAtMs
        ? { complianceCheckedAtMs: data.portraitComplianceCheckedAtMs }
        : {}),
      ...(typeof node.createdAtMs === 'number' ? { sourceCreatedAtMs: node.createdAtMs } : {}),
      ...(node.createdAtMsIsLocalPlaceholder ? { sourceCreatedAtMsIsLocalPlaceholder: true } : {}),
    };
  };
}

/** All row maps are complete; selectedHiddenUuids changes only the required-reference maximum. */
export function describeScriptV2VideoReferences({ nodes, scriptId, selectedHiddenUuids } = {}) {
  const failed = (reason) => ({
    valid: false,
    reason,
    rows: [],
    refsByRow: new Map(),
    refCounts: new Map(),
    prompts: new Map(),
    requiredRefs: 0,
    maxRequiredRefs: 0,
    assetsReady: false,
    assetReadiness: { total: 0, readyCount: 0, pendingCount: 0, pendingAssetIds: [], ready: false },
  });
  try {
    if (!Array.isArray(nodes)) return failed('invalid-graph');
    const ids = new Set();
    for (const node of nodes) {
      if (!object(node) || typeof node.id !== 'string' || !node.id || ids.has(node.id))
        return failed('invalid-graph');
      ids.add(node.id);
    }
    const script = nodes.find((node) => node.id === scriptId);
    if (!script) return failed('no-script');
    if ((script.type || script.data?.type) !== 'script-v2') return failed('not-v2-script');
    if (
      !object(script.data) ||
      !Array.isArray(script.data.rows) ||
      script.data.rows.some((row) => !object(row))
    )
      return failed('invalid-script');
    if (selectedHiddenUuids !== undefined && !(selectedHiddenUuids instanceof Set))
      return failed('invalid-selection');
    const rows = script.data.rows,
      getNodeUrl = referenceGetter(nodes);
    const context = createStoryboardVideoReferenceContext({
      nodes,
      assets: script.data.assets,
      getNodeUrl,
    });
    const assetItems = normalizeScriptAssets(script.data).flatMap((group) => group.items);
    const pendingAssetIds = assetItems
      .filter((asset) => !hasScriptAssetMedia(asset, getNodeUrl))
      .map((asset) => asset.id);
    const assetReadiness = {
      total: assetItems.length,
      readyCount: assetItems.length - pendingAssetIds.length,
      pendingCount: pendingAssetIds.length,
      pendingAssetIds,
      ready: !pendingAssetIds.length,
    };
    const refsByRow = new Map(),
      refCounts = new Map(),
      prompts = new Map();
    let requiredRefs = 0;
    for (const row of rows) {
      const references = collectStoryboardVideoRowReferences({ row, context });
      if (!row.hiddenUuid) continue;
      if (typeof row.hiddenUuid !== 'string' || refsByRow.has(row.hiddenUuid))
        return failed('invalid-script');
      const previewRefs = [
        { nodeId: '__poster_placeholder__', url: '' },
        ...references.map((ref) => ({ ...ref, url: '' })),
      ];
      const previewPrompt = projectStoryboardVideoPrompt({
        row,
        references: previewRefs,
        context,
      }).prompt.replace(/\{\{Image (\d+)\}\}/g, '图片$1');
      refsByRow.set(row.hiddenUuid, { row, references, previewPrompt });
      refCounts.set(row.hiddenUuid, references.length);
      prompts.set(row.hiddenUuid, previewPrompt);
      if (!selectedHiddenUuids || selectedHiddenUuids.has(row.hiddenUuid))
        requiredRefs = Math.max(requiredRefs, references.length);
    }
    return {
      valid: true,
      reason: '',
      script,
      rows,
      refsByRow,
      refCounts,
      prompts,
      requiredRefs,
      maxRequiredRefs: requiredRefs,
      assetReadiness,
      assetsReady: assetReadiness.ready,
    };
  } catch {
    return failed('invalid-script');
  }
}

function certificateTime(ref) {
  return positive(ref.complianceCheckedAtMs)
    ? ref.complianceCheckedAtMs
    : ref.sourceCreatedAtMsIsLocalPlaceholder
      ? undefined
      : ref.sourceCreatedAtMs;
}
function hasProof(ref, nowMs) {
  return (
    ((typeof ref.assetId === 'string' && ref.assetId) || ref.compliantExempt === true) &&
    fresh(certificateTime(ref), nowMs)
  );
}
function normalizeDuration(value, constraint) {
  if (!constraint) return value;
  if (constraint.type === 'enum') {
    const values = [...constraint.values].sort((a, b) => a - b);
    if (Number.isNaN(value) || value <= 0 || value <= values[0]) return values[0];
    if (value >= values.at(-1)) return values.at(-1);
    return values.reduce((best, candidate) => {
      const distance = Math.abs(candidate - value),
        old = Math.abs(best - value);
      return distance < old || (distance === old && candidate > best) ? candidate : best;
    }, values[0]);
  }
  const { min, max, step } = constraint;
  if (Number.isNaN(value) || value <= 0 || value <= min) return min;
  if (value >= max) return max;
  return Math.min(max, Math.max(min, min + Math.round((value - min) / step) * step));
}

/** ScriptV2 rw/eq: explicit selected rows, asset-only references, empty generators and script link. */
export function planCanvasScriptV2VideoGraph({
  nodes,
  edges,
  scriptId,
  config,
  selectedHiddenUuids,
  perShotDurations = new Map(),
  makeId,
  nowMs,
  portraitResults = [],
  groupPosition,
} = {}) {
  try {
    const description = describeScriptV2VideoReferences({ nodes, scriptId, selectedHiddenUuids });
    if (!description.valid) return failure(description.reason);
    if (!(selectedHiddenUuids instanceof Set)) return failure('invalid-selection');
    if (!Array.isArray(edges) || nodes.some((node) => !positionValid(node.position)))
      return failure('invalid-graph');
    const occupied = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
      if (
        !object(edge) ||
        typeof edge.id !== 'string' ||
        !edge.id ||
        occupied.has(edge.id) ||
        typeof edge.source !== 'string' ||
        typeof edge.target !== 'string'
      )
        return failure('invalid-graph');
      occupied.add(edge.id);
    }
    if (
      !object(config) ||
      typeof config.model !== 'string' ||
      !config.model ||
      !object(config.modelSchema) ||
      typeof makeId !== 'function'
    )
      return failure('invalid-config');
    if (config.settings != null && !object(config.settings)) return failure('invalid-config');
    if (!(perShotDurations instanceof Map)) return failure('invalid-duration');
    const rows = description.rows.filter(
      (row) => row.hiddenUuid && selectedHiddenUuids.has(row.hiddenUuid),
    );
    if (!rows.length) return failure('no-children');
    if (!description.assetsReady) return failure('assets-not-ready');
    if (rows.some((row) => !description.refCounts.get(row.hiddenUuid)))
      return failure('missing-refs');
    const capability = resolveScriptV2VideoCapability(config.modelSchema, description.requiredRefs);
    if (!capability.usable || capability.maxRefs <= 0) return failure('unsupported-mode');
    if (rows.some((row) => description.refCounts.get(row.hiddenUuid) > capability.maxRefs))
      return failure('over-ref-limit');
    if (rows.some((row) => !(row.videoMotionPrompt || row.plotDescription || '').trim()))
      return failure('empty-prompt');
    const settings = cloneStoryboardVideoValue(config.settings ?? {});
    const nodeById = new Map(nodes.map((node) => [node.id, node])),
      patches = new Map();
    const allRefs = new Map(
      rows.flatMap((row) =>
        description.refsByRow.get(row.hiddenUuid).references.map((ref) => [ref.nodeId, ref]),
      ),
    );
    const requiresPortrait =
      config.modelSchema.properties?.portrait === true ||
      (typeof config.modelSchema.modelVendor === 'string' &&
        config.modelSchema.modelVendor.startsWith('star-video2'));
    if (requiresPortrait) {
      const assets = normalizeScriptAssets(description.script.data).flatMap((group) => group.items);
      const describe = (ref) => ({
        ...ref,
        linkedNodeId: ref.nodeId,
        assetIds: assets
          .filter((asset) => asset.linkedNodeId === ref.nodeId)
          .map((asset) => asset.id),
        originalUrl: [nodeById.get(ref.nodeId)?.data?.originalUrl]
          .flatMap((value) =>
            Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
          )
          .filter((value) => typeof value === 'string'),
      });
      const blocked = (refs) => ({
        ...failure('portrait-unverified', true),
        portraitRequired: refs.map(describe),
      });
      if (!positive(nowMs) || !Array.isArray(portraitResults))
        return blocked([...allRefs.values()]);
      const resultIds = new Set();
      for (const result of portraitResults) {
        const ref = allRefs.get(result?.nodeId);
        if (!ref || resultIds.has(result.nodeId) || result.url !== ref.url)
          return failure('portrait-owner-changed', true);
        resultIds.add(result.nodeId);
        if (
          result.status !== 'approved' ||
          !fresh(result.checkedAtMs, nowMs) ||
          !((typeof result.assetId === 'string' && result.assetId) || result.exempt === true)
        )
          return blocked([ref]);
        const assetId =
          typeof result.assetId === 'string' && result.assetId ? result.assetId : undefined;
        const data = {
          portraitAssetId: assetId,
          portraitCompliantExempt: assetId ? undefined : true,
          portraitComplianceCheckedAtMs: result.checkedAtMs,
        };
        patches.set(ref.nodeId, { nodeId: ref.nodeId, data });
        allRefs.set(ref.nodeId, {
          ...ref,
          assetId,
          compliantExempt: assetId ? undefined : true,
          complianceCheckedAtMs: result.checkedAtMs,
        });
      }
      const required = [...allRefs.values()].filter((ref) => !hasProof(ref, nowMs));
      if (required.length) return blocked(required);
    }
    const projectedNodes = nodes.map((node) =>
      patches.has(node.id)
        ? { ...node, data: { ...node.data, ...patches.get(node.id).data } }
        : node,
    );
    const context = createStoryboardVideoReferenceContext({
      nodes: projectedNodes,
      assets: description.script.data.assets,
      getNodeUrl: referenceGetter(projectedNodes),
    });
    const label =
      description.script.data.title ||
      description.script.data.name ||
      description.script.data.label ||
      '脚本';
    if (typeof label !== 'string') return failure('invalid-script');
    const position = groupPosition ?? resolveStoryboardVideoAutoPosition(description.script, nodes);
    if (!positionValid(position)) return failure('invalid-position');
    const size = computeStoryboardNodeDimensionsFromRatio(
      extractStoryboardRatioFromNodeParams(config),
    );
    const columns = Math.ceil(Math.sqrt(rows.length)),
      gridRows = Math.ceil(rows.length / columns);
    const gridWidth = 80 + columns * size.width + (columns - 1) * 40,
      gridHeight = 110 + gridRows * size.height + (gridRows - 1) * 40;
    const constraint = extractScriptV2VideoDurationConstraint(config.modelSchema);
    let unsupportedShotCount = 0,
      unsupportedRefCount = 0;
    const plans = rows.map((row) => {
      const references = collectStoryboardVideoRowReferences({ row, context }).map((ref) => ({
        nodeId: ref.nodeId,
        url: ref.url,
        ...(ref.assetId ? { assetId: ref.assetId } : {}),
        ...(ref.compliantExempt ? { compliantExempt: true } : {}),
      }));
      // rg chooses its model using the largest selected reference count, while
      // eq resolves each row independently. A smaller row can fall below its
      // mixed minimum and must then drop its references and become text2video.
      const modeType = resolveStoryboardVideoReferenceMode(
        config.modelSchema,
        references.length,
        config.modeType,
      );
      if (!modeType && references.length) {
        unsupportedShotCount += 1;
        unsupportedRefCount += references.length;
        references.length = 0;
      }
      const rowSettings = cloneStoryboardVideoValue(settings),
        duration = perShotDurations.get(row.hiddenUuid);
      if (duration !== undefined && !Number.isFinite(duration)) throw new Error('Invalid duration');
      if (typeof duration === 'number' && Number.isFinite(duration))
        rowSettings.duration = normalizeDuration(duration, constraint);
      return {
        row,
        references,
        modeType: modeType || 'text2video',
        settings: rowSettings,
        ...projectStoryboardVideoPrompt({ row, references, context }),
      };
    });
    const nextId = (kind) => {
      const id = makeId(kind);
      if (typeof id !== 'string' || !id || occupied.has(id)) throw new Error('Invalid ID');
      occupied.add(id);
      return id;
    };
    const groupId = nextId('video_group'),
      addedEdges = [];
    const children = plans.map((plan, index) => {
      const id = nextId('video');
      addedEdges.push(
        ...plan.references.map((ref) => ({
          id: nextId('edge'),
          source: ref.nodeId,
          sourceHandle: 'source',
          target: id,
          targetHandle: 'target',
        })),
      );
      return {
        id,
        type: 'video',
        parentId: groupId,
        ...size,
        measured: { ...size },
        position: {
          x: 40 + (index % columns) * (size.width + 40),
          y: 70 + Math.floor(index / columns) * (size.height + 40),
        },
        data: {
          type: 'video',
          action: 'video_generate',
          name: `分镜视频-#${plan.row.shotNumber ?? index + 1}`,
          url: [],
          poster: '',
          params: {
            prompt: plan.prompt,
            model: config.model,
            modeType: plan.modeType,
            settings: plan.settings,
            image: '',
            imageList: plan.references,
            imageListOrder: plan.references.length
              ? plan.references.map((ref) => ref.nodeId)
              : undefined,
            imageLabelList: plan.references.length ? plan.imageLabelList : undefined,
            scene: 'group-generate',
          },
          _explicitContentDims: true,
          contentWidth: size.width,
          contentHeight: size.height,
        },
      };
    });
    addedEdges.push({
      id: nextId('edge'),
      source: scriptId,
      sourceHandle: 'source',
      target: groupId,
      targetHandle: 'target',
    });
    const name = `视频组 · ${label}`;
    const group = {
      id: groupId,
      type: 'group',
      position: { ...position },
      width: gridWidth,
      height: gridHeight,
      measured: { width: gridWidth, height: gridHeight },
      zIndex: -1001,
      style: {
        background: 'var(--canvas-storyboard-group-shell-bg, #212121)',
        border: '1px solid var(--canvas-group-border)',
      },
      data: {
        type: 'group',
        name,
        groupColor: null,
        sourceScriptNodeId: scriptId,
        storyboardTitle: name,
        storyboardGroupType: 'video',
        sourceScriptVersion: 'v2',
      },
    };
    const nodePatches = [
      ...patches.values(),
      { nodeId: scriptId, data: { linkedVideoGroupId: groupId } },
    ];
    return {
      ok: true,
      reason: '',
      blocked: false,
      message: '',
      groupId,
      sourceScriptNodeId: scriptId,
      addedNodes: [group, ...children],
      addedEdges,
      nodePatches,
      gridWidth,
      gridHeight,
      warnings: unsupportedRefCount
        ? [
            {
              key: 'canvas:storyboardVideoRefUnsupportedByModel',
              values: { shotCount: unsupportedShotCount, refCount: unsupportedRefCount },
            },
          ]
        : [],
      portraitRequired: [],
      submitted: false,
    };
  } catch {
    return failure('invalid-build-input');
  }
}
