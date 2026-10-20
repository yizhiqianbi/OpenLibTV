import { normalizeSubtitleTrack } from './subtitle-model.js';

const stable = (value) =>
  Array.isArray(value)
    ? `[${value.map(stable).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
          .join(',')}}`
      : JSON.stringify(value);
export const subtitleTrackFingerprint = (track) => {
  const { rawVtt: _raw, sourceUrl: _url, ...content } = track;
  return stable(content);
};
const content = (cue) =>
  stable({
    text: cue.text,
    textParts: cue.textParts,
    settings: cue.settings,
    style: cue.style,
    hidden: cue.hidden === true,
  });
const near = (a, b) => Math.abs(a - b) <= 0.0015;
const rate = (clip) =>
  Number(clip.speed ?? clip.playbackRate) > 0 ? Number(clip.speed ?? clip.playbackRate) : 1;
const identifier = (node, index) =>
  `vtt-migration-${node}-${index}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
const fail = (reason) => ({ ok: false, reason });

/** The source key contains ownership/windows, never the mutable VTT body or playhead. */
export function subtitleMigrationSourcePlan(clips = []) {
  const videos = clips.filter((clip) => clip.type !== 'audio' && clip.sourceNodeId?.trim());
  const sources = videos
    .filter((clip) => clip.subtitleUrl?.trim())
    .map((clip) => ({
      clipId: clip.id,
      nodeId: clip.sourceNodeId.trim(),
      url: clip.subtitleUrl.trim(),
    }));
  return {
    key: stable(
      videos.map((clip) => ({
        id: clip.id,
        nodeId: clip.sourceNodeId.trim(),
        url: clip.subtitleUrl?.trim(),
        start: clip.startTime,
        duration: clip.duration,
        offset: clip.sourceOffset,
        rate: rate(clip),
      })),
    ),
    sources,
    nodeIds: [...new Set(videos.map((clip) => clip.sourceNodeId.trim()))],
  };
}

/** Source pi: reconcile all repeated instances before any document is produced. */
export function planSubtitleMigration({ currentTrack, sources, clips, origins = [] }) {
  try {
    if (new Set(currentTrack.cues.map((cue) => cue.id)).size !== currentTrack.cues.length)
      return fail('duplicate-timeline-cue-id');
    const current = normalizeSubtitleTrack(currentTrack);
    if (current.cues.length !== currentTrack.cues.length) return fail('conversion-loss');
    const nodes = new Map();
    for (const source of sources) {
      const nodeId = source.nodeId?.trim();
      if (!nodeId) return fail('missing-source-track');
      const track = normalizeSubtitleTrack(source.track);
      if (track.cues.length !== (source.track?.cues?.length || 0)) return fail('conversion-loss');
      if (nodes.has(nodeId)) {
        if (
          subtitleTrackFingerprint(nodes.get(nodeId).original) !== subtitleTrackFingerprint(track)
        )
          return fail('conflicting-source-track');
        continue;
      }
      nodes.set(nodeId, {
        nodeId,
        original: track,
        track: {
          ...structuredClone(track),
          cues: track.cues.map((cue, index) => ({
            ...structuredClone(cue),
            id: identifier(nodeId, index),
          })),
        },
        timelineIds: new Map(),
      });
    }
    if (!nodes.size) return fail('missing-source-track');
    const byId = new Map(current.cues.map((cue) => [cue.id, cue])),
      known = new Set(),
      groups = new Map();
    for (const origin of origins) {
      if (known.has(origin.timelineCueId)) return fail('duplicate-timeline-cue-id');
      known.add(origin.timelineCueId);
      const key = JSON.stringify([origin.sourceNodeId, origin.sourceCueIndex]);
      const group = groups.get(key) || [];
      group.push(origin);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const origin = group[0],
        node = nodes.get(origin.sourceNodeId),
        id = identifier(origin.sourceNodeId, origin.sourceCueIndex);
      const original = node?.track.cues.find((cue) => cue.id === id);
      if (!original) return fail('missing-source-track');
      const instances = group.map((item) => byId.get(item.timelineCueId)).filter(Boolean);
      if (!instances.length) {
        node.track.cues = node.track.cues.filter((cue) => cue.id !== id);
        continue;
      }
      if (
        instances.length !== group.length ||
        instances.some((cue) => content(cue) !== content(instances[0]))
      )
        return fail('repeated-instance-conflict');
      const windows = group.map((origin, index) => {
        const cue = instances[index];
        if (
          near(cue.startTime, origin.timelineStartTime) &&
          near(cue.endTime, origin.timelineEndTime)
        )
          return { start: original.startTime, end: original.endTime };
        if (
          cue.startTime < origin.clipStartTime - 0.0015 ||
          cue.endTime > origin.clipEndTime + 0.0015 ||
          cue.endTime <= cue.startTime
        )
          return null;
        return {
          start: origin.sourceOffset + (cue.startTime - origin.clipStartTime) * origin.playbackRate,
          end: origin.sourceOffset + (cue.endTime - origin.clipStartTime) * origin.playbackRate,
        };
      });
      if (
        windows.some(
          (window) =>
            !window || !near(window.start, windows[0]?.start) || !near(window.end, windows[0]?.end),
        )
      )
        return fail('repeated-instance-conflict');
      const previous = { ...original };
      for (const key of ['textParts', 'settings', 'style', 'hidden']) delete previous[key];
      node.track.cues = node.track.cues.map((cue) =>
        cue.id === id
          ? {
              ...previous,
              ...structuredClone(instances[0]),
              id,
              startTime: windows[0].start,
              endTime: windows[0].end,
            }
          : cue,
      );
      node.timelineIds.set(
        id,
        group.map((item) => item.timelineCueId),
      );
    }
    for (const cue of current.cues) {
      if (known.has(cue.id)) continue;
      const candidates = clips.filter(
        (clip) =>
          clip.type !== 'audio' &&
          nodes.has(clip.sourceNodeId?.trim()) &&
          cue.startTime >= clip.startTime - 0.0015 &&
          cue.endTime <= clip.startTime + clip.duration + 0.0015,
      );
      if (candidates.length !== 1) return fail('unmapped-cue');
      const clip = candidates[0],
        node = nodes.get(clip.sourceNodeId.trim()),
        id = `vtt-migration-added-${cue.id}`.replace(/[^a-zA-Z0-9_-]+/g, '-');
      node.track.cues.push({
        ...structuredClone(cue),
        id,
        startTime: clip.sourceOffset + (cue.startTime - clip.startTime) * rate(clip),
        endTime: clip.sourceOffset + (cue.endTime - clip.startTime) * rate(clip),
      });
      node.timelineIds.set(id, [cue.id]);
    }
    for (const node of nodes.values()) {
      const { defaultStyle: _default, classStyles: _classes, ...base } = node.track;
      node.track = {
        ...base,
        visible: current.visible,
        ...(current.defaultStyle ? { defaultStyle: structuredClone(current.defaultStyle) } : {}),
        ...(current.classStyles ? { classStyles: structuredClone(current.classStyles) } : {}),
      };
    }
    return { ok: true, nodes: [...nodes.values()] };
  } catch {
    return fail('invalid-track');
  }
}
