// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collectGeneratorMediaInputs } from './media-input-model.js';
import { collectCanvasConnectionInputs } from './mentions-enhanced/connection-inputs.js';
import { roleMediaReferenceMetadata } from './role-media-reference-model.js';

const certificateKeys = [
  'assetId',
  'compliantExempt',
  'complianceCheckedAtMs',
  'sourceCreatedAtMs',
  'sourceCreatedAtMsIsLocalPlaceholder',
];
const certificate = (ref) =>
  Object.fromEntries(
    certificateKeys.filter((key) => Object.hasOwn(ref, key)).map((key) => [key, ref[key]]),
  );
const mediaNode = (kind, data = {}, fields = {}) => ({
  id: `${kind}-source`,
  type: kind,
  data: { type: kind, url: [`https://media.test/${kind}-source`], ...data },
  ...fields,
});
const graph = (sources, params = {}) => {
  const target = { id: 'target', type: 'video', data: { type: 'video', params } };
  return {
    target,
    nodes: [...sources, target],
    edges: sources.map((node) => ({ id: `edge-${node.id}`, source: node.id, target: target.id })),
  };
};
const collectBoth = (input) => [
  collectGeneratorMediaInputs(input),
  collectCanvasConnectionInputs({ ...input, targetId: input.target.id }),
];

