import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  appendPromptBadgeSwapOverlay,
  isSwappablePromptBadge,
  PROMPT_BADGE_SWAP_SELECTOR,
  stripPromptBadgeSwapOverlays,
} from './prompt-badge-swap-dom.js';
import './prompt-badge-swap.css';

export function useNodePromptSwap({ editorRef, latest, menu, composing }, { onOpenSwap }) {
  const current = useRef({ menu, onOpenSwap });
  useLayoutEffect(() => {
    const menuClosed = current.current.menu && !menu;
    current.current = { menu, onOpenSwap };
    if (
      menuClosed ||
      latest.current.blocked ||
      latest.current.mentionEnabled === false ||
      composing.current
    )
      stripPromptBadgeSwapOverlays(editorRef.current);
  });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const allowed = () =>
      !latest.current.blocked && latest.current.mentionEnabled !== false && !composing.current;
    const findBadge = (target) => {
      const badge = target?.closest?.('[data-prompt-token]');
      return editor.contains(badge) && isSwappablePromptBadge(badge) ? badge : null;
    };
    const hover = (event) => {
      if (!allowed()) return stripPromptBadgeSwapOverlays(editor);
      if (current.current.menu) return;
      const badge = findBadge(event.target);
      const overlay = editor.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
      if (badge && overlay && badge.contains(overlay)) return;
      stripPromptBadgeSwapOverlays(editor);
      if (badge) appendPromptBadgeSwapOverlay(badge);
    };
    const leave = () => {
      if (!allowed() || !current.current.menu) stripPromptBadgeSwapOverlays(editor);
    };
    const click = (event) => {
      if (!allowed()) return stripPromptBadgeSwapOverlays(editor);
      const overlay = event.target?.closest?.(PROMPT_BADGE_SWAP_SELECTOR);
      if (!overlay || !editor.contains(overlay)) return;
      const badge = findBadge(overlay);
      if (!badge) return;
      event.preventDefault();
      event.stopPropagation();
      current.current.onOpenSwap?.(badge);
    };
    editor.addEventListener('pointerover', hover);
    editor.addEventListener('pointerleave', leave);
    editor.addEventListener('click', click);
    return () => {
      editor.removeEventListener('pointerover', hover);
      editor.removeEventListener('pointerleave', leave);
      editor.removeEventListener('click', click);
      stripPromptBadgeSwapOverlays(editor);
    };
  }, [editorRef, latest, composing]);
}
