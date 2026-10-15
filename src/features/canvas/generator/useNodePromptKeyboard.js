import { useEffect, useLayoutEffect, useRef } from 'react';
import { parseNodePrompt, replaceNodePromptRange } from './node-prompt-model.js';
import { selectionOffsets } from './node-prompt-dom.js';

export function useNodePromptKeyboard(
  { editorRef, latest, composing, draft, blocked, insert, redraw, change, restoreHistory },
  suggestions,
) {
  const eventHandlers = useRef({});
  useLayoutEffect(() => {
    eventHandlers.current.beforeInput = (event) => {
      if (latest.current.blocked || composing.current || event.isComposing) return;
      suggestions?.dismiss();
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
        event.preventDefault();
        insert('\n');
      } else if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        restoreHistory(event.inputType === 'historyUndo' ? -1 : 1);
      } else if (
        event.inputType === 'deleteContentBackward' ||
        event.inputType === 'deleteContentForward'
      ) {
        const offsets = selectionOffsets(editorRef.current);
        if (!offsets) return;
        const backward = event.inputType === 'deleteContentBackward';
        const start =
          offsets.start === offsets.end && backward
            ? Math.max(0, offsets.start - 1)
            : offsets.start;
        const end = offsets.start === offsets.end && !backward ? offsets.end + 1 : offsets.end;
        const next = replaceNodePromptRange(draft.current, start, end, '', {
          magicList: latest.current.magicList,
        });
        const intersectsBadge = parseNodePrompt(
          draft.current,
          {},
          { magicList: latest.current.magicList },
        ).some(
          (part) =>
            ['reference', 'magic'].includes(part.kind) &&
            next.value.length < draft.current.length - (end - start),
        );
        if (intersectsBadge) {
          event.preventDefault();
          redraw(next.value, next.caret);
          change(next.value, next.caret, true);
        }
      }
    };
    eventHandlers.current.keyDown = (event) => {
      if (latest.current.blocked || composing.current || event.isComposing) return;
      if (suggestions?.handleKeyDown(event)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopPropagation();
        restoreHistory(event.shiftKey ? 1 : -1);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'y'
      ) {
        event.preventDefault();
        event.stopPropagation();
        restoreHistory(1);
      }
      // Ordinary source renderers do not supply onEnterSubmit: Enter remains a line break.
    };
  }, [insert, change, redraw, restoreHistory, composing, draft, editorRef, latest, suggestions]);

  useEffect(() => {
    if (blocked) return;
    const editor = editorRef.current;
    const before = (event) => eventHandlers.current.beforeInput(event);
    const key = (event) => eventHandlers.current.keyDown(event);
    editor.addEventListener('beforeinput', before);
    editor.addEventListener('keydown', key);
    return () => {
      editor.removeEventListener('beforeinput', before);
      editor.removeEventListener('keydown', key);
    };
  }, [blocked, editorRef]);
}
