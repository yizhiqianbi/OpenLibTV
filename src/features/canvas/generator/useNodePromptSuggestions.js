import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { promptMentionPreferences } from '../../../services/prompt-mention-preference.ts';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';
import { usePromptMentionPreference } from './usePromptMentionPreference.js';
import {
  findPromptSuggestions,
  promptSuggestionPool,
  suggestionRejectionKey,
} from './prompt-suggestion-model.js';
import {
  acceptPromptGhost,
  insertPromptGhost,
  stripPromptGhosts,
} from './prompt-suggestion-dom.js';
import { readPromptDOM, selectionOffsets } from './node-prompt-dom.js';

const SINGLE_HINT = '点击 或 按Tab键插入';
const BATCH_HINT = '点击 或 按Tab键插入 · Shift Tab 插入全部';
const MODIFIER_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
]);

export function useNodePromptSuggestions(
  controller,
  { available, references, mentionListType, mentionTypes, sessionKey },
) {
  const { editorRef, latest, beforeMutation, composing, draft, savedSelection, change, menu } =
    controller;
  const preference = usePromptMentionPreference();
  const poolSignature = JSON.stringify({ references, mentionListType, mentionTypes });
  const pool = useMemo(() => {
    const configuration = JSON.parse(poolSignature);
    return promptSuggestionPool(configuration.references, configuration);
  }, [poolSignature]);
  const current = useRef({});
  const session = useRef(null);
  const timer = useRef(null);
  const generation = useRef(0);
  const rejected = useRef(new Set());
  const [presentation, setPresentation] = useState(null);
  const [hovered, setHovered] = useState(null);
  useLayoutEffect(() => {
    current.current = { available, enabled: preference.enabled, pool, menu, sessionKey };
  });
  const usable = useCallback(() => {
    const editor = editorRef.current;
    return (
      editor?.isConnected &&
      editor.ownerDocument.activeElement === editor &&
      current.current.available &&
      current.current.enabled &&
      !current.current.menu &&
      !latest.current.blocked &&
      !composing.current
    );
  }, [editorRef, latest, composing]);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
    generation.current += 1;
    stripPromptGhosts(editorRef.current);
    if (session.current) {
      session.current = null;
      setPresentation(null);
    }
    setHovered(null);
  }, [editorRef]);
  const reject = useCallback(() => {
    for (const item of session.current?.items ?? []) {
      if (rejected.current.size >= 200) rejected.current.clear();
      rejected.current.add(item.key);
    }
    dismiss();
  }, [dismiss]);
  const present = useCallback(
    (next, showTip = false) => {
      next.items.forEach((item, index) => {
        item.ghost.dataset.suggestHint =
          index === next.active && next.items.length > 1 ? BATCH_HINT : SINGLE_HINT;
        item.ghost.classList.toggle('is-active', index === next.active);
      });
      const anchor = next.items[next.active]?.ghost;
      if (!anchor) return;
      setPresentation({ anchor, text: anchor.dataset.suggestHint, showTip });
      const editor = editorRef.current;
      const bounds = editor.parentElement.getBoundingClientRect();
      const rect = anchor.getBoundingClientRect();
      if (bounds.height && rect.height) {
        if (rect.top < bounds.top) editor.parentElement.scrollTop -= bounds.top - rect.top + 4;
        else if (rect.bottom > bounds.bottom)
          editor.parentElement.scrollTop += rect.bottom - bounds.bottom + 4;
      }
    },
    [editorRef],
  );
  const schedule = useCallback(
    ({ mode = 'caret', region } = {}) => {
      dismiss();
      if (!usable()) return;
      const expected = generation.current;
      timer.current = setTimeout(
        () => {
          timer.current = null;
          if (expected !== generation.current || !usable()) return;
          const editor = editorRef.current;
          const selection = selectionOffsets(editor);
          if (!selection || selection.start !== selection.end) return;
          const value = readPromptDOM(editor);
          if (value !== draft.current) return;
          const matches = findPromptSuggestions(value, current.current.pool, {
            mode,
            region,
            caret: selection.start,
            rejected: rejected.current,
          });
          const items = [];
          for (const match of matches.slice().reverse()) {
            const option = current.current.pool.options.find(
              (item) => item.nodeId === match.nodeId,
            );
            const ghost = insertPromptGhost(editor, match, option, latest.current.asset);
            if (ghost) items.unshift({ match, ghost, key: suggestionRejectionKey(match, value) });
          }
          if (!items.length) return;
          const next = { items, active: 0, value, sessionKey: current.current.sessionKey };
          session.current = next;
          if (mode === 'batch') {
            const range = editor.ownerDocument.createRange();
            range.setStartBefore(items[0].ghost);
            range.collapse(true);
            const selection = editor.ownerDocument.defaultView.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
          }
          present(
            next,
            promptMentionPreferences.claimTip(
              mode === 'batch' && items.length > 1 ? 'batch' : 'caret',
            ),
          );
        },
        mode === 'batch' ? 0 : 200,
      );
    },
    [dismiss, usable, editorRef, draft, latest, present],
  );
  const accept = useCallback(
    (all = false, clicked) => {
      const state = session.current;
      const editor = editorRef.current;
      if (
        !state ||
        !usable() ||
        state.sessionKey !== current.current.sessionKey ||
        readPromptDOM(editor) !== state.value
      )
        return void dismiss();
      const selected = all
        ? state.items
        : [state.items.find((item) => item.ghost === clicked) ?? state.items[state.active]];
      if (
        selected.some(
          (item) =>
            !item?.ghost.isConnected ||
            !current.current.pool.options.some((option) => option.nodeId === item.match.nodeId),
        )
      )
        return void dismiss();
      const lastIndex = state.items.indexOf(selected.at(-1));
      clearTimeout(timer.current);
      generation.current += 1;
      let caret = null;
      for (const item of selected.slice().reverse()) {
        const option = current.current.pool.options.find(
          (option) => option.nodeId === item.match.nodeId,
        );
        const position = acceptPromptGhost(item.ghost, option, latest.current.asset, editor);
        if (!caret && position) caret = position;
      }
      if (!caret) return void dismiss();
      setHovered(null);
      const range = editor.ownerDocument.createRange();
      range.setStart(caret.node, caret.offset);
      range.collapse(true);
      const selection = editor.ownerDocument.defaultView.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const value = readPromptDOM(editor);
      const offset = selectionOffsets(editor)?.start;
      savedSelection.current = { start: offset, end: offset };
      const remaining = state.items.filter((item) => item.ghost.isConnected);
      if (!remaining.length) {
        session.current = null;
        setPresentation(null);
      } else {
        state.active = Math.min(lastIndex, remaining.length - 1);
        state.items = remaining;
        state.value = value;
        present(state);
      }
      change(value, offset, true);
    },
    [editorRef, usable, dismiss, latest, savedSelection, present, change],
  );
  const handleKeyDown = useCallback(
    (event) => {
      if (!session.current || composing.current || event.isComposing) return false;
      if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        accept(event.shiftKey);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        reject();
        return true;
      }
      if (!MODIFIER_KEYS.has(event.key)) dismiss();
      return false;
    },
    [accept, reject, dismiss, composing],
  );
  useLayoutEffect(() => {
    beforeMutation.current = dismiss;
    return () => {
      if (beforeMutation.current === dismiss) beforeMutation.current = null;
    };
  }, [beforeMutation, dismiss]);
  useLayoutEffect(() => {
    dismiss();
    rejected.current.clear();
  }, [sessionKey, dismiss]);
  useLayoutEffect(() => {
    dismiss();
  }, [pool, available, preference.enabled, menu, controller.blocked, dismiss]);
  useEffect(() => {
    if (!presentation) return;
    return registerDialogChildDismissal(
      editorRef.current,
      reject,
      editorRef.current,
      handleKeyDown,
    );
  }, [presentation, editorRef, reject, handleKeyDown]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      generation.current += 1;
      stripPromptGhosts(editorRef.current);
    },
    [editorRef],
  );
  return {
    schedule,
    dismiss,
    handleKeyDown,
    accept,
    presentation:
      hovered && (!presentation?.showTip || hovered.anchor !== presentation.anchor)
        ? hovered
        : presentation,
    hover: (ghost) =>
      setHovered((previous) => {
        if (!ghost?.isConnected) return previous ? null : previous;
        return previous?.anchor === ghost && previous.text === ghost.dataset.suggestHint
          ? previous
          : { anchor: ghost, text: ghost.dataset.suggestHint, showTip: true };
      }),
  };
}
