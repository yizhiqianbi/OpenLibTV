import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Film, Image, Layers, Layout, LoaderCircle, Music, Play } from 'lucide-react';
import { asset } from '../../services/assets.ts';
import {
  agentNodeVideoPoster,
  resolveAgentNodePresentation,
} from '../../services/agent-node-presentation.ts';
import { useAgentNodePresentationContext } from './AgentNodePresentationContext.jsx';
import './agent-node-reference.css';

const glyphs = { text: FileText, image: Image, video: Film, audio: Music };

/** Read-only node body. RichAgentInput keeps occurrence deletion in its own NodeView. */
export default function AgentNodeReference({ reference, variant = 'message', occurrenceKey }) {
  const context = useAgentNodePresentationContext();
  const presentation = useMemo(
    () =>
      resolveAgentNodePresentation(
        reference,
        context
          ? {
              ...context,
              canLocate: typeof context?.onLocate === 'function',
              canOpenProject: typeof context?.onOpenProject === 'function',
            }
          : undefined,
      ),
    [reference, context],
  );
  const [opened, setOpened] = useState(false);
  const [position, setPosition] = useState(null);
  const anchor = useRef(null),
    hover = useRef(null),
    timer = useRef(null);
  const active = useRef(false);
  const media = presentation.preview;
  const url = media ? asset(media.url) : '';
  const poster = media?.mediaType === 'video' ? agentNodeVideoPoster(url, 100) : undefined;
  const actionable = presentation.canLocate || presentation.canOpenProject;
  const Icon =
    presentation.state === 'other-project' ? Layout : glyphs[presentation.nodeType] || Layers;
  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      stopTimer();
    };
  }, [stopTimer]);
  useEffect(() => {
    stopTimer();
    setOpened(false);
  }, [url, presentation.state, context?.projectId, stopTimer]);
  const show = () => {
    if (!url) return;
    stopTimer();
    timer.current = setTimeout(() => {
      if (active.current) setOpened(true);
    }, 180);
  };
  const hide = () => {
    stopTimer();
    timer.current = setTimeout(() => {
      if (active.current) setOpened(false);
    }, 120);
  };
  const placeHover = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const size = hover.current?.getBoundingClientRect();
    const width = size?.width || Math.min(280, window.innerWidth - 24);
    const height = size?.height || Math.min(280, window.innerHeight / 2);
    setPosition({
      left: Math.max(
        12,
        Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12),
      ),
      top: Math.max(
        12,
        Math.min(
          rect.top >= height + 20 ? rect.top - height - 8 : rect.bottom + 8,
          window.innerHeight - height - 12,
        ),
      ),
    });
  }, []);
  useLayoutEffect(() => {
    if (!opened || !url) return;
    const dismiss = () => setOpened(false);
    placeHover();
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [opened, url, placeHover]);
  const properties = {
    ref: anchor,
    className: `agent-node-reference agent-node-reference-${variant}${presentation.dimmed ? ' is-dimmed' : ''}${presentation.state === 'error' ? ' is-error' : ''}`,
    title: presentation.title,
    'data-node-state': presentation.state,
    'data-preview-source': presentation.previewSource,
    'data-reference-key': occurrenceKey || reference.referenceKey,
    'aria-disabled': presentation.deleted || undefined,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    onKeyDown: (event) => {
      if (event.key === 'Escape' && opened) {
        stopTimer();
        setOpened(false);
        event.stopPropagation();
      }
    },
  };
  const content = (
    <>
      {reference.status === 'uploading' ? (
        <LoaderCircle size={14} className="agent-node-reference-spinner" aria-hidden="true" />
      ) : media?.mediaType === 'image' ? (
        <img src={url} alt={presentation.label} />
      ) : media?.mediaType === 'video' ? (
        <span className="agent-node-video-lead">
          {poster ? (
            <img src={poster} alt="" />
          ) : (
            <video src={url} muted playsInline preload="metadata" />
          )}
          <Play size={9} aria-hidden="true" />
        </span>
      ) : (
        <Icon size={14} aria-hidden="true" />
      )}
      <span
        className="agent-node-reference-label"
        title={presentation.title !== presentation.label ? presentation.label : undefined}
      >
        {presentation.label}
      </span>
    </>
  );
  return (
    <>
      {actionable ? (
        <button
          {...properties}
          type="button"
          aria-label={presentation.canLocate ? `定位 ${presentation.label}` : '打开对应画布'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            stopTimer();
            setOpened(false);
            if (presentation.canLocate) context.onLocate(reference);
            else if (presentation.canOpenProject) context.onOpenProject(reference);
          }}
        >
          {content}
        </button>
      ) : (
        <span {...properties} {...(url ? { tabIndex: 0 } : {})}>
          {content}
        </span>
      )}
      {opened &&
        url &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={hover}
            role="tooltip"
            aria-label={`${presentation.label} 预览`}
            className="agent-node-reference-hover"
            style={position || { visibility: 'hidden' }}
            onMouseEnter={stopTimer}
            onMouseLeave={hide}
          >
            {media.mediaType === 'image' ? (
              <img src={url} alt={presentation.label} onLoad={placeHover} />
            ) : (
              <video
                key={url}
                src={url}
                poster={agentNodeVideoPoster(url, 800)}
                muted
                playsInline
                loop
                autoPlay
                controls={false}
                preload="metadata"
                onLoadedMetadata={placeHover}
              />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
