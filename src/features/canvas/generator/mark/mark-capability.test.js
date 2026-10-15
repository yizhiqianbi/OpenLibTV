// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { markGeneratorCapability } from './mark-capability.js';

const schema = { properties: { magic: true } };
const node = (type = 'image', data = {}) => ({
  id: 'target',
  type,
  data: { type, action: `${type}_generate`, ...data },
});
const capable = (target, extra = {}) => markGeneratorCapability({ node: target, schema, ...extra });

describe('source default IMAGE and VIDEO mark entry capability', () => {
  it('accepts the evidenced IMAGE and VIDEO owners only with strict magic true', () => {
    for (const type of ['image', 'video']) {
      expect(capable(node(type))).toBe(true);
      for (const magic of [undefined, false, 'true', 1])
        expect(capable(node(type), { schema: { properties: { magic } } })).toBe(false);
    }
    for (const type of ['text', 'audio', 'script-v2', 'group', 'video-clip'])
      expect(capable(node(type))).toBe(false);
  });

  it('applies source IMAGE attachment gates and the independently evidenced VIDEO asset-board gate', () => {
    for (const override of [
      { isAssetBoardMode: true },
      { onlyFineTune: true },
      { slashPreset: { scene: 'preset' } },
    ])
      expect(capable(node(), override)).toBe(false);
    expect(capable(node('video'), { isAssetBoardMode: true })).toBe(false);
    // The VIDEO renderer's magic action does not use the IMAGE-only attachment props.
    expect(capable(node('video'), { onlyFineTune: true, slashPreset: {} })).toBe(true);
  });

  it('honors IMAGE resource/showGenerator and exact asset-sourced exception without altering action', () => {
    const uploaded = node('image', { action: 'image_resource', uploaded: true });
    expect(capable(uploaded)).toBe(false);
    expect(capable(node('image', { action: 'image_resource', showGenerator: true }))).toBe(true);
    for (const asset of [{ portraitAssetId: 'asset' }, { portraitCompliantExempt: true }]) {
      expect(capable(node('image', { action: 'image_resource', ...asset }))).toBe(true);
      expect(
        capable(
          node('image', { action: 'image_resource', ...asset, portraitCertifiedInPlace: true }),
        ),
      ).toBe(false);
      expect(
        capable(node('image', { action: 'image_resource', ...asset, showGenerator: false })),
      ).toBe(false);
    }
    expect(uploaded.data.action).toBe('image_resource');
    expect(capable(node('image', { action: 'image_edit' }))).toBe(false);
    expect(capable(node('image', { action: 'image_edit', showGenerator: true }))).toBe(true);
  });

  it('keeps the VIDEO factory resource rule distinct: showGenerator alone does not enable a resource', () => {
    expect(capable(node('video', { action: 'video_resource', showGenerator: true }))).toBe(false);
    for (const asset of [{ assetVideoAssetId: 'asset' }, { assetVideoCompliantExempt: true }]) {
      expect(capable(node('video', { action: 'video_resource', ...asset }))).toBe(true);
      expect(
        capable(
          node('video', { action: 'video_resource', ...asset, assetVideoCertifiedInPlace: true }),
        ),
      ).toBe(false);
    }
  });

  it('does not claim independently unverified enhance or editing renderers share this entry', () => {
    for (const type of ['image', 'video'])
      for (const generatorType of [
        'enhance',
        'picture_edit',
        'subtitle_erase',
        'picture-edit',
        'subtitle-erase',
      ])
        expect(capable(node(type, { generatorType }))).toBe(false);
    expect(markGeneratorCapability()).toBe(false);
    expect(capable({ id: 'bad', type: 'image', data: [] })).toBe(false);
  });
});
