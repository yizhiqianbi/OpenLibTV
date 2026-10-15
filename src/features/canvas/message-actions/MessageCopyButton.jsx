import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MessageActionIcon from './MessageActionIcon.jsx';

/** Original 24px CopyN control with its top/arrow tooltip; native keyboard activation remains. */
export default function MessageCopyButton({ pending, onCopy }) {
  const id = useId();
  const button = useRef(null);
  const tooltip = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      const size = tooltip.current?.getBoundingClientRect();
      if (!anchor || !size) return;
      const top = anchor.top - size.height - 8;
      setPosition({
        left: Math.max(
          8,
          Math.min(
            anchor.left + anchor.width / 2 - size.width / 2,
            window.innerWidth - size.width - 8,
          ),
        ),
        top: top < 8 ? anchor.bottom + 8 : top,
        bottomSide: top < 8,
      });
    };
    const dismiss = () => setOpen(false);
    place();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="cv-message-copy"
        aria-label="复制"
        aria-describedby={open ? id : undefined}
        aria-busy={pending}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => void onCopy()}
      >
        <MessageActionIcon />
      </button>
      {open &&
        createPortal(
          <span
            ref={tooltip}
            id={id}
            role="tooltip"
            className="cv-message-copy-tooltip"
            data-side={position?.bottomSide ? 'bottom' : 'top'}
            style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
          >
            复制
          </span>,
          document.body,
        )}
    </>
  );
}
