/** Source collectClipSubtitleSources: HTML and VTT references may coexist. */
export function collectSubtitleSources({
  clips = [],
  labelByNodeId,
  nodeSubtitleHtmlUrl,
  htmlEnabled = true,
} = {}) {
  const sources = [];
  const push = (clip, nodeId, url, kind) => {
    const value = typeof url === 'string' ? url.trim() : '';
    if (!value) return;
    const label = labelByNodeId?.get(nodeId)?.trim();
    sources.push({
      ...(clip?.id ? { clipId: clip.id } : {}),
      nodeId,
      url: value,
      kind,
      ...(label ? { label } : {}),
    });
  };
  for (const clip of clips) {
    if (clip?.type === 'audio') continue;
    const nodeId = typeof clip?.sourceNodeId === 'string' ? clip.sourceNodeId.trim() : '';
    if (!nodeId) continue;
    if (htmlEnabled) push(clip, nodeId, clip.subtitleHtmlUrl, 'html');
    push(clip, nodeId, clip.subtitleUrl, 'vtt');
  }
  const firstNode = clips
    .find(
      (clip) =>
        clip?.type !== 'audio' && typeof clip.sourceNodeId === 'string' && clip.sourceNodeId.trim(),
    )
    ?.sourceNodeId.trim();
  if (htmlEnabled && firstNode && nodeSubtitleHtmlUrl) {
    const hasNodeHtml = sources.some(
      (source) => source.nodeId === firstNode && source.kind === 'html',
    );
    if (!hasNodeHtml) push(null, firstNode, nodeSubtitleHtmlUrl, 'html');
  }
  return sources;
}

export function classifySubtitleSources({
  clips = [],
  timelineSubtitles,
  htmlLayers = [],
  nodeSubtitleHtmlUrl,
  labelByNodeId,
  htmlEnabled = true,
} = {}) {
  const sources = collectSubtitleSources({
    clips,
    nodeSubtitleHtmlUrl,
    labelByNodeId,
    htmlEnabled,
  });
  const hasHtml = htmlLayers.length > 0 || sources.some((source) => source.kind === 'html');
  const hasVtt = Boolean(
    timelineSubtitles?.cues?.length ||
    timelineSubtitles?.rawVtt?.trim?.() ||
    timelineSubtitles?.sourceUrl?.trim?.() ||
    sources.some((source) => source.kind === 'vtt'),
  );
  return {
    sources,
    hasHtml,
    hasVtt,
    mixed: hasHtml && hasVtt,
    mode: hasHtml && hasVtt ? 'mixed' : hasHtml ? 'html' : hasVtt ? 'vtt' : 'empty',
  };
}
