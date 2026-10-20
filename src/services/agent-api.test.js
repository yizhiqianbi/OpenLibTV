// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { consumeAgentStream, createAgentRunRequest } from './agent-api.js';

describe('generic Agent API protocol', () => {
  it('keeps ordered editor parts and safe node snapshots', () => {
    const request = createAgentRunRequest({
      projectId: 'project-1',
      documentRevision: 3,
      draft: {
        parts: [
          { type: 'text', text: '做一个片头 {{ node:n1 }}' },
          { type: 'node', id: 'n1', name: '片头', nodeKey: 'n1' },
        ],
        serialized: 'json-parts',
        plainText: '做一个片头 {{ node:n1 }}',
      },
      nodes: [
        { id: 'n1', type: 'image', position: { x: 1, y: 2 }, data: { url: 'blob:secret' } },
        null,
      ],
    });
    expect(request).toMatchObject({
      projectId: 'project-1',
      documentRevision: 3,
      serialized: 'json-parts',
    });
    expect(request.references).toHaveLength(1);
    expect(request.nodeSnapshot).toEqual([{ id: 'n1', type: 'image', position: { x: 1, y: 2 } }]);
  });

  it('consumes SSE and newline-delimited JSON in one stream', async () => {
    const response = new Response(
      'data: {"type":"message.delta","delta":"你好"}\n\n{"type":"done","status":"succeeded"}\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
    const events = [];
    await expect(
      consumeAgentStream(response, (event) => events.push(event)),
    ).resolves.toMatchObject({
      type: 'done',
    });
    expect(events).toEqual([
      { type: 'message.delta', delta: '你好' },
      { type: 'done', status: 'succeeded' },
    ]);
  });

  it('joins multi-line SSE data and applies an event name when the payload omits type', async () => {
    const response = new Response(
      'event: message.completed\ndata: {"message":\ndata: {"text":"长文本"}}\n\n' +
        'data: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
    const events = [];
    await consumeAgentStream(response, (event) => events.push(event));
    expect(events).toEqual([
      { type: 'message.completed', message: { text: '长文本' } },
      { type: 'done' },
    ]);
  });

  it('ignores SSE comments and preserves plain text after a completed event', async () => {
    const response = new Response(': heartbeat\n\ndata: hello\n\nplain\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    const events = [];
    await consumeAgentStream(response, (event) => events.push(event));
    expect(events).toEqual([
      { type: 'message.delta', delta: 'hello' },
      { type: 'message.delta', delta: 'plain' },
    ]);
  });

  it('supports plain text deltas without turning a failed response into success', async () => {
    const response = new Response('hello\n');
    const onEvent = vi.fn();
    await consumeAgentStream(response, onEvent);
    expect(onEvent).toHaveBeenCalledWith({ type: 'message.delta', delta: 'hello' });
  });
});
