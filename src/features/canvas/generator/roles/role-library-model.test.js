import { describe, expect, it } from 'vitest';
import {
  complianceRoleSelectionUris,
  flattenPublicRoleMaterials,
  isRoleComplianceExpired,
  publicRoleCompliancePlan,
  publicRoleConfirmUris,
  publicRoleRemainingCapacity,
  ROLE_COMPLIANCE_MAX_AGE_MS,
  roleAssetId,
  roleAssetKey,
  roleComplianceCheckedAt,
  roleLibraryAvailability,
  roleLibraryCapacities,
  roleLibraryPage,
  roleSelectionCount,
  roleUploadSizeError,
  toggleRoleSelection,
  validateRoleUploadMetadata,
} from './role-library-model.js';

const schema = (items, extra = {}) => ({
  properties: { modeType: { items, ...extra } },
});
const capacities = (model, params) => roleLibraryCapacities({ schema: model, params });
const NOW = ROLE_COMPLIANCE_MAX_AGE_MS * 2;

describe('VIDEO caller capacities, source 580897 ao/ac/au', () => {
  it('uses separate no-schema fallback counts and does not deduct existing asset selections', () => {
    expect(
      capacities(undefined, {
        imageList: [{}, { assetId: 'portrait' }, { compliantExempt: true }],
        videoList: [{}, { assetId: 'clip' }],
        audioList: [{ assetId: 'sound' }],
      }),
    ).toEqual({ imageSelectableCount: 8, videoSelectableCount: 9, audioSelectableCount: 1 });
  });
  it('single-image mode uses its own current maximum rather than the largest model mode', () => {
    expect(
      capacities(schema({ singleImage2video: [1, 1], frames2video: [1, 2], image2video: [1, 7] }), {
        modeType: 'singleImage2video',
        imageList: [{}],
      }).imageSelectableCount,
    ).toBe(0);
  });
  it('zero current image capacity searches other modes, respecting continuation exclusion', () => {
    const model = schema({ mixed2video: [1, 4], videoExtend2video: [1, 9], frames2video: [1, 2] });
    model.config = { excludeModeTypes: ['videoExtend2video'] };
    expect(
      capacities(model, { modeType: 'text2video', videoList: [{}, {}, {}] }).imageSelectableCount,
    ).toBe(2);
  });
  it('mixed image capacity subtracts every video then caps per-type before ordinary-image subtraction', () => {
    const model = schema(
      { mixed2video: [1, 10] },
      { mixed2videoConfig: { videoMax: 4, imageMax: 7, imageMaxWithVideo: 3, audioMax: 2 } },
    );
    expect(
      capacities(model, {
        modeType: 'mixed2video',
        imageList: [{}, { assetId: 'i' }],
        videoList: [{ assetId: 'v' }],
        audioList: [{}],
      }),
    ).toEqual({ imageSelectableCount: 2, videoSelectableCount: 4, audioSelectableCount: 1 });
  });
  it('video edit accepts configured image slots only with an existing video', () => {
    const model = schema(
      { videoEdit2video: [1, 4] },
      { videoEdit2videoConfig: { videoMax: 2, imageMaxWithVideo: 3 } },
    );
    expect(capacities(model, { modeType: 'videoEdit2video', videoList: [{}] })).toEqual({
      imageSelectableCount: 3,
      videoSelectableCount: 1,
      audioSelectableCount: 1,
    });
    expect(capacities(model, { modeType: 'videoEdit2video' }).imageSelectableCount).toBe(0);
  });
  it('uses exact picker video fallback 9 without claiming an enabled video mode', () => {
    expect(
      capacities(schema({ frames2video: [1, 2] }), { modeType: 'frames2video', videoList: [{}] })
        .videoSelectableCount,
    ).toBe(8);
  });
  it('video mixed maximum subtracts images and ordinary videos, while retaining asset slots', () => {
    const model = schema({ mixed2video: [1, 5] }, { mixed2videoConfig: { videoMax: 4 } });
    expect(
      capacities(model, {
        modeType: 'mixed2video',
        imageList: [{}, {}],
        videoList: [{}, { assetId: 'saved' }],
      }).videoSelectableCount,
    ).toBe(2);
  });
  it('Seedance 2.5 edit uses mixed audio slots, ordinary edit remains one slot', () => {
    const model = schema(
      { videoEdit2video: [1, 1] },
      { mixed2videoConfig: { videoMax: 1, audioMax: 3 } },
    );
    expect(
      capacities(model, { modeType: 'videoEdit2video', model: 'star-video2.5', audioList: [{}] })
        .audioSelectableCount,
    ).toBe(2);
    expect(
      capacities(model, { modeType: 'videoEdit2video', model: 'other', audioList: [{}] })
        .audioSelectableCount,
    ).toBe(0);
  });
  it('clamps overfull ordinary media and malformed ranges without NaN', () => {
    expect(
      capacities(schema({ frames2video: [1, NaN] }), {
        imageList: Array(12).fill({}),
        videoList: Array(20).fill({}),
        audioList: [{}],
      }),
    ).toEqual({ imageSelectableCount: 0, videoSelectableCount: 0, audioSelectableCount: 0 });
  });
});

