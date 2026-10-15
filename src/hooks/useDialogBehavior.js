import { useEffect, useLayoutEffect, useRef } from 'react';
import { registerDialog } from '../services/dialog-stack.ts';

/** Shared focus, dismissal, background isolation and scroll-lock lifecycle. */
export function useDialogBehavior(
  containerRef,
  { onClose, closeOnEscape = true, enabled = true, initialFocus = 'container' } = {},
) {
  const latest = useRef({ onClose, closeOnEscape, initialFocus });
  const openingFocus = useRef(null);
  const enabledBeforeCommit = useRef(false);
  const replayFocus = useRef(null);
  // React applies autoFocus during commit, before passive effects register the dialog.
  // Capture the opener during render; only recapture after a committed disabled state.
  if (enabled && !enabledBeforeCommit.current)
    openingFocus.current = typeof document === 'undefined' ? null : document.activeElement;
  useLayoutEffect(() => {
    latest.current = { onClose, closeOnEscape, initialFocus };
    enabledBeforeCommit.current = enabled;
  }, [onClose, closeOnEscape, initialFocus, enabled]);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const container = containerRef.current;
    const resume = replayFocus.current;
    replayFocus.current = null;
    const unregister = registerDialog(container, () => latest.current, openingFocus.current);
    // StrictMode replays effects without removing the DOM. Preserve the original
    // auto-focused field while keeping the outside opener for the eventual close.
    if (resume?.isConnected && container.contains(resume)) resume.focus();
    return () => {
      const focused = document.activeElement;
      replayFocus.current =
        enabledBeforeCommit.current &&
        container.isConnected &&
        focused instanceof HTMLElement &&
        container.contains(focused)
          ? focused
          : null;
      unregister();
    };
  }, [containerRef, enabled]);
}
