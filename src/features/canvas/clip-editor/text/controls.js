import { createTimedTextCueId } from '../../../../services/timed-text-id.js';
import { planTimedTextEntry } from '../domain/subtitle-model.js';
import { planNewOverlayCue, textOutputScale } from '../domain/text-timing-model.js';
import { createTextOverlayHtml, readTextOverlayHtml } from './html-document.js';
import {
  effectiveTextHtml,
  prepareTextTimelineEdit,
  projectTextDraft,
  textLoadPlan,
  textOutputSize,
  textStylePatches,
  readTextStyle,
} from './document-model.js';
import { readTextMotion } from './motion-document.js';
import { createHtmlSubtitleTools } from './html-subtitle-tools.js';

function createOrdinaryTextTools({
  getSession,
  current,
  publish,
  acceptEdit,
  pause,
  seek,
  makeId,
  notify,
  beginStyle,
  previewStyle,
  endStyle,
  cancelStyle,
}) {
  let cachedHtml, cachedModel;
  let activeStyle;
  const modelFor = (session) => {
    const html = effectiveTextHtml(session);
    if (html !== cachedHtml) {
      cachedHtml = html;
      cachedModel = html ? readTextOverlayHtml(html) : null;
    }
    return cachedModel;
  };
  const writable = () => {
    const session = getSession();
    return current(session) &&
      session.ready &&
      !session.conflicted &&
      session.textStatus === 'ready' &&
      !session.textPending
      ? session
      : null;
  };
  const commit = (patches, ui = {}) => {
    const session = writable();
    if (!session) return false;
    const base = { ...session.timeline, overlayHtmlInline: effectiveTextHtml(session) };
    const result = prepareTextTimelineEdit(base, { patches });
    if (result.error) {
      notify(result.error);
      return false;
    }
    if (result.timeline !== base && !acceptEdit(result)) return false;
    publish({ ...getSession(), ...ui });
    return true;
  };
  const flushDraft = () => {
    const session = getSession();
    if (!session?.textDraft) return true;
    if (!writable()) return false;
    let timeline;
    try {
      timeline = projectTextDraft(session);
    } catch (error) {
      notify(error.message);
      return false;
    }
    if (timeline !== session.timeline && !acceptEdit({ timeline })) return false;
    publish({ ...getSession(), textDraft: null });
    return true;
  };
  const select = (cueId) => {
    const session = writable(),
      model = session && modelFor(session);
    if (!model?.ok || !model.cues.some((cue) => cue.cueId === cueId)) return false;
    publish({
      ...session,
      textPanelOpen: true,
      selectedTextCueId: cueId,
      selectedClipIds: [],
      selectedSubtitleId: null,
      selectedTransitionRightClipId: null,
      subtitlePanelOpen: false,
      transitionPanelOpen: false,
      previewExpanded: true,
      textTrackChoice: null,
    });
    return true;
  };
  const prepareStyleEdit = (base, options) => {
    if (options.kind === 'gesture' && options.delta === 0) return { timeline: base };
    const effective = {
      ...base,
      overlayHtmlInline: base.overlayHtmlInline || getSession()?.textSourceHtml,
    };
    let patches = options.patches;
    if (options.fields) {
      const model = readTextOverlayHtml(effective.overlayHtmlInline || '');
      if (!model.ok) return { timeline: base, error: model.issues[0].detail };
      const output = textOutputSize(getSession());
      patches = textStylePatches(
        options.cueId,
        options.fields,
        readTextStyle(model, options.cueId, output),
        textOutputScale(model, output),
      );
    }
    const result = prepareTextTimelineEdit(effective, { ...options, patches });
    return result.timeline === effective ? { ...result, timeline: base } : result;
  };
  return {
    projectDraft: projectTextDraft,
    flushDraft,
    prepareEdit: prepareStyleEdit,
    normalizeUI: (session) => {
      const model = modelFor(session);
      const invalid =
        session.selectedTextCueId &&
        model?.ok &&
        !model.cues.some((cue) => cue.cueId === session.selectedTextCueId);
      const count = model?.ok ? model.trackIndexes.length : 0;
      return invalid || session.textTrackCount !== count
        ? {
            ...session,
            textTrackCount: count,
            ...(invalid ? { selectedTextCueId: null, textDraft: null } : {}),
          }
        : session;
    },
    controls: {
      onBeginTextStyle: ({ field, kind, readPending } = {}) => {
        const session = writable(),
          model = session && modelFor(session);
        const cueId = session?.selectedTextCueId;
        if (!model?.ok || !model.cues.some((cue) => cue.cueId === cueId) || !field) return null;
        const token = { field, cueId };
        const project =
          kind === 'pointer'
            ? undefined
            : (timeline) => {
                const value = readPending?.();
                if (value == null) return timeline;
                const model = readTextOverlayHtml(
                  timeline.overlayHtmlInline || getSession()?.textSourceHtml || '',
                );
                if (
                  model.ok &&
                  readTextStyle(model, cueId, textOutputSize(getSession()))[field] === value
                )
                  return timeline;
                const result = prepareStyleEdit(timeline, { cueId, fields: { [field]: value } });
                if (result.error) throw new Error(result.error);
                return result.timeline;
              };
        if (beginStyle?.(token, project) !== true) return null;
        activeStyle = token;
        return token;
      },
      onPreviewTextStyle: (token, value) =>
        activeStyle === token &&
        writable()?.selectedTextCueId === token?.cueId &&
        previewStyle?.(token, { cueId: token.cueId, fields: { [token.field]: value } }),
      onEndTextStyle: (token) => {
        if (activeStyle !== token) return false;
        activeStyle = null;
        return endStyle?.(token);
      },
      onCancelTextStyle: (token) => {
        if (activeStyle !== token) return false;
        activeStyle = null;
        return cancelStyle?.(token);
      },
      onTextLoadStatus: (key, error = '') => {
        const session = getSession();
        if (!current(session) || textLoadPlan(session.timeline).key !== key) return false;
        const status = error ? 'error' : 'loading';
        if (session.textStatus !== status || session.textError !== error)
          publish({ ...session, textStatus: status, textError: error, textSourceHtml: null });
        return true;
      },
      onTextLoaded: (key, html) => {
        const session = getSession();
        if (!current(session) || textLoadPlan(session.timeline).key !== key) return false;
        const model = html ? readTextOverlayHtml(html) : null;
        if (model && !model.ok) {
          publish({
            ...session,
            textStatus: 'error',
            textError: model.issues[0].detail,
            textSourceHtml: null,
          });
          return false;
        }
        if (session.textStatus !== 'ready' || session.textSourceHtml !== html)
          publish({ ...session, textStatus: 'ready', textError: '', textSourceHtml: html || null });
        return true;
      },
      onRetryText: () => {
        const session = getSession();
        if (current(session)) publish({ ...session, textRetry: (session.textRetry || 0) + 1 });
      },
      onAddText: async ({ trackIndex, force = false } = {}) => {
        let session = getSession();
        if (!current(session)) return false;
        publish({
          ...session,
          textPanelOpen: true,
          subtitlePanelOpen: false,
          transitionPanelOpen: false,
          previewExpanded: true,
        });
        session = writable();
        if (!session) return false;
        const model = modelFor(session);
        if (model && !model.ok) {
          notify(model.issues[0].detail);
          return false;
        }
        const rows =
          model?.trackIndexes.map((index) => ({
            rowId: `overlay:${model.compositionId}:${index}`,
            kind: 'text',
            cues: model.cues
              .filter((cue) => cue.trackIndex === index)
              .map((cue) => ({
                cueId: cue.cueId,
                startTime: cue.start,
                endTime: cue.start + cue.duration,
              })),
          })) || [];
        const entry = planTimedTextEntry({
          kind: 'text',
          currentTime: session.timeline.currentTime,
          rows,
          ...(trackIndex != null
            ? { targetRowId: `overlay:${model?.compositionId}:${trackIndex}` }
            : {}),
        });
        if (entry.type === 'request-track-choice') {
          publish({ ...session, textTrackChoice: model.trackIndexes });
          return false;
        }
        if (entry.type === 'unavailable') return false;
        if (!force && entry.type === 'select-cue') return select(entry.cueId);
        const row = trackIndex ?? (entry.rowId ? Number(entry.rowId.split(':').at(-1)) : 0);
        const plan = planNewOverlayCue({
          currentTime: session.timeline.currentTime,
          totalDuration: session.timeline.totalDuration,
          existing: model?.cues || [],
          trackIndex: row,
        });
        const output = textOutputSize(session);
        if (!plan || !output) {
          notify('当前播放位置没有可用的文本区间');
          return false;
        }
        pause();
        const timeline = session.timeline,
          owner = session.draftSession;
        publish({ ...getSession(), textPending: true, playing: false });
        try {
          const cueId = await createTimedTextCueId(
            plan.text,
            plan.start,
            plan.duration,
            'timeline-overlay',
            model?.cues || [],
          );
          const latest = getSession();
          if (
            !current(latest) ||
            latest.draftSession !== owner ||
            latest.timeline !== timeline ||
            latest.conflicted
          )
            return false;
          const cue = { ...plan, cueId, role: 'text' };
          const result = model
            ? prepareTextTimelineEdit(
                { ...timeline, overlayHtmlInline: effectiveTextHtml(latest) },
                { patches: [{ kind: 'addCue', cue }] },
              )
            : {
                timeline: {
                  ...timeline,
                  overlayHtmlInline: createTextOverlayHtml({
                    compositionId: `text-libtv-${makeId()}`,
                    ...output,
                    duration: timeline.totalDuration,
                    cues: [cue],
                  }),
                },
              };
          if (result.error) {
            notify(result.error);
            return false;
          }
          if (!acceptEdit(result)) return false;
          publish({ ...getSession(), textPending: false });
          return select(cueId);
        } catch (error) {
          if (current(getSession()) && getSession().draftSession === owner)
            notify(error.message || '文本创建失败，请重试');
          return false;
        } finally {
          const latest = getSession();
          if (current(latest) && latest.draftSession === owner && latest.textPending)
            publish({ ...latest, textPending: false });
        }
      },
      onSelectText: select,
      onSeekText: (cueId) => {
        if (!select(cueId)) return false;
        seek(modelFor(getSession()).cues.find((cue) => cue.cueId === cueId).start);
        return true;
      },
      onTextChange: (cueId, change) => {
        const session = writable();
        if (!session || session.selectedTextCueId !== cueId) return false;
        const draft = session.textDraft?.cueId === cueId ? session.textDraft : { cueId };
        publish({
          ...session,
          textDraft: {
            ...draft,
            ...(typeof change === 'string'
              ? { text: change }
              : { fields: { ...draft.fields, [change.field]: change.value } }),
          },
        });
        return true;
      },
      onCommitText: flushDraft,
      onEditText: ({ fields, patches, preset }) => {
        const session = writable(),
          model = session && modelFor(session);
        if (!model?.ok) return false;
        const cueId = session.selectedTextCueId;
        if (preset && (!cueId || !preset.id || !preset.fields)) return false;
        return commit(
          patches || [
            ...textStylePatches(
              cueId,
              preset?.fields || fields,
              readTextStyle(model, cueId, textOutputSize(session)),
              textOutputScale(model, textOutputSize(session)),
            ),
            ...(preset ? [{ kind: 'textPresetId', cueId, presetId: preset.id }] : []),
          ],
        );
      },
      onApplyTextToAll: () => {
        const session = writable(),
          model = session && modelFor(session);
        const selected =
          model?.ok && model.cues.find((cue) => cue.cueId === session.selectedTextCueId);
        if (!selected) return false;
        const style = readTextStyle(model, selected.cueId, textOutputSize(session)),
          motion = readTextMotion(selected.element);
        const scale = textOutputScale(model, textOutputSize(session));
        return commit(
          model.cues
            .filter((cue) => cue.cueId !== selected.cueId)
            .flatMap((cue) => [
              { kind: 'clearTextStyle', cueId: cue.cueId },
              ...textStylePatches(cue.cueId, style, {}, scale),
              {
                kind: 'copyTextAppearance',
                cueId: cue.cueId,
                sourceCueId: selected.cueId,
                pixelScale: scale,
              },
              { kind: 'animation', cueId: cue.cueId, ...motion },
              {
                kind: 'textPresetId',
                cueId: cue.cueId,
                presetId: selected.element.getAttribute('data-libtv-text-preset-id'),
              },
            ]),
        );
      },
      onDeleteText: (cueId = getSession()?.selectedTextCueId) =>
        commit([{ kind: 'removeCue', cueId }], { selectedTextCueId: null, textDraft: null }),
      onCloseTextPanel: () => {
        if (!flushDraft() || !current(getSession())) return false;
        publish({ ...getSession(), textPanelOpen: false, textTrackChoice: null });
        return true;
      },
      onTextPreviewStatus: (status) => {
        const session = getSession();
        if (!current(session)) return false;
        if (
          session.textPreviewReady !== status.ready ||
          session.textPreviewError !== (status.error || '') ||
          session.textScriptUnsupported !== Boolean(status.scriptUnsupported)
        )
          publish({
            ...session,
            textPreviewReady: status.ready,
            textPreviewError: status.error || '',
            textScriptUnsupported: Boolean(status.scriptUnsupported),
          });
        return true;
      },
    },
  };
}

export function createClipTextTools(options) {
  const text = createOrdinaryTextTools(options);
  const subtitles = createHtmlSubtitleTools(options);
  return {
    ...text,
    projectDraft: (session) =>
      subtitles.projectDraft({ ...session, timeline: text.projectDraft(session) }),
    flushDraft: () => text.flushDraft() && subtitles.flushDraft(),
    normalizeUI: (session) => subtitles.normalizeUI(text.normalizeUI(session)),
    prepareSubtitleEdit: subtitles.prepareEdit,
    transformTimelineEdit: subtitles.transformTimelineEdit,
    isPlaybackBlocked: subtitles.isPlaybackBlocked,
    controls: { ...text.controls, ...subtitles.controls },
  };
}