describe('source entry capability versus host permission', () => {
  it('can show role library for a non-portrait model with image capacity', () => {
    expect(
      roleLibraryAvailability({ schema: schema({ frames2video: [1, 2] }), params: {} }),
    ).toMatchObject({ visible: true, disabled: false, seedanceTabVisible: false });
  });
  it('compliance comes from schema portrait or Seedance vendor, not a suggestive model key', () => {
    const ordinary = schema({ frames2video: [1, 2] });
    expect(
      roleLibraryAvailability({ schema: ordinary, params: { model: 'star-video2' } })
        .seedanceTabVisible,
    ).toBe(false);
    expect(
      roleLibraryAvailability({ schema: { ...ordinary, modelVendor: 'star-video2-fast' } })
        .seedanceTabVisible,
    ).toBe(true);
    expect(
      roleLibraryAvailability({ schema: { properties: { portrait: true } } }).seedanceTabVisible,
    ).toBe(true);
  });
  it.each([{ isValidExtraConfig: true }, { restricted: true }, { digitalHuman: true }])(
    'hides the source chip for %j',
    (gate) => {
      expect(roleLibraryAvailability(gate).visible).toBe(false);
    },
  );
  it.each([
    { ready: false },
    { readonly: true },
    { configLocked: true },
    { protectionActive: true },
  ])('keeps capability visible while the host locks writing for %j', (gate) => {
    expect(roleLibraryAvailability(gate)).toMatchObject({ visible: true, disabled: true });
  });
});

describe('public detail URL occurrences and separate preview selection', () => {
  it('flattens block order with first exact URL winning and skips empty/malformed URLs', () => {
    const detail = {
      name: '人物',
      mediaBlocks: [
        {
          blockName: '正面',
          items: [
            { url: '' },
            { url: null },
            { url: 1 },
            { url: 'https://a/1.png', label: '主图', assetId: 'id1' },
          ],
        },
        {
          blockName: '侧面',
          items: [
            { url: 'https://a/1.png', label: '重复' },
            { url: 'https://a/2.png', thumbUrl: 'thumb' },
          ],
        },
        { items: [{ url: 'https://a/3.png' }] },
      ],
    };
    expect(flattenPublicRoleMaterials(detail)).toEqual([
      {
        url: 'https://a/1.png',
        name: '主图',
        blockName: '正面',
        assetId: 'id1',
        thumbUrl: undefined,
        complianceCheckedAtMs: undefined,
        createdAtMs: undefined,
      },
      {
        url: 'https://a/2.png',
        name: '侧面',
        blockName: '侧面',
        assetId: undefined,
        thumbUrl: 'thumb',
        complianceCheckedAtMs: undefined,
        createdAtMs: undefined,
      },
      {
        url: 'https://a/3.png',
        name: '人物',
        blockName: undefined,
        assetId: undefined,
        thumbUrl: undefined,
        complianceCheckedAtMs: undefined,
        createdAtMs: undefined,
      },
    ]);
    expect(detail.mediaBlocks[1].items).toHaveLength(2);
  });
  it('a valid character with no available material is an empty detail, not fabricated content', () => {
    expect(
      flattenPublicRoleMaterials({
        characterUuid: 'empty',
        mediaBlocks: [{ items: [{ url: '' }] }],
      }),
    ).toEqual([]);
    expect(flattenPublicRoleMaterials(null)).toEqual([]);
  });
  it('deducts existing image URI array length before the final confirmation dedupe', () => {
    expect(publicRoleRemainingCapacity(3, ['a', 'a'])).toBe(1);
    expect(publicRoleRemainingCapacity(1, ['a', 'b'])).toBe(0);
    expect(publicRoleRemainingCapacity(undefined, ['a', 'b'])).toBe(4);
  });
  it('capacity rejects an append without replacing selection identity; selected removal still works', () => {
    const selected = new Set(['a', 'b']);
    expect(toggleRoleSelection(selected, 'c', 2)).toBe(selected);
    expect([...toggleRoleSelection(selected, 'a', 0)]).toEqual(['b']);
    expect([...toggleRoleSelection(selected, 'c', 3)]).toEqual(['a', 'b', 'c']);
    expect([...selected]).toEqual(['a', 'b']);
  });
  it('confirmation preserves existing video/audio identities and adds no prompt text or asset claim', () => {
    const videos = ['asset://v'],
      audios = ['asset://a'];
    expect(
      publicRoleConfirmUris({
        selected: new Set(['new', 'old']),
        existingImages: ['old'],
        existingVideos: videos,
        existingAudios: audios,
      }),
    ).toEqual({ images: ['old', 'new'], videos, audios, assets: [], partialFailed: false });
    expect(publicRoleConfirmUris({ selected: [] })).toBeNull();
  });
});