describe('417754 media certificate projection independent source review', () => {
  it.each(['video', 'audio'])(
    '%s primary asset ID takes precedence over the legacy portrait ID',
    (kind) => {
      const field = kind === 'video' ? 'assetVideoAssetId' : 'assetAudioAssetId';
      expect(
        roleMediaReferenceMetadata(
          mediaNode(kind, { [field]: 'current', portraitAssetId: 'legacy' }),
        ),
      ).toEqual({
        assetId: 'current',
      });
    },
  );

  it.each([
    ['video', null],
    ['video', undefined],
    ['audio', null],
    ['audio', undefined],
  ])('%s nullish primary ID (%s) falls back to the legacy portrait ID', (kind, value) => {
    const field = kind === 'video' ? 'assetVideoAssetId' : 'assetAudioAssetId';
    expect(
      roleMediaReferenceMetadata(mediaNode(kind, { [field]: value, portraitAssetId: 'legacy' })),
    ).toEqual({
      assetId: 'legacy',
    });
  });

  it.each([
    ['video', ''],
    ['video', 0],
    ['video', false],
    ['audio', ''],
    ['audio', 0],
    ['audio', false],
  ])('%s falsy non-nullish primary ID (%s) does not revive a legacy certificate', (kind, value) => {
    const field = kind === 'video' ? 'assetVideoAssetId' : 'assetAudioAssetId';
    expect(
      roleMediaReferenceMetadata(mediaNode(kind, { [field]: value, portraitAssetId: 'legacy' })),
    ).toEqual({});
  });

  it('IMAGE gives a truthy asset ID priority over exempt and ignores VIDEO and AUDIO certificate fields', () => {
    expect(
      roleMediaReferenceMetadata(
        mediaNode('image', {
          portraitAssetId: 'image-asset',
          portraitCompliantExempt: true,
          assetVideoAssetId: 'video-asset',
          assetAudioAssetId: 'audio-asset',
          portraitComplianceCheckedAtMs: 0,
        }),
      ),
    ).toEqual({ assetId: 'image-asset', complianceCheckedAtMs: 0 });
  });

  it.each([null, undefined, '', 0, false])(
    'IMAGE falsy asset ID (%s) permits the source exempt fallback',
    (value) => {
      expect(
        roleMediaReferenceMetadata(
          mediaNode('image', { portraitAssetId: value, portraitCompliantExempt: true }),
        ),
      ).toEqual({
        compliantExempt: true,
      });
    },
  );

  it('VIDEO uses its own exempt and timestamp fields after a falsy primary ID, without portrait timestamp fallback', () => {
    const node = mediaNode('video', {
      assetVideoAssetId: '',
      portraitAssetId: 'legacy',
      assetVideoCompliantExempt: true,
      portraitComplianceCheckedAtMs: 987,
    });
    expect(roleMediaReferenceMetadata(node)).toEqual({ compliantExempt: true });
    expect(
      roleMediaReferenceMetadata({
        ...node,
        data: { ...node.data, assetVideoComplianceCheckedAtMs: 0 },
      }),
    ).toEqual({
      compliantExempt: true,
      complianceCheckedAtMs: 0,
    });
  });

  it('IMAGE and VIDEO retain explicit zero, null and false source-time values but never invent missing time', () => {
    const fields = { createdAtMs: 0, createdAtMsIsLocalPlaceholder: false };
    expect(
      roleMediaReferenceMetadata(
        mediaNode('image', { portraitAssetId: 'i', portraitComplianceCheckedAtMs: null }, fields),
      ),
    ).toEqual({
      assetId: 'i',
      complianceCheckedAtMs: null,
      sourceCreatedAtMs: 0,
      sourceCreatedAtMsIsLocalPlaceholder: false,
    });
    expect(
      roleMediaReferenceMetadata(
        mediaNode(
          'video',
          { assetVideoCompliantExempt: true },
          { createdAtMs: null, createdAtMsIsLocalPlaceholder: true },
        ),
      ),
    ).toEqual({
      compliantExempt: true,
      sourceCreatedAtMs: null,
      sourceCreatedAtMsIsLocalPlaceholder: true,
    });
    expect(roleMediaReferenceMetadata(mediaNode('image', { portraitAssetId: 'i' }))).toEqual({
      assetId: 'i',
    });
  });

  it('AUDIO has neither exempt nor checked/source-time projection, even when those raw fields exist', () => {
    const node = mediaNode(
      'audio',
      {
        assetAudioAssetId: 'audio-asset',
        assetAudioCompliantExempt: true,
        assetAudioComplianceCheckedAtMs: 21,
        assetVideoComplianceCheckedAtMs: 22,
        portraitCompliantExempt: true,
        portraitComplianceCheckedAtMs: 23,
      },
      { createdAtMs: 24, createdAtMsIsLocalPlaceholder: true },
    );
    expect(roleMediaReferenceMetadata(node)).toEqual({ assetId: 'audio-asset' });
    expect(
      roleMediaReferenceMetadata({ ...node, data: { ...node.data, assetAudioAssetId: undefined } }),
    ).toEqual({});
  });

  it.each([
    [
      'image',
      { portraitAssetId: 'i', portraitCertifiedInPlace: true, portraitComplianceCheckedAtMs: 11 },
      { assetId: 'i', complianceCheckedAtMs: 11 },
    ],
    [
      'image',
      { portraitCompliantExempt: true, portraitCertifiedInPlace: true },
      { compliantExempt: true },
    ],
    [
      'video',
      {
        assetVideoAssetId: 'v',
        assetVideoCertifiedInPlace: true,
        assetVideoComplianceCheckedAtMs: 12,
      },
      { assetId: 'v', complianceCheckedAtMs: 12 },
    ],
    [
      'video',
      { assetVideoCompliantExempt: true, assetVideoCertifiedInPlace: true },
      { compliantExempt: true },
    ],
  ])(
    '%s certified in place preserves the input certificate without classifying the node as imported',
    (kind, data, expected) => {
      const node = mediaNode(kind, data);
      const before = structuredClone(node);
      expect(roleMediaReferenceMetadata(node)).toEqual(expected);
      expect(node).toEqual(before);
    },
  );

  it('ordinary media, local readiness and certificate-looking timestamps alone create no certificate', () => {
    for (const kind of ['image', 'video', 'audio']) {
      expect(
        roleMediaReferenceMetadata(
          mediaNode(
            kind,
            {
              localMediaReady: true,
              portraitCertifiedInPlace: true,
              assetVideoCertifiedInPlace: true,
              portraitComplianceCheckedAtMs: 100,
              assetVideoComplianceCheckedAtMs: 200,
            },
            { createdAtMs: 300, createdAtMsIsLocalPlaceholder: true },
          ),
        ),
      ).toEqual({});
    }
    expect(roleMediaReferenceMetadata(mediaNode('text', { portraitAssetId: 'not-media' }))).toEqual(
      {},
    );
  });
});

