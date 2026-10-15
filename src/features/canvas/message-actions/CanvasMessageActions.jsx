import { useMemo } from 'react';
import {
  assistantTurnCopyText,
  formatMessageTime,
  messageTimestamp,
  userMessageCopyText,
} from './message-action-model.js';
import { useMessageCopy } from './useMessageCopy.js';
import MessageCopyButton from './MessageCopyButton.jsx';
import './message-actions.css';

/** User copies visible rich text. Assistant copies explicitly supplied raw turn Markdown. */
export default function CanvasMessageActions({
  message,
  contentRef,
  language = 'zh',
  readOnly = false,
  isShareReplay = false,
  assistantActions,
  onNotify,
  clipboardWriter,
}) {
  const isUser = message.role === 'user';
  const raw = useMemo(
    () => assistantTurnCopyText(assistantActions?.messages),
    [assistantActions?.messages],
  );
  const available =
    isUser ||
    (message.role === 'assistant' &&
      assistantActions?.canCopy === true &&
      !readOnly &&
      !isShareReplay &&
      Boolean(raw));
  const { copy, status, pending } = useMessageCopy({
    identity: message.id ?? message,
    getText: () => (isUser ? userMessageCopyText(message, contentRef?.current?.innerText) : raw),
    onNotify,
    writer: clipboardWriter,
  });
  const time = isUser ? formatMessageTime(message, { language }) : '';
  if (!available) return null;
  return (
    <div
      className={`cv-message-actions ${isUser ? 'cv-message-actions-user' : 'cv-message-actions-assistant'}`}
      data-message-feedback={isUser ? undefined : assistantActions.targetMessageId}
    >
      {time && (
        <time
          className="cv-message-time"
          dateTime={new Date(messageTimestamp(message)).toISOString()}
        >
          {time}
        </time>
      )}
      <MessageCopyButton pending={pending} onCopy={copy} />
      {status && (
        <span
          role="status"
          aria-live="polite"
          className={`cv-message-copy-status ${onNotify ? 'cv-message-action-sr-only' : ''} ${status === '复制失败' ? 'is-error' : ''}`}
        >
          {status}
        </span>
      )}
    </div>
  );
}
