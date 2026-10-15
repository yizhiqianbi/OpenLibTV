// @vitest-environment node
import { expect, it } from 'vitest';
import { generatorReferenceLists } from './reference-lists.js';
it('uses stored explicit reference order for 1-based prompts and appends new incoming refs', () => {
  const a = { nodeId: 'a', url: 'a.png', mediaType: 'image' },
    b = { nodeId: 'b', url: 'b.png', mediaType: 'image' },
    c = { nodeId: 'c', url: 'c.mp4', mediaType: 'video' };
  const node = {
    data: {
      params: {
        prompt: '{{Mixed 1}} {{Image 1}}',
        imageListOrder: ['b', 'a'],
        mixedListOrder: ['c', 'b', 'missing', 'a'],
      },
    },
  };
  const result = generatorReferenceLists(node, {
    imageList: [a, b],
    videoList: [c],
    audioList: [],
  });
  expect(result.imageList.map((ref) => ref.nodeId)).toEqual(['b', 'a']);
  expect(result.mixedList.map((ref) => ref.nodeId)).toEqual(['c', 'b', 'a']);
  expect(node.data.params.prompt).toBe('{{Mixed 1}} {{Image 1}}');
});
