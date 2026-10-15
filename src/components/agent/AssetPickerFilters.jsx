import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from '../../hooks/useDialogBehavior.js';
import { DialogFocusBoundary } from '../DialogFocusBoundary.jsx';

/** Source 195076: editable filter snapshot, reset/cancel/apply; no tag or membership writes. */
export default function AssetPickerFilters({ anchor, tags, members, value, onApply, onClose }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(() => ({
    tagNames: [...value.tagNames],
    memberUserIds: [...value.memberUserIds],
  }));
  const [position, setPosition] = useState({ right: 16, top: 80 });
  useDialogBehavior(ref, { onClose });
  useLayoutEffect(() => {
    const locate = () => {
      const bounds = anchor.current?.getBoundingClientRect();
      if (!bounds) return;
      setPosition({
        left: Math.max(8, Math.min(bounds.right - 300, window.innerWidth - 308)),
        top: Math.max(
          8,
          Math.min(bounds.bottom + 10, window.innerHeight - (ref.current?.offsetHeight || 300) - 8),
        ),
      });
    };
    locate();
    window.addEventListener('resize', locate);
    return () => window.removeEventListener('resize', locate);
  }, [anchor]);
  const toggle = (key, id) =>
    setDraft((previous) => ({
      ...previous,
      [key]: previous[key].includes(id)
        ? previous[key].filter((value) => value !== id)
        : [...previous[key], id],
    }));
  return createPortal(
    <div
      className="modal-overlay agent-asset-filter-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className="agent-asset-filter-panel"
        style={position}
        role="dialog"
        aria-modal="true"
        aria-label="筛选资产"
        tabIndex={-1}
      >
        <DialogFocusBoundary edge="start" />
        <header>
          <strong>筛选</strong>
          <button
            type="button"
            disabled={!draft.tagNames.length && !draft.memberUserIds.length}
            onClick={() => setDraft({ tagNames: [], memberUserIds: [] })}
          >
            重置
          </button>
        </header>
        <p>标签</p>
        <div className="agent-asset-tag-options">
          {tags.map((tag) => (
            <button
              type="button"
              key={tag.name}
              aria-pressed={draft.tagNames.includes(tag.name)}
              onClick={() => toggle('tagNames', tag.name)}
            >
              {tag.name}
            </button>
          ))}
          {!tags.length && <span className="muted">暂无标签</span>}
        </div>
        {members && (
          <>
            <p>按成员筛选</p>
            <div className="agent-asset-member-options">
              {members.map((member) => (
                <label key={member.id}>
                  <input
                    type="checkbox"
                    checked={draft.memberUserIds.includes(member.id)}
                    onChange={() => toggle('memberUserIds', member.id)}
                  />
                  {member.name}
                </label>
              ))}
              {!members.length && <span className="muted">暂无成员</span>}
            </div>
          </>
        )}
        <footer>
          <button type="button" className="soft-button" onClick={onClose}>
            取消
          </button>
          <button type="button" className="white-button" onClick={() => onApply(draft)}>
            应用
          </button>
        </footer>
        <DialogFocusBoundary edge="end" />
      </section>
    </div>,
    document.body,
  );
}
