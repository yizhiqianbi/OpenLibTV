import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box, FileText, Film, Image, Music, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { asset } from '../../../services/assets.ts';
import AgentNodeReference from '../../../components/agent/AgentNodeReference.jsx';
import CanvasMessageActions from '../message-actions/CanvasMessageActions.jsx';
import SourceSessionNotice from '../message-actions/SourceSessionNotice.jsx';
import {
  isMessageFeedbackControl,
  messageSourceSessionId,
} from '../message-actions/message-action-model.js';
import {
  canvasMessageRole,
  canvasMessageTokens,
  messageNodeThumbnail,
  messagePreviewReference,
  messageReferenceLabel,
} from '../domain/canvas-agent-message.ts';
import './canvas-agent-message.css';

const referenceIcons = {
  model: Box,
  skill: Sparkles,
  node: Box,
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
};

function MessageMediaReference({ token, onPreview }) {
  const reference = token.reference;
  const label = messageReferenceLabel(reference);
  const preview = messagePreviewReference(reference);
  const nodeThumbnail = messageNodeThumbnail(reference);
  const canPreview = Boolean(preview && typeof onPreview === 'function');
  const hasHoverMedia = Boolean(preview && ['image', 'video'].includes(reference.type));
  const [opened, setOpened] = useState(false);
  const [position, setPosition] = useState(null);
  const anchor = useRef(null),
    tooltip = useRef(null),
    timer = useRef(null);
  const Icon = referenceIcons[reference.type] || FileText;
  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const show = () => {
    if (!hasHoverMedia) return;
    stopTimer();
    timer.current = setTimeout(() => setOpened(true), 180);
  };
  const hide = () => {
    stopTimer();
    timer.current = setTimeout(() => setOpened(false), 120);
  };
  const placeHover = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!rect) return;
    const size = tooltip.current?.getBoundingClientRect();
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
  useEffect(() => stopTimer, [stopTimer]);
  useEffect(() => {
    stopTimer();
    setOpened(false);
  }, [reference.type, preview?.source.value, stopTimer]);
  useLayoutEffect(() => {
    if (!opened || !hasHoverMedia) return;
    const dismiss = () => setOpened(false);
    placeHover();
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [opened, hasHoverMedia, placeHover]);
  const properties = {
    ref: anchor,
    className: `cv-message-reference cv-message-reference-${reference.type}`,
    title: label,
    'data-reference-key': token.key,
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
  const contents = (
    <>
      {nodeThumbnail ? (
        <img className="cv-message-node-thumbnail" src={asset(nodeThumbnail)} alt={label} />
      ) : (
        <Icon size={14} aria-hidden="true" />
      )}
      <span>{label}</span>
      {reference.draft === true && <small>草稿</small>}
    </>
  );
  return (
    <>
      {canPreview ? (
        <button
          {...properties}
          type="button"
          aria-label={'预览 ' + label}
          onClick={() => {
            stopTimer();
            setOpened(false);
            onPreview({
              ...preview,
              source: { ...preview.source, value: asset(preview.source.value) },
            });
          }}
        >
          {contents}
        </button>
      ) : (
        <span {...properties} {...(hasHoverMedia ? { tabIndex: 0 } : {})}>
          {contents}
        </span>
      )}
      {opened &&
        hasHoverMedia &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltip}
            role="tooltip"
            aria-label={label + ' 预览'}
            className="cv-message-reference-hover"
            style={position || { visibility: 'hidden' }}
            onMouseEnter={stopTimer}
            onMouseLeave={hide}
          >
            {reference.type === 'image' ? (
              <img src={asset(preview.source.value)} alt={label} onLoad={placeHover} />
            ) : (
              <video
                src={asset(preview.source.value)}
                muted
                playsInline
                loop
                autoPlay
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

function MessageReference({ token, onPreview }) {
  return token.reference.type === 'node' ? (
    <AgentNodeReference reference={token.reference} occurrenceKey={token.key} />
  ) : (
    <MessageMediaReference token={token} onPreview={onPreview} />
  );
}

/** Body-only export lets the read-only replay retain its own message frame and permissions. */
export function CanvasAgentMessageContent({ message, onPreview }) {
  const tokens = useMemo(() => canvasMessageTokens(message), [message]);
  const role = canvasMessageRole(message);
  if (!tokens.length || isMessageFeedbackControl(message)) return null;
  if (role === 'assistant' && !tokens.some((token) => token.kind === 'reference'))
    return (
      <div className="cv-agent-message-content cv-agent-message-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {tokens.map((token) => token.text).join('')}
        </ReactMarkdown>
      </div>
    );
  return (
    <div className="cv-agent-message-content">
      {tokens.map((token) =>
        token.kind === 'text' ? (
          <span key={token.key}>{token.text}</span>
        ) : (
          <MessageReference key={token.key} token={token} onPreview={onPreview} />
        ),
      )}
    </div>
  );
}

export function CanvasAgentMessage({
  message,
  onPreview,
  className = '',
  language = 'zh',
  readOnly = false,
  isShareReplay = false,
  assistantActions,
  sourceSession,
  projectId,
  currentSessionId,
  sessionsReady = false,
  onContinueSourceSession,
  onNotify,
  clipboardWriter,
}) {
  const role = canvasMessageRole(message);
  const contentRef = useRef(null);
  const sourceId = role === 'user' ? messageSourceSessionId(message) : '';
  if (isMessageFeedbackControl(message)) return null;
  return (
    <div className={`cv-message cv-message-${role} cv-agent-message ${className}`.trim()}>
      {role === 'assistant' && <Sparkles size={16} aria-hidden="true" />}
      <div className="cv-agent-message-frame">
        {sourceId && (
          <SourceSessionNotice
            sourceId={sourceId}
            session={sourceSession?.sessionId === sourceId ? sourceSession : undefined}
            language={language}
            projectId={projectId}
            currentSessionId={currentSessionId}
            ready={sessionsReady}
            isShareReplay={isShareReplay}
            onContinue={onContinueSourceSession}
            onNotify={onNotify}
          />
        )}
        <div ref={contentRef}>
          <CanvasAgentMessageContent message={message} onPreview={onPreview} />
        </div>
        {role === 'assistant' && (
          <CanvasMessageActions
            message={message}
            language={language}
            readOnly={readOnly}
            isShareReplay={isShareReplay}
            assistantActions={assistantActions}
            onNotify={onNotify}
            clipboardWriter={clipboardWriter}
          />
        )}
      </div>
      {role === 'user' && (
        <CanvasMessageActions
          message={message}
          contentRef={contentRef}
          language={language}
          onNotify={onNotify}
          clipboardWriter={clipboardWriter}
        />
      )}
    </div>
  );
}
