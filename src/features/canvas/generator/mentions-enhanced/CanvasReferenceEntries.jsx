import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CanvasReferencePreview } from './CanvasReferencePreview.jsx';

export function CanvasReferenceOption({
  option,
  activeNodeId,
  keyboardOptions,
  onSelect,
  asset,
  portalTarget,
}) {
  const disabled = !!option.disabledReason;
  const reason =
    option.disabledReason === 'limit'
      ? '参考数量已达上限'
      : option.disabledReason === 'modelUnsupported'
        ? '当前模型不支持该素材作为参考'
        : undefined;
  const index = keyboardOptions.findIndex((candidate) => candidate.nodeId === option.nodeId);
  return (
    <button
      type="button"
      role="option"
      data-index={index >= 0 ? index : undefined}
      data-node-id={option.nodeId}
      aria-selected={activeNodeId === option.nodeId}
      disabled={disabled}
      title={reason}
      className={`node-reference-option ${activeNodeId === option.nodeId ? 'is-active' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => !disabled && onSelect(option)}
    >
      <CanvasReferencePreview option={option} asset={asset} portalTarget={portalTarget} />
      <span>{option.label}</span>
    </button>
  );
}

/** Source list uses 30/36/64px rows and overscan8 when entries exceed50. */
export function CanvasReferenceEntries({
  entries,
  maxHeight,
  activeNodeId,
  keyboardOptions,
  onSelect,
  asset,
  portalTarget,
}) {
  const viewportRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(maxHeight);
  const virtual = entries.length > 50;
  const layout = useMemo(() => {
    let offset = 0;
    return entries.map((entry) => {
      const size = entry.type === 'heading' ? 30 : entry.type === 'empty' ? 64 : 36;
      const row = { entry, top: offset, size };
      offset += size;
      return row;
    });
  }, [entries]);
  const totalHeight = layout.at(-1)?.top + layout.at(-1)?.size || 0;
  useLayoutEffect(() => {
    const element = viewportRef.current;
    const update = () => setHeight(element.clientHeight || maxHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [maxHeight]);
  useEffect(() => {
    if (!activeNodeId) return;
    const row = layout.find((value) => value.entry.option?.nodeId === activeNodeId);
    const element = viewportRef.current;
    if (!row || !element) return;
    const top =
      row.top < element.scrollTop
        ? row.top
        : row.top + row.size > element.scrollTop + height
          ? row.top + row.size - height
          : element.scrollTop;
    if (top !== element.scrollTop) {
      element.scrollTop = top;
      setScrollTop(top);
    }
  }, [activeNodeId, layout, height]);
  let start = virtual
    ? Math.max(0, layout.findIndex((row) => row.top + row.size > scrollTop) - 8)
    : 0;
  if (start < 0) start = 0;
  const last = virtual ? layout.findIndex((row) => row.top > scrollTop + height) : layout.length;
  const end = virtual && last >= 0 ? Math.min(layout.length, last + 8) : layout.length;
  return (
    <div
      ref={viewportRef}
      className="node-reference-entries"
      style={{ maxHeight, ...(virtual ? { height: maxHeight } : {}) }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={virtual ? { position: 'relative', height: totalHeight } : undefined}>
        {layout.slice(start, end).map(({ entry, top, size }) => (
          <div
            key={entry.key}
            style={virtual ? { position: 'absolute', top, height: size, width: '100%' } : undefined}
          >
            {entry.type === 'heading' ? (
              <div className="node-reference-heading">{entry.label}</div>
            ) : entry.type === 'empty' ? (
              <div className="node-reference-empty">{entry.label}</div>
            ) : (
              <CanvasReferenceOption
                option={entry.option}
                activeNodeId={activeNodeId}
                keyboardOptions={keyboardOptions}
                onSelect={onSelect}
                asset={asset}
                portalTarget={portalTarget}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
