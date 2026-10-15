// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assistantTurnCopyText,
  canContinueSourceSession,
  formatMessageTime,
  isMessageFeedbackControl,
  messageSourceSessionId,
  messageTimestamp,
  sourceSessionLabel,
  userMessageCopyText,
} from './message-action-model.js';

describe('source message actions content rules', () => {
  it('accepts seconds/milliseconds/date strings with source nullish priority and rejects invalid time', () => {
    const milliseconds = new Date(2026, 9, 11, 14, 5).getTime();
    expect(messageTimestamp({ createdAt: milliseconds / 1000 })).toBe(milliseconds);
    expect(messageTimestamp({ created_at: String(milliseconds) })).toBe(milliseconds);
    expect(messageTimestamp({ timestamp: new Date(milliseconds).toISOString() })).toBe(
      milliseconds,
    );
    expect(messageTimestamp({ createdAt: 'invalid', timestamp: milliseconds })).toBeNull();
    for (const value of [null, -1, 0, NaN, Infinity, 1e30])
      expect(messageTimestamp({ createdAt: value })).toBeNull();
  });
  it('shows only time today, adds month/day in the same year, and year across years', () => {
    const now = new Date(2026, 9, 11, 20, 0);
    expect(formatMessageTime({ createdAt: new Date(2026, 9, 11, 14, 5).getTime() }, { now })).toBe(
      '14:05',
    );
    const yesterday = formatMessageTime(
      { createdAt: new Date(2026, 9, 10, 14, 5).getTime() },
      { now },
    );
    expect(yesterday).toContain('10/10');
    expect(yesterday).not.toContain('2026');
    expect(
      formatMessageTime({ createdAt: new Date(2025, 9, 10, 14, 5).getTime() }, { now }),
    ).toContain('2025');
    expect(formatMessageTime({ createdAt: 'invalid' }, { now })).toBe('');
    expect(
      formatMessageTime(
        { createdAt: new Date(2026, 9, 10, 14, 5).getTime() },
        { now, language: 'en' },
      ),
    ).toContain('10/10');
  });
  it('copies actual innerText without source-session/tool controls and preserves stored occurrences', () => {
    const first = Object.freeze({
      type: 'model',
      id: 'm',
      name: '首个模型',
      referenceKey: 'first',
    });
    const second = Object.freeze({ ...first, name: '第二个模型', referenceKey: 'second' });
    const message = Object.freeze({
      role: 'user',
      parts: Object.freeze([{ type: 'text', text: '前{{model:m}}\n{{model:m}}尾' }, first, second]),
    });
    expect(userMessageCopyText(message, '  前实时名称\n第二个模型尾  ')).toBe(
      '前实时名称\n第二个模型尾',
    );
    expect(userMessageCopyText(message)).toBe('前首个模型\n第二个模型尾');
    expect(userMessageCopyText(message, '')).toBe('');
    expect(message.parts[1].referenceKey).toBe('first');
    expect(message.parts[2].referenceKey).toBe('second');
  });
  it('copies only explicitly supplied assistant strings as raw Markdown with blank-line separators', () => {
    expect(
      assistantTurnCopyText([
        { role: 'user', content: 'question' },
        { role: 'assistant', content: '  **First**\nline  ' },
        { role: 'tool', content: 'private' },
        { role: 'assistant', content: '' },
        { role: 'assistant', content: '```js\nconst n=1\n```' },
        { role: 'assistant', content: [] },
        { role: 'assistant', text: '本地能力说明' },
      ]),
    ).toBe('**First**\nline\n\n```js\nconst n=1\n```\n\n本地能力说明');
    expect(assistantTurnCopyText(undefined)).toBe('');
  });
  it('reads original context and hides feedback controls without mutating protocol metadata', () => {
    const context = Object.freeze({
      type: 'context',
      metadata: Object.freeze({ source_agent_session: ' source ' }),
    });
    expect(messageSourceSessionId({ content: JSON.stringify([context]) })).toBe('source');
    expect(messageSourceSessionId({ parts: [context] })).toBe('source');
    expect(
      isMessageFeedbackControl({
        role: 'user',
        content: JSON.stringify([{ type: 'message_feedback', rating: 'like' }]),
      }),
    ).toBe(true);
    expect(
      isMessageFeedbackControl({ role: 'assistant', content: '[{"type":"message_feedback"}]' }),
    ).toBe(false);
    expect(messageSourceSessionId({ content: 'broken' })).toBe('');
    expect(context.metadata.source_agent_session).toBe(' source ');
  });
  it('requires the complete active source-session adapter and same-project guard', () => {
    const valid = {
      sourceId: 's',
      session: { sessionId: 's', name: ' 来源 ', projectId: 'p' },
      projectId: 'p',
      currentSessionId: 'other',
      ready: true,
      onContinue: () => {},
    };
    expect(canContinueSourceSession(valid)).toBe(true);
    for (const extra of [
      { isShareReplay: true },
      { pending: true },
      { ready: false },
      { projectId: 'different' },
      { currentSessionId: 's' },
      { onContinue: undefined },
    ])
      expect(canContinueSourceSession({ ...valid, ...extra })).toBe(false);
    expect(sourceSessionLabel(valid.session)).toBe('来源');
    expect(sourceSessionLabel(undefined)).toBe('来源会话');
    expect(sourceSessionLabel({ createdAt: new Date(2026, 9, 11).toISOString() })).toMatch(
      /^未命名对话 /,
    );
  });
});
