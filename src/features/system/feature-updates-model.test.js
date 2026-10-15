import { describe, expect, it } from 'vitest';
import {
  appendUniqueFeatureUpdates,
  createSnapshotFeatureUpdatesSource,
  normalizeFeatureUpdatesPage,
} from './feature-updates-model.js';

describe('feature updates pagination model', () => {
  it('uses total or explicit hasMore to stop after a page', () => {
    expect(normalizeFeatureUpdatesPage({ list: [{ id: 1 }], total: 21 }, 1, 20).hasMore).toBe(true);
    expect(normalizeFeatureUpdatesPage({ list: [{ id: 1 }], total: 21 }, 2, 20).hasMore).toBe(
      false,
    );
    expect(
      normalizeFeatureUpdatesPage({ list: [{ id: 1 }], total: 1, hasMore: true }, 1, 20).hasMore,
    ).toBe(true);
  });

  it('deduplicates versions while preserving the first occurrence order', () => {
    expect(appendUniqueFeatureUpdates([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
  });

  it('exposes a deterministic snapshot source with an initial page', async () => {
    const source = createSnapshotFeatureUpdatesSource([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(source.initialPage(2)).toEqual({ list: [{ id: 1 }, { id: 2 }], total: 3 });
    await expect(source.list({ page: 2, pageSize: 2 })).resolves.toEqual({
      list: [{ id: 3 }],
      total: 3,
    });
  });
});
