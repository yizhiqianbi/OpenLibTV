import { isClipAgentEditingActive } from '../../clip-disconnect/disconnect-model.js';

// Original module 713118 and VideoClipNode dN: these are content dimensions,
// not the media's intrinsic width/height or the entire node chrome.
export const VIDEO_CLIP_NODE_WIDTH = 350;
export const VIDEO_CLIP_INCOMING_WIDTH = 566;
export const VIDEO_CLIP_INCOMING_HEIGHT = 350;
export const VIDEO_CLIP_EMBED_CONTENT_HEIGHT = 260;

/**
 * Wrapper 244434's URL-qualified projections. Renderer dN separately uses the
 * first video record; neither projection sorts by the saved timeline.
 */
export function collectVideoClipIncomingSources(incomingData) {
  const videoList = incomingData?.videoList ?? [];
  const audioList = incomingData?.audioList ?? [];
  const usableVideoList = videoList.filter((entry) => entry.url);
  const usableAudioList = audioList.filter((entry) => entry.url);
  return {
    videoSourceNodeIds: videoList.map((entry) => entry.nodeId),
    audioSourceNodeIds: audioList.map((entry) => entry.nodeId),
    usableVideoSourceNodeIds: usableVideoList.map((entry) => entry.nodeId),
    usableAudioSourceNodeIds: usableAudioList.map((entry) => entry.nodeId),
    videoUrls: videoList.map((entry) => entry.url).filter(Boolean),
    audioUrls: audioList.map((entry) => entry.url).filter(Boolean),
    videoDisplayNames: usableVideoList.map((entry) => entry.label?.trim() || ''),
    audioDisplayNames: usableAudioList.map((entry) => entry.label?.trim() || ''),
  };
}

/** Module 688111's one-shot active refresh delay; NaN/Infinity are intentional. */
export function getVideoClipAgentRefreshDelay(editing, nowMs) {
  if (editing?.state !== 'running' || typeof editing.startedAtMs !== 'number') return null;
  const remaining = editing.startedAtMs + 3_600_000 - nowMs;
  return remaining <= 0 ? null : remaining + 50;
}

/** Module 971021: any non-null agentEditing owns the saved timeline. */
export function shouldUseAuthoritativeVideoClipTimeline(data) {
  return data?.clipTimelineData?.clipsAuthoritative === true || data?.agentEditing != null;
}

/** 959248 / 182004: loading must be true; finite typed 2/3/4 are terminal. */
export function isVideoClipComposeGenerating(taskInfo) {
  if (taskInfo?.loading !== true) return false;
  const rawStatus = taskInfo.status;
  let status;
  if (typeof rawStatus === 'number') {
    if (Number.isFinite(rawStatus)) status = rawStatus;
  } else if (typeof rawStatus === 'string' && rawStatus.trim() !== '') {
    const parsed = Number(rawStatus);
    if (Number.isFinite(parsed)) status = parsed;
  }
  return status !== 2 && status !== 3 && status !== 4;
}

/**
 * Original dN renderer decision only. The caller supplies the clock, readonly
 * result, independent pending state and base generator visibility. A pending
 * request does not become active editing or change the preview's dimensions.
 */
export function resolveVideoClipNodePresentation({
  nodeId,
  data,
  incomingData,
  editingClipNodeId,
  editingClipPreviewExpanded,
  agentEditingPending = false,
  readonly = false,
  shouldShowGenerator = false,
  nowMs,
  defaultLabel,
} = {}) {
  const outputUrl = (data?.url ?? [])[0];
  const hasOutput = !!outputUrl;
  const firstVideo = (incomingData?.videoList ?? [])[0];
  const firstVideoUrl = firstVideo?.url;
  const hasIncomingVideo = !!firstVideoUrl;
  const isEditing = editingClipNodeId === nodeId;
  const isEmbeddedPreview = isEditing && !editingClipPreviewExpanded;
  const agentActive = isClipAgentEditingActive(data?.agentEditing, nowMs);
  const agentBusy = agentEditingPending || agentActive;
  const composeGenerating = isVideoClipComposeGenerating(data?.taskInfo);

  // Output and the active overlay coexist. Without an output, active editing
  // renders only dy; it must not accidentally render the empty preset panel.
  const state = isEmbeddedPreview
    ? 'editor-drop'
    : hasOutput
      ? 'output'
      : agentActive
        ? 'agent-active'
        : hasIncomingVideo
          ? 'incoming'
          : 'empty';
  const showOpenButton = state === 'output' || state === 'incoming';
  const openDisabled =
    state === 'output'
      ? readonly || agentBusy
      : state === 'incoming'
        ? readonly || agentEditingPending
        : true;
  const presetChosen = !!data?.agentComposerData?.modeKey;
  const showPresets = state === 'empty' && !presetChosen;

  return {
    state,
    label: data?.name || data?.label || defaultLabel,
    outputUrl,
    hasOutput,
    firstVideoUrl,
    firstVideoSourceNodeId: firstVideo?.nodeId ?? '',
    hasIncomingVideo,
    isEditing,
    isEmbeddedPreview,
    previewPortalId: isEmbeddedPreview ? `clip-preview-drop-${nodeId}` : null,
    width: isEmbeddedPreview
      ? VIDEO_CLIP_NODE_WIDTH
      : hasIncomingVideo && !agentActive
        ? VIDEO_CLIP_INCOMING_WIDTH
        : VIDEO_CLIP_NODE_WIDTH,
    height: isEmbeddedPreview
      ? (data?.embedContentHeight ?? VIDEO_CLIP_EMBED_CONTENT_HEIGHT)
      : hasIncomingVideo && !agentActive
        ? VIDEO_CLIP_INCOMING_HEIGHT
        : VIDEO_CLIP_NODE_WIDTH,
    borderRadius: !hasIncomingVideo || agentActive || isEmbeddedPreview ? 12 : 16,
    agentActive,
    agentPending: agentEditingPending,
    agentBusy,
    shouldCloseEditor: agentBusy && isEditing,
    showAgentOverlay: !isEmbeddedPreview && agentActive,
    showOpenButton,
    openDisabled,
    canOpenEditor: showOpenButton && !openDisabled,
    presetChosen,
    showPresets,
    presetDisabled: readonly,
    shouldWarmPresets: state === 'empty' && !readonly && !presetChosen,
    shouldShowGenerator: shouldShowGenerator && !isEditing && !agentBusy,
    composeGenerating,
    showDownload: hasOutput && !isEmbeddedPreview && !composeGenerating,
  };
}
