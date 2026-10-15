const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = (value) => (Array.isArray(value) ? value : []);
const groupTypes = new Set(['group', 'video_group', 'video-story']);
const empty = () => ({ textList: [], imageList: [], videoList: [], audioList: [] });
const content = (value) =>
  typeof value === 'string'
    ? value.length
      ? [value]
      : []
    : array(value).filter((item) => typeof item === 'string');

export function expandScriptV2GeneratorSources(roots, nodes, excluded = new Set()) {
  // Source A returns the original array, including duplicate direct edges, unless
  // there is at least one expandable group among the roots.
  if (!roots.some((node) => groupTypes.has(node.data?.type) && !node.data?.characterAsset))
    return roots;
  const children = new Map(),
    seen = new Set(),
    sources = [];
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  const visit = (node, depth = 0) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if (depth > 0 && excluded.has(node.id)) return;
    if (groupTypes.has(node.data?.type) && !node.data?.characterAsset) {
      if (depth >= 8) return;
      for (const child of children.get(node.id) || []) visit(child, depth + 1);
    } else sources.push(node);
  };
  roots.forEach((node) => visit(node));
  return sources;
}

function collect(nodes, localTextOverrides) {
  const incoming = empty();
  let directorId;
  for (const node of nodes) {
    const data = node.data;
    if (!data?.type) continue;
    const meta = node.resourceMeta?.items?.[0];
    if (data.type === 'text') {
      // CanvasNode edits data.text; its explicit empty value must not revive the
      // historical source content. Source-only snapshots retain S(data.content).
      incoming.textList.push({
        nodeId: node.id,
        content: content(
          localTextOverrides && typeof data.text === 'string' ? data.text : data.content,
        ),
      });
    } else if (data.type === 'director-studio') {
      if (directorId && node.id >= directorId) continue;
      directorId = node.id;
      const dimensions = data.studioDimensions,
        stored = data.directorStudio ?? {},
        settings =
          dimensions === undefined
            ? data.cameraControl
              ? {
                  ...stored,
                  cinematography: { ...stored.cinematography, cameraControl: data.cameraControl },
                }
              : stored
            : {
                narrative: {
                  ...(dimensions.genre ? { genre: dimensions.genre } : {}),
                  ...(dimensions.rhythm ? { rhythm: dimensions.rhythm } : {}),
                },
                visualStyle: {
                  ...(dimensions.colorStyle ? { colorPalette: dimensions.colorStyle } : {}),
                  ...(dimensions.costumeEra ? { styling: dimensions.costumeEra } : {}),
                  ...(dimensions.lighting ? { lighting: dimensions.lighting } : {}),
                },
              },
        studioDimensions = dimensions ?? {
          ...(settings.narrative?.genre && settings.narrative.genre !== 'general'
            ? { genre: settings.narrative.genre }
            : {}),
          ...(settings.narrative?.rhythm && settings.narrative.rhythm !== 'general'
            ? { rhythm: settings.narrative.rhythm }
            : {}),
          ...(settings.visualStyle?.colorPalette
            ? { colorStyle: settings.visualStyle.colorPalette }
            : {}),
          ...(settings.visualStyle?.styling ? { costumeEra: settings.visualStyle.styling } : {}),
          ...(settings.visualStyle?.lighting ? { lighting: settings.visualStyle.lighting } : {}),
        },
        cameraControl = data.cameraControl ?? settings.cinematography?.cameraControl;
      incoming.directorStudio = {
        studioDimensions,
        ...(cameraControl ? { cameraControl } : {}),
        ...(data.cameraPresets?.length ? { cameraPresets: data.cameraPresets } : {}),
      };
    } else if (['image', 'video', 'audio'].includes(data.type)) {
      const type = data.type,
        raw =
          type === 'image' &&
          !['hidden', 'watermark'].includes(data.protectionType) &&
          data.originalUrl?.length
            ? data.originalUrl
            : (data.url ?? []),
        ref = { nodeId: node.id, url: raw[0] ?? '', label: data.name || data.label || undefined };
      if (meta?.kind === type) {
        for (const key of type === 'audio'
          ? ['durationSec']
          : type === 'video'
            ? ['durationSec', 'width', 'height']
            : ['width', 'height'])
          if (meta[key] != null) ref[key] = meta[key];
      }
      if (type === 'image') {
        if (data.portraitAssetId) ref.assetId = data.portraitAssetId;
        else if (data.portraitCompliantExempt) ref.compliantExempt = true;
        if (ref.assetId || ref.compliantExempt) {
          ref.complianceCheckedAtMs = data.portraitComplianceCheckedAtMs;
          ref.sourceCreatedAtMs = node.createdAtMs;
          ref.sourceCreatedAtMsIsLocalPlaceholder = node.createdAtMsIsLocalPlaceholder;
        }
      } else if (type === 'video') {
        const assetId = data.assetVideoAssetId ?? data.portraitAssetId;
        if (assetId) ref.assetId = assetId;
        else if (data.assetVideoCompliantExempt) ref.compliantExempt = true;
        if (ref.assetId || ref.compliantExempt) {
          ref.complianceCheckedAtMs = data.assetVideoComplianceCheckedAtMs;
          ref.sourceCreatedAtMs = node.createdAtMs;
          ref.sourceCreatedAtMsIsLocalPlaceholder = node.createdAtMsIsLocalPlaceholder;
        }
        for (const key of ['subtitleUrl', 'subtitleHtmlUrl'])
          if (typeof data[key] === 'string' && data[key].trim()) ref[key] = data[key].trim();
        for (const transition of Array.isArray(data.transition ?? data.transitions)
          ? (data.transition ?? data.transitions)
          : [data.transition ?? data.transitions]) {
          if (!record(transition)) continue;
          const transitionType = typeof transition.type === 'string' ? transition.type.trim() : '';
          if (transitionType && Number.isFinite(transition.duration) && transition.duration > 0) {
            ref.transition = { type: transitionType, duration: transition.duration };
            break;
          }
        }
      } else {
        const assetId = data.assetAudioAssetId ?? data.portraitAssetId;
        if (assetId) ref.assetId = assetId;
      }
      incoming[`${type}List`].push(ref);
    }
  }
  return incoming;
}

