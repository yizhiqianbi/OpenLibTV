import { filmNodePorts } from './document.ts';
import type { FilmDocument, FilmEdge, FilmMedia, FilmNode } from './types.ts';

export interface FilmInheritedBackground {
  media: FilmMedia;
  frameTime?: number;
}
const mediaKinds = new Set(['play', 'choice', 'hotspot', 'qte']);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function outgoingBackground(
  node: FilmNode,
  port: string,
  media: Map<string, FilmMedia>,
): FilmInheritedBackground | undefined {
  const item = media.get(node.mediaId || '');
  if (!item || item.type === 'audio') return undefined;
  if (item.type === 'image') return { media: item };
  const start = node.trimIn ?? 0,
    end = node.trimOut ?? item.duration;
  if (
    !finite(item.duration) ||
    item.duration <= 0 ||
    !finite(start) ||
    !finite(end) ||
    start < 0 ||
    end <= start ||
    end > item.duration
  )
    return undefined;
  if (node.kind === 'play') return { media: item, frameTime: end };
  if (node.kind === 'choice' && port !== 'timeout') return undefined;
  // Choice keeps playing until its clip ends; a deadline can leave earlier.
  // Users can select while the clip plays, so successful interactions have no
  // statically determined exit frame.
  const elapsed = port === 'timeout' || port === 'failure' ? node.windowEnd : undefined;
  if (!finite(elapsed) || elapsed < 0) return undefined;
  if (node.kind !== 'choice' && elapsed > end - start) return undefined;
  return { media: item, frameTime: Math.min(start + elapsed, end) };
}

/** A presentation hint only: never assigns media to an inheriting authoring node. */
export function resolveFilmInheritedBackground(
  document: FilmDocument,
  nodeId: string,
): FilmInheritedBackground | undefined {
  const nodes = new Map(document.nodes.map((node) => [node.id, node])),
    media = new Map(document.media.map((item) => [item.id, item]));
  const target = nodes.get(nodeId),
    starts = document.nodes.filter((node) => node.kind === 'start');
  if (
    !target ||
    target.mediaId !== undefined ||
    starts.length !== 1 ||
    nodes.size !== document.nodes.length ||
    media.size !== document.media.length
  )
    return undefined;
  const incoming = new Map<string, FilmEdge[]>(),
    outgoing = new Map<string, FilmEdge[]>();
  for (const edge of document.edges) {
    const source = nodes.get(edge.source);
    if (
      !source ||
      !nodes.has(edge.target) ||
      !filmNodePorts(source).some((port) => port.id === edge.sourcePort)
    )
      continue;
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);
  }
  const reached = new Set<string>(),
    forward = [starts[0].id];
  while (forward.length) {
    const id = forward.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const edge of outgoing.get(id) || []) forward.push(edge.target);
  }
  if (!reached.has(nodeId)) return undefined;

  const visited = new Set<string>(),
    pending = [nodeId];
  let background: FilmInheritedBackground | undefined;
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    // The start route has no frame; it cannot be merged with a visual branch.
    if (id === starts[0].id) return undefined;
    const predecessors = (incoming.get(id) || []).filter((edge) => reached.has(edge.source));
    if (!predecessors.length) return undefined;
    for (const edge of predecessors) {
      const source = nodes.get(edge.source)!;
      if (!mediaKinds.has(source.kind) || source.mediaId === undefined) {
        pending.push(source.id);
        continue;
      }
      const frame = outgoingBackground(source, edge.sourcePort, media);
      if (!frame) return undefined;
      if (
        background &&
        (background.media.id !== frame.media.id || background.frameTime !== frame.frameTime)
      )
        return undefined;
      background = frame;
    }
  }

  // Reject cycles in the inherited part of the route without a recursive stack.
  // Shared ancestors in a diamond are ordinary nodes, not mistaken for cycles.
  const degree = new Map(
    [...visited].map((id) => [
      id,
      (incoming.get(id) || []).filter((edge) => visited.has(edge.source)).length,
    ]),
  );
  const roots = [...visited].filter((id) => degree.get(id) === 0);
  let removed = 0;
  while (roots.length) {
    const id = roots.pop()!;
    removed += 1;
    for (const edge of outgoing.get(id) || []) {
      if (!visited.has(edge.target)) continue;
      const next = degree.get(edge.target)! - 1;
      degree.set(edge.target, next);
      if (next === 0) roots.push(edge.target);
    }
  }
  return removed === visited.size ? background : undefined;
}
