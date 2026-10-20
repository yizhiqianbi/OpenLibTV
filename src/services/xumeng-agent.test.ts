import { describe, expect, it } from 'vitest';
import {
  normalizeXumengCard,
  readXumengStream,
  validateXumengCharacterInput,
  validateXumengChatRequest,
} from './xumeng-agent.ts';

const card = {
  name: '渡口的记录员',
  description: '在夜间渡口整理失物的人。',
  personality: '先听完，再行动。',
  scenario: '雾里的渡口只在潮汐变化时开放。',
  firstMessage: '你带来了什么需要寄存的东西？',
  characterBook: {
    scanDepth: 8,
    entries: [{ id: 'tide', name: '潮汐', keys: ['潮汐'], content: '渡口每晚更换方向。' }],
  },
};

describe('xumeng agent protocol', () => {
  it('accepts a v2 card wrapper and keeps only supported card fields', () => {
    const normalized = normalizeXumengCard({
      spec: 'chara_card_v2',
      data: { ...card, script: 'drop' },
    });
    expect(normalized.name).toBe(card.name);
    expect(normalized.characterBook?.entries[0].id).toBe('tide');
    expect((normalized as unknown as Record<string, unknown>).script).toBeUndefined();
  });

  it('normalizes SillyTavern snake-case fields and constant world-book entries', () => {
    const normalized = normalizeXumengCard({
      spec: 'chara_card_v2',
      data: {
        ...card,
        first_mes: card.firstMessage,
        firstMessage: undefined,
        characterBook: undefined,
        system_prompt: '只写可观察动作。',
        character_book: {
          scan_depth: 4,
          entries: [
            {
              id: 'always',
              constant: true,
              keys: [],
              content: '始终有效的规则。',
              position: 'after_char',
            },
          ],
        },
      },
    });
    expect(normalized.firstMessage).toBe(card.firstMessage);
    expect(normalized.systemPrompt).toBe('只写可观察动作。');
    expect(normalized.characterBook?.entries[0].constant).toBe(true);
    expect(normalized.characterBook?.entries[0].position).toBe('after_char');
  });

  it('rejects invalid world-book and chat shape before a request is made', () => {
    expect(() =>
      validateXumengCharacterInput({
        ...card,
        characterBook: { entries: [{ id: 'bad', content: 'x' }] },
      }),
    ).toThrow('世界书关键词不能为空');
    expect(() =>
      validateXumengChatRequest({
        character: card,
        messages: [{ role: 'assistant', content: '先说。' }],
      }),
    ).toThrow('最后一条消息应为用户消息');
  });

  it('reads plain text and SSE streams exactly once', async () => {
    const plain = new Response('你好，\n这里是回复。', {
      headers: { 'Content-Type': 'text/plain' },
    });
    const plainParts: string[] = [];
    await readXumengStream(plain, (part) => plainParts.push(part));
    expect(plainParts.join('')).toBe('你好，\n这里是回复。');

    const sse = new Response('data: {"delta":"你好"}\n\ndata: {"text":"！"}\n\ndata: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
    const sseParts: string[] = [];
    const events: unknown[] = [];
    await readXumengStream(
      sse,
      (part) => sseParts.push(part),
      undefined,
      (event) => events.push(event),
    );
    expect(sseParts.join('')).toBe('你好！');

    const state = new Response('data: {"statePatch":{"trust":2},"memoryAppend":["记得潮汐"]}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    });
    await readXumengStream(
      state,
      () => {},
      undefined,
      (event) => events.push(event),
    );
    expect(events).toContainEqual({ statePatch: { trust: 2 }, memoryAppend: ['记得潮汐'] });
  });
});