/** Exact ScriptV2-relevant source 417754 target collector; no stored media fallback. */
export function collectScriptV2GeneratorInputs({
  node,
  nodes = [],
  edges = [],
  localTextOverrides = true,
} = {}) {
  const invalid = (reason) => ({ valid: false, reason, incoming: empty() });
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return invalid('invalid-graph');
  const lookup = new Map();
  for (const item of nodes) {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !item.id ||
      lookup.has(item.id) ||
      (item.data != null && !record(item.data))
    )
      return invalid('invalid-graph');
    lookup.set(item.id, item);
  }
  if (edges.some((edge) => !record(edge))) return invalid('invalid-graph');
  const target = lookup.get(node?.id);
  if (!target) return invalid('no-script');
  const targetEdges = edges.filter((edge) => edge.target === target.id),
    roots = targetEdges
      .filter((edge) => !edge.data?.portraitVirtual && !edge.data?.assetVirtual)
      .map((edge) => lookup.get(edge.source))
      .filter(Boolean),
    excluded = new Set(
      array(target.data?.groupRefExcludedNodeIds).filter((id) => typeof id === 'string'),
    ),
    sources = expandScriptV2GeneratorSources(roots, nodes, excluded);
  const incoming = collect(sources, localTextOverrides);
  for (const edge of targetEdges) {
    const character = edge.data?.characterRef;
    if (record(character) && character.mainReferenceImageUrl)
      incoming.imageList.push({
        nodeId: edge.source,
        url: character.mainReferenceImageUrl,
        label: character.roleName,
        characterRef: character,
      });
  }
  array(target.data?.refImages).forEach((url, index) =>
    incoming.imageList.push({ nodeId: `${target.id}:ref-${index}`, url }),
  );
  const focusId = target.data?.params?.focusRegion?.nodeId;
  if (focusId) incoming.imageList = incoming.imageList.filter((ref) => ref.nodeId !== focusId);
  return { valid: true, reason: '', incoming };
}

/** Keep URL/text values by reference; do not stringify a graph or large data URLs. */
export function scriptV2GeneratorInputIdentity(incoming) {
  return ['textList', 'imageList', 'videoList', 'audioList'].map((key) => [
    key,
    array(incoming?.[key]).map((ref) => ({ ...ref })),
  ]);
}
