import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Pencil } from 'lucide-react';
import { iconFor } from '../catalog.jsx';
import { createElement } from 'react';
import { revealStudioRow, toggleStudioSubtree, visibleStudioRows } from './model.js';
import './outliner.css';

export function StudioEntityName({ row, onRename, request = 0, always = false }) {
  const [editing, setEditing] = useState(always),
    [draft, setDraft] = useState(row.name),
    [error, setError] = useState('');
  const input = useRef(null),
    done = useRef(false),
    lastRequest = useRef(0);
  useEffect(() => {
    setDraft(row.name);
    setError('');
  }, [row.name]);
  useEffect(() => {
    if (!request || request === lastRequest.current) return;
    lastRequest.current = request;
    done.current = false;
    setDraft(row.name);
    setError('');
    setEditing(true);
  }, [request, row.name]);
  useEffect(() => {
    if (editing && !always) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing, always]);
  const finish = (save) => {
    if (done.current) return;
    if (save) {
      const message = onRename(row.id, draft);
      if (message) {
        setError(message);
        input.current?.focus();
        return;
      }
    } else setDraft(row.name);
    done.current = true;
    setError('');
    if (!always) setEditing(false);
  };
  return editing || always ? (
    <>
      <input
        ref={input}
        aria-label={always ? '名称' : `对象名称 ${row.name || row.type}`}
        aria-invalid={Boolean(error)}
        title={error || undefined}
        className="cv-studio-entity-name-input"
        value={draft}
        maxLength={128}
        onFocus={() => {
          done.current = false;
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setError('');
          done.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing || !['Enter', 'Escape'].includes(event.key)) return;
          event.preventDefault();
          finish(event.key === 'Enter');
          if (done.current) event.currentTarget.closest('[role="treeitem"]')?.focus();
        }}
      />
      {error && (
        <span className="cv-studio-name-error" role="alert">
          {error}
        </span>
      )}
    </>
  ) : (
    <span
      className="cv-studio-tree-label"
      title={row.name || row.type}
      onDoubleClick={(event) => {
        event.stopPropagation();
        done.current = false;
        setDraft(row.name);
        setEditing(true);
      }}
    >
      {row.name || row.type}
    </span>
  );
}

function OutlinerRow({
  row,
  selected,
  tabbable,
  select,
  toggle,
  onToggleHidden,
  onRename,
  onKeyDown,
  labels,
  rowRef,
}) {
  const [renameRequest, setRenameRequest] = useState(0);
  const hiddenBy =
    row.visible !== false && row.hiddenByAncestorId ? labels.get(row.hiddenByAncestorId) : null;
  return (
    <div
      ref={rowRef}
      role="treeitem"
      data-outliner-id={row.id}
      aria-level={row.depth + 1}
      aria-selected={selected}
      aria-expanded={row.childCount ? !row.collapsed : undefined}
      tabIndex={tabbable ? 0 : -1}
      className={`cv-studio-tree-row${selected ? ' active' : ''}`}
      style={{ paddingLeft: `${6 + row.depth * 16}px` }}
      data-hidden={row.visible === false || Boolean(hiddenBy)}
      onClick={() => select(row.id)}
      onDoubleClick={() => select(row.id, true)}
      onKeyDown={onKeyDown}
    >
      {row.childCount ? (
        <button
          type="button"
          tabIndex={-1}
          className="cv-studio-tree-toggle"
          aria-label={`${row.collapsed ? '展开' : '折叠'} ${row.name || row.type}`}
          title={`${row.collapsed ? '展开' : '折叠'} · Alt 操作整个子树`}
          onClick={(event) => {
            event.stopPropagation();
            toggle(row.id, event.altKey);
          }}
        >
          <ChevronDown
            size={12}
            style={{ transform: row.collapsed ? 'rotate(-90deg)' : undefined }}
          />
        </button>
      ) : (
        <span className="cv-studio-tree-indent" aria-hidden="true" />
      )}
      {createElement(iconFor(row), { size: 13 })}
      <StudioEntityName row={row} onRename={onRename} request={renameRequest} />
      {row.collapsed && <span className="cv-studio-tree-count">{row.descendantCount}</span>}
      <button
        type="button"
        tabIndex={-1}
        className="cv-studio-tree-rename"
        aria-label={`重命名 ${row.name || row.type}`}
        onClick={(event) => {
          event.stopPropagation();
          setRenameRequest((value) => value + 1);
        }}
      >
        <Pencil size={12} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="cv-studio-tree-visibility"
        aria-label={
          hiddenBy
            ? `选择隐藏的上级 ${hiddenBy}`
            : `${row.visible === false ? '显示' : '隐藏'} ${row.name || row.type}`
        }
        title={
          hiddenBy
            ? `随 ${hiddenBy} 隐藏 — 点击定位上级`
            : `${row.visible === false ? '显示' : '隐藏'} (H)`
        }
        onClick={(event) => {
          event.stopPropagation();
          hiddenBy ? select(row.hiddenByAncestorId) : onToggleHidden(row.id);
        }}
      >
        {row.visible === false || hiddenBy ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  );
}

export function StudioOutliner({
  rows,
  selected,
  setSelected,
  query,
  onToggleHidden,
  onRename,
  onFocus,
}) {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const refs = useRef(new Map());
  const shown = useMemo(() => visibleStudioRows(rows, collapsed, query), [rows, collapsed, query]);
  const labels = useMemo(() => new Map(rows.map((row) => [row.id, row.name || row.type])), [rows]);
  useEffect(() => {
    setCollapsed((previous) => revealStudioRow(rows, previous, selected));
  }, [rows, selected]);
  const select = (id, focusViewport = false) => {
    setSelected(id);
    refs.current.get(id)?.focus({ preventScroll: true });
    if (focusViewport) onFocus?.(id);
  };
  const toggle = (id, recursive = false) =>
    setCollapsed((previous) => toggleStudioSubtree(rows, previous, id, recursive));
  const tabbable = shown.some((row) => row.id === selected) ? selected : shown[0]?.id;
  return (
    <div className="cv-studio-outliner cv-studio-source-tree" role="tree" aria-label="场景对象">
      {shown.map((row, index) => (
        <OutlinerRow
          key={row.id}
          row={row}
          selected={row.id === selected}
          tabbable={row.id === tabbable}
          select={select}
          toggle={toggle}
          onToggleHidden={onToggleHidden}
          onRename={onRename}
          labels={labels}
          rowRef={(node) => {
            node ? refs.current.set(row.id, node) : refs.current.delete(row.id);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
            const go = (offset) => {
              const next = shown[index + offset];
              if (next) select(next.id);
            };
            switch (event.key) {
              case 'ArrowDown':
                go(1);
                break;
              case 'ArrowUp':
                go(-1);
                break;
              case 'Home':
                go(-index);
                break;
              case 'End':
                go(shown.length - 1 - index);
                break;
              case 'ArrowRight':
                if (!row.childCount) return;
                row.collapsed ? toggle(row.id, event.altKey) : go(1);
                break;
              case 'ArrowLeft':
                if (row.childCount && !row.collapsed) toggle(row.id, event.altKey);
                else if (row.parentId) select(row.parentId);
                else return;
                break;
              case 'h':
              case 'H':
                onToggleHidden(row.id);
                break;
              default:
                return;
            }
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      ))}
      {!rows.length && <p>暂无资产</p>}
      {rows.length > 0 && !shown.length && <p>没有匹配“{query.trim()}”的对象</p>}
    </div>
  );
}
