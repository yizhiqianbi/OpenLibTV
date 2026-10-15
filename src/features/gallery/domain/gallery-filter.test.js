import { describe, expect, it } from 'vitest';
import { filterGalleryItems, selectGallerySource } from './gallery-filter.js';

const first = { id: 'first', name: '首屏作品', nickname: '作者甲' };
const other = { id: 'other', name: '远处的森林', nickname: '作者乙', description: 'Trees' };

describe('gallery selection and filtering', () => {
  it('retains default order and uses the initial list until the full list arrives', () => {
    expect(selectGallerySource({ initial: { items: [first] } })).toEqual([first]);
    expect(
      selectGallerySource({ initial: { items: [first] }, all: { items: [other, first] } }),
    ).toEqual([other, first]);
  });
  it('searches the union only on the all tab and respects category and override boundaries', () => {
    const options = { source: [first], all: { allItems: [first, other] }, search: 'trees' };
    expect(filterGalleryItems(options)).toEqual([other]);
    expect(filterGalleryItems({ ...options, selected: 1 })).toEqual([]);
    expect(filterGalleryItems({ ...options, override: [first] })).toEqual([]);
  });
  it('selects category records without mutating their order', () => {
    const categories = [{ id: 12, items: [other, first] }];
    expect(selectGallerySource({ selected: 12, categories })).toBe(categories[0].items);
    expect(selectGallerySource({ selected: 99, categories })).toEqual([]);
  });
});