describe('actual generator and connection collector certificate wiring', () => {
  it('both collectors transmit typed certificates, timestamps and placeholders from the current graph, including in-place certification', () => {
    const sources = [
      mediaNode(
        'image',
        {
          portraitAssetId: 'i',
          portraitCertifiedInPlace: true,
          portraitComplianceCheckedAtMs: 11,
          createdAtMs: 'wrong-data-value',
        },
        { createdAtMs: 0, createdAtMsIsLocalPlaceholder: false },
      ),
      mediaNode(
        'video',
        {
          assetVideoCompliantExempt: true,
          assetVideoCertifiedInPlace: true,
          assetVideoComplianceCheckedAtMs: 12,
          portraitComplianceCheckedAtMs: 999,
        },
        { createdAtMs: 13, createdAtMsIsLocalPlaceholder: true },
      ),
      mediaNode(
        'audio',
        { assetAudioAssetId: 'a', portraitComplianceCheckedAtMs: 999 },
        { createdAtMs: 14, createdAtMsIsLocalPlaceholder: true },
      ),
    ];
    const input = graph(sources, { prompt: '保留原文', subjectList: [{ uuid: 'subject' }] });
    const before = structuredClone(input);
    for (const result of collectBoth(input)) {
      expect(certificate(result.imageList[0])).toEqual({
        assetId: 'i',
        complianceCheckedAtMs: 11,
        sourceCreatedAtMs: 0,
        sourceCreatedAtMsIsLocalPlaceholder: false,
      });
      expect(certificate(result.videoList[0])).toEqual({
        compliantExempt: true,
        complianceCheckedAtMs: 12,
        sourceCreatedAtMs: 13,
        sourceCreatedAtMsIsLocalPlaceholder: true,
      });
      expect(certificate(result.audioList[0])).toEqual({ assetId: 'a' });
      for (const kind of ['image', 'video', 'audio']) {
        expect(result[kind + 'List']).toHaveLength(1);
        expect(result[kind + 'List'][0]).toMatchObject({
          nodeId: `${kind}-source`,
          url: `https://media.test/${kind}-source`,
        });
      }
    }
    expect(collectCanvasConnectionInputs({ ...input, targetId: input.target.id })).toMatchObject({
      prompt: '保留原文',
      subjectList: [{ uuid: 'subject' }],
    });
    expect(input).toEqual(before);
  });

  it('both collectors keep the nullish/falsy distinction instead of promoting a stale portrait certificate', () => {
    const input = graph([
      mediaNode('video', { assetVideoAssetId: '', portraitAssetId: 'stale' }),
      mediaNode('audio', { assetAudioAssetId: null, portraitAssetId: 'legacy-audio' }),
    ]);
    for (const result of collectBoth(input)) {
      expect(certificate(result.videoList[0])).toEqual({});
      expect(certificate(result.audioList[0])).toEqual({ assetId: 'legacy-audio' });
    }
  });

  it('ordinary remote and explicitly local-ready media remain usable without becoming assets', () => {
    const input = graph([
      mediaNode('image', {
        url: ['data:image/png;base64,cHVibGlj'],
        localMediaReady: true,
        name: '本地读取',
      }),
      mediaNode('video', { name: '普通视频', portraitCertifiedInPlace: true }),
      mediaNode('audio', { name: '普通音频' }),
    ]);
    for (const result of collectBoth(input)) {
      for (const kind of ['image', 'video', 'audio']) {
        expect(result[kind + 'List']).toHaveLength(1);
        expect(certificate(result[kind + 'List'][0])).toEqual({});
      }
    }
  });

  it('connection capacity retains an empty certified reference while the generator keeps its usable-URL gate', () => {
    const input = graph([
      mediaNode(
        'image',
        { url: [], portraitAssetId: 'i', portraitComplianceCheckedAtMs: 0 },
        { createdAtMsIsLocalPlaceholder: true },
      ),
    ]);
    const [generator, connection] = collectBoth(input);
    expect(generator.imageList).toEqual([]);
    expect(connection.imageList).toEqual([
      {
        nodeId: 'image-source',
        url: '',
        assetId: 'i',
        complianceCheckedAtMs: 0,
        sourceCreatedAtMsIsLocalPlaceholder: true,
      },
    ]);
  });
});
