// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { usesMixedGeneratorReferences } from './reference-actions-model.js';
import {
  ensureGeneratorMediaListOrder,
  buildGeneratorMixedReferences,
  normalizeGeneratorMentionsToMixed,
  orderGeneratorMediaReferences,
  reconcileGeneratorIncomingPrompt,
  rewriteGeneratorReferenceTokens,
} from './reference-reconciliation-model.js';

// Expected strings below follow archived store ig/T and module 677418. They are
// intentionally literal: neither the production remapper nor a copied regex oracle
// computes the expectation.
const item = (nodeId, label = nodeId) => ({ nodeId, label, url: `/${label}.png` });
const lists = (imageList = [], videoList = [], audioList = [], mixedList = []) => ({
  imageList,
  videoList,
  audioList,
  mixedList,
});
const before = lists(
  [item('a'), item('b'), item('c')],
  [item('v')],
  [item('s')],
  [item('v'), item('b'), item('a'), item('s'), item('c')],
);

describe('generator request media order materialization', () => {
  it('writes each current stable node order and leaves other params untouched', () => {
    const params = {
      prompt: '保留',
      imageList: [item('b'), { url: '/legacy.png' }, item('a')],
      videoList: [item('v')],
      mixedList: [item('b'), { nodeId: 'asset://saved', url: '/asset.png' }],
      settings: { ratio: '16:9' },
      imageListOrder: ['old'],
    };
    const result = ensureGeneratorMediaListOrder(params);
    expect(result).toMatchObject({
      prompt: '保留',
      imageListOrder: ['b', 'a'],
      videoListOrder: ['v'],
      mixedListOrder: ['b', 'asset://saved'],
      settings: params.settings,
    });
    expect(result.imageList).toBe(params.imageList);
    expect(params).not.toHaveProperty('videoListOrder');
  });

  it('is idempotent, preserves URL-only lists and does not invent empty orders', () => {
    const params = {
      imageList: [{ url: '/legacy.png' }],
      audioList: [],
      videoList: [{ nodeId: 'v', url: '/v.mp4' }],
      videoListOrder: ['v'],
    };
    const result = ensureGeneratorMediaListOrder(params);
    expect(result).toBe(params);
    expect(result).not.toHaveProperty('imageListOrder');
    expect(result).not.toHaveProperty('audioListOrder');
  });

  it('keeps duplicate IDs in source order instead of deduplicating references', () => {
    const params = { imageList: [item('same'), item('same')] };
    expect(ensureGeneratorMediaListOrder(params).imageListOrder).toEqual(['same', 'same']);
  });
});
const afterFirst = lists(
  [item('b'), item('c')],
  [item('v')],
  [item('s')],
  [item('v'), item('b'), item('s'), item('c')],
);

