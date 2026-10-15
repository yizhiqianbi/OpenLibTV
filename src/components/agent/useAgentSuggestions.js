import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PluginKey } from '@tiptap/pm/state';
import {
  agentContentFromJSON,
  agentReferenceNode,
  isAgentReference,
} from '../../services/agent-content.js';
import {
  firstMentionRow,
  isSelectableMentionRow,
  nextMentionRow,
  normalizeAgentMentionRows,
} from '../../services/agent-mention-rows.js';

export function useAgentSuggestions({ latest, mentionRefreshKey, mentionReferencesKey }) {
  const [suggestion, setSuggestion] = useState(null);
  const [selected, setSelected] = useState(-1);
  const suggestionRef = useRef(null);
  const selectedRef = useRef(-1);
  const alive = useRef(true);
  const refreshRequest = useRef(null);
  const sourceEpoch = useRef(0);
  const sourceBatches = useRef(new WeakMap());

  const update = useCallback(
    (props, kind) => {
      if (!alive.current) return;
      const previous = suggestionRef.current;
      const preserve =
        previous?.kind === kind &&
        previous.query === props.query &&
        previous.range.from === props.range.from;
      const previousId = preserve ? previous.items?.[selectedRef.current]?.id : undefined;
      const next = {
        ...props,
        kind,
        grouped: kind === 'reference' && !!latest.current.mentionSource,
      };
      suggestionRef.current = next;
      selectedRef.current = firstMentionRow(next.items || [], previousId);
      setSelected(selectedRef.current);
      setSuggestion(next);
    },
    [latest],
  );

  const selectRow = useCallback(
    (row) => {
      if (!isSelectableMentionRow(row)) return;
      if (row.rowKind === 'loadMore') latest.current.onMentionLoadMore?.();
      else suggestionRef.current?.command(row);
    },
    [latest],
  );

  const build = useMemo(
    () => (char, kind) => {
      const pluginKey = new PluginKey(`libtv-${kind}-suggestion`);
      const renderUpdate = (props) => {
        const epoch = sourceBatches.current.get(props.items);
        if (
          kind === 'reference' &&
          !props.loading &&
          epoch !== undefined &&
          epoch !== sourceEpoch.current
        )
          return;
        update({ ...props, pluginKey }, kind);
      };
      return {
        char,
        pluginKey,
        dismissOnOutsideClick: false,
        allowedPrefixes: [' '],
        startOfLine: false,
        debounce: kind === 'skill' ? 200 : 0,
        allow: () => kind !== 'skill' || !!latest.current.searchSkills,
        items: async ({ query, editor, signal }) => {
          if (kind === 'skill')
            return normalizeAgentMentionRows(
              ((await latest.current.searchSkills?.(query)) || []).slice(0, 24),
            );
          if (latest.current.mentionSource) {
            const epoch = ++sourceEpoch.current;
            let rows;
            try {
              rows = normalizeAgentMentionRows(
                await latest.current.mentionSource({
                  query,
                  parts: agentContentFromJSON(editor.getJSON()),
                  signal,
                }),
              );
            } catch {
              rows = [{ rowKind: 'empty', id: 'mention-load-error', label: '引用加载失败' }];
            }
            sourceBatches.current.set(rows, epoch);
            return rows;
          }
          return normalizeAgentMentionRows(
            latest.current.mentionItems
              .filter((item) =>
                `${item.name || ''} ${item.id}`.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 24),
          );
        },
        command: ({ editor, range, props: row }) => {
          const reference = row.reference;
          if (!isSelectableMentionRow(row) || !isAgentReference(reference)) return;
          const next = editor.state.doc.resolve(range.to).nodeAfter;
          const to = range.to + (next?.text?.startsWith(' ') ? 1 : 0);
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to }, [
              agentReferenceNode(reference, { fresh: true }),
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => ({
          onBeforeStart: (props) => {
            if (kind === 'reference') latest.current.onMentionOpen?.();
            renderUpdate(props);
          },
          onBeforeUpdate: (props) => {
            // The original Suggestion treats moving to another @ range as a
            // new session. TipTap 3 instead calls update for that transition.
            if (kind === 'reference' && suggestionRef.current?.range.from !== props.range.from)
              latest.current.onMentionOpen?.();
            renderUpdate(props);
          },
          onStart: renderUpdate,
          onUpdate: renderUpdate,
          onExit: () => {
            if (kind === 'reference') {
              sourceEpoch.current += 1;
              refreshRequest.current?.abort();
            }
            if (suggestionRef.current?.kind !== kind) return;
            suggestionRef.current = null;
            if (alive.current) setSuggestion(null);
          },
          onKeyDown: ({ event }) => {
            const current = suggestionRef.current;
            if (!current) return false;
            if (event.key === 'Escape') return false;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              selectedRef.current = nextMentionRow(
                current.items || [],
                selectedRef.current,
                event.key === 'ArrowDown' ? 1 : -1,
              );
              setSelected(selectedRef.current);
              return true;
            }
            if (event.key === 'Enter') {
              selectRow(current.items?.[selectedRef.current]);
              return true;
            }
            return false;
          },
        }),
      };
    },
    [latest, selectRow, update],
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      refreshRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    const current = suggestionRef.current;
    if (!current || current.kind !== 'reference' || !latest.current.mentionSource) return;
    const request = new AbortController();
    const epoch = ++sourceEpoch.current;
    refreshRequest.current?.abort();
    refreshRequest.current = request;
    const { editor, query, range, pluginKey } = current;
    // Refresh a live menu without dispatching document edits or replacing the editor.
    Promise.resolve()
      .then(() =>
        latest.current.mentionSource({
          query,
          parts: agentContentFromJSON(editor.getJSON()),
          signal: request.signal,
        }),
      )
      .then((items) => {
        const state = !editor.isDestroyed && pluginKey.getState(editor.state);
        if (
          !alive.current ||
          epoch !== sourceEpoch.current ||
          request.signal.aborted ||
          !state?.active ||
          state.query !== query ||
          state.range.from !== range.from ||
          state.range.to !== range.to
        )
          return;
        update(
          { ...current, items: normalizeAgentMentionRows(items), loading: false },
          'reference',
        );
      })
      .catch(() => {
        const state = !editor.isDestroyed && pluginKey.getState(editor.state);
        if (
          alive.current &&
          epoch === sourceEpoch.current &&
          !request.signal.aborted &&
          state?.active &&
          state.query === query &&
          state.range.from === range.from &&
          state.range.to === range.to
        )
          update(
            {
              ...current,
              items: [{ rowKind: 'empty', id: 'mention-load-error', label: '引用加载失败' }],
              loading: false,
            },
            'reference',
          );
      });
    return () => request.abort();
  }, [mentionRefreshKey, mentionReferencesKey, latest, update]);

  const hoverRow = useCallback((index) => {
    selectedRef.current = index;
    setSelected(index);
  }, []);
  return { build, suggestion, suggestionRef, selected, selectRow, hoverRow };
}
