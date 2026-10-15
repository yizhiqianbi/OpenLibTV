import { createHash, webcrypto } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createTimedTextCueId } from './timed-text-id.js';
describe('source timed text anchors', () => {
  it('matches SHA-256 source namespace/text/milliseconds and resolves collisions without random IDs', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const id =
        'c-' +
        createHash('sha256')
          .update('timeline-overlay|默认文本|1033|3000')
          .digest('hex')
          .slice(0, 6);
      expect(await createTimedTextCueId(' 默认文本 ', 31 / 30, 3, ' timeline-overlay ')).toBe(id);
      expect(
        await createTimedTextCueId(' 默认文本 ', 31 / 30, 3, 'timeline-overlay', [
          { cueId: id },
          { cueId: id + '-2' },
        ]),
      ).toBe(id + '-3');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
