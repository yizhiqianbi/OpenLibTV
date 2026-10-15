import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';

export default function SkillCreateMenu({ onCreate, primary = false }) {
  const [open, setOpen] = useState(false);
  const root = useRef();
  const timer = useRef();
  const stopTimer = () => clearTimeout(timer.current);
  useEffect(() => {
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('pointerdown', outside);
    };
  }, []);
  return (
    <div
      className={'sk-selector-create ' + (primary ? 'sk-selector-create-primary' : '')}
      ref={root}
      onMouseEnter={() => {
        stopTimer();
        setOpen(true);
      }}
      onMouseLeave={() => {
        stopTimer();
        timer.current = setTimeout(() => setOpen(false), 120);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          stopTimer();
          setOpen(true);
        }}
      >
        <Icon name="add" size={primary ? 16 : 11} /> {primary ? '创建Skill' : '创建'}{' '}
        <Icon name="down-s" size={14} />
      </button>
      {open && (
        <div className="sk-selector-create-menu" role="menu" aria-label="创建 Skill">
          {[
            ['chat', 'chat', '创建新的Skill', '通过与Agent对话创建'],
            ['custom', 'file-input', '导入已有Skill', '上传 .md 文件或文件夹'],
          ].map(([action, icon, name, description]) => (
            <button
              type="button"
              role="menuitem"
              key={action}
              onClick={() => {
                setOpen(false);
                onCreate(action);
              }}
            >
              <Icon name={icon} size={18} />
              <span>
                {name}
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
