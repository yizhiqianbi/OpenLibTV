export const cloneSnapshot = (value) => JSON.parse(JSON.stringify(value));

export function createLocalId(prefix = 'local', random = Math.random) {
  return `${prefix}-${random().toString(36).slice(2, 10)}`;
}

export function createSnapshotHistory(limit = 50) {
  const past = [];
  const future = [];
  return {
    past,
    future,
    record(snapshot) {
      past.push(cloneSnapshot(snapshot));
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      if (!past.length) return null;
      future.push(cloneSnapshot(current));
      return past.pop();
    },
    redo(current) {
      if (!future.length) return null;
      past.push(cloneSnapshot(current));
      return future.pop();
    },
    clear() {
      past.length = 0;
      future.length = 0;
    },
  };
}
