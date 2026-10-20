import { describeSubtitleEditing } from '../domain/subtitle-ownership-model.js';
import {
  subtitleMigrationSourcePlan,
  subtitleTrackFingerprint,
} from '../domain/subtitle-migration-model.js';
import { mergeSubtitleSourcesWithOrigins } from '../domain/subtitle-vtt.js';
import { projectSubtitleTextDraft } from '../domain/subtitle-document-model.js';
import { effectiveTextHtml, textOutputSize } from './document-model.js';
import { readTextOverlayHtml } from './html-document.js';
import { migrateSubtitleDocuments } from './subtitle-migration-document.js';

/** Volatile source receipts and pending history belong to the current editor session only. */
export function createSubtitleMigrationControls({
  getSession,
  current,
  publish,
  acceptEdit,
  getSubtitleInputSelection = () => null,
}) {
  const keyFor = (session) => subtitleMigrationSourcePlan(session.timeline.clips).key;
  const stateFor = (session) => {
    const plan = subtitleMigrationSourcePlan(session.timeline.clips);
    if (!plan.sources.length)
      return {
        key: plan.key,
        status: 'ready',
        sources: plan.nodeIds.map((nodeId) => ({ nodeId, track: { visible: true, cues: [] } })),
      };
    return session.subtitleMigrationSources?.key === plan.key
      ? session.subtitleMigrationSources
      : { key: plan.key, status: 'loading' };
  };
  const convert = (session, timeline) => {
    const receipt = stateFor(session);
    if (receipt.status !== 'ready')
      return { status: receipt.status === 'failed' ? 'fallback' : 'wait' };
    const overlay = effectiveTextHtml({ ...session, timeline });
    let reservedTrackIndexes = [];
    if (timeline.overlayHtmlUrl && !overlay && !['error', 'ready'].includes(session.textStatus))
      return { status: 'wait' };
    if (overlay) {
      const parsed = readTextOverlayHtml(overlay);
      if (!parsed.ok) return { status: 'fallback', reason: 'overlay-invalid' };
      reservedTrackIndexes = parsed.trackIndexes;
    }
    const sourceClips = timeline.clips.map((clip) => ({
      ...clip,
      sourceDuration:
        session.mediaBySourceId?.get(clip.sourceNodeId)?.metadata?.sourceDuration ??
        clip.sourceDuration,
    }));
    const originSources = receipt.sources.flatMap((source) =>
      source.clipId ? [{ clipId: source.clipId, track: source.track }] : [],
    );
    const { origins } = mergeSubtitleSourcesWithOrigins(originSources, sourceClips);
    const result = migrateSubtitleDocuments({
      currentTrack: timeline.subtitles,
      sources: receipt.sources,
      clips: sourceClips,
      origins,
      outputSize: textOutputSize(session),
      reservedTrackIndexes,
    });
    return result.ok
      ? { status: 'ready', ...result }
      : { status: 'fallback', reason: result.reason };
  };
  const finish = (session, result, conversion, selectedId) => {
    const pending = session.pendingVttMigration;
    const focus = getSubtitleInputSelection();
    const subtitlesHtml = { ...result.timeline.subtitlesHtml };
    for (const layer of conversion.layers) subtitlesHtml[layer.key] = layer.archive;
    const accepted = acceptEdit({
      ...result,
      timeline: { ...result.timeline, subtitlesHtml },
      ...(pending ? { migrationToken: pending.token, amendHistory: pending.history } : {}),
    });
    if (!accepted) return false;
    const identity =
      conversion.timelineCueIdMap.get(selectedId) ||
      conversion.timelineCueIdMap.values().next().value ||
      null;
    const latest = getSession();
    publish({
      ...latest,
      pendingVttMigration: null,
      subtitleMigrationPhase: 'idle',
      subtitleMigrationError: '',
      subtitleTextDraft: null,
      selectedSubtitleId: null,
      selectedHtmlSubtitle: identity,
      subtitlePanelOpen: false,
      htmlSubtitlePanelOpen: session.subtitlePanelOpen || session.htmlSubtitlePanelOpen,
      htmlSubtitleStyleRequest: { token: {}, focus },
      htmlSubtitleTrackChoice: null,
    });
    return true;
  };
  const commitVttEdit = (result, selectedId) => {
    const session = getSession();
    if (!current(session) || !session.ready || session.conflicted) return false;
    if (describeSubtitleEditing(session).ownsHtml) return false;
    const conversion = convert(session, result.timeline);
    if (conversion.status === 'ready') return finish(session, result, conversion, selectedId);
    const previous = session.pendingVttMigration;
    const accepted = acceptEdit({
      ...result,
      ...(previous ? { migrationToken: previous.token, amendHistory: previous.history } : {}),
    });
    if (!accepted) return false;
    const latest = getSession();
    publish({
      ...latest,
      pendingVttMigration:
        conversion.status === 'wait'
          ? {
              token: previous?.token || {},
              key: keyFor(latest),
              history: latest.history,
              trackFingerprint: subtitleTrackFingerprint(latest.timeline.subtitles),
              selectedId,
            }
          : null,
      subtitleMigrationPhase: conversion.status === 'wait' ? 'pending' : 'failed',
      subtitleMigrationError:
        conversion.status === 'wait' ? '' : '字幕格式暂时无法转换，当前字幕已保留，可继续编辑',
    });
    return true;
  };
  const resume = () => {
    const session = getSession(),
      pending = session?.pendingVttMigration;
    if (!current(session) || !pending || session.conflicted || !session.ready) return false;
    if (
      pending.key !== keyFor(session) ||
      pending.history !== session.history ||
      subtitleTrackFingerprint(session.timeline.subtitles) !== pending.trackFingerprint
    ) {
      publish({ ...session, pendingVttMigration: null, subtitleMigrationPhase: 'idle' });
      return false;
    }
    const timeline = projectSubtitleTextDraft(session),
      conversion = convert(session, timeline);
    if (conversion.status === 'wait') return false;
    if (conversion.status === 'fallback') {
      publish({
        ...session,
        pendingVttMigration: null,
        subtitleMigrationPhase: 'failed',
        subtitleMigrationError: '字幕格式暂时无法转换，当前字幕已保留，可继续编辑',
      });
      return false;
    }
    return finish(session, { timeline }, conversion, pending.selectedId);
  };
  return {
    commitVttEdit,
    resume,
    normalizeUI: (session) =>
      session.pendingVttMigration &&
      (session.pendingVttMigration.key !== keyFor(session) ||
        session.pendingVttMigration.history !== session.history)
        ? { ...session, pendingVttMigration: null, subtitleMigrationPhase: 'idle' }
        : session,
    controls: {
      onSubtitleMigrationSources: (key, status, sources = []) => {
        const session = getSession();
        if (!current(session) || key !== keyFor(session)) return false;
        const previous = session.subtitleMigrationSources;
        if (
          previous?.key === key &&
          previous.status === status &&
          JSON.stringify(previous.sources) === JSON.stringify(sources)
        )
          return true;
        publish({ ...session, subtitleMigrationSources: { key, status, sources } });
        resume();
        return true;
      },
      onResumeSubtitleMigration: resume,
    },
  };
}
