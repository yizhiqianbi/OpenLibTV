const referenceTypes = new Set(['skill', 'model', 'image', 'video', 'audio', 'document', 'node']);
const placeholder = /\{\{\s*(\w+)\s*:\s*([^}]+)\}\}/g;
const newKey = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

export function isAgentReference(part) {
  if (!part || !referenceTypes.has(part.type) || typeof part.id !== 'string' || !part.id)
    return false;
  // Source node parts carry the actual canvas identity, never an occurrence key
  // or media URL. Older node drafts omitted nodeKey, which remains supported.
  return (
    part.type !== 'node' ||
    (typeof part.name === 'string' &&
      part.id.trim() === part.id &&
      !/[{}\r\n]/.test(part.id) &&
      (part.nodeKey === undefined || part.nodeKey === part.id))
  );
}

export function agentReferenceNode(reference, { fresh = false } = {}) {
  return {
    type: 'agentReference',
    attrs: {
      reference: {
        ...reference,
        referenceKey: fresh ? newKey() : reference.referenceKey || newKey(),
      },
    },
  };
}

function appendText(nodes, text) {
  text.split('\n').forEach((line, index) => {
    if (index) nodes.push({ type: 'hardBreak' });
    if (line) nodes.push({ type: 'text', text: line });
  });
}

/** The source protocol stores ordered placeholders in its first text part. */
export function agentContentToJSON(parts = []) {
  const references = parts.filter(isAgentReference);
  const nodes = [];
  const matched = new Set();
  const keys = new Set();
  const pushReference = (reference) => {
    const node = agentReferenceNode(reference);
    if (keys.has(node.attrs.reference.referenceKey))
      node.attrs.reference = agentReferenceNode(reference, { fresh: true }).attrs.reference;
    keys.add(node.attrs.reference.referenceKey);
    nodes.push(node);
  };
  const text = parts
    .filter((part) => part?.type === 'text')
    .map((part) => part.text || '')
    .join('\n');
  let end = 0;
  for (const match of text.matchAll(placeholder)) {
    appendText(nodes, text.slice(end, match.index));
    const matches = references.filter(
      (part) => part.type === match[1] && part.id === match[2].trim(),
    );
    const reference = matches.find((part) => !matched.has(part)) || matches[0];
    if (reference) {
      matched.add(reference);
      pushReference(reference);
    } else appendText(nodes, match[0]);
    end = match.index + match[0].length;
  }
  appendText(nodes, text.slice(end));
  // Preserve older saved drafts whose refs had no placeholders yet.
  for (const reference of references) {
    if (matched.has(reference)) continue;
    if (nodes.length) nodes.push({ type: 'text', text: ' ' });
    pushReference(reference);
  }
  return {
    type: 'doc',
    content: [{ type: 'paragraph', ...(nodes.length ? { content: nodes } : {}) }],
  };
}

export function agentContentFromJSON(doc) {
  const references = [];
  const keys = new Set();
  const read = (node) => {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return node.text || '';
    if (node.type === 'hardBreak') return '\n';
    if (node.type === 'agentReference') {
      const reference = node.attrs?.reference;
      if (!isAgentReference(reference)) return '';
      const key = reference.referenceKey || `legacy-reference-${references.length}`;
      let unique = key;
      while (keys.has(unique)) unique += `-${references.length}`;
      const part = { ...reference, referenceKey: unique };
      keys.add(part.referenceKey);
      references.push(part);
      return `{{ ${part.type}:${part.id} }}`;
    }
    return (node.content || []).map(read).join(node.type === 'doc' ? '\n' : '');
  };
  return [{ type: 'text', text: read(doc) }, ...references];
}

export function agentPlainText(parts = []) {
  const refs = parts.filter(isAgentReference);
  return (parts[0]?.type === 'text' ? parts[0].text || '' : '')
    .replace(placeholder, (text, type, id) =>
      refs.some((part) => part.type === type && part.id === id.trim()) ? '' : text,
    )
    .trim();
}

export function agentContentReady(parts = []) {
  const references = parts.filter(isAgentReference);
  return !references.some(
    (part) =>
      (part.status && part.status !== 'ready') ||
      (['image', 'video', 'audio', 'document'].includes(part.type) && !part.source?.value),
  );
}

export function agentDraftFromParts(draft, parts, now = Date.now()) {
  const text = parts[0]?.text || '';
  return {
    ...draft,
    version: 1,
    parts,
    plainText: text,
    serialized:
      parts.length > 1 || /\{\{\s*\w+\s*:\s*[^}]+\}\}/.test(text) ? JSON.stringify(parts) : text,
    createdAt: draft?.createdAt || now,
  };
}

/** For legacy textarea/external updates; unchanged text must not move inline refs. */
export function updateAgentContentText(draft, prompt) {
  if (draft?.parts?.[0]?.type === 'text' && agentPlainText(draft.parts) === prompt.trim())
    return draft;
  const references = (draft?.parts || []).filter(isAgentReference);
  const text = [prompt.trim(), ...references.map((part) => `{{ ${part.type}:${part.id} }}`)]
    .filter(Boolean)
    .join(' ');
  return agentDraftFromParts(draft, [{ type: 'text', text }, ...references]);
}

export function appendAgentReferences(draft, prompt, references) {
  const current = updateAgentContentText(draft, prompt);
  const parts = [current.parts[0], ...current.parts.slice(1), ...references];
  const text = [parts[0].text, ...references.map((part) => `{{ ${part.type}:${part.id} }}`)]
    .filter(Boolean)
    .join(' ');
  return agentDraftFromParts(current, [{ type: 'text', text }, ...parts.slice(1)]);
}

export function removeAgentReference(draft, reference) {
  if (!draft) return null;
  const doc = agentContentToJSON(draft.parts);
  const matches = (part) =>
    reference.referenceKey
      ? part.referenceKey === reference.referenceKey
      : part.type === reference.type && part.id === reference.id;
  for (const paragraph of doc.content) {
    paragraph.content = paragraph.content?.filter(
      (node) => node.type !== 'agentReference' || !matches(node.attrs.reference),
    );
  }
  return agentDraftFromParts(draft, agentContentFromJSON(doc));
}
