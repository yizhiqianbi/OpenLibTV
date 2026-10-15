// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CHAT_MODEL_CATALOGUE } from './agent-model-catalogue.js';
import { agentContentToJSON, agentContentFromJSON } from './agent-content.js';
import {
  chatModelPickReference,
  getAgentToolbarBenefits,
  getAgentToolbarModels,
  resolveToolbarModelDisable,
} from './agent-toolbar-models.js';

describe('source agent model toolbar rules', () => {
  it('preserves source order and both groups while filtering an explicit allowlist', () => {
    const models = {
      text: [{ modelKey: 'text' }],
      image: [
        { modelKey: ' a ', modelName: ' A ' },
        { modelKey: 'a' },
        { modelKey: 'b', vip: true },
        { modelKey: '' },
      ],
      video: [{ modelKey: 'v' }],
    };
    expect(getAgentToolbarModels(models, ['a', 'v'])).toEqual({
      image: [
        {
          modelKey: 'a',
          modelName: 'A',
          description: undefined,
          icon: undefined,
          disable: undefined,
          vip: false,
        },
      ],
      video: [
        {
          modelKey: 'v',
          modelName: 'v',
          description: undefined,
          icon: undefined,
          disable: undefined,
          vip: false,
        },
      ],
    });
    expect(getAgentToolbarModels(models, [])).toEqual({ image: [], video: [] });
    expect(getAgentToolbarModels(CHAT_MODEL_CATALOGUE).image).toHaveLength(9);
    expect(getAgentToolbarModels(CHAT_MODEL_CATALOGUE).video).toHaveLength(8);
  });
  it('uses only source disable flags, including localized reasons and the English fallback', () => {
    for (const value of [false, '', '   ', {}, [], null])
      expect(resolveToolbarModelDisable(value)).toEqual({ disabled: false });
    expect(resolveToolbarModelDisable(true)).toEqual({ disabled: true });
    expect(resolveToolbarModelDisable(' 暂不可用 ')).toEqual({
      disabled: true,
      reason: '暂不可用',
    });
    expect(resolveToolbarModelDisable({ zh: ' 中文 ', en: 'English' }, 'zh')).toEqual({
      disabled: true,
      reason: '中文',
    });
    expect(resolveToolbarModelDisable({ en: 'English' }, 'fr')).toEqual({
      disabled: true,
      reason: 'English',
    });
    expect(resolveToolbarModelDisable({ zh: '' }, 'en')).toEqual({ disabled: true });
    const vip = getAgentToolbarModels({ video: [{ modelKey: 'vip', vip: true }] }).video[0];
    expect(resolveToolbarModelDisable(vip.disable)).toEqual({ disabled: false });
  });
  it('applies real benefit records with source first-match and 720P fallback rules', () => {
    const map = getAgentToolbarBenefits(
      ['a', 'b', 'star-video2'],
      [
        {
          benefitType: 'powerZero',
          targetParams: JSON.stringify({ modelKey: 'a', extraLabel: 'HD' }),
          targetKey: 'b',
          showContent: JSON.stringify({ libtv: { badgeTooltip: '仅此模型' } }),
        },
        {
          benefitType: 'freeTimes',
          targetParams: JSON.stringify({ modelKey: 'a' }),
          targetKey: 'b',
          freeTimes: { totalTimes: 10, usedTimes: 3 },
        },
        { benefitType: 'powerDiscount', benefitValue: 80, targetKey: 'star_2.0_720p_no_video' },
      ],
    );
    expect(map.get('a')).toEqual({ label: 'HD免积分', badgeTooltip: '仅此模型' });
    expect(map.get('b').label).toBe('限免7条');
    expect(map.get('star-video2').label).toBe('720P限时8折');
    expect(
      getAgentToolbarBenefits(
        ['a'],
        [
          {
            targetKey: 'a',
            benefitType: 'powerFixed',
            benefitValue: 9,
            showContent: '{"unit":"秒"}',
          },
        ],
      ).get('a').label,
    ).toBe('限时 9 积分/秒');
  });
  it('serializes independent model occurrences rather than replacing one selected model', () => {
    const image = chatModelPickReference({ modelKey: 'a', label: 'A', modality: 'image' });
    const video = chatModelPickReference({ modelKey: 'v', label: 'V', modality: 'video' });
    const parts = [image, { type: 'text', text: ' 与 ' }, video, image];
    const restored = agentContentFromJSON(agentContentToJSON(parts));
    expect(restored.filter((part) => part.type === 'model').map((part) => part.id)).toEqual([
      'a',
      'v',
      'a',
    ]);
    expect(chatModelPickReference({ modelKey: '', modality: 'image' })).toBeNull();
    expect(chatModelPickReference({ modelKey: 'x', modality: 'text' })).toBeNull();
  });
});
