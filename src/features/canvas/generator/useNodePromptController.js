import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  listNodePromptReferences,
  promptReferenceFromDrop,
  replaceNodePromptRange,
} from './node-prompt-model.js';
import {
  disposePromptMedia,
  hasUnrenderedPromptTokens,
  readPromptDOM,
  renderPromptDOM,
  selectionOffsets,
  setPromptCaret,
} from './node-prompt-dom.js';

export function useNodePromptController(
  {
    value,
    onChange,
    references,
    readonly,
    disabled,
    onHistoryBoundary,
    debounceMs,
    asset,
    sessionKey,
    mentionEnabled,
    mentionListType,
    mentionTypes,
    magicList,
    onSelectionOffset,
  },
  ref,
) {
  const editorRef = useRef(null);
  const latest = useRef({});
  const draft = useRef(value);
  const external = useRef({ value, sessionKey });
  const emitted = useRef(value);
  const timer = useRef(null);
  const epoch = useRef(0);
  const composing = useRef(false);
  const mounted = useRef(false);
  const rendered = useRef(null);
  const beforeMutation = useRef(null);
  const savedSelection = useRef(null);
  const draggedBadge = useRef(null);
  const history = useRef({
    entries: [{ value, caret: value.length }],
    index: 0,
    time: 0,
    coalesce: false,
  });
  const [empty, setEmpty] = useState(value.length === 0);
  const [menu, setMenu] = useState(null);
  const blocked = readonly || disabled;
  const referenceSignature = JSON.stringify(references);
  const magicSignature = JSON.stringify(magicList);
  const cancelPending = useCallback(() => {
    epoch.current += 1;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useLayoutEffect(() => {
    latest.current = {
      onChange,
      references,
      referenceSignature,
      blocked,
      asset,
      debounceMs,
      onHistoryBoundary,
      mentionEnabled,
      mentionListType,
      mentionTypes,
      magicList,
      magicSignature,
      onSelectionOffset,
    };
  });

  const flush = useCallback(() => {
    cancelPending();
    const current = draft.current;
    if (mounted.current && !latest.current.blocked && current !== emitted.current) {
      emitted.current = current;
      latest.current.onChange?.(current);
    }
    return current;
  }, [cancelPending]);

  const schedule = useCallback(() => {
    cancelPending();
    const expected = epoch.current;
    timer.current = setTimeout(() => {
      if (expected === epoch.current && mounted.current && !composing.current) flush();
    }, latest.current.debounceMs);
  }, [cancelPending, flush]);

  const redraw = useCallback((next, caret) => {
    const editor = editorRef.current;
    if (!editor) return;
    beforeMutation.current?.();
    renderPromptDOM(
      editor,
      next,
      latest.current.references,
      latest.current.asset,
      latest.current.blocked,
      { magicList: latest.current.magicList },
    );
    rendered.current = {
      referenceSignature: latest.current.referenceSignature,
      asset: latest.current.asset,
      blocked: latest.current.blocked,
      magicSignature: latest.current.magicSignature,
    };
    if (caret != null && editor.ownerDocument.activeElement === editor)
      setPromptCaret(editor, caret);
  }, []);

  const remember = useCallback((next, caret, coalesce = false) => {
    const state = history.current;
    if (state.entries[state.index]?.value === next) return;
    state.entries.length = state.index + 1;
    const now = Date.now();
    const entry = { value: next, caret };
    if (coalesce && state.coalesce && state.index > 0 && now - state.time < 350)
      state.entries[state.index] = entry;
    else {
      state.entries.push(entry);
      state.index += 1;
      if (state.entries.length > 100) (state.entries.shift(), (state.index -= 1));
    }
    state.time = now;
    state.coalesce = coalesce;
  }, []);

  const change = useCallback(
    (next, caret, immediate = false, coalesce = false) => {
      draft.current = next;
      setEmpty(next.length === 0);
      remember(next, caret, coalesce);
      if (immediate) flush();
      else schedule();
    },
    [flush, remember, schedule],
  );

  useLayoutEffect(() => {
    const sessionChanged = external.current.sessionKey !== sessionKey;
    const valueChanged = external.current.value !== value;
    const replacing = sessionChanged || (valueChanged && value !== draft.current);
    if (replacing) {
      cancelPending();
      composing.current = false;
      draft.current = value;
      emitted.current = value;
      history.current = {
        entries: [{ value, caret: value.length }],
        index: 0,
        time: 0,
        coalesce: false,
      };
      setMenu(null);
    }
    external.current = { value, sessionKey };
    if (blocked) {
      composing.current = false;
      cancelPending();
      setMenu(null);
    }
    if (composing.current) return;
    if (
      replacing ||
      rendered.current?.referenceSignature !== referenceSignature ||
      rendered.current?.magicSignature !== magicSignature ||
      rendered.current?.asset !== asset ||
      rendered.current?.blocked !== blocked ||
      readPromptDOM(editorRef.current) !== draft.current ||
      hasUnrenderedPromptTokens(editorRef.current, magicList)
    ) {
      const caret = selectionOffsets(editorRef.current)?.start;
      redraw(draft.current, caret);
    }
    setEmpty(draft.current.length === 0);
  }, [
    value,
    sessionKey,
    referenceSignature,
    magicSignature,
    magicList,
    asset,
    blocked,
    redraw,
    cancelPending,
  ]);

  useLayoutEffect(() => {
    mounted.current = true;
    const editor = editorRef.current;
    return () => {
      mounted.current = false;
      cancelPending();
      disposePromptMedia(editor);
    };
  }, [cancelPending]);

  const insert = useCallback(
    (insertion, range = savedSelection.current) => {
      if (latest.current.blocked) return false;
      const editor = editorRef.current;
      const current = selectionOffsets(editor) ??
        range ?? { start: draft.current.length, end: draft.current.length };
      const next = replaceNodePromptRange(draft.current, current.start, current.end, insertion, {
        magicList: latest.current.magicList,
      });
      editor.focus({ preventScroll: true });
      redraw(next.value, next.caret);
      savedSelection.current = { start: next.caret, end: next.caret };
      setMenu(null);
      change(next.value, next.caret, true);
      return true;
    },
    [change, redraw],
  );

  const restoreHistory = useCallback(
    (direction) => {
      if (composing.current || latest.current.blocked) return;
      const state = history.current;
      const nextIndex = Math.min(Math.max(0, state.index + direction), state.entries.length - 1);
      if (nextIndex === state.index) return;
      state.index = nextIndex;
      state.coalesce = false;
      const entry = state.entries[nextIndex];
      draft.current = entry.value;
      redraw(entry.value, entry.caret);
      setEmpty(entry.value.length === 0);
      setMenu(null);
      flush();
    },
    [flush, redraw],
  );

  useImperativeHandle(
    ref,
    () => ({
      flush,
      cancelPending,
      getValue: () => draft.current,
      acceptCommittedValue: (next) => {
        if (!mounted.current || latest.current.blocked || typeof next !== 'string') return false;
        cancelPending();
        composing.current = false;
        draft.current = next;
        emitted.current = next;
        external.current = { ...external.current, value: next };
        history.current = {
          entries: [{ value: next, caret: next.length }],
          index: 0,
          time: 0,
          coalesce: false,
        };
        setMenu(null);
        redraw(next);
        setEmpty(next.length === 0);
        return true;
      },
      getSelectionOffset: () =>
        selectionOffsets(editorRef.current)?.start ?? savedSelection.current?.start ?? null,
      focus: () => editorRef.current?.focus({ preventScroll: true }),
      insertTextAtCursor: (text) => insert(text),
      insertReference: (payload) => {
        const option = promptReferenceFromDrop(payload, latest.current.references);
        return !!option && latest.current.mentionEnabled && insert(option.token);
      },
      insertReferenceAtCursor: (nodeId) => {
        const option = listNodePromptReferences(latest.current.references, latest.current).find(
          (item) => item.nodeId === nodeId,
        );
        return !!option && latest.current.mentionEnabled && insert(option.token);
      },
    }),
    [flush, cancelPending, insert, redraw],
  );

  useEffect(() => {
    const editor = editorRef.current;
    const save = () => {
      const current = selectionOffsets(editor);
      if (current) {
        savedSelection.current = current;
        if (
          mounted.current &&
          !latest.current.blocked &&
          !composing.current &&
          editor.contains(editor.ownerDocument.activeElement)
        )
          latest.current.onSelectionOffset?.(current.start);
      }
    };
    editor.ownerDocument.addEventListener('selectionchange', save);
    return () => editor.ownerDocument.removeEventListener('selectionchange', save);
  }, []);

  const input = (event) => {
    if (blocked) return false;
    const next = readPromptDOM(editorRef.current);
    draft.current = next;
    setEmpty(next.length === 0);
    if (composing.current) return false;
    const caret = selectionOffsets(editorRef.current)?.start;
    if (
      rendered.current?.referenceSignature !== latest.current.referenceSignature ||
      rendered.current?.magicSignature !== latest.current.magicSignature ||
      rendered.current?.asset !== latest.current.asset ||
      rendered.current?.blocked !== latest.current.blocked ||
      hasUnrenderedPromptTokens(editorRef.current, latest.current.magicList)
    )
      redraw(next, caret);
    change(next, caret, false, event.nativeEvent.inputType === 'insertText');
    return true;
  };
  const copy = (event, cut = false) => {
    const offsets = selectionOffsets(editorRef.current);
    if (!offsets || offsets.start === offsets.end || !event.clipboardData) return;
    const selection = window.getSelection();
    const text = readPromptDOM(selection.getRangeAt(0).cloneContents(), false);
    event.clipboardData.setData('text/plain', text);
    event.preventDefault();
    if (cut && !blocked) insert('', offsets);
  };

  return {
    editorRef,
    beforeMutation,
    latest,
    draft,
    external,
    composing,
    savedSelection,
    draggedBadge,
    history,
    empty,
    menu,
    setMenu,
    blocked,
    input,
    copy,
    insert,
    change,
    redraw,
    restoreHistory,
    cancelPending,
  };
}
