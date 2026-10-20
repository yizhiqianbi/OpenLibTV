import { htmlSubtitleLoadPlan } from './html-subtitle-sources.js';
import { collectSubtitleSources } from './subtitle-source-mode.js';

/** Archived source ig/pz/se: source coexistence does not grant two editing owners. */
export function resolveSubtitleEditing({
  hasAuthored = false,
  active = false,
  loading = false,
  knownSourceNodeIds = [],
  layers = [],
  hasHtmlSource = false,
  htmlEnabled = true,
  previewEnabled = true,
  exportEnabled = true,
  hasVttCues = false,
  hasVttSource = false,
} = {}) {
  const ownsHtml = Boolean(
    hasAuthored ||
    active ||
    loading ||
    knownSourceNodeIds.some((nodeId) => {
      const matches = layers.filter((layer) => layer.nodeId === nodeId);
      return !matches.length || matches.some((layer) => !layer.rejected);
    }) ||
    (!previewEnabled && hasHtmlSource),
  );
  return {
    ownsHtml,
    useHtmlEditor:
      ownsHtml || (htmlEnabled && previewEnabled && exportEnabled && !hasVttCues && !hasVttSource),
    readiness: ownsHtml
      ? !previewEnabled || !exportEnabled
        ? 'disabled'
        : !active || loading
          ? 'loading'
          : 'ready'
      : 'ready',
  };
}

export function subtitleSourceStates(session, plan) {
  if (session.htmlSubtitleLoadKey !== plan.key)
    return plan.layers.map((layer) => ({
      key: layer.key,
      nodeId: layer.nodeId,
      status: 'loading',
    }));
  return plan.layers.map(
    (layer) =>
      session.htmlSubtitleSourceStates?.find((state) => state.key === layer.key) || {
        key: layer.key,
        nodeId: layer.nodeId,
        status: session.htmlSubtitleStatus === 'ready' ? 'ready' : 'loading',
      },
  );
}

/** Only volatile, validated load receipts decide readiness; none enter the saved timeline. */
export function describeSubtitleEditing(session) {
  const timeline = session?.timeline || { clips: [] };
  let plan;
  try {
    plan = htmlSubtitleLoadPlan(timeline, session?.nodeSubtitleHtmlUrl);
  } catch (error) {
    return { ownsHtml: true, useHtmlEditor: true, readiness: 'loading', active: false, error };
  }
  const states = subtitleSourceStates(session || {}, plan);
  const active = states.some((state) => state.status === 'ready' || state.status === 'readonly');
  const sources = collectSubtitleSources({
    clips: timeline.clips,
    nodeSubtitleHtmlUrl: session?.nodeSubtitleHtmlUrl,
  });
  const editing = resolveSubtitleEditing({
    hasAuthored: plan.layers.some((layer) => Boolean(layer.html)),
    active,
    loading: states.some((state) => state.status === 'loading'),
    knownSourceNodeIds: plan.layers.map((layer) => layer.key),
    layers: states.map((state) => ({
      nodeId: state.key,
      rejected: state.status === 'rejected',
    })),
    hasHtmlSource: sources.some((source) => source.kind === 'html'),
    hasVttCues: Boolean(
      timeline.subtitles?.cues?.length || session?.subtitleSourceTrack?.cues?.length,
    ),
    hasVttSource: Boolean(
      timeline.subtitles?.rawVtt?.trim() ||
      timeline.subtitles?.sourceUrl?.trim() ||
      sources.some((source) => source.kind === 'vtt'),
    ),
  });
  return {
    ...editing,
    canEditHtml: editing.useHtmlEditor && (active || plan.layers.length === 0 || !editing.ownsHtml),
    active,
    states,
  };
}