describe('explicit certificates and source lifetime', () => {
  it('prefers check time; only a real created time can be a fallback', () => {
    expect(roleComplianceCheckedAt({ complianceCheckedAtMs: 4, createdAtMs: 8 })).toBe(4);
    expect(roleComplianceCheckedAt({ createdAtMs: 8 })).toBe(8);
    expect(
      roleComplianceCheckedAt({ createdAtMs: 8, createdAtMsIsLocalPlaceholder: true }),
    ).toBeUndefined();
    expect(roleComplianceCheckedAt({ complianceCheckedAtMs: 0, createdAtMs: NaN })).toBeUndefined();
  });
  it('accepts only known past certificates strictly younger than 60 days', () => {
    expect(
      isRoleComplianceExpired({ createdAtMs: NOW - ROLE_COMPLIANCE_MAX_AGE_MS + 1 }, NOW),
    ).toBe(false);
    expect(isRoleComplianceExpired({ createdAtMs: NOW - ROLE_COMPLIANCE_MAX_AGE_MS }, NOW)).toBe(
      true,
    );
    expect(isRoleComplianceExpired({ createdAtMs: NOW + 1 }, NOW)).toBe(true);
    expect(isRoleComplianceExpired({ status: 1 }, NOW)).toBe(true);
  });
  it('uses cached certificates, requests force for expired IDs, and never creates a success itself', () => {
    const materials = [
      { url: 'cached', assetId: 'c', createdAtMs: NOW },
      { url: 'expired', assetId: 'e', createdAtMs: 1 },
      { url: 'new' },
    ];
    expect(
      publicRoleCompliancePlan({
        selected: new Set(['cached', 'expired', 'new']),
        materials,
        now: NOW,
      }),
    ).toEqual({
      readyUris: ['asset://c'],
      cachedAssets: [
        {
          uuid: 'c',
          assetId: 'c',
          assetUrl: 'cached',
          assetType: 'image',
          status: 1,
          createdAtMs: NOW,
          updatedAtMs: NOW,
          complianceCheckedAtMs: NOW,
        },
      ],
      requests: [
        { url: 'expired', force: true },
        { url: 'new', force: false },
      ],
    });
  });
  it('partial real adapter results preserve successes while failed or absent results stay failed', () => {
    const asset = { uuid: 'q', assetUrl: 'one', assetId: 'id', status: 1 };
    const result = publicRoleConfirmUris({
      selected: ['one', 'two', 'three'],
      existingImages: ['old'],
      requireCompliance: true,
      certificates: new Map([
        ['one', { status: 1, assetId: 'id', asset }],
        ['two', { status: 1, exempt: true }],
      ]),
    });
    expect(result).toEqual({
      images: ['old', 'asset://id', 'two'],
      videos: [],
      audios: [],
      assets: [asset],
      partialFailed: true,
    });
    expect(publicRoleConfirmUris({ selected: ['missing'], requireCompliance: true })).toBeNull();
    expect(
      publicRoleConfirmUris({
        selected: ['rejected'],
        requireCompliance: true,
        certificates: { rejected: { status: 2, assetId: 'not-ready' } },
      }),
    ).toBeNull();
  });
  it('compliance tab converts cached sets, omits expired entries, and retains unknown existing keys', () => {
    const good = { assetId: 'good', assetUrl: 'url', createdAtMs: NOW },
      expired = { assetId: 'expired', createdAtMs: 1 };
    const result = complianceRoleSelectionUris({
      images: new Set(['good', 'expired', 'https://raw/image']),
      videos: new Set(['prior-video']),
      audios: new Set(),
      assetsByKey: new Map([
        ['good', good],
        ['expired', expired],
      ]),
      now: NOW,
    });
    expect(result).toEqual({
      images: ['asset://good', 'https://raw/image'],
      videos: ['asset://prior-video'],
      audios: [],
      assets: [good],
      partialFailed: false,
    });
  });
});

