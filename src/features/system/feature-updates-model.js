/**
 * The public feature-updates endpoint is a page/total contract.  Keeping the
 * contract outside React lets the local snapshot and a future operations API
 * share the same cursor, dedupe and cancellation rules.
 */
export function normalizeFeatureUpdatesPage(payload, page, pageSize) {
  if (!Array.isArray(payload?.list)) throw new Error('Invalid feature updates list');
  const list = payload.list;
  const total = Number.isFinite(payload.total) ? payload.total : null;
  const explicitHasMore = typeof payload.hasMore === 'boolean' ? payload.hasMore : null;
  const hasMore =
    explicitHasMore ?? (total != null ? page * pageSize < total : list.length >= pageSize);
  return { items: list, total, hasMore };
}

export function appendUniqueFeatureUpdates(current, next) {
  const seen = new Set(current.map((item) => String(item?.id ?? '')));
  return next.reduce(
    (items, item) => {
      const id = String(item?.id ?? '');
      // The source always supplies an id. Invalid rows are kept out of the
      // rendered stream so a malformed response cannot create duplicate keys.
      if (!id || seen.has(id)) return items;
      seen.add(id);
      items.push(item);
      return items;
    },
    [...current],
  );
}

export function createSnapshotFeatureUpdatesSource(versions = []) {
  const snapshot = Array.isArray(versions) ? versions.slice() : [];
  return {
    initialPage(pageSize = 20) {
      return {
        list: snapshot.slice(0, pageSize),
        total: snapshot.length,
      };
    },
    async list({ page = 1, pageSize = 20, signal } = {}) {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const start = Math.max(0, page - 1) * pageSize;
      return { list: snapshot.slice(start, start + pageSize), total: snapshot.length };
    },
  };
}
