import { describe, expect, it } from 'vitest';
import { assistantTurnScopes } from './assistant-turn-scopes.js';
import { assistantTurnCopyText } from './message-action-model.js';

describe('completed Canvas transcript copy scopes', () => {
  it('copies each whole assistant turn once without including another prompt or feedback controls', () => {
    const first = { id: 'a', role: 'assistant', content: '**第一段**' };
    const second = { id: 'b', role: 'assistant', content: '第二段' };
    const third = { id: 'c', role: 'assistant', text: '本地服务状态' };
    const scopes = assistantTurnScopes([
      { role: 'user', text: '请求一' },
      first,
      { role: 'user', content: JSON.stringify([{ type: 'message_feedback' }]) },
      second,
      { role: 'user', text: '请求二' },
      third,
    ]);
    expect([...scopes.keys()]).toEqual([3, 5]);
    expect(scopes.get(3).targetMessageId).toBe('b');
    expect(assistantTurnCopyText(scopes.get(3).messages)).toBe('**第一段**\n\n第二段');
    expect(assistantTurnCopyText(scopes.get(5).messages)).toBe('本地服务状态');
    expect(assistantTurnScopes([]).size).toBe(0);
  });
});
