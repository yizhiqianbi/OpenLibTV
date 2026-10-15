import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  deleteStoryboardRow,
  filterStoryboardRows,
  insertStoryboardRowAfter,
  moveStoryboardRow,
  patchStoryboardCell,
  reconcileStoryboardSelection,
  selectedStoryboardRows,
  storyboardActiveView,
  storyboardFields,
  storyboardRows,
  storyboardTableConfigPatch,
  storyboardViewPatch,
} from './rows.js';

const draftConflictMessage = '分镜内容已在外部更新，当前输入已保留，无法覆盖新数据';
const fieldSnapshot = (value) => JSON.stringify(value);
const draftConflicts = (baseline, node) =>
  baseline &&
  (baseline.node?.type !== node?.type ||
    [...baseline.fields].some(([key, value]) => fieldSnapshot(node?.data?.[key]) !== value));

/** Caller owns document writes. A rejected patch remains editable/retryable here. */
export function useStoryboardTable({
  node,
  documentKey = '',
  ready = true,
  readonly = true,
  onChange,
  activeViewId,
}) {
  const identity = JSON.stringify([documentKey, node?.id]);
  const [state, setState] = useState(() => ({
    identity,
    data: { type: node?.type, ...node?.data },
    pending: false,
    error: '',
  }));
  const [selection, setSelection] = useState(() => ({ identity, ids: new Set() }));
  const current = useRef({ identity, node, documentKey, ready, readonly, onChange });
  const draft = useRef(null);
  const draftBaseline = useRef(null);
  const operation = useRef(null);
  useLayoutEffect(() => {
    const changed = current.current.identity !== identity;
    current.current = { identity, node, documentKey, ready, readonly, onChange };
    if (changed) {
      operation.current?.abort();
      operation.current = null;
      draft.current = null;
      draftBaseline.current = null;
      setState({ identity, data: { type: node?.type, ...node?.data }, pending: false, error: '' });
      setSelection({ identity, ids: new Set() });
    } else {
      if (operation.current && (!ready || readonly)) {
        operation.current.abort();
        operation.current = null;
        setState((value) => ({ ...value, pending: false }));
      }
      setState((value) => ({
        ...value,
        data: { type: node?.type, ...node?.data, ...draft.current },
      }));
    }
  }, [identity, node, documentKey, ready, readonly, onChange]);
  useLayoutEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
    },
    [],
  );
  const data = state.identity === identity ? state.data : node?.data || {};
  const rows = storyboardRows(data);
  const viewData = activeViewId === undefined ? data : { ...data, activeViewId };
  const activeView = storyboardActiveView(viewData);
  const tableConfig = activeView.tableConfig || {};
  const selected = useMemo(
    () =>
      reconcileStoryboardSelection(
        rows,
        selection.identity === identity ? selection.ids : new Set(),
      ),
    [rows, selection, identity],
  );
  const disabled = readonly || !ready || !onChange || state.pending;
  const apply = useCallback(async (patch) => {
    const owner = current.current;
    if (!owner.ready || owner.readonly || !owner.onChange || operation.current) return false;
    const merged = { ...draft.current, ...patch };
    draftBaseline.current ||= { node: owner.node, fields: new Map() };
    for (const key of Object.keys(patch)) {
      if (!draftBaseline.current.fields.has(key))
        draftBaseline.current.fields.set(key, fieldSnapshot(owner.node?.data?.[key]));
    }
    draft.current = merged;
    if (draftConflicts(draftBaseline.current, owner.node)) {
      setState((value) => ({
        ...value,
        data: { type: owner.node?.type, ...owner.node?.data, ...merged },
        pending: false,
        error: draftConflictMessage,
      }));
      return false;
    }
    const controller = new AbortController();
    operation.current = controller;
    setState((value) => ({
      ...value,
      data: { ...value.data, ...merged },
      pending: true,
      error: '',
    }));
    try {
      const result = await owner.onChange(merged, {
        signal: controller.signal,
        documentKey: owner.documentKey,
        nodeId: owner.node.id,
        expectedNode: owner.node,
      });
      if (controller.signal.aborted || current.current.identity !== owner.identity) return false;
      if (result === false) throw new Error('分镜修改未保存，请重试');
      draft.current = null;
      draftBaseline.current = null;
      setState((value) => ({ ...value, pending: false, error: '' }));
      return true;
    } catch (error) {
      if (!controller.signal.aborted && current.current.identity === owner.identity)
        setState((value) => ({
          ...value,
          pending: false,
          error: error?.message || '分镜修改未保存，请重试',
        }));
      return false;
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }, []);
  const toggle = (id) =>
    setSelection((value) => {
      const ids = reconcileStoryboardSelection(
        rows,
        value.identity === identity ? value.ids : new Set(),
      );
      if (ids.has(id)) ids.delete(id);
      else if (rows.some((row) => row.hiddenUuid === id)) ids.add(id);
      return { identity, ids };
    });
  const toggleAll = () =>
    setSelection({
      identity,
      ids:
        selected.size === new Set(rows.map((row) => row.hiddenUuid).filter(Boolean)).size
          ? new Set()
          : new Set(rows.map((row) => row.hiddenUuid).filter(Boolean)),
    });
  return {
    data,
    rows,
    fields: storyboardFields(data),
    tableConfig,
    selected,
    disabled,
    visibleRows: filterStoryboardRows(rows, tableConfig.columnFilters),
    selectedRows: selectedStoryboardRows(rows, selected),
    error: state.identity === identity ? state.error : '',
    pending: state.identity === identity && state.pending,
    apply,
    toggle,
    toggleAll,
    retry: () => apply(draft.current || {}),
    setView: (type) => apply(storyboardViewPatch(data, type)),
    setTableConfig: (config) => apply(storyboardTableConfigPatch(viewData, config)),
    edit: (key, field, value) =>
      apply({ rows: patchStoryboardCell(rows, key, field, value, data.type === 'script-v2') }),
    move: (key, target) => apply({ rows: moveStoryboardRow(rows, key, target) }),
    insert: (key = null) => apply({ rows: insertStoryboardRowAfter(rows, key) }),
    remove: (key) => apply({ rows: deleteStoryboardRow(rows, key) }),
  };
}
