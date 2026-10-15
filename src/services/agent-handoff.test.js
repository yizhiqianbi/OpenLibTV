import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { storageRepository, writeStoredValue } from './storage.ts';
import {
  createSkillHandoff,
  writeSkillHandoff,
  readSkillHandoff,
  consumeSkillHandoff,
  legacySkillHandoff,
  skillHandoffText,
  canSubmitSkill,
  skillAttachmentType,
} from './agent-handoff.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('Skill to Canvas handoff', () => {
  it('persists complete typed references separately from the URL and can consume once', () => {
    const payload = createSkillHandoff({
      prompt: '剧本\n第二幕',
      model: { modelKey: 'lib-image-2.5-s', label: 'Lib Image', modality: 'image' },
      skill: { skillKey: 'film', namespace: '/studio/', name: '镜头规划' },
      attachments: [
        {
          id: 'picture',
          type: 'image',
          name: '参考图',
          status: 'ready',
          source: { type: 'data', value: 'data:image/png;base64,AAAA', mimeType: 'image/png' },
          metadata: { mediaAssetUuid: 'asset' },
        },
      ],
      dryRunIntent: false,
    });
    expect(writeSkillHandoff(payload, 'creation')).toBe('creation');
    expect(readSkillHandoff('creation')).toEqual(payload);
    expect(localStorage.getItem('libtv.canvas-handoff.creation')).toBeNull();
    expect(skillHandoffText(payload)).toBe('剧本\n第二幕');
    expect(JSON.parse(payload.serialized)).toEqual(payload.parts);
    expect(payload.parts.find((part) => part.type === 'skill').id).toBe('studio/film');
    expect(payload.parts.find((part) => part.type === 'image').source.value).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(consumeSkillHandoff('creation')).toEqual(payload);
    expect(readSkillHandoff('creation')).toBeNull();
  });
  it('supports plain legacy prompts and Skill-only submissions', () => {
    expect(createSkillHandoff({ prompt: '一句话' }).serialized).toBe('一句话');
    expect(
      skillHandoffText(legacySkillHandoff('?prompt=%E6%97%A7%E6%96%87%E6%9C%AC&skillUuid=old')),
    ).toBe('旧文本');
    expect(legacySkillHandoff('')).toBeNull();
    expect(canSubmitSkill({ skill: { skillKey: 'film' } })).toBe(true);
    expect(canSubmitSkill({ prompt: '  ' })).toBe(false);
  });
  it('blocks uploading/error attachments and omits their invalid sources', () => {
    const attachments = [{ id: 'waiting', type: 'image', status: 'uploading' }];
    expect(canSubmitSkill({ prompt: '已有文本', attachments })).toBe(false);
    expect(createSkillHandoff({ attachments }).parts).toEqual([{ type: 'text', text: '' }]);
    expect(canSubmitSkill({ attachments: [{ status: 'error' }] })).toBe(false);
    expect(canSubmitSkill({ attachments: [{ status: 'ready' }] })).toBe(false);
    expect(
      canSubmitSkill({
        attachments: [{ type: 'image', status: 'ready', source: { value: '/image.webp' } }],
      }),
    ).toBe(true);
  });
  it('does not silently lose a handoff when browser storage rejects a write', () => {
    vi.spyOn(storageRepository, 'writeStoredValue').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeSkillHandoff(createSkillHandoff({ prompt: '保留创作' }), 'quota')).toThrow(
      'quota',
    );
    expect(readSkillHandoff('quota')).toBeNull();
  });
  it('rejects malformed, expired, and unsafe handoff IDs without evaluating data', () => {
    writeStoredValue('libtv.canvas-handoff.bad', { version: 2, parts: [] }, { scope: 'session' });
    expect(readSkillHandoff('bad')).toBeNull();
    writeSkillHandoff(createSkillHandoff({ prompt: '旧草稿' }, 10), 'expired');
    expect(readSkillHandoff('expired', 30 * 60 * 1000 + 11)).toBeNull();
    expect(readSkillHandoff('../other')).toBeNull();
    expect(() => writeSkillHandoff({}, '../other')).toThrow('创作交接编号无效');
  });
  it('infers supported file types without trusting only the filename', () => {
    expect(skillAttachmentType({ name: 'picture', type: 'image/png' })).toBe('image');
    expect(skillAttachmentType({ name: 'SCRIPT.MD', type: '' })).toBe('document');
    expect(skillAttachmentType({ name: 'sound.mp3', type: '' })).toBe('audio');
    expect(skillAttachmentType({ name: 'program.exe', type: '' })).toBeNull();
  });
});
