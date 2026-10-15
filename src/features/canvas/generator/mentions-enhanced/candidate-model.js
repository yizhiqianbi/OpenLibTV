const KINDS = ['image', 'video', 'audio', 'text'];
export const CANVAS_REFERENCE_KINDS = Object.freeze(KINDS);
export const REFERENCE_LABELS = Object.freeze({
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
});

export function getReferenceNodeKind(node) {
  const type = node?.data?.type ?? node?.type;
  return KINDS.includes(type) ? type : null;
}

/** Source 163688: missing validation is an unavailable capability, never implicit approval. */
export function evaluateReferenceCandidate(source, target, dependencies) {
  const kind = getReferenceNodeKind(source);
  if (!kind || !dependencies?.validate) return { available: false, reason: 'modelUnsupported' };
  if (kind !== 'text') {
    const canAccept = dependencies.canAcceptMore?.(target, kind);
    if (canAccept !== true)
      return { available: false, reason: canAccept === false ? 'limit' : 'modelUnsupported' };
  }
  const result = dependencies.validate(source, target);
  return result?.allowed === true && !result.switchToModel
    ? { available: true }
    : { available: false, reason: 'modelUnsupported' };
}

/** Yield every 32 records, matching the original cancellable public graph collector. */
export async function collectCanvasReferenceCandidates({
  nodes = [],
  edges = [],
  targetNodeId,
  dependencies,
  signal,
  isStale = () => false,
  scriptV2ImageOnly = false,
}) {
  const stale = () => signal?.aborted || isStale();
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!target || stale()) return null;
  const imageOnly = scriptV2ImageOnly && (target.data?.type ?? target.type) === 'script-v2';
  const byId = imageOnly ? new Map(nodes.map((node) => [node.id, node])) : null;
  const connectedNodeIds = new Set();
  const real = new Set();
  const virtual = new Set();
  const yieldAt = async (index) => {
    if (index > 0 && index % 32 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    return stale();
  };
  for (let index = 0; index < edges.length; index += 1) {
    if (await yieldAt(index)) return null;
    const edge = edges[index];
    if (
      edge.target !== targetNodeId ||
      (byId && getReferenceNodeKind(byId.get(edge.source)) !== 'image')
    )
      continue;
    connectedNodeIds.add(edge.source);
    (edge.data?.portraitVirtual || edge.data?.assetVirtual ? virtual : real).add(edge.source);
  }
  const limits = new Map();
  const cachedDependencies = {
    validate: dependencies?.validate,
    canAcceptMore(targetNode, kind) {
      if (!limits.has(kind)) limits.set(kind, dependencies?.canAcceptMore?.(targetNode, kind));
      return limits.get(kind);
    },
  };
  const candidates = [];
  let hasLimit = false;
  for (let index = 0; index < nodes.length; index += 1) {
    if (await yieldAt(index)) return null;
    const node = nodes[index];
    const kind = getReferenceNodeKind(node);
    if (
      node.id === targetNodeId ||
      !kind ||
      (imageOnly && kind !== 'image') ||
      (virtual.has(node.id) && !real.has(node.id))
    )
      continue;
    if (real.has(node.id)) candidates.push({ node, kind, connected: true });
    else {
      const result = evaluateReferenceCandidate(node, target, cachedDependencies);
      if (result.reason === 'limit') hasLimit = true;
      candidates.push({
        node,
        kind,
        connected: false,
        ...(result.available ? {} : { blockReason: result.reason }),
      });
    }
  }
  if (stale()) return null;
  return {
    candidates,
    connectedNodeIds,
    limitCount: hasLimit
      ? candidates.filter((candidate) => candidate.connected && candidate.kind !== 'text').length +
        (Array.isArray(target.data?.refImages) ? target.data.refImages.length : 0)
      : null,
  };
}

