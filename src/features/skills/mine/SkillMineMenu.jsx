import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/Icon.jsx';

export default function SkillMineMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({});
  const trigger = useRef(null),
    panel = useRef(null),
    timer = useRef(null);
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  const show = () => {
    clearTimeout(timer.current);
    const bounds = trigger.current?.getBoundingClientRect();
    if (bounds)
      setPosition({
        top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 200)),
        left: Math.max(8, Math.min(bounds.right - 132, window.innerWidth - 140)),
      });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event) => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const enter = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(show, 80);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 120);
  };
  const items = [
    ['查看详情', 'detail', actions.onDetail],
    ['在对话中编辑', 'edit', actions.onEditInChat],
    ['编辑', 'edit', actions.onEdit],
    [actions.state.hasPublishedSnapshot ? '更新发布' : '发布', 'publish', actions.onPublish],
    ['删除', 'delete', actions.onDelete],
  ];
  const keyboard = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      trigger.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = Array.from(
        panel.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [],
      );
      const index = buttons.indexOf(document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : index < 0
              ? event.key === 'ArrowUp'
                ? buttons.length - 1
                : 0
              : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onKeyDown={keyboard}
        onClick={(event) => {
          event.stopPropagation();
          show();
        }}
      >
        <Icon name="more" size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label="我的 Skill 操作"
            className="sk-mine-menu"
            style={position}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={leave}
            onKeyDown={keyboard}
            onBlur={(event) => {
              if (
                !panel.current?.contains(event.relatedTarget) &&
                event.relatedTarget !== trigger.current
              )
                close();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {items.map(([label, permission, callback]) => (
              <button
                type="button"
                role="menuitem"
                key={label}
                disabled={actions.state[permission + 'Disabled'] || !callback}
                title={actions.state[permission + 'Reason'] || ''}
                className={permission === 'delete' ? 'danger' : ''}
                onClick={() => {
                  trigger.current?.focus();
                  close();
                  callback?.();
                }}
              >
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
