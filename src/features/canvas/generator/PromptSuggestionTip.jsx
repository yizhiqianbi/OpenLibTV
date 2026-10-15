import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PromptSuggestionTip({ presentation, portalTarget }) {
  const [position, setPosition] = useState(null);
  const element = useRef(null);
  const positioned = !!position;
  useLayoutEffect(() => {
    const anchor = presentation?.anchor;
    if (!anchor?.isConnected || !presentation.showTip) return;
    const update = () => {
      if (!anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const tipRect = element.current?.getBoundingClientRect();
      const halfWidth = (tipRect?.width || Math.min(320, window.innerWidth - 16)) / 2;
      const height = tipRect?.height || 30;
      const below = rect.top - height - 8 < 8;
      setPosition({
        left: Math.max(
          halfWidth + 8,
          Math.min(rect.left + rect.width / 2, window.innerWidth - halfWidth - 8),
        ),
        top: below
          ? Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8))
          : rect.top - 8,
        below,
      });
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, [presentation, positioned]);
  if (!presentation?.showTip || !presentation.anchor.isConnected || !position) return null;
  return createPortal(
    <div
      ref={element}
      role="tooltip"
      className="node-prompt-suggestion-tip"
      data-placement={position.below ? 'bottom' : 'top'}
      style={{ left: position.left, top: position.top }}
    >
      {presentation.text}
    </div>,
    portalTarget?.() || document.body,
  );
}
