import { describe, expect, it } from 'vitest';
import { loadTextFontResources, readTextFontCatalogue } from './clip-text-fonts.js';

describe('readTextFontCatalogue', () => {
  it('normalizes valid remote entries while preserving optional resource metadata', () => {
    expect(
      readTextFontCatalogue({
        fonts: [
          {
            id: 'source-han',
            name: '思源黑体远程版',
            family: 'Source Han Sans CN',
            src: 'https://fonts.example.test/source-han.woff2',
            weight: 600,
            style: 'normal',
          },
        ],
      }),
    ).toEqual({
      fonts: [
        {
          id: 'source-han',
          name: '思源黑体远程版',
          family: 'Source Han Sans CN',
          src: 'https://fonts.example.test/source-han.woff2',
          weight: 600,
          style: 'normal',
        },
      ],
    });
  });

  it.each([
    {
      fonts: [
        { id: 'dup', name: '一', family: 'A' },
        { id: 'dup', name: '二', family: 'B' },
      ],
    },
    { fonts: [{ id: 'bad', name: '一', family: 'A', src: '/local.woff2' }] },
    { fonts: [{ id: 'bad', name: '一', family: 'A', weight: 550 }] },
  ])('rejects malformed font catalogue %#', (value) => {
    expect(() => readTextFontCatalogue(value)).toThrow('字体');
  });

  it('loads HTTPS resources into the supplied FontFace set and reports partial failures', async () => {
    const added = [],
      fontSet = { add: (face) => added.push(face), delete: () => true };
    class FakeFontFace {
      constructor(family, source, descriptors) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
      }
      load() {
        return this.family === 'Broken'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(this);
      }
    }
    await expect(
      loadTextFontResources(
        [
          { id: 'ok', family: 'Ops', src: 'https://fonts.example.test/ok.woff2' },
          { id: 'bad', family: 'Broken', src: 'https://fonts.example.test/bad.woff2' },
        ],
        { FontFaceCtor: FakeFontFace, fontSet },
      ),
    ).resolves.toMatchObject({ status: 'partial', loaded: ['ok'], failed: [{ id: 'bad' }] });
    expect(added[0]).toMatchObject({
      family: 'Ops',
      source: 'url("https://fonts.example.test/ok.woff2")',
    });
  });
});
