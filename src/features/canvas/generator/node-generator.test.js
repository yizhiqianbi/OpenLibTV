// @vitest-environment node
import { describe, expect, it } from 'vitest';
import models from '../../../../public/data/models.json';
import { generatorIncomingIdentity, resolveNodeGenerator } from './node-generator.js';

const node = (model, params = {}) => ({
  id: 'target',
  type: 'video',
  data: { params: { model, prompt: '描述', ...params } },
});
const images = [0, 1].map((i) => ({
  id: `image-${i}`,
  type: 'image',
  data: { url: [`/image-${i}.png`] },
}));
const edges = images.map((image) => ({ source: image.id, target: 'target' }));
describe('shared inspector and submission generator state', () => {
  it('preserves the raw parameter document while the schema is missing', () => {
    const target = node('star-video2', {
      settings: { resolution: '1080p', duration: 12 },
      advancedSettings: { search_enabled: 0 },
    });
    expect(resolveNodeGenerator(target, [], [], null).params).toEqual(target.data.params);
  });
  it('blocks a stale model outside the source template list and exposes the whole config lock', () => {
    const target = node('star-video2');
    target.data.extraConfig = {
      scene: 'fixture',
      models: [{ modelKey: 'kling-v3-omni' }],
      schema: { config: false },
    };
    const result = resolveNodeGenerator(target, [], [], models);
    expect(result.configLocked).toBe(true);
    expect(result.error).toMatch(/模型不在/);
    expect(result.modelKeys).toEqual(['kling-v3-omni']);
  });
  it('infers from usable media and preserves an enabled explicit frame mode while editing parameters', () => {
    const target = node('kling-v3-omni');
    const inferred = resolveNodeGenerator(target, images, edges, models, { syncIncoming: true });
    expect(inferred.params.modeType).toBe('mixed2video');
    const selected = resolveNodeGenerator(
      node('kling-v3-omni', { modeType: 'frames2video' }),
      images,
      edges,
      models,
    );
    expect(selected.params.modeType).toBe('frames2video');
    expect(selected.inputCounts.imageList).toBe(2);
    expect(selected.error).toBe('');
  });
  it('never resurrects a cleared prompt from the old text field', () => {
    const target = {
      id: 'target',
      type: 'text',
      data: { text: '旧文本', params: { model: models.default.text, prompt: '' } },
    };
    expect(resolveNodeGenerator(target, [], [], models).params.prompt).toBe('');
  });
  it('blocks unknown media constraints and validates actual metadata without using graph dimensions', () => {
    const target = node('kling-v3-omni');
    const video = {
      id: 'video',
      type: 'video',
      width: 1920,
      height: 1080,
      data: { url: ['/movie.mp4'], duration: 8 },
    };
    const connected = [{ source: 'video', target: 'target' }];
    const unresolved = resolveNodeGenerator(target, [video], connected, models, {
      syncIncoming: true,
    });
    expect(unresolved.mediaValidation.complete).toBe(false);
    expect(unresolved.error).toMatch(/元数据/);
    const resolved = resolveNodeGenerator(target, [video], connected, models, {
      metadata: { '/movie.mp4': { width: 1920, height: 1080, durationSec: 8, byteSize: 1000 } },
      syncIncoming: true,
    });
    expect(resolved.error).toBe('');
    expect(resolved.params.modeType).toBe('videoEdit2video');
    const changed = resolveNodeGenerator(
      target,
      [{ ...video, data: { url: ['/next.mp4'] } }],
      connected,
      models,
      {
        metadata: { '/movie.mp4': { durationSec: 99 } },
        syncIncoming: true,
      },
    );
    expect(changed.mediaValidation.complete).toBe(false);
  });
  it('preserves source mode locks and enforces long-video single count in both consumers', () => {
    const locked = resolveNodeGenerator(
      node('kling-v3-omni', { modeType: 'frames2video', segmentRemakeLock: true }),
      [],
      [],
      models,
    );
    expect(locked.params.modeType).toBe('frames2video');
    expect(locked.locks.modeLocked).toBe(true);
    const long = resolveNodeGenerator(
      node('star-video2.5', { modeType: 'longVideo2video', count: 4 }),
      [],
      [],
      models,
    );
    expect(long.params.count).toBe(1);
    expect(long.locks.forceSingleCount).toBe(true);
  });
  it('validates an explicit unavailable mode rather than silently inferring a different mode on submit', () => {
    const target = node('kling-v3-omni', { modeType: 'text2video' });
    const explicit = resolveNodeGenerator(target, images, edges, models);
    expect(explicit.params.modeType).toBe('text2video');
    expect(explicit.error).not.toBe('');
    expect(
      resolveNodeGenerator(target, images, edges, models, { syncIncoming: true }).params.modeType,
    ).toBe('mixed2video');
  });
  it('keys incoming resources by actual identity, URL and order rather than display names or probed metadata', () => {
    const original = { imageList: [{ nodeId: 'i', url: '/a.png', mediaType: 'image' }] };
    expect(
      generatorIncomingIdentity({
        imageList: [{ ...original.imageList[0], label: '改名', width: 200 }],
      }),
    ).toBe(generatorIncomingIdentity(original));
    expect(
      generatorIncomingIdentity({ imageList: [{ ...original.imageList[0], url: '/b.png' }] }),
    ).not.toBe(generatorIncomingIdentity(original));
  });
});
