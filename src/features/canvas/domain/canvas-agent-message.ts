import { isAgentReference } from '../../../services/agent-content.js';

export interface CanvasMessageInput {
  role?: unknown;
  text?: unknown;
  parts?: unknown;
  content?: unknown;
}
export interface CanvasMessageReference extends Record<string, unknown> {
  type: string;
  id: string;
}
export type CanvasMessageToken =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'reference'; key: string; reference: CanvasMessageReference };
const hiddenTypes = new Set(['context', 'hidden', 'vfs']);
const mediaTypes = new Set(['image', 'video', 'audio', 'document']);

function displayUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const schemeValue = value.trim().replace(/\s/g, '');
  return !/^[a-z][a-z\d+.-]*:/i.test(schemeValue) || /^(?:https?:|data:|blob:)/i.test(schemeValue);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function textPart(value: unknown): value is { type: 'text'; text: string } {
  const row = record(value);
  return row?.type === 'text' && typeof row.text === 'string';
}
function referencePart(value: unknown): value is CanvasMessageReference {
  return isAgentReference(value);
}

/** Public ChatMessageUser accepts both serialized arrays and plain string content. */
function parseMessageContent(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    if (parsed === null) return [];
    if (['string', 'number', 'boolean'].includes(typeof parsed))
      return [{ type: 'text', text: String(parsed) }];
  } catch {
    // A normal prompt is not JSON; normalize only its displayed text below.
  }
  return [{ type: 'text', text: value }];
}

function messageParts(message: CanvasMessageInput): unknown[] {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  if (parts.some(textPart)) return parts;
  if (message.content !== undefined) {
    const content = parseMessageContent(message.content);
    return content.some(referencePart) ? content : [...content, ...parts];
  }
  return [
    ...(typeof message.text === 'string' ? [{ type: 'text', text: message.text }] : []),
    ...parts,
  ];
}

/** Display only; never rebuild the protocol through an editor or mutate occurrence identities. */
export function canvasMessageTokens(message: CanvasMessageInput): CanvasMessageToken[] {
  const parts = messageParts(message).map((part) =>
    textPart(part) ? { ...part, text: part.text.trim() } : part,
  );
  const tokens: CanvasMessageToken[] = [];
  const keyCounts = new Map<string, number>();
  const addText = (text: string) => {
    if (!text) return;
    const last = tokens.at(-1);
    if (last?.kind === 'text') last.text += text;
    else tokens.push({ kind: 'text', key: `text-${tokens.length}`, text });
  };
  const addReference = (reference: CanvasMessageReference, sourceIndex: number) => {
    const base =
      typeof reference.referenceKey === 'string' && reference.referenceKey
        ? reference.referenceKey
        : `legacy-${reference.type}:${reference.id}:${sourceIndex}`;
    const occurrence = keyCounts.get(base) || 0;
    keyCounts.set(base, occurrence + 1);
    tokens.push({ kind: 'reference', key: `${base}:${occurrence}`, reference });
  };
  // The canonical codec puts the full ordered placeholder text first. Older
  // interleaved text/reference arrays instead keep their physical array order.
  const canonical = textPart(parts[0]) && parts.slice(1).every((part) => !textPart(part));
  if (canonical) {
    const references = parts.flatMap((part, index) =>
      referencePart(part) ? [{ reference: part, index }] : [],
    );
    const used = new Set<number>();
    const text = (parts[0] as { text: string }).text;
    let end = 0;
    for (const match of text.matchAll(/\{\{\s*(\w+)\s*:\s*([^}]+)\}\}/g)) {
      addText(text.slice(end, match.index));
      const type = match[1],
        id = match[2].trim();
      if (!hiddenTypes.has(type)) {
        const matches = references.filter(
          ({ reference }) => reference.type === type && reference.id === id,
        );
        const candidate = matches.find(({ index }) => !used.has(index)) || matches[0];
        if (candidate) {
          used.add(candidate.index);
          addReference(candidate.reference, candidate.index);
        } else addText(match[0]);
      }
      end = match.index + match[0].length;
    }
    addText(text.slice(end));
    // Legacy locally sent messages discarded the placeholder text. Preserve
    // those references after their plain prompt rather than inventing positions.
    for (const { reference, index } of references) {
      if (used.has(index)) continue;
      if (tokens.length) addText(' ');
      addReference(reference, index);
    }
  } else {
    parts.forEach((part, index) => {
      if (textPart(part)) addText(part.text);
      else if (referencePart(part)) addReference(part, index);
    });
  }
  return tokens;
}

export function canvasMessageRole(message: CanvasMessageInput): 'user' | 'assistant' | 'other' {
  return message.role === 'user' || message.role === 'assistant' ? message.role : 'other';
}
export function messageReferenceLabel(reference: CanvasMessageReference): string {
  return typeof reference.name === 'string' && reference.name ? reference.name : reference.id;
}

/** Node URLs are a read-only image snapshot, never an attachment source or a locator. */
export function messageNodeThumbnail(reference: CanvasMessageReference): string | null {
  return reference.type === 'node' && reference.mediaType === 'image' && displayUrl(reference.url)
    ? reference.url
    : null;
}

/** Normalize the source base64 shape without changing the saved reference or its metadata. */
export function messagePreviewReference(
  reference: CanvasMessageReference,
):
  (CanvasMessageReference & { source: { type: string; value: string; mimeType?: string } }) | null {
  if (!mediaTypes.has(reference.type) || (reference.status && reference.status !== 'ready'))
    return null;
  const source = record(reference.source);
  if (!source || typeof source.value !== 'string' || !source.value.trim()) return null;
  const mimeType = typeof source.mimeType === 'string' ? source.mimeType : '';
  let value = source.value;
  if (source.type === 'data' && !value.startsWith('data:')) {
    if (!mimeType || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)) return null;
    value = `data:${mimeType};base64,${value}`;
  }
  // Media URLs may be relative to the operator host. Reject executable schemes
  // before forwarding documents to the shared preview's download link.
  if (!displayUrl(value)) return null;
  if (source.type === 'data' && !/^data:[\w.+-]+\/[\w.+-]+[;,]/i.test(value)) return null;
  return {
    ...reference,
    source: { ...source, type: source.type === 'data' ? 'data' : 'url', value, mimeType },
  };
}
