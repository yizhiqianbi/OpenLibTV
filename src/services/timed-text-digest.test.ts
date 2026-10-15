import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { timedTextDigestSync } from './timed-text-digest';
describe('synchronous document SHA-256 identifiers', () => {
  it.each([0, 1, 55, 56, 63, 64, 65, 128, 1000, 100000])(
    'matches independent Node SHA-256 at length %s',
    (length) => {
      const text = 'x'.repeat(length);
      expect(timedTextDigestSync(text)).toBe(createHash('sha256').update(text).digest('hex'));
    },
  );
  it('uses the same UTF-8 replacement and code points for multilingual document text', () => {
    const text = '中文👩🏽‍🎨\n\ud800<字幕> ';
    expect(timedTextDigestSync(text)).toBe(createHash('sha256').update(text).digest('hex'));
  });
});
