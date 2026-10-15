import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';

function fileTree(files) {
  const roots = [],
    folders = new Map();
  for (const file of files) {
    let children = roots,
      parent = '';
    const segments = file.path.split('/');
    for (const name of segments.slice(0, -1)) {
      parent = parent ? `${parent}/${name}` : name;
      if (!folders.has(parent)) {
        const folder = { path: parent, name, children: [], directory: true };
        folders.set(parent, folder);
        children.push(folder);
      }
      children = folders.get(parent).children;
    }
    children.push({ path: file.path, name: segments.at(-1), directory: false });
  }
  return roots;
}

export default function SkillFileMenu({ files, current, onSelect }) {
  const [opened, setOpened] = useState(false),
    [collapsed, setCollapsed] = useState(new Set()),
    menu = useRef(null),
    trigger = useRef(null),
    focusLast = useRef(false),
    nodes = useMemo(() => fileTree(files), [files]);
  useEffect(() => {
    if (!opened) return;
    const buttons = menu.current?.querySelectorAll('[role="menuitem"]');
    buttons?.[focusLast.current ? buttons.length - 1 : 0]?.focus();
    function pointerDown(event) {
      if (!menu.current?.contains(event.target)) setOpened(false);
    }
    function keyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpened(false);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', pointerDown);
    document.addEventListener('keydown', keyDown, true);
    return () => {
      document.removeEventListener('pointerdown', pointerDown);
      document.removeEventListener('keydown', keyDown, true);
    };
  }, [opened]);
  function renderNodes(entries, depth = 0) {
    return entries.map((entry) => {
      const closed = collapsed.has(entry.path);
      return (
        <React.Fragment key={entry.path}>
          <button
            role="menuitem"
            title={entry.path}
            aria-expanded={entry.directory ? !closed : undefined}
            aria-current={entry.path === current?.path ? 'page' : undefined}
            className={entry.path === current?.path ? 'active' : ''}
            style={{ paddingLeft: 8 + 22 * depth }}
            onClick={() => {
              if (entry.directory) {
                setCollapsed((old) => {
                  const next = new Set(old);
                  next.has(entry.path) ? next.delete(entry.path) : next.add(entry.path);
                  return next;
                });
                return;
              }
              onSelect(entry.path);
              setOpened(false);
              trigger.current?.focus();
            }}
          >
            {entry.directory ? (
              <>
                <ChevronDown
                  size={14}
                  style={{ transform: closed ? 'rotate(-90deg)' : undefined }}
                />
                {closed ? <Folder size={16} /> : <FolderOpen size={16} />}
              </>
            ) : (
              <FileText size={16} />
            )}
            <span>{entry.name}</span>
          </button>
          {entry.directory && !closed && renderNodes(entry.children, depth + 1)}
        </React.Fragment>
      );
    });
  }
  return (
    <div className="secondary-skill-read-files" ref={menu}>
      <button
        ref={trigger}
        aria-label="选择 Skill 文件"
        aria-haspopup="menu"
        aria-expanded={opened}
        onClick={() => {
          focusLast.current = false;
          setOpened((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          focusLast.current = event.key === 'ArrowUp';
          setOpened(true);
        }}
      >
        <FileText size={16} />
        <span>{current?.path.split('/').at(-1)}</span>
        <ChevronDown size={16} />
      </button>
      {opened && (
        <div
          role="menu"
          aria-label="Skill 文件"
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = [...event.currentTarget.querySelectorAll('[role="menuitem"]')],
              index = buttons.indexOf(document.activeElement),
              next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                      buttons.length;
            buttons[next]?.focus();
          }}
        >
          {renderNodes(nodes)}
        </div>
      )}
    </div>
  );
}
