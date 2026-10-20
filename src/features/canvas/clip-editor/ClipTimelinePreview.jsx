import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useClipTimelinePlayback } from './useClipTimelinePlayback.js';
import PreviewTransformOverlay from './text/PreviewTransformOverlay.jsx';

/** The host stays mounted while the caller moves its container between portals. */
const ClipTimelinePreview = forwardRef(function ClipTimelinePreview(
  {
    timeline,
    mediaBySourceId,
    documentKey,
    nodeId,
    previewExpanded = true,
    playing = false,
    mapUrl,
    outputSize,
    metadataReader,
    metadataTimeoutMs,
    onTimeChange,
    onPlayingChange,
    onPreparationChange,
    onMetadata,
    onContentHeightRequired,
    onError,
    onTextPreviewStatus,
    textRetryKey,
    htmlSubtitleLayers,
    onHtmlSubtitlePreviewStatus,
    htmlSubtitleRetryKey,
    previewSelection,
    onBeginPreviewEdit,
    onEditPreview,
    onEndPreviewEdit,
    onCancelPreviewEdit,
  },
  ref,
) {
  const hostRef = useRef(null);
  const playback = useClipTimelinePlayback({
    hostRef,
    timeline,
    mediaBySourceId,
    documentKey,
    nodeId,
    previewExpanded,
    playing,
    mapUrl,
    outputSize,
    metadataReader,
    metadataTimeoutMs,
    onTimeChange,
    onPlayingChange,
    onPreparationChange,
    onMetadata,
    onContentHeightRequired,
    onError,
    onTextPreviewStatus,
    textRetryKey,
    htmlSubtitleLayers,
    onHtmlSubtitlePreviewStatus,
    htmlSubtitleRetryKey,
  });
  const [showWaiting, setShowWaiting] = useState(false);
  const previewRoot = useRef(null);
  useEffect(() => {
    if (!playback.state.preparing) {
      setShowWaiting(false);
      return;
    }
    const timer = setTimeout(() => setShowWaiting(true), 300);
    return () => clearTimeout(timer);
  }, [playback.state.preparing]);
  useImperativeHandle(
    ref,
    () => ({ seekAndWait: playback.seekAndWait, play: playback.play, pause: playback.pause }),
    [playback.seekAndWait, playback.play, playback.pause],
  );
  return (
    <div
      ref={previewRoot}
      className="cv-clip-preview"
      data-preview-ready={playback.state.ready}
      data-preview-expanded={previewExpanded}
      role="region"
      aria-label="智能剪辑预览"
    >
      <div ref={hostRef} className="cv-clip-preview-stage" />
      {playback.state.ready && (
        <PreviewTransformOverlay
          rootRef={previewRoot}
          playback={playback}
          selection={previewSelection}
          onBeginEdit={onBeginPreviewEdit}
          onEditPreview={onEditPreview}
          onEndEdit={onEndPreviewEdit}
          onCancelEdit={onCancelPreviewEdit}
        />
      )}
      {(playback.state.preparing || playback.state.error) && (
        <div
          className="cv-clip-preview-preparation"
          data-testid="clip-preview-preparation"
          aria-busy={playback.state.preparing}
        >
          {playback.state.error ? (
            <span role="alert">{playback.state.error}</span>
          ) : (
            showWaiting && (
              <LoaderCircle
                size={24}
                className="cv-clip-preview-spinner"
                aria-label="正在准备媒体"
              />
            )
          )}
        </div>
      )}
    </div>
  );
});

export default ClipTimelinePreview;
