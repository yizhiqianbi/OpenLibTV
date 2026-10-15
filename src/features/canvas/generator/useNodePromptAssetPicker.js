import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readPromptDOM, setPromptCaret } from './node-prompt-dom.js';
import { replaceNodePromptRange } from './node-prompt-model.js';

/** The picker owns a trigger request, never a live menu or an old graph snapshot. */
export function useNodePromptAssetPicker(controller, { canvasMentions, sessionKey, closeMenu }) {
  const {
    editorRef,
    draft,
    external,
    latest,
    composing,
    menu,
    savedSelection,
    setMenu,
    redraw,
    change,
  } = controller;
  const [open, setOpen] = useState(false);
  const request = useRef(null);
  const mounted = useRef(false);
  const focus = useRef(null);
  const current = useRef(null);
  current.current = { canvasMentions, sessionKey, closeMenu };
  const available = typeof canvasMentions?.importAssets === 'function';
  const valid = useCallback(
    (pending) => {
      const editor = editorRef.current;
      return (
        !!pending &&
        mounted.current &&
        request.current === pending &&
        !pending.signal.aborted &&
        !latest.current.blocked &&
        latest.current.mentionEnabled &&
        !composing.current &&
        current.current.sessionKey === pending.sessionKey &&
        current.current.canvasMentions?.targetNodeId === pending.targetNodeId &&
        editor?.isConnected &&
        draft.current === pending.value &&
        readPromptDOM(editor) === pending.value &&
        ['@', '＠'].includes(pending.value.slice(pending.start, pending.end))
      );
    },
    [editorRef, latest, composing, draft],
  );
  const dismiss = useCallback((restoreFocus = true) => {
    const pending = request.current;
    pending?.abort();
    request.current = null;
    focus.current =
      restoreFocus && pending ? { sessionKey: pending.sessionKey, caret: pending.caret } : null;
    setOpen(false);
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      focus.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    if (request.current && (!available || !valid(request.current))) dismiss(false);
  });
  useEffect(() => {
    if (open || !focus.current) return;
    const target = focus.current;
    focus.current = null;
    const view = editorRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const frame = view.requestAnimationFrame(() => {
      if (
        !mounted.current ||
        latest.current.blocked ||
        current.current.sessionKey !== target.sessionKey
      )
        return;
      editorRef.current?.focus({ preventScroll: true });
      setPromptCaret(editorRef.current, target.caret);
    });
    return () => view.cancelAnimationFrame(frame);
  }, [open, editorRef, latest]);
  const show = () => {
    if (!available || !menu || menu.swapBadge || latest.current.blocked || composing.current)
      return;
    const task = new AbortController();
    const pending = {
      value: draft.current,
      basePrompt: external.current.value,
      start: menu.start,
      end: menu.end,
      caret: menu.end,
      sessionKey,
      targetNodeId: canvasMentions.targetNodeId,
      signal: task.signal,
      abort: () => task.abort(),
    };
    request.current = pending;
    if (!valid(pending)) return void dismiss(false);
    closeMenu({ restoreEditorFocus: true });
    setOpen(true);
  };
  const renderedRequest = request.current;
  const pick = (items) => {
    const pending = renderedRequest;
    if (request.current !== pending) return false;
    if (!valid(pending)) return void dismiss(false);
    const result = current.current.canvasMentions.importAssets(items, {
      signal: pending.signal,
      promptOverride: pending.value,
      expectedPrompts: [pending.basePrompt, pending.value],
      sessionKey: pending.sessionKey,
    });
    if (!valid(pending)) return false;
    if (!result || typeof result !== 'object' || typeof result.then === 'function') return false;
    const options = result.options || [];
    const tokens = options
      .map((option) => option.token)
      .filter(
        (token) =>
          typeof token === 'string' &&
          /^\{\{(?:Image|Portrait|Video|Audio|Mixed|Element) [1-9]\d*\}\}$/.test(token),
      );
    if (tokens.length) {
      const before = pending.value.slice(0, pending.start);
      const after = pending.value.slice(pending.end);
      const insertion = `${before.length && !before.endsWith(' ') ? ' ' : ''}${tokens.join(' ')}${after.startsWith(' ') ? '' : ' '}`;
      const next = replaceNodePromptRange(pending.value, pending.start, pending.end, insertion);
      editorRef.current.focus({ preventScroll: true });
      redraw(next.value, next.caret);
      savedSelection.current = { start: next.caret, end: next.caret };
      setMenu(null);
      change(next.value, next.caret, true);
      pending.caret = next.caret;
    }
    dismiss();
    return true;
  };
  return {
    available,
    open,
    portalTarget: editorRef.current?.ownerDocument.body,
    show,
    close: () => {
      if (request.current === renderedRequest) dismiss();
    },
    pick,
    assetSource: canvasMentions?.assetSource,
    isAssetDisabled: canvasMentions?.isAssetDisabled,
    onSelectDisabledAsset: canvasMentions?.onSelectDisabledAsset,
    getAssetCapacity: canvasMentions?.getAssetCapacity,
    getPreviewAsset: canvasMentions?.getPreviewAsset,
  };
}
