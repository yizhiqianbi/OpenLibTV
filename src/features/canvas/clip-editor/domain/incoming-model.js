// Source contract:417754 collector ->184656 hook ->272776 dN /244434 wrapper.
// The renderer keeps empty first URLs; the editor performs its own projection.
const EXPANDED_GROUP_TYPES = new Set(['group', 'video_group', 'video-story']);

function normalizeTextContent(content) {
  if (typeof content === 'string') return content.length > 0 ? [content] : [];
  return Array.isArray(content) ? content.filter((entry) => typeof entry === 'string') : [];
}

function isExpandedGroup(node) {
  return (
    typeof node.data?.type === 'string' &&
    EXPANDED_GROUP_TYPES.has(node.data.type) &&
    !node.data.characterAsset
  );
}

function expandSources(sources, nodes, excluded) {
  // Source preserves duplicate direct edges unless at least one group expands.
  if (!sources.some(isExpandedGroup)) return sources;
  const children = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId);
    if (siblings) siblings.push(node);
    else children.set(node.parentId, [node]);
  }
  const visited = new Set();
  const expanded = [];
  function visit(node, depth) {
    if (visited.has(node.id)) return;
    if (depth > 0 && excluded?.has(node.id)) {
      visited.add(node.id);
      return;
    }
    visited.add(node.id);
    if (isExpandedGroup(node)) {
      if (depth >= 8) return;
      for (const child of children.get(node.id) ?? []) visit(child, depth + 1);
    } else expanded.push(node);
  }
  for (const source of sources) visit(source, 0);
  return expanded;
}

function firstTransition(raw) {
  for (const transition of Array.isArray(raw) ? raw : [raw]) {
    if (!transition || typeof transition !== 'object') continue;
    const type = typeof transition.type === 'string' ? transition.type.trim() : '';
    if (
      type &&
      typeof transition.duration === 'number' &&
      Number.isFinite(transition.duration) &&
      transition.duration > 0
    )
      return { type, duration: transition.duration };
  }
}

function appendCompliance(item, data, node, isVideo) {
  if (!item.assetId && !item.compliantExempt) return;
  item.complianceCheckedAtMs = isVideo
    ? data.assetVideoComplianceCheckedAtMs
    : data.portraitComplianceCheckedAtMs;
  item.sourceCreatedAtMs = node.createdAtMs;
  item.sourceCreatedAtMsIsLocalPlaceholder = node.createdAtMsIsLocalPlaceholder;
}

function storedDirectorStudio(data) {
  if (data.studioDimensions === undefined) {
    const studio = data.directorStudio ?? {};
    return data.cameraControl
      ? {
          ...studio,
          cinematography: { ...studio.cinematography, cameraControl: data.cameraControl },
        }
      : studio;
  }
  const dimensions = data.studioDimensions;
  const covers = data.directorStudioPresetCovers;
  const narrative = {
    ...(dimensions.genre ? { genre: dimensions.genre } : {}),
    ...(dimensions.rhythm ? { rhythm: dimensions.rhythm } : {}),
    ...(covers?.narrative ? { coverUrl: covers.narrative } : {}),
  };
  const visualStyle = {
    ...(dimensions.colorStyle ? { colorPalette: dimensions.colorStyle } : {}),
    ...(dimensions.costumeEra ? { styling: dimensions.costumeEra } : {}),
    ...(dimensions.lighting ? { lighting: dimensions.lighting } : {}),
    ...(covers?.visualStyle ? { coverUrl: covers.visualStyle } : {}),
  };
  return {
    ...(Object.keys(narrative).length > 0 ? { narrative } : {}),
    ...(Object.keys(visualStyle).length > 0 ? { visualStyle } : {}),
    ...(data.cameraControl ? { cinematography: { cameraControl: data.cameraControl } } : {}),
  };
}

