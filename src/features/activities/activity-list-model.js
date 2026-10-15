/**
 * The public challenge list is a page/total contract in the source client.
 * Keep that contract independent from React so the local snapshot and a future
 * operations adapter can share the same deduplication and pagination rules.
 */
export function normalizeActivityPage(payload, page, pageSize) {
  if (!Array.isArray(payload?.list)) throw new Error('Invalid campaign list');
  const list = payload.list;
  const total = Number.isFinite(payload?.total) ? payload.total : null;
  const hasMore = list.length > 0 && total != null && page * pageSize < total;
  return { items: list, total, hasMore };
}

export function appendUniqueActivities(current, next) {
  const seen = new Set(current.map((item) => String(item?.activityId ?? '')));
  return next.reduce(
    (items, item) => {
      const id = String(item?.activityId ?? '');
      if (!id || seen.has(id)) return items;
      seen.add(id);
      items.push(item);
      return items;
    },
    [...current],
  );
}

export function createSnapshotActivitySource(activities = []) {
  const snapshot = Array.isArray(activities) ? activities.slice() : [];
  return {
    async list({ page = 1, pageSize = 20, signal } = {}) {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const start = Math.max(0, page - 1) * pageSize;
      return { list: snapshot.slice(start, start + pageSize), total: snapshot.length };
    },
  };
}
