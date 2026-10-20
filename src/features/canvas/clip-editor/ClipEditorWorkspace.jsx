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
import {
  projectTextDraft,
  effectiveTextHtml,
  readTextStyle,
  textOutputSize,
} from './text/document-model.js';
import { useHtmlSubtitleSources } from './text/useHtmlSubtitleSources.js';
import HtmlSubtitleWorkspace, {
  HtmlSubtitleTimelineRows,
  useHtmlSubtitleView,
} from './text/HtmlSubtitleWorkspace.jsx';
import { classifySubtitleSources } from './domain/subtitle-source-mode.js';
import { describeSubtitleEditing } from './domain/subtitle-ownership-model.js';
import { planClipTimelineExport } from './domain/clip-export-model.js';
import { download } from '../../editor/browser.js';
import { readHtmlSubtitleStyle } from './text/subtitle-style-document.js';

export default function ClipEditorWorkspace({
  controller,
  state,
  mediaHost,
  src,
  documentKey,
  fontSource,
}) {
  useTextTools(state, controller, src);
  const htmlPlan = useHtmlSubtitleSources(state, controller, src);
  const subtitleSources = classifySubtitleSources({
    clips: state?.timeline.clips,
    timelineSubtitles: state?.timeline.subtitles,
    htmlLayers: htmlPlan.layers,
    nodeSubtitleHtmlUrl: state?.nodeSubtitleHtmlUrl,
  });
  const editing = describeSubtitleEditing(state);
  const htmlMode = editing.useHtmlEditor;
  useClipSubtitleSources(
    state,
    controller,
    src,
    !htmlMode || subtitleSources.hasVtt,
    !editing.ownsHtml,
  );
  const textModel = useTextModel(state);
  const htmlView = useHtmlSubtitleView(state);
  if (!state) return null;
  const exportLocal = () => {
    const plan = planClipTimelineExport(state.timeline, state.mediaBySourceId);
    if (plan.status !== 'ready') {
      controller.notify?.(plan.message);
      return false;
    }
    download(plan.filename, plan.content, 'application/json');
    controller.notify?.('剪辑工程已导出到本地');
    return true;
  };
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
    ...(editing.active ? { subtitles: undefined } : {}),
  };
  const output = textOutputSize(state);
  const textCue =
    textModel?.ok && state.selectedTextCueId
      ? textModel.cues.find((cue) => cue.cueId === state.selectedTextCueId)
      : null;
  const textActive = Boolean(
    textCue &&
    state.timeline.currentTime >= textCue.start - 0.001 &&
    state.timeline.currentTime < textCue.start + textCue.duration - 0.001 &&
    !textCue.hidden &&
    !textCue.trackHidden,
  );
  const htmlSelection = state.selectedHtmlSubtitle
    ? htmlView.blocks.find(
        (block) =>
          block.identity.key === state.selectedHtmlSubtitle.key &&
          block.cueId === state.selectedHtmlSubtitle.cueId &&
          (!state.selectedHtmlSubtitle.clipId ||
            block.clipId === state.selectedHtmlSubtitle.clipId),
      )
    : null;
  const htmlLayer = htmlSelection
    ? htmlView.layers.find((layer) => layer.key === htmlSelection.identity.key)
    : null;
  const htmlCue =
    htmlLayer?.model.ok && state.selectedHtmlSubtitle
      ? htmlLayer.model.cues.find((cue) => cue.cueId === state.selectedHtmlSubtitle.cueId)
      : null;
  const htmlActive = Boolean(
    htmlSelection &&
    htmlCue &&
    state.timeline.currentTime >= htmlSelection.startTime - 0.001 &&
    state.timeline.currentTime < htmlSelection.endTime - 0.001 &&
    !htmlSelection.hidden &&
    !htmlSelection.trackHidden,
  );
  const previewSelection =
    state.textPanelOpen && textCue
      ? {
          owner: 'overlay',
          cueId: textCue.cueId,
          operation: 'text-overlay',
          layout: readTextStyle(textModel, textCue.cueId, output),
          active: textActive,
          canEditLayout: true,
          label: '文字',
        }
      : state.htmlSubtitlePanelOpen && htmlSelection && htmlCue && htmlLayer?.model.ok
        ? {
            owner: 'html-subtitle',
            layerKey: htmlSelection.identity.key,
            cueId: htmlSelection.cueId,
            clipId: htmlSelection.clipId,
            trackIndex: htmlSelection.trackIndex,
            operation: 'html-subtitle',
            layout: readHtmlSubtitleStyle(htmlLayer.model, htmlCue.cueId, output),
            active: htmlActive,
            canEditLayout: !htmlLayer.model.styleCompatibility?.readOnly,
            label: '字幕',
          }
        : null;
  const htmlLayers = htmlView.layers
    .filter((layer) => layer.model.ok)
    .map(({ key, nodeId, html, url }) => ({
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
  const subtitlePanelOpen = Boolean(state.htmlSubtitlePanelOpen || state.subtitlePanelOpen);
  const htmlState = {
    ...state,
    htmlSubtitlePanelOpen: htmlMode && subtitlePanelOpen,
    htmlSubtitleStatus: editing.canEditHtml ? 'ready' : state.htmlSubtitleStatus,
  };
  const vttState = { ...state, subtitlePanelOpen: !htmlMode && subtitlePanelOpen };
  const content = (
    <ClipTextWorkspace state={state} controller={controller} fontSource={fontSource}>
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
        previewSelection={previewSelection}
        onBeginPreviewEdit={controller.onBeginEdit}
        onEditPreview={controller.onEditPreview}
        onEndPreviewEdit={controller.onEndEdit}
        onCancelPreviewEdit={controller.onCancelEdit}
      />
    </ClipTextWorkspace>
  );
  return (
    <>
      {createPortal(
        <ClipTransitionWorkspace state={state} controller={controller} src={src}>
          <HtmlSubtitleWorkspace
            state={htmlState}
            controller={controller}
            view={htmlView}
            fontSource={fontSource}
          >
            <ClipSubtitleWorkspace state={vttState} controller={controller} fontSource={fontSource}>
              {content}
            </ClipSubtitleWorkspace>
          </HtmlSubtitleWorkspace>
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
            subtitlePanelOpen={subtitlePanelOpen}
            subtitleTrackRows={
              htmlMode ? (
                <HtmlSubtitleTimelineRows
                  state={htmlState}
                  controller={controller}
                  view={htmlView}
                />
              ) : undefined
            }
            htmlSubtitleBlocks={htmlView.blocks}
            onEditHtmlSubtitle={controller.onEditHtmlSubtitle}
            canPasteClip={Boolean(state.clipClipboard?.clip)}
            error={state.error || state.mediaError}
            ready={state.ready && !state.conflicted}
            onClose={controller.close}
            onPlayToggle={controller.onPlayToggle}
            playbackBlocked={
              (Boolean(state.timeline.overlayHtmlInline || state.timeline.overlayHtmlUrl) &&
                (state.textStatus !== 'ready' || state.textPreviewReady !== true)) ||
              editing.readiness !== 'ready' ||
              (editing.active && state.htmlSubtitlePreviewReady !== true)
            }
            textTrackRows={<ClipTextTimelineRows state={state} controller={controller} />}
            textBeforeSubtitles={textModel?.groupAnchor === 0}
            onCanDetachAudio={controller.onCanDetachAudio}
            onDetachAudio={controller.onDetachAudio}
            onVocalSplit={controller.onVocalSplit}
            onExportLocal={exportLocal}
          />
        </div>
      </div>
    </>
  );
}
