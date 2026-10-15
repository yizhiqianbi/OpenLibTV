import { canvasMessageTokens, messageReferenceLabel } from '../domain/canvas-agent-message.ts';

const locales = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' };
const parts = (content) => {
  if (Array.isArray(content)) return content;
  if (typeof content !== 'string') return content && typeof content === 'object' ? [content] : [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : [];
  } catch {
    return [];
  }
};

export function isMessageFeedbackControl(message) {
  return (
    message?.role === 'user' &&
    parts(message.content).some((part) => part?.type === 'message_feedback')
  );
}

export function messageSourceSessionId(message) {
  const localContext =
    Array.isArray(message?.parts) && message.parts.find((part) => part?.type === 'context');
  const context = localContext || parts(message?.content).find((part) => part?.type === 'context');
  const id = context?.metadata?.source_agent_session;
  return typeof id === 'string' ? id.trim() : '';
}

export function messageTimestamp(message) {
  const value = message?.createdAt ?? message?.created_at ?? message?.timestamp;
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value) || Date.parse(value)
        : NaN;
  if (!Number.isFinite(number) || number <= 0) return null;
  const timestamp = number < 1e12 ? number * 1000 : number;
  return Number.isNaN(new Date(timestamp).getTime()) ? null : timestamp;
}

export function formatMessageTime(message, { now = new Date(), language = 'zh' } = {}) {
  const timestamp = messageTimestamp(message);
  if (timestamp === null) return '';
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameDay =
    sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  return date.toLocaleString(locales[language] || 'zh-CN', {
    ...(sameDay ? {} : { month: '2-digit', day: '2-digit' }),
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Browser path uses only the rich-content element's actual rendered innerText. */
export function userMessageCopyText(message, renderedText) {
  if (typeof renderedText === 'string') return renderedText.trim();
  // jsdom/SSR have no innerText layout. Preserve repeated display occurrences;
  // never serialize or modify the underlying model/Skill/node protocol.
  return canvasMessageTokens(message)
    .map((token) =>
      token.kind === 'text'
        ? token.text
        : messageReferenceLabel(token.reference) + (token.reference.draft === true ? '草稿' : ''),
    )
    .join('')
    .trim();
}

/** Caller explicitly supplies the whole completed turn, not just the displayed last message. */
export function assistantTurnCopyText(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === 'assistant')
    .map((message) =>
      typeof message.content === 'string'
        ? message.content.trim()
        : message.content === undefined && typeof message.text === 'string'
          ? message.text.trim()
          : '',
    )
    .filter(Boolean)
    .join('\n\n');
}

export function sourceSessionLabel(session, language = 'zh') {
  if (!session) return '来源会话';
  if (typeof session.name === 'string' && session.name.trim()) return session.name.trim();
  const date = new Date(session.createdAt);
  if (Number.isNaN(date.getTime())) return '来源会话';
  const locale = language === 'en' ? 'en-US' : language === 'ko' ? 'ko-KR' : 'zh-CN';
  return `未命名对话 ${date.toLocaleString(locale, { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

export function canContinueSourceSession({
  sourceId,
  session,
  projectId,
  currentSessionId,
  ready,
  isShareReplay,
  pending,
  onContinue,
}) {
  return Boolean(
    sourceId &&
    session?.sessionId === sourceId &&
    ready &&
    !isShareReplay &&
    !pending &&
    typeof onContinue === 'function' &&
    typeof projectId === 'string' &&
    session.projectId === projectId &&
    currentSessionId !== sourceId,
  );
}
