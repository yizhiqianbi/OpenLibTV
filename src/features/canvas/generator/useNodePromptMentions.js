import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  findPromptMentionTrigger,
  listNodePromptReferences,
  replaceNodePromptRange,
} from './node-prompt-model.js';
import {
  createPromptBadge,
  disposePromptMedia,
  readPromptDOM,
  selectionOffsets,
} from './node-prompt-dom.js';
import { promptBadgeRange } from './prompt-badge-swap-dom.js';
import { commitCanvasMentionSelection } from './mentions-enhanced/candidate-model.js';

function menuPosition(rect, view, width = 240) {
  const below = view.innerHeight - rect.bottom - 4;
  const above = rect.top - 4;
  return {
    left: Math.max(4, Math.min(rect.left, view.innerWidth - width - 4)),
    ...(below >= 400 || below >= above
      ? { top: rect.bottom + 4 }
      : { bottom: view.innerHeight - rect.top + 4 }),
  };
}

export function useNodePromptMentions(
  { editorRef, latest, draft, composing, menu, setMenu, blocked, savedSelection, change, redraw },
  { references, mentionListType, mentionTypes, canvasMentions },
) {
  const menuRef = useRef(null);
  const [selected, setSelected] = useState(-1);
  const menuId = useId();
  const enhanced = !!canvasMentions?.source;
  const options = useMemo(
    () =>
      listNodePromptReferences(references, { mentionListType, mentionTypes }).filter(
        (option) => !menu?.swapBadge || (option.insertMode !== 'text' && option.type !== 'asset'),
      ),
    [references, mentionListType, mentionTypes, menu?.swapBadge],
  );
  useLayoutEffect(() => {
    if (
      menu &&
      (latest.current.blocked ||
        !latest.current.mentionEnabled ||
        composing.current ||
        (menu.swapBadge && !editorRef.current?.contains(menu.swapBadge)))
    )
      setMenu(null);
  });
  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!menu || !element) return;
    const width = element.getBoundingClientRect().width;
    if (!width) return;
    const left = Math.max(
      4,
      Math.min(menu.left, element.ownerDocument.defaultView.innerWidth - width - 4),
    );
    if (left !== menu.left) setMenu({ ...menu, left });
  }, [menu, setMenu]);
  useEffect(() => {
    if (!menu?.swapBadge) return;
    const editor = editorRef.current;
    const view = editor.ownerDocument.defaultView;
    const badge = menu.swapBadge;
    let frame;
    const follow = () => {
      if (!editor.contains(badge)) return void setMenu(null);
      const position = menuPosition(
        badge.getBoundingClientRect(),
        view,
        menuRef.current?.getBoundingClientRect().width || 240,
      );
      setMenu((current) => {
        if (current?.swapBadge !== badge) return current;
        return Math.abs(position.left - current.left) > 1 ||
          Math.abs((position.top ?? 0) - (current.top ?? 0)) > 1 ||
          Math.abs((position.bottom ?? 0) - (current.bottom ?? 0)) > 1
          ? { ...current, top: undefined, bottom: undefined, ...position }
          : current;
      });
      frame = view.requestAnimationFrame(follow);
    };
    frame = view.requestAnimationFrame(follow);
    return () => view.cancelAnimationFrame(frame);
  }, [menu?.swapBadge, editorRef, setMenu]);
  const openAtCaret = useCallback(() => {
    if (!latest.current.mentionEnabled || latest.current.blocked) return;
    const editor = editorRef.current;
    const caret = selectionOffsets(editor)?.start ?? draft.current.length;
    const trigger = findPromptMentionTrigger(draft.current, caret);
    if (!trigger) return void setMenu(null);
    const selection = editor.ownerDocument.defaultView?.getSelection();
    const rect = selection?.rangeCount
      ? (selection.getRangeAt(0).getBoundingClientRect?.() ?? editor.getBoundingClientRect())
      : editor.getBoundingClientRect();
    const view = editor.ownerDocument.defaultView;
    setMenu({
      ...trigger,
      ...menuPosition(rect, view),
    });
    setSelected(-1);
  }, [draft, editorRef, latest, setMenu]);

  const openSwap = useCallback(
    (badge) => {
      if (latest.current.blocked || !latest.current.mentionEnabled || composing.current) return;
      const editor = editorRef.current;
      const range = promptBadgeRange(editor, badge);
      if (!range || readPromptDOM(editor) !== draft.current) return;
      setMenu({
        ...range,
        originalToken: badge.dataset.promptToken,
        swapBadge: badge,
        ...menuPosition(badge.getBoundingClientRect(), editor.ownerDocument.defaultView),
      });
      setSelected(-1);
    },
    [latest, composing, editorRef, draft, setMenu],
  );
  const rangeIsCurrent = useCallback(() => {
    if (!menu) return false;
    if (!menu.swapBadge) return true;
    const current = promptBadgeRange(editorRef.current, menu.swapBadge);
    return (
      current?.start === menu.start &&
      current?.end === menu.end &&
      draft.current.slice(menu.start, menu.end) === menu.originalToken
    );
  }, [menu, editorRef, draft]);
  const commitSwap = useCallback(
    (option) => {
      if (
        !menu?.swapBadge ||
        latest.current.blocked ||
        !latest.current.mentionEnabled ||
        composing.current ||
        !rangeIsCurrent()
      )
        return void setMenu(null);
      const badge = menu.swapBadge;
      const replacement = createPromptBadge(
        editorRef.current.ownerDocument,
        option,
        latest.current.asset,
        latest.current.blocked,
      );
      disposePromptMedia(badge);
      badge.replaceWith(replacement);
      const next = readPromptDOM(editorRef.current);
      setMenu(null);
      change(next, menu.start + option.token.length, true);
    },
    [menu, rangeIsCurrent, setMenu, editorRef, latest, composing, change],
  );

  const selectReference = useCallback(
    (option) => {
      if (!menu || latest.current.blocked || !latest.current.mentionEnabled || composing.current)
        return;
      if (!rangeIsCurrent()) return void setMenu(null);
      if (menu.swapBadge) return void commitSwap(option);
      const next = replaceNodePromptRange(draft.current, menu.start, menu.end, option.token);
      editorRef.current.focus({ preventScroll: true });
      redraw(next.value, next.caret);
      savedSelection.current = { start: next.caret, end: next.caret };
      setMenu(null);
      change(next.value, next.caret, true);
    },
    [
      menu,
      change,
      redraw,
      draft,
      editorRef,
      latest,
      composing,
      savedSelection,
      setMenu,
      rangeIsCurrent,
      commitSwap,
    ],
  );

  const closeMenu = useCallback(
    (options) => {
      if (options?.restoreEditorFocus && menu && !menu.swapBadge && !latest.current.blocked) {
        editorRef.current.focus({ preventScroll: true });
        redraw(draft.current, menu.end);
      }
      setMenu(null);
    },
    [menu, latest, editorRef, redraw, draft, setMenu],
  );
  const selectCanvasReference = useCallback(
    (reference) => {
      if (!menu || latest.current.blocked || !latest.current.mentionEnabled || composing.current)
        return;
      if (!rangeIsCurrent()) return void closeMenu();
      if (menu.swapBadge && reference.kind === 'text') return;
      const commit = (insertion) => {
        if (latest.current.blocked || !latest.current.mentionEnabled || composing.current) return;
        const next = replaceNodePromptRange(draft.current, menu.start, menu.end, insertion);
        editorRef.current.focus({ preventScroll: true });
        redraw(next.value, next.caret);
        savedSelection.current = { start: next.caret, end: next.caret };
        setMenu(null);
        change(next.value, next.caret, true);
      };
      try {
        return commitCanvasMentionSelection({
          reference,
          targetNodeId: canvasMentions.targetNodeId,
          connect: canvasMentions.connect,
          getLatestReference: canvasMentions.getLatestReference,
          insertMention: (option) => {
            if (
              typeof option.token !== 'string' ||
              !/^\{\{(?:Image|Portrait|Video|Audio|Mixed|Element) [1-9]\d*\}\}$/.test(option.token)
            )
              return void closeMenu();
            if (menu.swapBadge) return void commitSwap(option);
            const before = draft.current.slice(0, menu.start);
            const after = draft.current.slice(menu.end);
            commit(
              `${before.length && !before.endsWith(' ') ? ' ' : ''}${option.token}${after.startsWith(' ') ? '' : ' '}`,
            );
          },
          consumeTextTrigger: () => commit(''),
          onConnectFailed: canvasMentions.onConnectFailed,
          onConnectedWithoutMention: closeMenu,
        });
      } catch (error) {
        canvasMentions.onConnectFailed?.(error);
        return 'connectFailed';
      }
    },
    [
      menu,
      latest,
      canvasMentions,
      composing,
      closeMenu,
      draft,
      editorRef,
      redraw,
      savedSelection,
      setMenu,
      change,
      rangeIsCurrent,
      commitSwap,
    ],
  );

  useEffect(() => {
    if (!menu || blocked || enhanced) return;
    const outside = (event) => {
      if (event.target.closest?.('[data-popover-safe]')) return;
      if (!menuRef.current?.contains(event.target)) setMenu(null);
    };
    const keyboard = (event) => {
      if (event.isComposing || composing.current || event.altKey || event.ctrlKey || event.metaKey)
        return;
      if (event.key === 'Escape') (event.preventDefault(), event.stopPropagation(), setMenu(null));
      else if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        setSelected((index) => Math.min(index + 1, options.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setSelected((index) => (index <= 0 ? -1 : index - 1));
      } else if (event.key === 'Enter' && selected >= 0 && options[selected]) {
        event.preventDefault();
        event.stopPropagation();
        selectReference(options[selected]);
      } else if (/^[1-9]$/.test(event.key) && options[Number(event.key) - 1]) {
        event.preventDefault();
        event.stopPropagation();
        selectReference(options[Number(event.key) - 1]);
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', keyboard, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', keyboard, true);
    };
  }, [menu, blocked, enhanced, selected, options, selectReference, composing, setMenu]);

  return {
    menuRef,
    menuId,
    selected,
    options,
    openAtCaret,
    openSwap,
    selectReference,
    selectCanvasReference,
    closeMenu,
    enhanced,
  };
}
