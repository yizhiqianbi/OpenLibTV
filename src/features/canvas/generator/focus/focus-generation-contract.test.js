// @vitest-environment node
import { describe, expect, it } from 'vitest';
import models from '../../../../../public/data/models.json';
import { resolveNodeGenerator } from '../node-generator.js';
import { generatorValidation } from '../schema.js';
import { validateGeneratorMediaInputs } from '../media-input-model.js';

describe('source camera_focus evaluation without inventing a prompt or ordinary image reference', () => {
  it.each(['nebula-ultra', 'nebula-2-flash', 'nebula-2.1'])(
    'keeps confirmed focus usable for %s with an empty prompt',
    (model) => {
      const source = {
        id: 'source',
        type: 'image',
        data: { action: 'image_resource', url: ['/source.png'] },
      };
      const params = {
        model,
        prompt: '',
        modeType: 'text2image',
        scene: 'camera_focus',
        originImage: '/source.png',
        focusRegion: {
          nodeId: 'source',
          relX: 0.1,
          relY: 0.2,
          width: 0.4,
          height: 0.3,
          imageUrl: '/source.png',
        },
        settings: { ratio: '1:1' },
      };
      const target = { id: 'target', type: 'image', data: { action: 'image_generate', params } };
      const result = resolveNodeGenerator(
        target,
        [source, target],
        [{ id: 'edge', source: 'source', target: 'target' }],
        models,
        { syncIncoming: true },
      );
      expect(result.schema.properties.focus).toBe(true);
      expect(result.params).toMatchObject({
        prompt: '',
        scene: 'camera_focus',
        originImage: '/source.png',
        focusRegion: params.focusRegion,
      });
      expect(result.inputMedia.imageList).toEqual([]);
      expect(result.inputCounts.imageList).toBe(0);
      expect(result.error).toBe('');
    },
  );
  it('evaluates required image using originImage for camera_focus and does not borrow a different connected image', () => {
    const schema = { properties: {}, rules: [{ require: ['prompt', 'image'], mode: 'all' }] };
    expect(
      generatorValidation(
        { prompt: '', scene: 'camera_focus', originImage: '/source.png' },
        schema,
        {},
      ),
    ).toBe('');
    expect(
      generatorValidation({ prompt: '', scene: 'camera_focus' }, schema, { imageList: 1 }),
    ).toBe('请添加模型所需的参考素材');
    expect(generatorValidation({ prompt: '', originImage: '/source.png' }, schema, {})).toBe(
      '请先输入提示词',
    );
  });
  it('keeps conditional media rules consistent with the task scene, while non-focus rules still need a real prompt', () => {
    const schema = {
      properties: {},
      rules: [{ whenHas: ['image'], require: ['prompt'], mode: 'all', message: '需要正文' }],
    };
    const options = {
      type: 'image',
      prompt: '',
      scene: 'camera_focus',
      originImage: '/source.png',
    };
    expect(validateGeneratorMediaInputs(schema, 'text2image', {}, options).blockMessages).toEqual(
      [],
    );
    expect(
      validateGeneratorMediaInputs(
        schema,
        'text2image',
        { imageList: [{ url: '/source.png' }] },
        { type: 'image', prompt: '' },
      ).blockMessages,
    ).toContain('需要正文');
  });
});
