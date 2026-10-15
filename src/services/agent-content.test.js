import { describe, expect, it } from 'vitest';
import {
  agentContentFromJSON,
  agentContentToJSON,
  agentDraftFromParts,
  agentPlainText,
  isAgentReference,
  appendAgentReferences,
  removeAgentReference,
  updateAgentContentText,
} from './agent-content.js';
import { createSkillHandoff, canSubmitSkill } from './agent-handoff.js';

const skill = { type: 'skill', id: 'studio/film', name: '镜头', referenceKey: 'skill-1' };
const model = {
  type: 'model',
  id: 'model-x',
  name: '模型',
  modality: 'image',
  referenceKey: 'model-1',
};
const parts = [
  { type: 'text', text: '先{{ skill:studio/film }}然后\n{{ model:model-x }}结尾' },
  skill,
  model,
];

describe('ordered Agent content and legacy compatibility', () => {
  it('round trips mixed text, newlines and refs without moving them to the end', () => {
    const document = agentContentToJSON(parts);
    expect(document.content[0].content.map((node) => node.type)).toEqual([
      'text',
      'agentReference',
      'text',
      'hardBreak',
      'agentReference',
      'text',
    ]);
    expect(agentContentFromJSON(document)).toEqual(parts);
    expect(agentPlainText(parts)).toBe('先然后\n结尾');
    const draft = createSkillHandoff({ parts, dryRunIntent: false }, 10);
    expect(draft.parts).toEqual(parts);
    expect(draft.createdAt).toBe(10);
    expect(draft.dryRunIntent).toBe(false);
    expect(updateAgentContentText(draft, agentPlainText(parts))).toBe(draft);
  });
  it('retains multiple occurrences of the same reference and removes only one key', () => {
    const second = { ...skill, referenceKey: 'skill-2' };
    const ordered = [
      { type: 'text', text: '{{ skill:studio/film }}与{{ skill:studio/film }}' },
      skill,
      second,
    ];
    const draft = agentDraftFromParts(null, ordered);
    expect(agentContentFromJSON(agentContentToJSON(ordered))).toEqual(ordered);
    const removed = removeAgentReference(draft, second);
    expect(removed.parts).toEqual([{ type: 'text', text: '{{ skill:studio/film }}与' }, skill]);
    expect(removed.createdAt).toBe(draft.createdAt);
  });
  it('keeps unknown placeholders as literal text and appends orphan legacy references', () => {
    const older = [{ type: 'text', text: '文字 {{ model:unknown }}' }, skill];
    const restored = agentContentFromJSON(agentContentToJSON(older));
    expect(restored[0].text).toBe('文字 {{ model:unknown }} {{ skill:studio/film }}');
    expect(agentPlainText(restored)).toBe('文字 {{ model:unknown }}');
  });
  it('adds a new media reference without destroying existing inline placement', () => {
    const draft = agentDraftFromParts(null, parts);
    const image = {
      type: 'image',
      id: 'image',
      name: '参考',
      source: { type: 'url', value: '/image.png' },
    };
    const next = appendAgentReferences(draft, agentPlainText(parts), [image]);
    expect(next.parts[0].text).toBe(parts[0].text + ' {{ image:image }}');
    expect(next.parts.slice(1)).toEqual([skill, model, image]);
    expect(canSubmitSkill({ parts: next.parts })).toBe(true);
  });
  it('blocks pending/error media and omits removed references from the handoff', () => {
    const pending = [
      { type: 'text', text: '{{ image:x }}' },
      { type: 'image', id: 'x', status: 'uploading' },
    ];
    expect(canSubmitSkill({ parts: pending })).toBe(false);
    expect(() => createSkillHandoff({ parts: pending })).toThrow('参考素材尚未就绪');
    expect(canSubmitSkill({ parts: [{ type: 'text', text: ' ' }] })).toBe(false);
    expect(canSubmitSkill({ parts: [{ type: 'text', text: '{{ literal:kept }}' }] })).toBe(true);
  });
  it('round trips source node identities and image-only previews through drafts/handoff without requiring an attachment source', () => {
    const node = {
      type: 'node',
      id: 'canvas-image',
      nodeKey: 'canvas-image',
      name: '画布图片',
      nodeType: 'image',
      projectId: 'project',
      url: '/preview.webp',
      mediaType: 'image',
      referenceKey: 'node-1',
    };
    const repeated = { ...node, referenceKey: 'node-2' };
    const content = [
      { type: 'text', text: '{{ node:canvas-image }}与{{ node:canvas-image }}' },
      node,
      repeated,
    ];
    expect(agentContentFromJSON(agentContentToJSON(content))).toEqual(content);
    expect(canSubmitSkill({ parts: content })).toBe(true);
    expect(createSkillHandoff({ parts: content }).parts).toEqual(content);
    expect(removeAgentReference(agentDraftFromParts(null, content), repeated).parts).toEqual([
      { type: 'text', text: '{{ node:canvas-image }}与' },
      node,
    ]);
    expect(isAgentReference({ type: 'node', id: 'old', name: '旧节点' })).toBe(true);
  });
  it('leaves unknown or conflicting node placeholders literal instead of binding them to fabricated identities', () => {
    const content = [
      { type: 'text', text: '{{ node:unknown }} {{ node:a }}' },
      { type: 'node', id: 'a', nodeKey: 'b', name: '错误身份' },
    ];
    expect(agentContentFromJSON(agentContentToJSON(content))).toEqual([content[0]]);
    expect(agentPlainText(content)).toBe(content[0].text);
    expect(isAgentReference({ type: 'node', id: ' a ', name: '空白身份' })).toBe(false);
  });
});
