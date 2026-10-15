let activeWrite = null;

/** Source-compatible text-only copy with a real legacy fallback and focus/selection restoration. */
export async function writeTextToClipboard(text, { signal } = {}) {
  activeWrite?.cancel();
  let canceled = false;
  let legacyCopy = false;
  const cancel = () => {
    canceled = true;
  };
  const write = { cancel };
  activeWrite = write;
  const userCopy = () => {
    if (!legacyCopy) cancel();
  };
  const assertCurrent = () => {
    if (canceled || signal?.aborted || activeWrite !== write)
      throw new DOMException('Clipboard write superseded', 'AbortError');
  };
  signal?.addEventListener('abort', cancel, { once: true });
  document.addEventListener('copy', userCopy, true);
  document.addEventListener('cut', userCopy, true);
  try {
    assertCurrent();
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        assertCurrent();
        return;
      } catch {
        assertCurrent();
      }
    }
    if (typeof document.execCommand !== 'function')
      throw new Error('Clipboard text write unavailable');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const input = opener instanceof HTMLInputElement || opener instanceof HTMLTextAreaElement;
    const caret =
      input && opener.selectionStart !== null
        ? {
            start: opener.selectionStart,
            end: opener.selectionEnd,
            direction: opener.selectionDirection,
          }
        : null;
    const selection = window.getSelection();
    const ranges = selection
      ? Array.from({ length: selection.rangeCount }, (_, index) =>
          selection.getRangeAt(index).cloneRange(),
        )
      : [];
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = 'position:fixed;top:0;opacity:0;pointer-events:none';
    document.body.appendChild(textarea);
    try {
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      assertCurrent();
      legacyCopy = true;
      const copied = document.execCommand('copy');
      legacyCopy = false;
      if (!copied) throw new Error('Clipboard copy failed');
      assertCurrent();
    } finally {
      const restore = document.activeElement === textarea;
      textarea.remove();
      if (restore) {
        if (opener?.isConnected) {
          opener.focus({ preventScroll: true });
          if (caret) opener.setSelectionRange(caret.start, caret.end, caret.direction || undefined);
        }
        if (selection) {
          selection.removeAllRanges();
          for (const range of ranges)
            if (range.commonAncestorContainer.isConnected) selection.addRange(range);
        }
      }
    }
  } finally {
    if (activeWrite === write) activeWrite = null;
    signal?.removeEventListener('abort', cancel);
    document.removeEventListener('copy', userCopy, true);
    document.removeEventListener('cut', userCopy, true);
  }
}
