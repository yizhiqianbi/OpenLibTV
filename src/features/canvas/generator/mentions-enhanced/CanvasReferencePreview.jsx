import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const identity = (url) => url;
function PreviewMedia({ option, asset }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play()?.catch(() => {});
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);
  return option.previewMedia === 'video' ? (
    <video ref={videoRef} src={asset(option.previewUrl)} muted playsInline loop />
  ) : (
    <img
      src={asset(option.previewUrl)}
      alt=""
      draggable={false}
      style={
        option.mediaWidth > 0 && option.mediaHeight > 0
          ? { aspectRatio: `${option.mediaWidth}/${option.mediaHeight}` }
          : undefined
      }
    />
  );
}

export function CanvasReferencePreview({ option, asset = identity, portalTarget }) {
  const [failed, setFailed] = useState(null);
  const [position, setPosition] = useState(null);
  const timer = useRef(null);
  const anchor = useRef(null);
  const thumbnail =
    option.thumbnailUrl ?? (option.previewMedia === 'image' ? option.previewUrl : null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const close = () => {
    clearTimeout(timer.current);
    setPosition(null);
  };
  const open = () => {
    if (!option.previewUrl || !['image', 'video'].includes(option.previewMedia)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const element = anchor.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const view = element.ownerDocument.defaultView;
      setPosition({
        left: Math.max(4, Math.min(rect.left + rect.width / 2 - 84, view.innerWidth - 172)),
        top: rect.top >= 176 ? rect.top - 8 : rect.bottom + 8,
        transform: rect.top >= 176 ? 'translateY(-100%)' : undefined,
      });
    }, 200);
  };
  const iconName =
    { image: 'image-s', video: 'video-add-s', audio: 'audio-lines', text: 'text-ref' }[
      option.kind
    ] ?? 'image-s';
  return (
    <span
      ref={anchor}
      className={`node-reference-thumbnail ${option.kind === 'audio' ? 'is-audio' : ''}`}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {thumbnail && failed !== thumbnail ? (
        <img src={asset(thumbnail)} alt="" draggable={false} onError={() => setFailed(thumbnail)} />
      ) : (
        <img
          className="node-reference-icon"
          src={`/assets/icons/${iconName}.svg`}
          alt=""
          draggable={false}
        />
      )}
      {position &&
        createPortal(
          <div className="node-reference-preview" style={position} data-popover-safe="true">
            <PreviewMedia option={option} asset={asset} />
          </div>,
          portalTarget?.() ?? anchor.current.ownerDocument.body,
        )}
    </span>
  );
}
