/** Source collectClipSubtitleSources: HTML and VTT references may coexist. */
export function classifySubtitleSources({ clips = [], timelineSubtitles, htmlLayers = [] } = {}) {
  const hasHtml =
    htmlLayers.length > 0 ||
    clips.some((clip) => clip.type !== 'audio' && clip.subtitleHtmlUrl?.trim());
  const hasVtt = Boolean(
    timelineSubtitles?.cues?.length ||
    timelineSubtitles?.rawVtt?.trim?.() ||
    timelineSubtitles?.sourceUrl?.trim?.() ||
    clips.some((clip) => clip.type !== 'audio' && clip.subtitleUrl?.trim()),
  );
  return {
    hasHtml,
    hasVtt,
    mixed: hasHtml && hasVtt,
    mode: hasHtml && hasVtt ? 'mixed' : hasHtml ? 'html' : hasVtt ? 'vtt' : 'empty',
  };
}
