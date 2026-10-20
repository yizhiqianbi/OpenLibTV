import { api, serverConnected, ServiceError } from './api-client.ts';
import { agentPlainText, isAgentReference } from './agent-content.js';

const id = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const safeUrl = (value) =>
  typeof value === 'string' && (/^https?:\/\//i.test(value) || value.startsWith('/'))
    ? value
    : undefined;
const nodeSnapshot = (node, projectId) => {
  if (!node || typeof node.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(node.id)) return null;
  const data = node.data && typeof node.data === 'object' ? node.data : {};
  const url = safeUrl(data.type === 'image' ? data.url || data.originalUrl : undefined);
  return {
    id: node.id,
    type: typeof node.type === 'string' ? node.type : 'node',
    position: node.position,
    ...(Number.isFinite(node.width) ? { width: node.width } : {}),
    ...(Number.isFinite(node.height) ? { height: node.height } : {}),
    ...(typeof data.name === 'string'
      ? { name: data.name }
      : typeof data.title === 'string'
        ? { title: data.title }
        : {}),
    ...(url ? { url, projectId } : {}),
  };
};

/** Convert the editor's ordered draft into the stable server request protocol. */
export function createAgentRunRequest({
  draft,
  projectId,
  documentRevision,
  nodes = [],
  agentConfig = {},
  metadata = {},
  requestId = id(),
} = {}) {
  const parts = Array.isArray(draft?.parts)
    ? draft.parts
    : [{ type: 'text', text: draft?.plainText || '' }];
  return {
    requestId,
    ...(projectId ? { projectId } : {}),
    ...(Number.isFinite(documentRevision) ? { documentRevision } : {}),
    parts,
    plainText: draft?.plainText || agentPlainText(parts),
    serialized: draft?.serialized || JSON.stringify(parts),
    references: parts.filter(isAgentReference),
    nodeSnapshot: nodes.map((node) => nodeSnapshot(node, projectId)).filter(Boolean),
    agentConfig,
    metadata,
  };
}

function parseEvent(value, eventType) {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  const payload = text;
  if (!payload || payload === '[DONE]') return { type: 'done' };
  try {
    const event = JSON.parse(payload);
    if (eventType && event && typeof event === 'object' && !event.type)
      return { ...event, type: eventType };
    return event;
  } catch {
    return eventType
      ? { type: eventType, delta: payload }
      : { type: 'message.delta', delta: payload };
  }
}

/** Consume SSE, NDJSON, or plain text responses from an Agent run. */
export async function consumeAgentStream(response, onEvent = () => {}) {
  if (!response?.body) throw new ServiceError('服务没有返回 Agent 流', { code: 'EMPTY_STREAM' });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sseData = [];
  let sseEventType = '';
  let last;
  const emit = (value, eventType) => {
    const event = parseEvent(value, eventType);
    if (event) {
      last = event;
      onEvent(event);
    }
  };
  const flushSse = () => {
    if (!sseData.length) {
      sseEventType = '';
      return;
    }
    emit(sseData.join('\n'), sseEventType || undefined);
    sseData = [];
    sseEventType = '';
  };
  const flushLine = (line) => {
    if (line === '') {
      flushSse();
      return;
    }
    if (line.startsWith(':')) return;
    if (line.startsWith('data:')) {
      sseData.push(line.slice(5).replace(/^ /, ''));
      return;
    }
    if (line.startsWith('event:')) {
      sseEventType = line.slice(6).trim();
      return;
    }
    if (sseData.length) {
      // A non-SSE line starts the next protocol frame; finish the pending
      // event before handing the line to the NDJSON/plain-text parser.
      flushSse();
    }
    emit(line);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    if (buffer) {
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach(flushLine);
    }
    if (done) break;
  }
  if (buffer.trim()) flushLine(buffer);
  flushSse();
  return last;
}

export async function runAgent({ request, onEvent, signal } = {}) {
  if (!serverConnected)
    throw new ServiceError('生成服务尚未连接，请先配置 LibTV API', { code: 'NOT_CONFIGURED' });
  const response = await api.agent.stream(request, { signal });
  return consumeAgentStream(response, onEvent);
}

export { id as createAgentRequestId };
