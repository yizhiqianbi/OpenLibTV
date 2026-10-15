import { createTimedTextCueIdSync } from '../../../../services/timed-text-id.js';
import { htmlSubtitleLoadPlan } from '../domain/html-subtitle-sources.js';
import {
  planNewHtmlSubtitleCue,
  subtitleClipWindow,
  subtitleCueInstances,
  subtitleDocumentId,
} from '../domain/html-subtitle-model.js';
import { describeClipTimelinePlayback } from '../domain/playback-model.js';
import { readTextMotion } from './motion-document.js';
import { textOutputScale } from '../domain/text-timing-model.js';
import { placeHtmlSubtitleCue } from '../domain/html-subtitle-model.js';
import { createSubtitleHtml, readSubtitleHtml } from './html-document.js';
import { textOutputSize } from './document-model.js';
import {
  readHtmlSubtitleStyle as readTextStyle,
  htmlSubtitleStylePatches as textStylePatches,
} from './subtitle-style-document.js';
import {
  archiveHtmlSubtitle,
  patchHtmlSubtitle,
  transformHtmlSubtitleTimeline,
} from './subtitle-archive.js';

export function effectiveHtmlSubtitleLayers(session) {
  if (!session) return [];
  const plan = htmlSubtitleLoadPlan(session.timeline, session.nodeSubtitleHtmlUrl);
  return plan.layers.flatMap((layer) => {
    const loaded = session.htmlSubtitleLayers?.find(
      (item) => item.key === layer.key && item.url === layer.url,
    );
    const html =
      layer.html && loaded?.sourceHtml === layer.html ? loaded.html : layer.html || loaded?.html;
    return html ? [{ ...layer, html }] : [];
  });
}
const replaceArchive = (timeline, layer, html, stamp) => {
  const {
    htmlUrl: _url,
    userCleared: _cleared,
    ...previous
  } = timeline.subtitlesHtml?.[layer.key] || {};
  return {
    ...timeline,
    subtitlesHtml: {
      ...timeline.subtitlesHtml,
      [layer.key]: { ...previous, ...archiveHtmlSubtitle({ ...layer, html, savedAt: stamp }) },
    },
  };
};
export function projectHtmlSubtitleDraft(session) {
  const draft = session.htmlSubtitleDraft;
  if (!draft) return session.timeline;
  const layer = effectiveHtmlSubtitleLayers(session).find((item) => item.key === draft.key);
  if (!layer) throw new Error('字幕来源已改变，当前输入已保留');
  const model = readSubtitleHtml(layer.html);
  if (!model.ok || !model.cues.some((cue) => cue.cueId === draft.cueId))
    throw new Error('字幕片段已改变，当前输入已保留');
  const result = patchHtmlSubtitle(layer.html, [
    { kind: 'text', cueId: draft.cueId, text: draft.text },
  ]);
  if (!result.ok) throw new Error(result.issues[0].detail);
  return result.changed
    ? replaceArchive(session.timeline, layer, result.html, draft.stamp)
    : session.timeline;
}

