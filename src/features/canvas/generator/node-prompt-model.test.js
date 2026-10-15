// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  findPromptMentionTrigger,
  listNodePromptReferences,
  parseNodePrompt,
  promptReferenceFromDrop,
  replaceNodePromptRange,
  serializeNodePrompt,
} from './node-prompt-model.js';

const references = {
  imageList: [{ nodeId: 'i-a', url: '/a.webp', label: '画面' }],
  videoList: [{ nodeId: 'v-b', url: '/b.mp4' }],
  audioList: [{ nodeId: 'a-c', url: '/c.mp3' }],
  mixedList: [
    { nodeId: 'v-b', url: '/b.mp4', mediaType: 'video' },
    { nodeId: 'i-a', url: '/a.webp', mediaType: 'image' },
    { nodeId: 'a-c', url: '/c.mp3', mediaType: 'audio' },
  ],
  elementList: [{ uuid: 'subject-d', name: '猫', coverUrl: '/d.webp' }],
};

describe('ordinary node prompt protocol', () => {
  it('roundtrips the real public video prompt and resolves its fifth Mixed reference by ordered snapshot list', () => {
    const snapshot = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(
            '../../../../public/data/canvas-snapshots/e0098a0a61f347a59aca05670f70318e.json.gz',
            import.meta.url,
          ),
        ),
      ),
    );
    const params = snapshot.nodes.find((node) => node.id === 'v-ePMlcWHdNd').data.params;
    const parts = parseNodePrompt(params.prompt, params);
    expect(serializeNodePrompt(parts)).toBe(params.prompt);
    expect(parts.find((part) => part.token === '{{Mixed 5}}')).toMatchObject({
      nodeId: params.mixedList[4].nodeId,
      url: params.mixedList[4].url,
      label: '图片5',
      missing: false,
    });
  });

  it('preserves occurrence, special and unknown tokens while display-index overrides never change the stored index', () => {
    const value =
      'A{{Image  1}}/{{Image  1}}\n{{Mixed 1}}{{Portrait 1}}{{Element 1}}{{CameraPreset 1}}{{magic:x:2}}{{Unknown 3}}<#0.5#>';
    const parts = parseNodePrompt(value, references);
    expect(serializeNodePrompt(parts)).toBe(value);
    expect(parts.filter((part) => part.token === '{{Image  1}}')).toHaveLength(2);
    expect(parts.find((part) => part.tokenType === 'Image')).toMatchObject({
      index: 1,
      displayIndex: 2,
      label: '图片2',
    });
    expect(parts.find((part) => part.tokenType === 'Portrait').nodeId).toBe('i-a');
    expect(parts.find((part) => part.tokenType === 'Element').nodeId).toBe('subject-d');
    expect(
      parts.some((part) => part.kind === 'reference' && part.tokenType === 'CameraPreset'),
    ).toBe(false);
  });

  it('keeps missing / zero-index references visible without fabricating identity or thumbnail', () => {
    for (const part of parseNodePrompt('{{Image 0}}{{Mixed 99}}', references)) {
      expect(part).toMatchObject({ kind: 'reference', missing: true, nodeId: '', url: '' });
    }
    expect(
      listNodePromptReferences(references, { mentionListType: 'mixed' }).map((part) => part.token),
    ).toEqual(['{{Mixed 1}}', '{{Mixed 2}}', '{{Mixed 3}}', '{{Element 1}}']);
  });

  it('does not confuse a stored mixedList with the current model mode candidate protocol', () => {
    expect(listNodePromptReferences(references).map((part) => part.token)).toEqual([
      '{{Image 1}}',
      '{{Video 1}}',
      '{{Audio 1}}',
      '{{Element 1}}',
    ]);
    expect(
      listNodePromptReferences(references, { mentionTypes: ['image'] }).map((part) => part.token),
    ).toEqual(['{{Image 1}}']);
    expect(parseNodePrompt('{{Mixed 1}}', references)[0].nodeId).toBe('v-b');
  });

  it('validates zero-based drag payload against the current list and never accepts an outside node identity', () => {
    expect(
      promptReferenceFromDrop('{"listType":"video","index":0,"nodeId":"other"}', references),
    ).toMatchObject({ token: '{{Video 1}}', nodeId: 'v-b' });
    for (const raw of [
      'invalid',
      '{}',
      '{"listType":"video","index":-1}',
      '{"listType":"video","index":1}',
      '{"listType":"unknown","index":0}',
    ])
      expect(promptReferenceFromDrop(raw, references)).toBeNull();
  });

  it('consumes a partially selected token atomically and only opens mention at the immediate trigger', () => {
    const value = '前{{Mixed 1}}后';
    expect(replaceNodePromptRange(value, 3, 6, '')).toEqual({ value: '前后', caret: 1 });
    expect(findPromptMentionTrigger('描述＠', 3)).toEqual({ start: 2, end: 3 });
    expect(findPromptMentionTrigger('描述@素材', 5)).toBeNull();
  });
});