describe('store incoming reconciliation: stable ID cleanup before optional Mixed normalization', () => {
  it.each([
    [afterFirst, '{{Image 1}} {{Image 1}} {{Portrait 2}}'],
    [
      lists([item('a'), item('c')], before.videoList, before.audioList),
      '{{Image 1}} {{Portrait 2}}',
    ],
    [
      lists([item('a'), item('b')], before.videoList, before.audioList),
      '{{Image 1}} {{Image 2}} {{Image 2}}',
    ],
  ])('cleans a removed first, middle or last typed occurrence (%#)', (after, expected) => {
    expect(
      reconcileGeneratorIncomingPrompt(
        '{{Image 1}} {{Image 2}} {{Image 2}} {{Portrait 3}}',
        before,
        after,
      ),
    ).toBe(expected);
  });

  it('remaps typed indices first, then converts those current indices to Mixed; existing Mixed tokens retain their type', () => {
    const prompt =
      '{{Image 1}} {{Image 2}} {{Portrait 3}} {{Video 1}} {{Audio 1}} {{Mixed 2}} {{Mixed 5}}';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst, true)).toBe(
      '{{Mixed 2}} {{Mixed 4}} {{Mixed 1}} {{Mixed 3}} {{Mixed 2}} {{Mixed 4}}',
    );
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst, false)).toBe(
      '{{Image 1}} {{Portrait 2}} {{Video 1}} {{Audio 1}} {{Mixed 2}} {{Mixed 4}}',
    );
  });

  it('never looks up a new typed index in the old list during the second stage', () => {
    const old = lists([item('a'), item('b')], [item('v')], [], [item('a'), item('v'), item('b')]);
    const next = lists([item('b')], [item('v')], [], [item('v'), item('b')]);
    expect(reconcileGeneratorIncomingPrompt('{{Image 2}} {{Video 1}}', old, next, true)).toBe(
      '{{Mixed 2}} {{Mixed 1}}',
    );
  });

  it('returns unchanged typed whitespace byte for byte when no recognized index changes', () => {
    const prompt = '  lead\n\t{{Portrait 3}} \t\t tail\n\n\n  ';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, before)).toBe(prompt);
  });

  it('returns unchanged Mixed-only whitespace even when the old mode uses the Mixed protocol', () => {
    const prompt = '  lead\n\t{{Mixed 2}} \t\t tail\n\n\n  ';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst, true)).toBe(prompt);
  });

  it('a typed conversion alone invokes source horizontal whitespace and blank-line normalization', () => {
    const prompt = '  lead\n\t{{Image 2}} \t\t tail\n\n\n  end  ';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, before, true)).toBe(
      'lead\n\t{{Mixed 2}} tail\n\n end',
    );
  });

  it('without Mixed conversion, a changed index only collapses ASCII spaces and trims the result', () => {
    const prompt = '  lead\n\t{{Image 2}}   \t\t tail\n\n\n  end  ';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst)).toBe(
      'lead\n\t{{Image 1}} tail\n\n\n end',
    );
  });

  it('deletion consumes the matched leading newline and indentation as well as trailing horizontal whitespace', () => {
    expect(
      reconcileGeneratorIncomingPrompt('head\n\t {{Image 1}} \t\t tail', before, afterFirst),
    ).toBe('headtail');
  });

  it('renumbering retains a matched leading newline and indentation and emits one trailing space', () => {
    expect(
      reconcileGeneratorIncomingPrompt('head\n\t {{Image 2}} \t\t tail', before, afterFirst),
    ).toBe('head\n\t {{Image 1}} tail');
  });

  it('ASCII-space cleanup leaves unrelated tabs and interior triple newlines intact', () => {
    expect(
      reconcileGeneratorIncomingPrompt('a\t\t b\n\n\nc {{Image 1}} z', before, afterFirst),
    ).toBe('a\t\t b\n\n\nc z');
  });

  it('recognizes a newline between token kind and number, but keeps its bytes when the index is unchanged', () => {
    const prompt = 'x {{Image\n2}} y';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, before)).toBe(prompt);
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst)).toBe('x {{Image 1}} y');
  });

  it.each(['Image', 'Portrait', 'Video', 'Audio', 'Mixed'])(
    'cleans an unknown old %s index',
    (kind) => {
      expect(reconcileGeneratorIncomingPrompt(`left {{${kind} 99}} right`, before, before)).toBe(
        'left right',
      );
    },
  );

  it('cleans recognized zero indices, but retains unrecognized, negative, decimal and nonnumeric tokens', () => {
    const prompt =
      '{{Image 0}} {{Image -1}} {{Image 1.5}} {{Image NaN}} {{image 1}} {{Text 1}} {{Element 1}} {{Magic m:1}} {{magic:m:0}}';
    expect(reconcileGeneratorIncomingPrompt(prompt, before, before)).toBe(
      '{{Image -1}} {{Image 1.5}} {{Image NaN}} {{image 1}} {{Text 1}} {{Element 1}} {{Magic m:1}} {{magic:m:0}}',
    );
  });

  it('retains a leading-zero spelling when unchanged, but renumbering uses the canonical decimal index', () => {
    expect(reconcileGeneratorIncomingPrompt('{{Image 002}}', before, before)).toBe('{{Image 002}}');
    expect(reconcileGeneratorIncomingPrompt('{{Image 002}}', before, afterFirst)).toBe(
      '{{Image 1}}',
    );
  });

  it.each([undefined, '', null])(
    'a missing old nodeId is removed rather than resolved by URL (%j)',
    (nodeId) => {
      const old = lists([{ nodeId, url: '/same.png' }]);
      const next = lists([{ nodeId: 'valid', url: '/same.png' }]);
      expect(reconcileGeneratorIncomingPrompt('before {{Image 1}} after', old, next)).toBe(
        'before after',
      );
    },
  );

  it('explicitly empty old typed arrays do not infer an old identity from the current graph list', () => {
    expect(reconcileGeneratorIncomingPrompt('{{Image 1}} {{Video 1}}', lists(), afterFirst)).toBe(
      '',
    );
  });

  it('uses the last current duplicate nodeId position for both typed and Mixed mapping', () => {
    const old = lists([item('same')], [], [], [item('same')]);
    const next = lists(
      [item('same', 'first'), item('other'), item('same', 'last')],
      [],
      [],
      [item('same', 'first'), item('other'), item('same', 'last')],
    );
    expect(
      reconcileGeneratorIncomingPrompt('{{Image 1}} {{Portrait 1}} {{Mixed 1}}', old, next),
    ).toBe('{{Image 3}} {{Portrait 3}} {{Mixed 3}}');
    expect(
      reconcileGeneratorIncomingPrompt('{{Image 1}} {{Portrait 1}} {{Mixed 1}}', old, next, true),
    ).toBe('{{Mixed 3}} {{Mixed 3}} {{Mixed 3}}');
  });

  it.each([undefined, null, ''])('does not coerce an absent or empty prompt (%j)', (prompt) => {
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst, true)).toBe(prompt);
  });
});