describe('small source selection and pagination helpers', () => {
  it('keeps exact asset protocol and never treats an ordinary URL as an asset ID', () => {
    expect(roleAssetId('asset://abc')).toBe('abc');
    expect(roleAssetId('https://asset/abc')).toBeUndefined();
    expect(roleAssetId('asset://')).toBeUndefined();
    expect(roleAssetKey({ assetId: 'id', assetUrl: 'url' })).toBe('id');
    expect(roleAssetKey({ assetUrl: 'url' })).toBe('url');
  });
  it('normalizes finite page coordinates and counts all three media sets', () => {
    expect(roleLibraryPage({ page: 40, pageSize: 15, total: 31 })).toEqual({
      page: 3,
      pageSize: 15,
      total: 31,
      pageCount: 3,
    });
    expect(roleLibraryPage({ page: NaN, pageSize: 0, total: -1 })).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      pageCount: 1,
    });
    expect(
      roleSelectionCount({ images: new Set(['i']), videos: new Set(['v', 'v2']), audios: ['a'] }),
    ).toBe(4);
  });
});

describe('upload metadata source thresholds and explicit unreadable state', () => {
  const image = { type: 'image', size: 30 * 1024 * 1024, width: 6000, height: 6000 };
  const video = { type: 'video', size: 50 * 1024 * 1024, width: 640, height: 640, duration: 2 };
  const audio = { type: 'audio', size: 15 * 1024 * 1024, duration: 15 };
  it.each([
    [image, '图片大小不能超过 30MB'],
    [video, '视频大小不能超过 50MB'],
    [audio, '音频大小不能超过 15MB'],
  ])('allows pre-reader byte validation with the same exact source limit', (metadata, error) => {
    expect(roleUploadSizeError(metadata.type, metadata.size)).toBeNull();
    expect(roleUploadSizeError(metadata.type, metadata.size + 1)).toBe(error);
  });
  it.each([image, video, audio, { ...image, type: 'portrait' }])(
    'allows exact size and inclusive dimension/duration limits for %j',
    (metadata) => {
      expect(validateRoleUploadMetadata(metadata)).toBeNull();
    },
  );
  it.each([
    [image, '图片大小不能超过 30MB'],
    [video, '视频大小不能超过 50MB'],
    [audio, '音频大小不能超过 15MB'],
  ])('rejects one byte above size before metadata checks', (metadata, message) => {
    expect(
      validateRoleUploadMetadata({
        ...metadata,
        size: metadata.size + 1,
        width: undefined,
        duration: undefined,
      }),
    ).toBe(message);
  });
  it.each([0.4, 2.5])('image excludes ratio endpoint %s while video includes it', (ratio) => {
    const width = ratio === 0.4 ? 512 : 1280,
      height = ratio === 0.4 ? 1280 : 512;
    expect(validateRoleUploadMetadata({ ...image, width, height })).toBe(
      '图片宽高比需在 0.4 ~ 2.5 之间',
    );
    expect(validateRoleUploadMetadata({ ...video, width, height })).toBeNull();
  });
  it('video keeps exact 409600 pixel lower bound, duration checked before dimensions', () => {
    expect(validateRoleUploadMetadata({ ...video, width: 639 })).toBe('视频分辨率需不低于 480p');
    expect(validateRoleUploadMetadata({ ...video, duration: 30 })).toBeNull();
    expect(validateRoleUploadMetadata({ ...video, duration: 30.1, width: 100 })).toBe(
      '视频时长需在 2s ~ 30s 之间',
    );
    expect(validateRoleUploadMetadata({ ...image, width: 299 })).toBe(
      '图片宽高需在 300px ~ 6000px 之间',
    );
  });
  it.each([
    { ...image, width: NaN },
    { ...video, duration: Infinity },
    { ...audio, duration: undefined },
  ])('never converts unknown metadata to a successful preflight for %j', (metadata) => {
    expect(validateRoleUploadMetadata(metadata)).toMatch(/^无法读取/);
  });
});