/** Source 112007 nG: existing token order, then edge order, then original node order. */
export function presentCanvasReferenceCandidates({
  collected,
  options = [],
  edges = [],
  targetNodeId,
  ignoredKinds = [],
  preview = () => ({}),
}) {
  if (!collected) return undefined;
  const optionsById = new Map(options.map((option) => [option.nodeId, option]));
  const candidates = collected.candidates.map(({ node, kind, connected, blockReason }) => {
    const data = node.data ?? {};
    const name = data.name ?? data.title ?? data.label;
    const option = optionsById.get(node.id);
    const media = preview(node) ?? {};
    return {
      nodeId: node.id,
      kind,
      connected,
      label: typeof name === 'string' && name.trim() ? name.trim() : REFERENCE_LABELS[kind],
      previewUrl: media.previewUrl ?? option?.url ?? option?.thumbnailUrl,
      previewMedia: media.previewMedia,
      thumbnailUrl:
        kind === 'image'
          ? media.previewUrl
          : kind === 'video' && typeof data.poster === 'string'
            ? data.poster.trim() || undefined
            : undefined,
      mediaWidth: media.width,
      mediaHeight: media.height,
      mentionOption: option,
      disabledReason:
        blockReason ??
        (kind !== 'text' && (ignoredKinds.includes(kind) || (connected && !option))
          ? 'modelUnsupported'
          : undefined),
    };
  });
  const present = new Set(candidates.map((candidate) => candidate.nodeId));
  for (const option of options) {
    if (!option.nodeId || present.has(option.nodeId)) continue;
    const kind = option.mediaType ?? (option.type === 'mixed' ? 'image' : (option.type ?? 'image'));
    candidates.push({
      nodeId: option.nodeId,
      kind: KINDS.includes(kind) ? kind : 'image',
      label: option.optionLabel ?? option.label,
      connected: true,
      previewUrl: option.url ?? option.thumbnailUrl,
      previewMedia: kind === 'image' || kind === 'video' ? kind : undefined,
      mentionOption: option,
    });
  }
  const order = new Map(options.map((option, index) => [option.nodeId, index]));
  const incoming = new Map(
    edges
      .filter((edge) => edge.target === targetNodeId)
      .map((edge, index) => [edge.source, options.length + index]),
  );
  const rank = (candidate) =>
    order.get(candidate.nodeId) ?? incoming.get(candidate.nodeId) ?? Number.MAX_SAFE_INTEGER;
  return [
    ...candidates.filter((candidate) => candidate.connected).sort((a, b) => rank(a) - rank(b)),
    ...candidates.filter((candidate) => !candidate.connected),
  ];
}

export function canvasReferenceMenuModel(
  candidates = [],
  { search = '', kind = null, connectedLimit = 12, hiddenKinds = [] } = {},
) {
  const query = search.trim().toLocaleLowerCase();
  const kinds = KINDS.filter((value) => !hiddenKinds.includes(value));
  const all = candidates.filter((candidate) => kinds.includes(candidate.kind));
  const connected = all.filter((candidate) => candidate.connected);
  const matches = (candidate) => candidate.label.toLocaleLowerCase().includes(query);
  const entries = [];
  let visible;
  if (query) {
    const referenced = connected.filter(matches);
    if (referenced.length)
      entries.push(
        { type: 'heading', key: 'connected', label: '已引用' },
        ...referenced.map((option) => ({
          type: 'option',
          key: `connected-${option.nodeId}`,
          option,
        })),
      );
    for (const value of kinds) {
      const group = all.filter(
        (candidate) => !candidate.connected && candidate.kind === value && matches(candidate),
      );
      if (group.length)
        entries.push(
          { type: 'heading', key: value, label: REFERENCE_LABELS[value] },
          ...group.map((option) => ({ type: 'option', key: `${value}-${option.nodeId}`, option })),
        );
    }
    visible = entries.filter((entry) => entry.type === 'option').map((entry) => entry.option);
  } else if (kind) {
    visible = all.filter((candidate) => candidate.kind === kind);
    entries.push(...visible.map((option) => ({ type: 'option', key: option.nodeId, option })));
  } else visible = connected.slice(0, Math.max(12, connectedLimit));
  if ((query || kind) && !entries.length)
    entries.push({ type: 'empty', key: 'empty', label: '暂无可引用资产，请连入后操作' });
  const seen = new Set();
  const keyboardOptions = visible.filter(
    (option) =>
      !option.disabledReason && !seen.has(option.nodeId) && (seen.add(option.nodeId), true),
  );
  return {
    query,
    kinds,
    all,
    connected,
    visibleConnected: connected.slice(0, Math.max(12, connectedLimit)),
    visible,
    entries,
    keyboardOptions,
  };
}

/** Source 196260: a text connection consumes @ but never inserts a media token. */
export function commitCanvasMentionSelection({
  reference,
  targetNodeId,
  connect,
  getLatestReference,
  insertMention,
  consumeTextTrigger,
  onConnectFailed,
  onConnectedWithoutMention,
}) {
  if (reference.disabledReason) return 'disabled';
  if (
    !reference.connected &&
    (!targetNodeId || connect?.(reference.nodeId, targetNodeId) !== true)
  ) {
    onConnectFailed?.();
    return 'connectFailed';
  }
  if (reference.kind === 'text') {
    consumeTextTrigger();
    return 'textConnected';
  }
  const option = reference.connected
    ? reference.mentionOption
    : getLatestReference?.(reference.nodeId);
  if (option) {
    insertMention(option);
    return 'mentionInserted';
  }
  onConnectedWithoutMention?.();
  return 'connectedWithoutMention';
}
