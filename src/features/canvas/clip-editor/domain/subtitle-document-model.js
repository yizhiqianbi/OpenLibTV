import { editSubtitleTrack, normalizeSubtitleTrack } from './subtitle-model.js';
import { serializeSubtitleVtt } from './subtitle-vtt.js';

export function prepareSubtitleEdit(timeline, options) {
  const result = editSubtitleTrack(timeline, options);
  if (result.timeline !== timeline)
    result.timeline = {
      ...result.timeline,
      subtitles: {
        ...result.timeline.subtitles,
        rawVtt: serializeSubtitleVtt(result.timeline.subtitles),
      },
    };
  return result;
}
export function projectSubtitleTextDraft(session) {
  if (!session?.subtitleTextDraft) return session?.timeline;
  const { cueId, text } = session.subtitleTextDraft;
  return prepareSubtitleEdit(effectiveSubtitleTimeline(session), { kind: 'text', cueId, text })
    .timeline;
}
export function effectiveSubtitleTimeline(session) {
  const track = session?.timeline?.subtitles;
  return session?.subtitleSourceTrack && !track?.cues?.length && !track?.userCleared
    ? { ...session.timeline, subtitles: session.subtitleSourceTrack }
    : session?.timeline;
}
export function subtitleLoadPlan(timeline) {
  const track = normalizeSubtitleTrack(timeline.subtitles);
  if (track.cues.length || track.userCleared) return { key: 'ready', ready: true };
  if (track.rawVtt)
    return {
      key: JSON.stringify(['inline', track.rawVtt, track.visible, track.defaultStyle]),
      raw: track.rawVtt,
      track,
    };
  if (track.sourceUrl)
    return {
      key: JSON.stringify(['url', track.sourceUrl, track.visible, track.defaultStyle]),
      url: track.sourceUrl,
      track,
    };
  const sources = timeline.clips
    .filter((clip) => clip.type !== 'audio' && clip.subtitleUrl?.trim())
    .map((clip) => ({
      id: clip.id,
      sourceNodeId: clip.sourceNodeId,
      subtitleUrl: clip.subtitleUrl,
      startTime: clip.startTime,
      duration: clip.duration,
      sourceOffset: clip.sourceOffset,
      speed: clip.speed,
    }));
  return sources.length
    ? { key: JSON.stringify([sources, track.visible, track.defaultStyle]), sources, track }
    : { key: 'ready', ready: true };
}