export function createHtmlSubtitleTools({
  getSession,
  current,
  publish,
  acceptEdit,
  beginStyle,
  previewStyle,
  endStyle,
  cancelStyle,
  pause,
  seek,
  notify,
}) {
  const parsed = new Map();
  let activeStyle;
  const keyFor = (session) => {
    try {
      return htmlSubtitleLoadPlan(session.timeline, session.nodeSubtitleHtmlUrl).key;
    } catch {
      return 'invalid';
    }
  };
  const modelFor = (html) => {
    if (!parsed.has(html)) {
      if (parsed.size > 24) parsed.clear();
      parsed.set(html, readSubtitleHtml(html));
    }
    return parsed.get(html);
  };
  const layersFor = (session) =>
    effectiveHtmlSubtitleLayers(session).map((layer) => ({
      ...layer,
      model: modelFor(layer.html),
    }));
  const safe =
    (action) =>
    (...args) => {
      try {
        return action(...args);
      } catch (error) {
        notify(error.message || '字幕编辑失败，原数据已保留');
        return false;
      }
    };
  const writable = () => {
    const session = getSession();
    if (!current(session) || !session.ready || session.conflicted) return null;
    const plan = htmlSubtitleLoadPlan(session.timeline, session.nodeSubtitleHtmlUrl);
    if (
      layersFor(session).length !== plan.layers.length ||
      layersFor(session).some((layer) => !layer.model.ok)
    )
      return null;
    return session;
  };
  const selected = (session) => {
    const identity = session.selectedHtmlSubtitle;
    const layer = identity && layersFor(session).find((layer) => layer.key === identity.key);
    const cue = layer?.model.ok && layer.model.cues.find((cue) => cue.cueId === identity.cueId);
    return cue ? { identity, layer, cue } : null;
  };
  const editDocument = (timeline, { key, patches, stamp = Date.now() }) => {
    const layer = layersFor({ ...getSession(), timeline }).find((item) => item.key === key);
    if (!layer) return { timeline, error: '字幕来源已改变，当前编辑已保留' };
    const result = patchHtmlSubtitle(layer.html, patches);
    return !result.ok
      ? { timeline, error: result.issues[0].detail }
      : {
          timeline: result.changed ? replaceArchive(timeline, layer, result.html, stamp) : timeline,
        };
  };
  const prepare = (timeline, options) => {
    if (options.kind === 'gesture' && options.delta === 0) return { timeline };
    const session = { ...getSession(), timeline };
    const item = selected(session);
    if (!item) return { timeline };
    let patches = options.patches;
    if (options.preset && (!options.preset.id || !options.preset.fields))
      return { timeline, error: '字幕预设无法读取，原样式已保留' };
    const fields = options.preset?.fields || options.fields;
    if (fields) {
      const style = readTextStyle(item.layer.model, item.cue.cueId, textOutputSize(session));
      if (
        !options.preset &&
        Object.entries(fields).every(([field, value]) => style[field] === value)
      )
        return { timeline };
      patches = [
        ...textStylePatches(
          item.cue.cueId,
          fields,
          style,
          textOutputScale(item.layer.model, textOutputSize(session)),
        ),
        ...(options.preset
          ? [{ kind: 'textPresetId', cueId: item.cue.cueId, presetId: options.preset.id }]
          : []),
      ];
    }
    if (options.kind === 'gesture') {
      const clip = timeline.clips.find(
        (clip) => clip.id === options.clipId || clip.id === item.identity.clipId,
      );
      if (!clip || !Number.isFinite(options.delta)) return { timeline };
      const rate = item.layer.model.timeBase === 'source' ? subtitleClipWindow(clip).rate : 1;
      const bounds =
        item.layer.model.timeBase === 'source'
          ? subtitleClipWindow(clip)
          : { start: 0, end: item.layer.model.duration };
      const delta = options.delta * rate,
        cue = item.cue;
      let start = cue.start,
        duration = cue.duration;
      if (options.mode === 'move') {
        start = placeHtmlSubtitleCue(
          item.layer.model.cues,
          { ...cue, start: start + delta },
          bounds,
        );
        if (start == null) return { timeline, status: 'no-slot' };
      } else if (options.mode === 'resize-start') {
        if (cue.start + cue.duration > bounds.end || cue.start + cue.duration - 0.2 < bounds.start)
          return { timeline, status: 'no-slot' };
        const lower = Math.max(
          bounds.start,
          ...item.layer.model.cues
            .filter(
              (peer) =>
                peer.cueId !== cue.cueId &&
                peer.clipId === cue.clipId &&
                peer.trackIndex === cue.trackIndex &&
                peer.start < cue.start,
            )
            .map((peer) => peer.start + peer.duration),
        );
        start = Math.max(lower, Math.min(start + delta, cue.start + duration - 0.2));
        duration = cue.start + cue.duration - start;
      } else if (options.mode === 'resize-end') {
        if (cue.start < bounds.start || cue.start + 0.2 > bounds.end)
          return { timeline, status: 'no-slot' };
        const upper = Math.min(
          bounds.end,
          ...item.layer.model.cues
            .filter(
              (peer) =>
                peer.cueId !== cue.cueId &&
                peer.clipId === cue.clipId &&
                peer.trackIndex === cue.trackIndex &&
                peer.start > cue.start,
            )
            .map((peer) => peer.start),
        );
        duration = Math.max(0.2, Math.min(upper, cue.start + cue.duration + delta) - start);
      }
      patches = [{ kind: 'timing', cueId: cue.cueId, start, duration }];
    }
    return editDocument(timeline, {
      key: item.layer.key,
      patches: patches || [],
      stamp: options.stamp,
    });
  };
  const commit = (options) => {
    const session = writable();
    if (!session) return false;
    let result;
    if (options.edits) {
      let timeline = session.timeline;
      const stamp = Date.now();
      for (const edit of options.edits) {
        const next = editDocument(timeline, { ...edit, stamp });
        if (next.error) {
          notify(next.error);
          return false;
        }
        timeline = next.timeline;
      }
      result = { timeline };
    } else
      result = options.key
        ? editDocument(session.timeline, options)
        : prepare(session.timeline, options);
    if (result.error) {
      notify(result.error);
      return false;
    }
    return result.timeline === session.timeline || acceptEdit(result);
  };
  const flushDraft = () => {
    const session = getSession();
    if (!session?.htmlSubtitleDraft) return true;
    if (!writable()) return false;
    const timeline = projectHtmlSubtitleDraft(session);
    if (timeline !== session.timeline && !acceptEdit({ timeline })) return false;
    publish({ ...getSession(), htmlSubtitleDraft: null });
    return true;
  };
  const select = (identity) => {
    const session = writable();
    if (!session || !selected({ ...session, selectedHtmlSubtitle: identity })) return false;
    publish({
      ...session,
      htmlSubtitlePanelOpen: true,
      selectedHtmlSubtitle: identity,
      htmlSubtitleTrackChoice: null,
      selectedClipIds: [],
      selectedTextCueId: null,
      selectedSubtitleId: null,
      selectedTransitionRightClipId: null,
      textPanelOpen: false,
      subtitlePanelOpen: false,
      transitionPanelOpen: false,
      previewExpanded: true,
    });
    return true;
  };
  const controls = {
    onHtmlSubtitleLoadStatus: (key, error = '') => {
      const session = getSession();
      if (!current(session) || keyFor(session) !== key) return false;
      if (
        session.htmlSubtitleLoadKey === key &&
        session.htmlSubtitleError === error &&
        session.htmlSubtitleStatus === (error ? 'error' : 'loading')
      )
        return true;
      publish({
        ...session,
        htmlSubtitleLoadKey: key,
        htmlSubtitleStatus: error ? 'error' : 'loading',
        htmlSubtitleError: error,
      });
      return true;
    },
    onHtmlSubtitleLoaded: (key, layers) => {
      const session = getSession();
      if (!current(session) || keyFor(session) !== key) return false;
      for (const layer of layers) {
        const model = modelFor(layer.html);
        if (!model.ok) return controls.onHtmlSubtitleLoadStatus(key, model.issues[0].detail);
      }
      if (
        session.htmlSubtitleLoadKey === key &&
        session.htmlSubtitleStatus === 'ready' &&
        JSON.stringify(session.htmlSubtitleLayers) === JSON.stringify(layers)
      )
        return true;
      publish({
        ...session,
        htmlSubtitleLoadKey: key,
        htmlSubtitleStatus: 'ready',
        htmlSubtitleError: '',
        htmlSubtitleLayers: layers,
      });
      return true;
    },
    onRetryHtmlSubtitles: () => {
      const session = getSession();
      if (current(session))
        publish({ ...session, htmlSubtitleRetry: (session.htmlSubtitleRetry || 0) + 1 });
    },
    onAddHtmlSubtitle: ({ key, cueId: afterId, clipId, force = false, trackIndex } = {}) => {
      let session = writable();
      if (!session) return false;
      publish({
        ...session,
        htmlSubtitlePanelOpen: true,
        previewExpanded: true,
        textPanelOpen: false,
        subtitlePanelOpen: false,
        transitionPanelOpen: false,
      });
      session = getSession();
      const video = describeClipTimelinePlayback(
        session.timeline,
        session.timeline.currentTime,
      ).activeVideos.at(-1)?.clip;
      const layers = layersFor(session);
      let layer = key
        ? layers.find((layer) => layer.key === key)
        : layers.find(
            (layer) =>
              layer.nodeId === video?.sourceNodeId &&
              (layer.model.cues.some((cue) => cue.clipId === video.id) ||
                layer.model.clipMeta[video.id] ||
                (!layer.model.cues.some((cue) => cue.clipId) &&
                  (!video.subtitleHtmlUrl || layer.url === video.subtitleHtmlUrl))),
          );
      const after = afterId && layer?.model.cues.find((cue) => cue.cueId === afterId);
      const clip = after
        ? session.timeline.clips.find((clip) => clip.id === (after.clipId || clipId)) || video
        : video;
      if (!clip || (afterId && !after)) {
        notify('当前播放位置没有可添加字幕的视频');
        return false;
      }
      const nodeId = clip.sourceNodeId,
        window = subtitleClipWindow(clip);
      const timeBase = layer?.model.timeBase || 'source';
      const time = after
        ? after.start + after.duration
        : timeBase === 'source'
          ? (session.timeline.currentTime - clip.startTime) * window.rate + clip.sourceOffset
          : session.timeline.currentTime;
      const row = after?.trackIndex ?? trackIndex ?? layer?.model.trackIndexes[0] ?? 0;
      if (!after && trackIndex == null && layer?.model.trackIndexes.length > 1) {
        const hits = layer.model.cues.filter(
          (cue) =>
            (!cue.clipId || cue.clipId === clip.id) &&
            time >= cue.start &&
            time < cue.start + cue.duration,
        );
        if (hits.length === 1 && !force)
          return select({ key: layer.key, cueId: hits[0].cueId, clipId: clip.id });
        publish({
          ...getSession(),
          htmlSubtitleTrackChoice: {
            key: layer.key,
            clipId: clip.id,
            tracks: layer.model.trackIndexes,
          },
        });
        return false;
      }
      if (!force && !after && layer) {
        const hit = layer.model.cues.find(
          (cue) =>
            cue.trackIndex === row &&
            (!cue.clipId || cue.clipId === clip.id) &&
            time >= cue.start &&
            time < cue.start + cue.duration,
        );
        if (hit) return select({ key: layer.key, cueId: hit.cueId, clipId: clip.id });
      }
      const duration = Math.max(clip.sourceDuration || 0, window.end);
      const bindingClipId = after ? after.clipId || undefined : clip.id;
      const plan = planNewHtmlSubtitleCue({
        existing: layer?.model.cues || [],
        clipId: bindingClipId,
        tSource: time,
        maxEnd: Math.min(
          layer?.model.duration ?? Infinity,
          timeBase === 'source' ? duration : session.timeline.totalDuration,
        ),
        trackIndex: row,
      });
      if (
        !plan ||
        (timeBase === 'source' &&
          !subtitleCueInstances(plan, session.timeline.clips, nodeId).length)
      ) {
        notify('当前素材区间没有可用字幕位置');
        return false;
      }
      const cueId = createTimedTextCueIdSync(
        plan.text,
        plan.start,
        plan.duration,
        bindingClipId ? `${nodeId}|${bindingClipId}` : nodeId,
        layer?.model.cues || [],
      );
      const stamp = Date.now();
      if (!layer) {
        const output = textOutputSize(session);
        if (!output) return false;
        layer = {
          key: subtitleDocumentId(nodeId, `clip:${clip.id}`),
          nodeId,
          html: createSubtitleHtml({
            compositionId: `sub-libtv-${nodeId}`,
            width: clip.width || output.width,
            height: clip.height || output.height,
            duration,
            clipMetas: [{ clipId: clip.id, materialized: [window.start, window.end] }],
            cues: [{ ...plan, cueId }],
          }),
        };
        if (!acceptEdit({ timeline: replaceArchive(session.timeline, layer, layer.html, stamp) }))
          return false;
      } else if (
        !commit({
          key: layer.key,
          stamp,
          patches: [
            { kind: 'addCue', cue: { ...plan, cueId } },
            ...(bindingClipId && !layer.model.clipMeta[bindingClipId]
              ? [
                  {
                    kind: 'setClipMeta',
                    clipId: bindingClipId,
                    materialized: [window.start, window.end],
                  },
                ]
              : []),
          ],
        })
      )
        return false;
      pause();
      return select({ key: layer.key, cueId, clipId: clip.id });
    },
    onSelectHtmlSubtitle: select,
    onSeekHtmlSubtitle: (identity) => {
      if (!select(identity)) return false;
      const session = getSession(),
        item = selected(session);
      const instance =
        item.layer.model.timeBase === 'timeline'
          ? { startTime: item.cue.start }
          : subtitleCueInstances(item.cue, session.timeline.clips, item.layer.nodeId).find(
              (instance) => !identity.clipId || instance.clipId === identity.clipId,
            );
      if (instance) seek(instance.startTime);
      return !!instance;
    },
    onHtmlSubtitleTextChange: (text) => {
      const session = writable();
      if (!session || !selected(session)) return false;
      const identity = session.selectedHtmlSubtitle;
      publish({
        ...session,
        htmlSubtitleDraft: {
          ...identity,
          text,
          stamp: session.htmlSubtitleDraft?.stamp ?? Date.now(),
        },
      });
      return true;
    },
    onCommitHtmlSubtitle: flushDraft,
    onEditHtmlSubtitle: (options) => commit(options),
    onDeleteHtmlSubtitle: (identity = getSession()?.selectedHtmlSubtitle) => {
      if (!identity) return false;
      const result = commit({
        key: identity.key,
        patches: [{ kind: 'removeCue', cueId: identity.cueId }],
      });
      if (
        result &&
        getSession()?.selectedHtmlSubtitle?.key === identity.key &&
        getSession()?.selectedHtmlSubtitle?.cueId === identity.cueId
      )
        publish({ ...getSession(), selectedHtmlSubtitle: null, htmlSubtitleDraft: null });
      return result;
    },
    onCloseHtmlSubtitles: () => {
      if (!flushDraft() || !current(getSession())) return false;
      publish({ ...getSession(), htmlSubtitlePanelOpen: false, htmlSubtitleTrackChoice: null });
      return true;
    },
    onBeginHtmlSubtitleStyle: ({ field, kind, readPending }) => {
      const session = writable(),
        item = session && selected(session);
      if (!item) return null;
      const token = { ...item.identity, field, stamp: Date.now() };
      const project =
        kind === 'pointer'
          ? undefined
          : (timeline) => {
              const value = readPending?.();
              if (value == null) return timeline;
              const result = prepare(timeline, { fields: { [field]: value }, stamp: token.stamp });
              if (result.error) throw new Error(result.error);
              return result.timeline;
            };
      if (!beginStyle(token, project)) return null;
      activeStyle = token;
      return token;
    },
    onPreviewHtmlSubtitleStyle: (token, value) =>
      activeStyle === token &&
      selected(getSession())?.cue.cueId === token.cueId &&
      previewStyle(
        token,
        { fields: { [token.field]: value }, stamp: token.stamp },
        'html-subtitle',
      ),
    onEndHtmlSubtitleStyle: (token) => {
      if (activeStyle !== token) return false;
      activeStyle = null;
      return endStyle(token);
    },
    onCancelHtmlSubtitleStyle: (token) => {
      if (activeStyle !== token) return false;
      activeStyle = null;
      return cancelStyle(token);
    },
    onHtmlSubtitlePreviewStatus: (status) => {
      const session = getSession();
      if (
        current(session) &&
        (session.htmlSubtitlePreviewReady !== status.ready ||
          session.htmlSubtitlePreviewError !== (status.error || ''))
      )
        publish({
          ...session,
          htmlSubtitlePreviewReady: status.ready,
          htmlSubtitlePreviewError: status.error || '',
        });
    },
    onApplyHtmlSubtitleToAll: () => {
      const session = writable(),
        item = session && selected(session);
      if (!item) return false;
      const style = readTextStyle(item.layer.model, item.cue.cueId, textOutputSize(session));
      return commit({
        edits: layersFor(session).map((layer) => ({
          key: layer.key,
          patches: layer.model.cues
            .filter(
              (cue) =>
                cue.trackIndex === item.cue.trackIndex &&
                (layer.key !== item.layer.key || cue.cueId !== item.cue.cueId),
            )
            .flatMap((cue) => [
              { kind: 'clearTextStyle', cueId: cue.cueId },
              ...textStylePatches(
                cue.cueId,
                style,
                {},
                textOutputScale(layer.model, textOutputSize(session)),
              ),
              {
                kind: 'copyTextAppearance',
                cueId: cue.cueId,
                sourceStyle:
                  item.cue.element.querySelector('[data-libtv-text]')?.getAttribute('style') || '',
                sourcePixelScale: textOutputScale(item.layer.model, textOutputSize(session)),
                pixelScale: textOutputScale(layer.model, textOutputSize(session)),
              },
              {
                kind: 'textPresetId',
                cueId: cue.cueId,
                presetId: item.cue.element.getAttribute('data-libtv-text-preset-id'),
              },
              { kind: 'animation', cueId: cue.cueId, ...readTextMotion(item.cue.element) },
            ]),
        })),
      });
    },
  };
  return {
    controls: Object.fromEntries(
      Object.entries(controls).map(([key, action]) => [key, safe(action)]),
    ),
    projectDraft: projectHtmlSubtitleDraft,
    flushDraft: safe(flushDraft),
    prepareEdit: prepare,
    transformTimelineEdit: (session, result, operation) => {
      try {
        if (
          operation &&
          htmlSubtitleLoadPlan(session.timeline, session.nodeSubtitleHtmlUrl).layers.length !==
            layersFor(session).length
        )
          return { ...result, error: 'HTML字幕仍在读取，请准备完成后再编辑片段' };
        return transformHtmlSubtitleTimeline(session, result, operation, layersFor(session));
      } catch (error) {
        return { ...result, error: error.message };
      }
    },
    normalizeUI: (session) => {
      try {
        const layers = layersFor(session);
        if (
          layers.length !==
            htmlSubtitleLoadPlan(session.timeline, session.nodeSubtitleHtmlUrl).layers.length ||
          layers.some((layer) => !layer.model.ok)
        )
          return session;
        const rows = new Set(layers.flatMap((layer) => layer.model.trackIndexes));
        const crossSelection =
          session.selectedClipIds?.length ||
          session.textPanelOpen ||
          session.subtitlePanelOpen ||
          session.transitionPanelOpen;
        const invalid =
          session.selectedHtmlSubtitle &&
          ((!selected(session) && !session.htmlSubtitleDraft) || crossSelection);
        return session.htmlSubtitleTrackCount !== rows.size || invalid
          ? {
              ...session,
              htmlSubtitleTrackCount: rows.size,
              ...(invalid
                ? {
                    selectedHtmlSubtitle: null,
                    htmlSubtitleDraft: null,
                    htmlSubtitlePanelOpen: crossSelection ? false : session.htmlSubtitlePanelOpen,
                  }
                : {}),
            }
          : session;
      } catch {
        return session;
      }
    },
    isPlaybackBlocked: () => {
      const session = getSession();
      try {
        return (
          htmlSubtitleLoadPlan(session.timeline, session.nodeSubtitleHtmlUrl).layers.length > 0 &&
          (session.htmlSubtitleStatus !== 'ready' || session.htmlSubtitlePreviewReady !== true)
        );
      } catch {
        return true;
      }
    },
  };
}