function collectSources(sources) {
  const result = { textList: [], imageList: [], videoList: [], audioList: [] };
  let directorId;
  for (const node of sources) {
    const data = node.data;
    if (!data?.type) continue;
    const meta = node.resourceMeta?.items?.[0];
    switch (data.type) {
      case 'text':
        result.textList.push({ nodeId: node.id, content: normalizeTextContent(data.content) });
        break;
      case 'image': {
        const protectedImage =
          data.protectionType === 'hidden' || data.protectionType === 'watermark';
        const urls = protectedImage
          ? (data.url ?? [])
          : data.originalUrl?.length
            ? data.originalUrl
            : (data.url ?? []);
        const item = {
          nodeId: node.id,
          url: urls[0] ?? '',
          label: data.name || data.label || undefined,
        };
        if (meta?.kind === 'image') {
          if (meta.width != null) item.width = meta.width;
          if (meta.height != null) item.height = meta.height;
        }
        if (data.portraitAssetId) item.assetId = data.portraitAssetId;
        else if (data.portraitCompliantExempt) item.compliantExempt = true;
        appendCompliance(item, data, node, false);
        result.imageList.push(item);
        break;
      }
      case 'video': {
        const item = {
          nodeId: node.id,
          url: (data.url ?? [])[0] ?? '',
          label: data.name || data.label || undefined,
        };
        if (meta?.kind === 'video') {
          if (meta.durationSec != null) item.durationSec = meta.durationSec;
          if (meta.width != null) item.width = meta.width;
          if (meta.height != null) item.height = meta.height;
        }
        const assetId = data.assetVideoAssetId ?? data.portraitAssetId;
        if (assetId) item.assetId = assetId;
        else if (data.assetVideoCompliantExempt) item.compliantExempt = true;
        appendCompliance(item, data, node, true);
        if (typeof data.subtitleUrl === 'string' && data.subtitleUrl.trim())
          item.subtitleUrl = data.subtitleUrl.trim();
        if (typeof data.subtitleHtmlUrl === 'string' && data.subtitleHtmlUrl.trim())
          item.subtitleHtmlUrl = data.subtitleHtmlUrl.trim();
        const transition = firstTransition(data.transition ?? data.transitions);
        if (transition) item.transition = transition;
        result.videoList.push(item);
        break;
      }
      case 'audio': {
        const item = {
          nodeId: node.id,
          url: (data.url ?? [])[0] ?? '',
          label: data.name || data.label || undefined,
        };
        if (meta?.kind === 'audio' && meta.durationSec != null) item.durationSec = meta.durationSec;
        const assetId = data.assetAudioAssetId ?? data.portraitAssetId;
        if (assetId) item.assetId = assetId;
        result.audioList.push(item);
        break;
      }
      case 'director-studio': {
        if (directorId && node.id >= directorId) break;
        directorId = node.id;
        const studio = storedDirectorStudio(data);
        const dimensions = data.studioDimensions ?? {
          ...(studio.narrative?.genre && studio.narrative.genre !== 'general'
            ? { genre: studio.narrative.genre }
            : {}),
          ...(studio.narrative?.rhythm && studio.narrative.rhythm !== 'general'
            ? { rhythm: studio.narrative.rhythm }
            : {}),
          ...(studio.visualStyle?.colorPalette
            ? { colorStyle: studio.visualStyle.colorPalette }
            : {}),
          ...(studio.visualStyle?.styling ? { costumeEra: studio.visualStyle.styling } : {}),
          ...(studio.visualStyle?.lighting ? { lighting: studio.visualStyle.lighting } : {}),
        };
        const cameraControl = data.cameraControl ?? studio.cinematography?.cameraControl;
        result.directorStudio = {
          studioDimensions: dimensions,
          ...(cameraControl ? { cameraControl } : {}),
          ...(data.cameraPresets?.length ? { cameraPresets: data.cameraPresets } : {}),
        };
        break;
      }
    }
  }
  return result;
}

/**
 * Exact target collector for clip renderer/editor. The graph's target record
 * supplies target filters; node identifies it, as184656 passes the target ID.
 */
export function collectVideoClipIncomingData({ node, nodes = [], edges = [] } = {}) {
  const targetId = node?.id;
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const target = byId.get(targetId);
  const incomingEdges = edges.filter((edge) => edge.target === targetId);
  const sources = incomingEdges
    .filter((edge) => !edge.data?.portraitVirtual && !edge.data?.assetVirtual)
    .map((edge) => byId.get(edge.source))
    .filter((source) => !!source);
  const excludedIds = Array.isArray(target?.data?.groupRefExcludedNodeIds)
    ? target.data.groupRefExcludedNodeIds.filter((id) => typeof id === 'string')
    : [];
  const result = collectSources(
    expandSources(sources, nodes, excludedIds.length ? new Set(excludedIds) : undefined),
  );
  for (const edge of incomingEdges) {
    const reference = edge.data?.characterRef;
    if (reference && typeof reference === 'object' && reference.mainReferenceImageUrl)
      result.imageList.push({
        nodeId: edge.source,
        url: reference.mainReferenceImageUrl,
        label: reference.roleName,
        characterRef: reference,
      });
  }
  const referenceImages = Array.isArray(target?.data?.refImages) ? target.data.refImages : [];
  for (let index = 0; index < referenceImages.length; index++)
    result.imageList.push({ nodeId: `${targetId}:ref-${index}`, url: referenceImages[index] });
  const focusedId = target?.data?.params?.focusRegion?.nodeId;
  if (focusedId) result.imageList = result.imageList.filter((item) => item.nodeId !== focusedId);
  return result;
}

/** dC reads the first incoming source's poster, independently of its URL. */
export function resolveVideoClipIncomingPoster({ incomingData, nodes = [] } = {}) {
  const sourceId = incomingData?.videoList?.[0]?.nodeId;
  return new Map(nodes.map((node) => [node.id, node])).get(sourceId)?.data?.poster;
}
