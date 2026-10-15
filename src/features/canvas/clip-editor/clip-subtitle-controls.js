import { normalizeSubtitleTrack, planTimedTextEntry } from './domain/subtitle-model.js';
import {
  effectiveSubtitleTimeline,
  prepareSubtitleEdit,
  subtitleLoadPlan,
} from './domain/subtitle-document-model.js';

/** Thin session actions; ownership/history/persistence remain with the editor. */
export function createClipSubtitleControls({
  getSession,
  current,
  publish,
  acceptEdit,
  seek,
  notify,
}) {
  const planKey = (timeline) => {
    try {
      return subtitleLoadPlan(timeline).key;
    } catch {
      return 'invalid';
    }
  };
  const writable = () => {
    const session = getSession();
    return current(session) &&
      session.ready &&
      !session.conflicted &&
      session.subtitleStatus === 'ready'
      ? session
      : null;
  };
  const select = (cueId) => {
    const session = writable();
    const cue = effectiveSubtitleTimeline(session)?.subtitles?.cues.find(
      (entry) => entry.id === cueId,
    );
    if (!cue) return false;
    publish({
      ...session,
      subtitlePanelOpen: true,
      transitionPanelOpen: false,
      textPanelOpen: false,
      selectedTextCueId: null,
      previewExpanded: true,
      selectedSubtitleId: cueId,
      selectedClipIds: [],
      selectedTransitionRightClipId: null,
    });
    return true;
  };
  const edit = (options) => {
    const session = writable();
    if (!session) return false;
    const base = effectiveSubtitleTimeline(session);
    const result = prepareSubtitleEdit(base, options);
    if (result.timeline !== base && !acceptEdit(result)) return false;
    publish({
      ...getSession(),
      selectedSubtitleId: result.selectedSubtitleId ?? session.selectedSubtitleId,
    });
    return true;
  };
  const flushDraft = () => {
    const session = getSession();
    const draft = session?.subtitleTextDraft;
    if (!draft) return true;
    if (!edit({ kind: 'text', cueId: draft.cueId, text: draft.text })) return false;
    publish({ ...getSession(), subtitleTextDraft: null });
    return true;
  };
  return {
    flushDraft,
    controls: {
      onSubtitleLoadStatus: (key, error = '') => {
        const session = getSession();
        if (!current(session)) return false;
        if (key !== planKey(session.timeline)) return false;
        const status = error ? 'error' : 'loading';
        if (session.subtitleStatus !== status || session.subtitleError !== error)
          publish({
            ...session,
            subtitleStatus: status,
            subtitleError: error,
            subtitleSourceTrack: null,
          });
        return true;
      },
      onSubtitleLoaded: (key, track) => {
        const session = getSession();
        if (!current(session) || key !== planKey(session.timeline)) return false;
        if (session.subtitleStatus === 'ready' && !track) return true;
        publish({
          ...session,
          subtitleStatus: 'ready',
          subtitleError: '',
          subtitleSourceTrack: track ?? null,
        });
        return true;
      },
      onRetrySubtitles: () => {
        const session = getSession();
        if (current(session))
          publish({ ...session, subtitleRetry: (session.subtitleRetry || 0) + 1 });
      },
      onAddSubtitle: ({ afterId, force = false } = {}) => {
        const session = getSession();
        if (!current(session)) return false;
        publish({
          ...session,
          subtitlePanelOpen: true,
          transitionPanelOpen: false,
          textPanelOpen: false,
          selectedTextCueId: null,
          previewExpanded: true,
        });
        const active = writable();
        if (!active) return false;
        const track = normalizeSubtitleTrack(effectiveSubtitleTimeline(active).subtitles);
        const plan = planTimedTextEntry({
          kind: 'subtitle',
          currentTime: active.timeline.currentTime,
          rows: track.cues.length
            ? [
                {
                  rowId: 'ordinary:0',
                  kind: 'subtitle',
                  cues: track.cues.map((cue) => ({ cueId: cue.id, ...cue })),
                },
              ]
            : [],
        });
        if (!force && !afterId && plan.type === 'select-cue') return select(plan.cueId);
        if (plan.type === 'unavailable') {
          notify?.('当前无法新增字幕');
          return false;
        }
        if (!edit({ kind: 'add', afterId })) return false;
        return select(getSession().selectedSubtitleId);
      },
      onSelectSubtitle: select,
      onSeekSubtitle: (cueId) => {
        if (!select(cueId)) return false;
        seek(
          effectiveSubtitleTimeline(getSession()).subtitles.cues.find((cue) => cue.id === cueId)
            .startTime,
        );
        return true;
      },
      onSubtitleTextChange: (cueId, text) => {
        const session = writable();
        if (
          !session ||
          cueId !== session.selectedSubtitleId ||
          !effectiveSubtitleTimeline(session).subtitles?.cues.some((cue) => cue.id === cueId)
        )
          return false;
        publish({ ...session, subtitleTextDraft: { cueId, text } });
        return true;
      },
      onCommitSubtitleText: flushDraft,
      onEditSubtitle: (options) =>
        edit({ ...options, cueId: options.cueId ?? getSession()?.selectedSubtitleId }),
      onCloseSubtitlePanel: () => {
        if (!flushDraft() || !current(getSession())) return false;
        publish({ ...getSession(), subtitlePanelOpen: false });
        return true;
      },
    },
  };
}
