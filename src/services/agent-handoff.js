import { readStoredValue, writeStoredValue, removeStoredValue } from './storage.ts';
import {
  agentDraftFromParts,
  agentPlainText,
  agentContentReady,
  isAgentReference,
} from './agent-content.js';

const scope = { scope: 'session' };
const prefix = 'libtv.canvas-handoff.';
const maxAge = 30 * 60 * 1000;
const mediaTypes = new Set(['image', 'video', 'audio', 'document']);

export function skillReferenceId(skill) {
  const key = (skill.skillKey || skill.skillUuid || skill.templateUuid || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!key || key.includes('/')) return key;
  const namespace = (skill.namespace ?? (skill.skillKey ? 'libtv-user-generated' : ''))
    .trim()
    .replace(/^\/+|\/+$/g, '');
  return namespace ? `${namespace}/${key}` : key;
}

export function createSkillHandoff(
  { prompt = '', model, skill, attachments = [], parts: orderedParts, dryRunIntent },
  now = Date.now(),
) {
  if (orderedParts) {
    if (!agentContentReady(orderedParts)) throw new Error('参考素材尚未就绪');
    return {
      ...agentDraftFromParts(null, orderedParts, now),
      ...(typeof dryRunIntent === 'boolean' ? { dryRunIntent } : {}),
    };
  }
  const references = [];
  if (model?.modelKey)
    references.push({
      type: 'model',
      id: model.modelKey,
      name: model.label || model.modelName || model.modelKey,
      modality: model.modality,
    });
  if (skill && skillReferenceId(skill))
    references.push({
      type: 'skill',
      id: skillReferenceId(skill),
      name: skill.name || skill.label || skill.skillKey,
      ...(skill.localDemo ? { draft: true } : {}),
    });
  for (const attachment of attachments) {
    if (
      attachment.status !== 'ready' ||
      !mediaTypes.has(attachment.type) ||
      !attachment.source?.value
    )
      continue;
    references.push({
      type: attachment.type,
      id: attachment.id,
      name: attachment.name,
      source: attachment.source,
      ...(attachment.metadata ? { metadata: attachment.metadata } : {}),
    });
  }
  const text = [prompt.trim(), ...references.map((part) => `{{ ${part.type}:${part.id} }}`)]
    .filter(Boolean)
    .join(' ');
  const parts = [{ type: 'text', text }, ...references];
  return {
    version: 1,
    parts,
    plainText: text,
    serialized:
      references.length || /\{\{\s*\w+\s*:\s*[^}]+\}\}/.test(text) ? JSON.stringify(parts) : text,
    createdAt: now,
    ...(typeof dryRunIntent === 'boolean' ? { dryRunIntent } : {}),
  };
}

export function skillHandoffText(payload) {
  return agentPlainText(payload?.parts || [{ type: 'text', text: payload?.plainText || '' }]);
}

export function canSubmitSkill({ prompt = '', model, skill, attachments = [], parts }) {
  if (parts)
    return (
      agentContentReady(parts) && Boolean(agentPlainText(parts) || parts.some(isAgentReference))
    );
  return (
    !attachments.some((item) => item.status !== 'ready') &&
    Boolean(
      prompt.trim() ||
      model?.modelKey ||
      (skill && skillReferenceId(skill)) ||
      attachments.some((item) => mediaTypes.has(item.type) && item.source?.value),
    )
  );
}

function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

export function writeSkillHandoff(
  payload,
  id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
) {
  if (!validId(id)) throw new Error('创作交接编号无效');
  writeStoredValue(prefix + id, payload, scope);
  return id;
}

export function readSkillHandoff(id, now = Date.now()) {
  if (!validId(id)) return null;
  const value = readStoredValue(prefix + id, null, scope);
  if (
    !value ||
    value.version !== 1 ||
    value.parts?.[0]?.type !== 'text' ||
    !Array.isArray(value.parts) ||
    !Number.isFinite(value.createdAt) ||
    now - value.createdAt > maxAge
  )
    return null;
  return value;
}

export function consumeSkillHandoff(id) {
  const value = readSkillHandoff(id);
  if (validId(id)) removeStoredValue(prefix + id, scope);
  return value;
}

export function legacySkillHandoff(search) {
  const query = new URLSearchParams(search);
  const prompt = query.get('prompt') || '';
  const skillUuid = query.get('skillUuid');
  return prompt || skillUuid
    ? createSkillHandoff({ prompt, skill: skillUuid ? { skillUuid, name: skillUuid } : null })
    : null;
}

export const SKILL_ATTACHMENT_ACCEPT =
  'image/*,video/*,audio/*,.pdf,.txt,.md,.markdown,.doc,.docx,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function skillAttachmentType(file) {
  const mime = file.type || file.mimeType || '';
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name))
    return 'image';
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(file.name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|aac|ogg|m4a|flac)$/i.test(file.name)) return 'audio';
  if (/\.(pdf|txt|md|markdown|docx?)$/i.test(file.name)) return 'document';
  return null;
}
