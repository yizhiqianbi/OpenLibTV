import { describe, expect, it } from 'vitest';
import {
  appendUniqueActivities,
  createSnapshotActivitySource,
  normalizeActivityPage,
} from './activity-list-model.js';

describe('activity list pagination contract', () => {
  it('uses page and total to expose the source hasMore state', () => {
    expect(normalizeActivityPage({ list: [{ activityId: 1 }], total: 21 }, 1, 20)).toMatchObject({
      hasMore: true,
      total: 21,
    });
    expect(normalizeActivityPage({ list: [{ activityId: 21 }], total: 21 }, 2, 20)).toMatchObject({
      hasMore: false,
    });
  });

  it('deduplicates repeated activity IDs while preserving server order', () => {
    expect(
      appendUniqueActivities(
        [{ activityId: 1 }, { activityId: 2 }],
        [{ activityId: 2 }, { activityId: 3 }],
      ),
    ).toEqual([{ activityId: 1 }, { activityId: 2 }, { activityId: 3 }]);
  });

  it('adapts the representative snapshot to the same page contract', async () => {
    const source = createSnapshotActivitySource([
      { activityId: 1 },
      { activityId: 2 },
      { activityId: 3 },
    ]);
    await expect(source.list({ page: 2, pageSize: 2 })).resolves.toEqual({
      list: [{ activityId: 3 }],
      total: 3,
    });
  });
});
