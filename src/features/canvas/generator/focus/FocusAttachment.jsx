import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../../hooks/useAgentToolbarPopover.js';
import { cropFocusRegionPreview } from './preview-helper.js';
import './attachment.css';

const identity = (url) => url;
// Source 42seoipo_5lv1 @410. Chinese clip is archived as remote-only, not a fake local asset.
const tutorialUrl =
  'https://libtv-res.liblib.art/upload-images/4e303b89c099425a93084d50cdcb10f4/e5d71224e151896d9ead9955953984aff3f293e4.mp4';
const isolate = (event) => event.stopPropagation();
const isolateActivation = (event) => {
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
};
function mappedUrl(asset, url) {
  try {
    return asset(url) || url || '';
  } catch {
    return '';
  }
}
function FocusIcon() {
  return <span className="cv-focus-attachment-icon" aria-hidden="true" />;
}

function FocusRegionCard({ region, asset, disabled, onEdit, onDelete }) {
  const sourceUrl = mappedUrl(asset, region.imageUrl);
  const key = JSON.stringify([sourceUrl, region.relX, region.relY, region.width, region.height]);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    cropFocusRegionPreview(
      sourceUrl,
      { relX: region.relX, relY: region.relY, width: region.width, height: region.height },
      { signal: controller.signal },
    ).then(
      (url) => {
        if (current) setPreview({ key, url });
      },
      () => {
        if (current) setPreview({ key, url: null });
      },
    );
    return () => {
      current = false;
      controller.abort();
    };
  }, [key, sourceUrl, region.relX, region.relY, region.width, region.height]);
  const crop = preview?.key === key ? preview.url : null;
  return (
    <div
      className="cv-focus-attachment-card focus-mode-toggle nodrag nopan"
      data-preview-state={crop ? 'ready' : 'fallback'}
      onPointerDown={isolate}
      onDoubleClick={isolate}
      onKeyDown={isolateActivation}
    >
      <button
        type="button"
        className="cv-focus-attachment-edit"
        aria-label="编辑聚焦区域"
        disabled={disabled || typeof onEdit !== 'function'}
        onClick={(event) => {
          event.stopPropagation();
          onEdit?.(event.currentTarget);
        }}
      >
        {crop && <img src={crop} alt="" draggable={false} />}
        <span className="cv-focus-attachment-shade" aria-hidden="true" />
        <span className="cv-focus-attachment-label is-normal" aria-hidden="true">
          <FocusIcon />
          <span>聚焦</span>
        </span>
        <span className="cv-focus-attachment-label is-hover" aria-hidden="true">
          <FocusIcon />
          <span>编辑</span>
        </span>
      </button>
      <button
        type="button"
        className="cv-focus-attachment-delete"
        aria-label="删除聚焦区域"
        disabled={disabled || typeof onDelete !== 'function'}
        onClick={(event) => {
          event.stopPropagation();
          onDelete?.(event.currentTarget);
        }}
      >
        <X size={7} aria-hidden="true" />
      </button>
    </div>
  );
}

function FocusTutorial({ url }) {
  const video = useRef(null);
  const [failed, setFailed] = useState(!url);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.play()?.catch(() => {});
    return () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [url, failed]);
  return failed ? (
    <div className="cv-focus-attachment-tutorial-fallback" role="status">
      聚焦教程暂不可用
    </div>
  ) : (
    <video
      ref={video}
      className="cv-focus-attachment-tutorial-video"
      src={url}
      aria-label="聚焦教程视频"
      autoPlay
      muted
      loop
      playsInline
      onError={() => setFailed(true)}
    />
  );
}

function FocusChip({ active, asset, disabled, onEnter }) {
  const blocked = disabled || typeof onEnter !== 'function';
  const popover = useAgentToolbarPopover({
    trigger: 'hover',
    width: 337,
    maxHeight: 197,
    offset: 8,
    openDelay: 200,
    closeDelay: 150,
    disabled: blocked,
  });
  const url = mappedUrl(asset, tutorialUrl);
  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        className={`cv-focus-attachment-chip focus-mode-toggle nodrag nopan${active ? ' is-active' : ''}`}
        aria-label="聚焦"
        aria-pressed={Boolean(active)}
        aria-describedby={popover.open ? popover.popoverProps.id : undefined}
        disabled={blocked}
        onMouseEnter={popover.triggerProps.onMouseEnter}
        onMouseLeave={popover.triggerProps.onMouseLeave}
        onPointerDown={isolate}
        onDoubleClick={isolate}
        onKeyDown={(event) => {
          isolateActivation(event);
          popover.triggerProps.onKeyDown(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          popover.close();
          onEnter?.(event.currentTarget);
        }}
      >
        <FocusIcon />
        <span>聚焦</span>
      </button>
      {popover.open &&
        createPortal(
          <div
            {...popover.popoverProps}
            ref={popover.popoverRef}
            className="cv-focus-attachment-tutorial"
            role="tooltip"
            aria-label="聚焦教程"
            style={popover.popoverStyle}
            onPointerDown={isolate}
            onClick={isolate}
            onDoubleClick={isolate}
          >
            <FocusTutorial key={url} url={url} />
          </div>,
          document.body,
        )}
    </>
  );
}

/** Source attachment view only: caller owns current schema, permissions, graph and mode. */
export default function FocusAttachment({
  available,
  active = false,
  region,
  asset = identity,
  disabled = false,
  onEnter,
  onEdit,
  onDelete,
}) {
  if (!available) return null;
  return region ? (
    <FocusRegionCard {...{ region, asset, disabled, onEdit, onDelete }} />
  ) : (
    <FocusChip {...{ active, asset, disabled, onEnter }} />
  );
}