describe('store Mixed decision comes from the original mode and model', () => {
  it.each([
    ['mixed2video', 'ordinary', true],
    ['videoExtend2video', 'ordinary', true],
    ['longVideo2video', 'ordinary', true],
    ['videoEdit2video', 'star-video2.5', true],
    ['videoEdit2video', 'star-video2.5-draft', true],
    ['videoEdit2video', 'other', false],
    ['image2video', 'star-video2.5', false],
    ['text2video', 'star-video2.5-draft', false],
    [undefined, 'star-video2.5', false],
  ])('the saved %s / %s gate is %j', (modeType, model, mixed) => {
    expect(usesMixedGeneratorReferences(modeType, model)).toBe(mixed);
    expect(
      reconcileGeneratorIncomingPrompt(
        '{{Image 2}}',
        before,
        afterFirst,
        usesMixedGeneratorReferences(modeType, model),
      ),
    ).toBe(mixed ? '{{Mixed 2}}' : '{{Image 1}}');
  });

  it('a subsequently inferred typed mode cannot reverse old Mixed conversion, and a new Mixed mode cannot rewrite an old typed store transaction', () => {
    const savedMixed = { modeType: 'mixed2video', model: 'ordinary' };
    const savedTyped = { modeType: 'image2video', model: 'star-video2.5' };
    expect(
      reconcileGeneratorIncomingPrompt(
        '{{Image 2}}',
        before,
        afterFirst,
        usesMixedGeneratorReferences(savedMixed.modeType, savedMixed.model),
      ),
    ).toBe('{{Mixed 2}}');
    expect(
      reconcileGeneratorIncomingPrompt(
        '{{Image 2}}',
        before,
        afterFirst,
        usesMixedGeneratorReferences(savedTyped.modeType, savedTyped.model),
      ),
    ).toBe('{{Image 1}}');
  });
});

