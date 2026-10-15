export type AgentNodeReferenceValue = Readonly<Record<string, unknown>>;
export type AgentCanvasNode = {
  id: string;
  type?: string;
  data?: Readonly<Record<string, unknown>>;
};
export type AgentNodePreview = { url: string; mediaType: 'image' | 'video' };
export type AgentNodePresentationOptions = {
  nodes?: readonly AgentCanvasNode[];
  projectId?: string;
  ready?: boolean;
  isShareReplay?: boolean;
  canLocate?: boolean;
  canOpenProject?: boolean;
};
export type AgentNodePresentation = {
  state: 'live' | 'missing' | 'snapshot' | 'loading' | 'other-project' | 'pending' | 'error';
  nodeId: string;
  projectId?: string;
  label: string;
  nodeType: string;
  title: string;
  deleted: boolean;
  dimmed: boolean;
  canLocate: boolean;
  canOpenProject: boolean;
  preview?: AgentNodePreview;
  previewSource?: 'live' | 'snapshot';
};

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const firstUrl = (value: unknown) =>
  Array.isArray(value) ? value.map(trimmed).find(Boolean) || '' : trimmed(value);

/** A node preview is not an upload source or a workspace locator. */
export function safeAgentNodePreviewUrl(value: unknown): string {
  const url = trimmed(value);
  if (/^(?:https?:|blob:|data:(?:image|video)\/)/i.test(url)) return url;
  if (/^(?:\/(?!\/)|\.\.?\/)/.test(url)) return url;
  return '';
}

/** Source 682580 reads data.type, image url/originalUrl, and video url only. */
export function agentNodeLivePreview(node: AgentCanvasNode): AgentNodePreview | undefined {
  const data = node.data || {};
  const mediaType = data.type;
  if (mediaType !== 'image' && mediaType !== 'video') return undefined;
  const url = safeAgentNodePreviewUrl(
    firstUrl(data.url) || (mediaType === 'image' ? firstUrl(data.originalUrl) : ''),
  );
  return url ? { url, mediaType } : undefined;
}

/** Source 103145 uses OSS video snapshots for HTTP non-WebM URLs without existing processing. */
export function agentNodeVideoPoster(url: string, requestedWidth: number): string | undefined {
  if (
    !/^https?:/i.test(url) ||
    url.includes('x-oss-process=') ||
    /\.webm$/i.test(url.replace(/[?#].*$/, ''))
  )
    return undefined;
  const width = [200, 400, 800, 1600].find((tier) => tier >= requestedWidth) || 1600;
  return `${url}${url.includes('?') ? '&' : '?'}x-oss-process=video/snapshot,t_0,f_jpg,w_${width},m_fast,ar_auto`;
}

function tagExtra(reference: AgentNodeReferenceValue): Record<string, unknown> {
  if (typeof reference.extra !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(reference.extra);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function snapshotPreview(
  reference: AgentNodeReferenceValue,
  extra: Record<string, unknown>,
  nodeType: string,
): AgentNodePreview | undefined {
  const url = safeAgentNodePreviewUrl(
    reference.previewUrl ?? extra.previewUrl ?? reference.url ?? reference.sourceValue,
  );
  const mediaType = reference.previewMedia ?? extra.previewMedia ?? reference.mediaType ?? nodeType;
  return url && (mediaType === 'image' || mediaType === 'video') ? { url, mediaType } : undefined;
}

/** Source 401533: display derives from live nodes; saved occurrence metadata stays unchanged. */
export function resolveAgentNodePresentation(
  reference: AgentNodeReferenceValue,
  options?: AgentNodePresentationOptions,
): AgentNodePresentation {
  const extra = tagExtra(reference);
  const nodeId = trimmed(extra.canvasNodeId) || trimmed(reference.nodeKey) || trimmed(reference.id);
  const projectId = trimmed(reference.projectId) || trimmed(extra.projectId) || undefined;
  const nodeType = trimmed(reference.nodeType) || trimmed(extra.nodeType) || 'node';
  const status = reference.status ?? 'ready';
  const pending = reference.canvasPickPending === true || status === 'uploading';
  const otherProject = Boolean(
    options && !options.isShareReplay && projectId && projectId !== trimmed(options.projectId),
  );
  const ready = options?.ready === true && Array.isArray(options.nodes);
  const live =
    !otherProject && ready ? options.nodes?.find((node) => node.id === nodeId) : undefined;
  const deleted = !otherProject && ready && status === 'ready' && !pending && !live;
  // Nullish precedence matches the source: an explicitly blank live name does not use its title.
  const candidate = live?.data?.name ?? live?.data?.title ?? live?.data?.label ?? reference.name;
  const label =
    status === 'error'
      ? '上传失败'
      : otherProject
        ? '非本画布节点'
        : trimmed(candidate) || nodeId || '节点';
  const canLocate = Boolean(
    !otherProject && ready && live && status === 'ready' && options?.canLocate,
  );
  const canOpenProject = Boolean(
    otherProject && ready && status === 'ready' && !pending && options?.canOpenProject,
  );
  const livePreview = live ? agentNodeLivePreview(live) : undefined;
  const savedPreview = snapshotPreview(reference, extra, nodeType);
  const preview =
    !otherProject && !deleted && status === 'ready' ? livePreview || savedPreview : undefined;
  const state =
    status === 'error'
      ? 'error'
      : pending
        ? 'pending'
        : otherProject
          ? 'other-project'
          : deleted
            ? 'missing'
            : live
              ? 'live'
              : options && options.ready !== true
                ? 'loading'
                : 'snapshot';
  return {
    state,
    nodeId,
    projectId,
    label,
    nodeType,
    title: deleted
      ? '节点已删除'
      : otherProject
        ? '点击打开对应画布'
        : canLocate
          ? `${label} · 点击定位节点`
          : label,
    deleted,
    dimmed: deleted || pending,
    canLocate,
    canOpenProject,
    ...(preview ? { preview, previewSource: livePreview ? 'live' : 'snapshot' } : {}),
  };
}
