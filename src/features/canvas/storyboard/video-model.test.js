import { describe, expect, it } from 'vitest';
import models from '../../../../public/data/models.json';
import {
  initialStoryboardVideoConfig,
  resolveStoryboardImageShots,
  storyboardClosestRatio,
  storyboardDurationConstraint,
  storyboardDurationSupported,
  storyboardGroupPendingPlan,
  storyboardVideoModelKeys,
  storyboardVideoSettingsSchema,
} from './video-model.js';
describe('source storyboard video contracts (not wired to submission)', () => {
  it('keeps dedicated support separate and uses actual video schemas without inventing a model catalogue', () => {
    const key = Object.keys(models.videoModels)[0];
    expect(storyboardVideoModelKeys(models, [{ modelKey: key }, { modelKey: 'missing' }])).toEqual([
      key,
    ]);
    expect(storyboardVideoModelKeys(models, [])).toEqual([]);
    const schema = {
      properties: {
        modeType: { items: { singleImage2video: [1, 1] } },
        ratio: { originalField: 'ratio', enum: ['16:9', '1:1'] },
        normal: {},
        advanced: { batch: true },
        private: {},
      },
      config: { settings: ['normal'], advancedSettings: ['advanced', 'private'] },
    };
    const catalogue = { default: { video: 'v' }, videoModels: { v: schema } };
    expect(
      initialStoryboardVideoConfig({
        models: catalogue,
        initialImageSettings: { ratio: '16:9', resolution: '720p' },
        value: { settings: { custom: 'preserved' } },
      }),
    ).toMatchObject({
      model: 'v',
      modeType: 'singleImage2video',
      settings: { ratio: '16:9', resolution: '720p', custom: 'preserved' },
    });
    const batch = storyboardVideoSettingsSchema(schema, 'singleImage2video');
    expect(batch.config.settings).toEqual(['normal']);
    expect(batch.config.advancedSettings[0].fields).toEqual(['advanced']);
    expect(schema.config.advancedSettings).toEqual(['advanced', 'private']);
  });
  it('validates per-shot enum and min-based step constraints without clamping invalid drafts', () => {
    const enums = storyboardDurationConstraint({
      properties: { duration: { enum: [{ value: 5 }, 10, 'bad'] } },
    });
    expect(storyboardDurationSupported(7, enums)).toBe(false);
    expect(storyboardDurationSupported(5, enums)).toBe(true);
    const slider = storyboardDurationConstraint({
      properties: { duration: { min: 3, max: 9, step: 2 } },
    });
    expect(storyboardDurationSupported(5, slider)).toBe(true);
    expect(storyboardDurationSupported(4, slider)).toBe(false);
    expect(storyboardClosestRatio(1920, 1080)).toBe('16:9');
    expect(storyboardClosestRatio(0, 1080)).toBeUndefined();
  });
  it('matches only real linked image outputs by hiddenUuid and rejects a stale group binding', () => {
    const script = {
      id: 's',
      type: 'script',
      data: { rows: [{ hiddenUuid: 'h2' }, { hiddenUuid: 'h1' }], linkedImageGroupId: 'g' },
    };
    const group = { id: 'g', type: 'group', data: { sourceScriptNodeId: 's' } };
    const children = [
      {
        id: 'i1',
        type: 'image',
        parentId: 'g',
        data: { scriptRowHiddenUuid: 'h1', url: ['/one.webp'] },
      },
      { id: 'i2', type: 'image', parentId: 'g', data: { scriptRowHiddenUuid: 'h2', url: [] } },
    ];
    expect(
      resolveStoryboardImageShots([script, group, ...children], 'g').shots.map(
        (shot) => shot.child.id,
      ),
    ).toEqual(['i1']);
    expect(
      resolveStoryboardImageShots(
        [{ ...script, data: { ...script.data, linkedImageGroupId: 'other' } }, group, ...children],
        'g',
      ).reason,
    ).toBe('stale-image-group');
  });
  it('regenerates only empty or terminal-failed shots, preserving video params and source child order', () => {
    const nodes = [
      { id: 'g', type: 'group', data: { childNodeIds: ['failed', 'empty', 'done'] } },
      ...['done', 'empty', 'failed'].map((id) => ({
        id,
        type: 'video',
        parentId: 'g',
        data: {
          url: id === 'empty' ? [] : ['/' + id],
          params: { prompt: id, model: 'v' },
          ...(id === 'failed' ? { taskInfo: { status: '4', loading: false } } : {}),
        },
      })),
    ];
    expect(storyboardGroupPendingPlan({ kind: 'video', groupId: 'g', nodes }).targets).toEqual([
      { nodeId: 'failed', generatorType: 'video', patch: { action: 'video_generate' } },
      { nodeId: 'empty', generatorType: 'video', patch: { action: 'video_generate' } },
    ]);
    expect(nodes[1].data.params).toEqual({ prompt: 'done', model: 'v' });
  });
});