describe('module 677418 normalization and isolated VIDEO reorder have distinct cleanup rules', () => {
  it('Typed-to-Mixed conversion uses last duplicate positions and preserves existing Mixed tokens', () => {
    const refs = lists([item('same')], [], [], [item('same'), item('other'), item('same')]);
    expect(normalizeGeneratorMentionsToMixed('{{Portrait 1}} {{Image 1}} {{Mixed 1}}', refs)).toBe(
      '{{Mixed 3}} {{Mixed 3}} {{Mixed 1}}',
    );
  });

  it('the normalizer deletes unavailable typed tokens and collapses tabs and long blank-line runs', () => {
    expect(
      normalizeGeneratorMentionsToMixed(
        '  a\t\t b\n\n\n c {{Image 99}} d {{Video 1}}  ',
        afterFirst,
      ),
    ).toBe('a b\n\n c d {{Mixed 1}}');
  });

  it('a malformed typed token triggers the normalizer whitespace policy without becoming a reference', () => {
    expect(normalizeGeneratorMentionsToMixed('  a\t\t {{Image -1}}\n\n\n z  ', before)).toBe(
      'a {{Image -1}}\n\n z',
    );
  });

  it('Mixed-only prompts skip normalizer whitespace cleanup entirely', () => {
    const prompt = '  a\t\t {{Mixed 1}}\n\n\n z  ';
    expect(normalizeGeneratorMentionsToMixed(prompt, before)).toBe(prompt);
  });

  it('nonmixed VIDEO reorder preserves invalid and missing tokens while store reconciliation deletes them', () => {
    const prompt = '  {{Image 1}} {{Image 2}} {{Portrait 99}} {{Mixed 99}} {{Text 1}}  ';
    expect(rewriteGeneratorReferenceTokens(prompt, before, afterFirst)).toBe(
      '  {{Image 1}} {{Image 1}} {{Portrait 99}} {{Mixed 99}} {{Text 1}}  ',
    );
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst)).toBe(
      '{{Image 1}} {{Text 1}}',
    );
  });

  it('Mixed VIDEO reorder deletes invalid typed mentions, retains invalid Mixed mentions, and does not consume the leading newline around a removed token', () => {
    const prompt = 'x\n\t{{Image 1}} y {{Portrait 99}} {{Mixed 99}}';
    expect(rewriteGeneratorReferenceTokens(prompt, before, afterFirst, true)).toBe(
      'x\n y {{Mixed 99}}',
    );
    expect(reconcileGeneratorIncomingPrompt(prompt, before, afterFirst, true)).toBe('xy');
  });

  it('VIDEO reorder uses last duplicate positions and leaves an unchanged token spelling intact', () => {
    const old = lists([item('same')]);
    const next = lists([item('same'), item('other'), item('same')]);
    expect(rewriteGeneratorReferenceTokens('{{Image 1}} {{Portrait 1}}', old, next)).toBe(
      '{{Image 3}} {{Portrait 3}}',
    );
    expect(rewriteGeneratorReferenceTokens('{{Image 001}}', old, old)).toBe('{{Image 001}}');
  });
});

describe('module 677418 order helpers retain Map insertion and last-record semantics', () => {
  it.each([undefined, [], null])(
    'no explicit order preserves the original array and duplicates (%j)',
    (order) => {
      const refs = [item('same', 'first'), item('same', 'last')];
      expect(orderGeneratorMediaReferences(refs, order)).toBe(refs);
      expect(refs.map((value) => value.label)).toEqual(['first', 'last']);
    },
  );

  it('a single-item list remains the same array even when the explicit order does not mention its ID', () => {
    const refs = [item('single')];
    expect(orderGeneratorMediaReferences(refs, ['unknown'])).toBe(refs);
  });

  it('unknown and repeated requested IDs are ignored, and unrequested records keep Map insertion order', () => {
    const refs = [item('a'), item('b'), item('c')];
    const result = orderGeneratorMediaReferences(refs, ['unknown', 'c', 'c']);
    expect(result).toEqual([refs[2], refs[0], refs[1]]);
    expect(refs.map((value) => value.nodeId)).toEqual(['a', 'b', 'c']);
  });

  it('explicit order deduplicates by nodeId using the last record, including duplicates absent from that order', () => {
    const refs = [item('a', 'first-a'), item('b'), item('a', 'last-a'), item('c')];
    expect(orderGeneratorMediaReferences(refs, ['b'])).toEqual([refs[1], refs[2], refs[3]]);
    expect(orderGeneratorMediaReferences(refs, ['a', 'a', 'unknown'])).toEqual([
      refs[2],
      refs[1],
      refs[3],
    ]);
  });

  it('Mixed combines image then video then audio and overrides each incoming mediaType without mutating it', () => {
    const image = { ...item('i'), mediaType: 'wrong' };
    const video = { ...item('v'), mediaType: 'wrong' };
    const audio = { ...item('s'), mediaType: 'wrong' };
    expect(buildGeneratorMixedReferences(lists([image], [video], [audio]))).toEqual([
      { ...image, mediaType: 'image' },
      { ...video, mediaType: 'video' },
      { ...audio, mediaType: 'audio' },
    ]);
    expect([image.mediaType, video.mediaType, audio.mediaType]).toEqual([
      'wrong',
      'wrong',
      'wrong',
    ]);
  });

  it('an explicit Mixed order selects the last duplicate across media kinds and appends remaining IDs once', () => {
    const image = item('same', 'image');
    const video = item('same', 'video');
    const audio = item('s');
    expect(
      buildGeneratorMixedReferences(lists([image], [video], [audio]), ['same', 'missing']),
    ).toEqual([
      { ...video, mediaType: 'video' },
      { ...audio, mediaType: 'audio' },
    ]);
  });
});
