import { createPortal } from 'react-dom';
import ClipTimelinePreview from './ClipTimelinePreview.jsx';
import VideoClipTimeline from './VideoClipTimeline.jsx';
import ClipTransitionWorkspace from './ClipTransitionWorkspace.jsx';
import { useClipSubtitleSources } from './useClipSubtitleSources.js';
import {
  effectiveSubtitleTimeline,
  projectSubtitleTextDraft,
} from './domain/subtitle-document-model.js';
import ClipSubtitleWorkspace from './ClipSubtitleWorkspace.jsx';
import { useTextTools } from './text/useTextTools.js';
import ClipTextWorkspace, {
  ClipTextTimelineRows,
  useTextModel,
} from './text/ClipTextWorkspace.jsx';
import { projectTextDraft, effectiveTextHtml } from './text/document-model.js';
import { useHtmlSubtitleSources } from './text/useHtmlSubtitleSources.js';
import HtmlSubtitleWorkspace, {
  HtmlSubtitleTimelineRows,
  useHtmlSubtitleView,
} from './text/HtmlSubtitleWorkspace.jsx';
import ClipSubtitleTimelineRow from './ClipSubtitleTimelineRow.jsx';
import { classifySubtitleSources } from './domain/subtitle-source-mode.js';

export default function ClipEditorWorkspace({ controller, state, mediaHost, src, documentKey }) {
  useTextTools(state, controller, src);
  const htmlPlan = useHtmlSubtitleSources(state, controller, src);
  const subtitleSources = classifySubtitleSources({
    clips: state?.timeline.clips,
    timelineSubtitles: state?.timeline.subtitles,
    htmlLayers: htmlPlan.layers,
  });
  const htmlMode = Boolean(
    htmlPlan.error ||
    htmlPlan.layers.length ||
    !(
      state?.timeline.subtitles?.cues?.length ||
      state?.timeline.subtitles?.rawVtt ||
      state?.timeline.subtitles?.sourceUrl ||
      state?.timeline.subtitles?.userCleared ||
      state?.timeline.clips.some((clip) => clip.subtitleUrl)
    ),
  );
  useClipSubtitleSources(state, controller, src, !htmlMode || subtitleSources.hasVtt);
  const textModel = useTextModel(state);
  const htmlView = useHtmlSubtitleView(state);
  if (!state) return null;
  const previewTimeline = state.subtitleTextDraft
    ? projectSubtitleTextDraft(state)
    : effectiveSubtitleTimeline(state);
  const textTimeline = state.textDraft
    ? projectTextDraft({ ...state, timeline: previewTimeline })
    : effectiveTextHtml(state)
      ? { ...previewTimeline, overlayHtmlInline: effectiveTextHtml(state) }
      : previewTimeline;
  const renderedTimeline = {
    ...textTimeline,
    subtitlesHtml: htmlView.timeline.subtitlesHtml,
    ...(htmlMode && !subtitleSources.hasVtt ? { subtitles: undefined } : {}),
  };
  const htmlLayers = htmlView.layers.map(({ key, nodeId, html, url }) => ({
    key,
    nodeId,
    html,
    url,
  }));
  const videoController = htmlMode
    ? {
        ...controller,
        onAddSubtitle: controller.onAddHtmlSubtitle,
        onCloseSubtitlePanel: controller.onCloseHtmlSubtitles,
      }
    : controller;
  const content = (
    <ClipTextWorkspace state={state} controller={controller}>
      <ClipTimelinePreview
        ref={controller.playbackRef}
        timeline={renderedTimeline}
        mediaBySourceId={state.mediaBySourceId}
        documentKey={documentKey}
        nodeId={state.nodeId}
        previewExpanded={state.previewExpanded}
        playing={state.playing}
        mapUrl={src}
        onTimeChange={controller.onTimeChange}
        onPlayingChange={controller.onPlayingChange}
        onMetadata={controller.onMetadata}
        onPreparationChange={controller.onPreparationChange}
        onContentHeightRequired={controller.onContentHeightRequired}
        onTextPreviewStatus={controller.onTextPreviewStatus}
        textRetryKey={state.textRetry}
        htmlSubtitleLayers={htmlLayers}
        onHtmlSubtitlePreviewStatus={controller.onHtmlSubtitlePreviewStatus}
        htmlSubtitleRetryKey={state.htmlSubtitleRetry}
      />
    </ClipTextWorkspace>
  );
  return (
    <>
      {createPortal(
        <ClipTransitionWorkspace state={state} controller={controller} src={src}>
          {htmlMode ? (
            <HtmlSubtitleWorkspace state={state} controller={controller} view={htmlView}>
              {content}
            </HtmlSubtitleWorkspace>
          ) : (
            <ClipSubtitleWorkspace state={state} controller={controller}>
              {content}
            </ClipSubtitleWorkspace>
          )}
        </ClipTransitionWorkspace>,
        mediaHost,
      )}
      <div className="cv-clip-editor-timeline-shell" style={{ height: state.height }}>
        {(state.textError || state.textPreviewError) && !state.textPanelOpen && (
          <div className="cv-clip-editor-error" role="alert">
            {state.textError || state.textPreviewError}
            <button type="button" onClick={controller.onRetryText}>
              重试读取文本
            </button>
          </div>
        )}
        {state.subtitleError && !state.subtitlePanelOpen && (
          <div className="cv-clip-editor-error" role="alert">
            {state.subtitleError}
            <button type="button" onClick={controller.onRetrySubtitles}>
              重试读取字幕
            </button>
          </div>
        )}
        {(state.htmlSubtitleError || state.htmlSubtitlePreviewError || htmlView.error) &&
          !state.htmlSubtitlePanelOpen && (
            <div className="cv-clip-editor-error" role="alert">
              {state.htmlSubtitleError || state.htmlSubtitlePreviewError || htmlView.error}
              <button type="button" onClick={controller.onRetryHtmlSubtitles}>
                重试读取字幕
              </button>
            </div>
          )}
        {(state.error || state.mediaError) && (
          <div className="cv-clip-editor-error" role="alert">
            {state.error || state.mediaError}
            {state.conflicted ? (
              <button type="button" onClick={controller.onReloadLatestTimeline}>
                保留副本并打开最新时间轴
              </button>
            ) : state.mediaError && !state.preparing ? (
              <button type="button" onClick={controller.onRetryPreparation}>
                重试读取素材
              </button>
            ) : null}
          </div>
        )}
        {state.recoveryDraft && !state.conflicted && (
          <div className="cv-clip-editor-recovery" role="status">
            上次编辑副本保留在当前页面。
            <button type="button" onClick={controller.onRestoreRecoveryTimeline}>
              恢复编辑副本
            </button>
          </div>
        )}
        {!!state.unsupportedFeatures.length && (
          <div className="cv-clip-editor-capability-note" role="status">
            当前预览尚未支持：{state.unsupportedFeatures.join('、')}。原时间轴数据已保留。
          </div>
        )}
        <div className="cv-clip-editor-timeline-panel">
          <VideoClipTimeline
            {...videoController}
            {...state}
            timeline={
              htmlMode
                ? { ...state.timeline, subtitles: undefined }
                : effectiveSubtitleTimeline(state)
            }
            subtitlePanelOpen={htmlMode ? state.htmlSubtitlePanelOpen : state.subtitlePanelOpen}
            subtitleTrackRows={
              htmlMode ? (
                <>
                  <HtmlSubtitleTimelineRows state={state} controller={controller} view={htmlView} />
                  {subtitleSources.mixed && (
                    <ClipSubtitleTimelineRow
                      timeline={effectiveSubtitleTimeline(state)}
                      selectedSubtitleId={state.selectedSubtitleId}
                      blocked={!state.ready || state.conflicted || state.subtitleStatus !== 'ready'}
                      draftSession={state.draftSession}
                      onSelectSubtitle={controller.onSelectSubtitle}
                      onEditSubtitle={controller.onEditSubtitle}
                      onBeginEdit={controller.onBeginEdit}
                      onEditPreview={controller.onEditPreview}
                      onEndEdit={controller.onEndEdit}
                      onCancelEdit={controller.onCancelEdit}
                    />
                  )}
                </>
              ) : undefined
            }
            canPasteClip={Boolean(state.clipClipboard?.clip)}
            error={state.error || state.mediaError}
            ready={state.ready && !state.conflicted}
            onClose={controller.close}
            onPlayToggle={controller.onPlayToggle}
            playbackBlocked={
              (Boolean(state.timeline.overlayHtmlInline || state.timeline.overlayHtmlUrl) &&
                (state.textStatus !== 'ready' || state.textPreviewReady !== true)) ||
              (htmlPlan.layers.length > 0 &&
                (state.htmlSubtitleStatus !== 'ready' || state.htmlSubtitlePreviewReady !== true))
            }
            textTrackRows={<ClipTextTimelineRows state={state} controller={controller} />}
            textBeforeSubtitles={textModel?.groupAnchor === 0}
            onCanDetachAudio={controller.onCanDetachAudio}
            onDetachAudio={controller.onDetachAudio}
            onCanVocalSplit={controller.onCanVocalSplit}
            onVocalSplit={controller.onVocalSplit}
          />
        </div>
      </div>
    </>
  );
}
