import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { DialogFocusBoundary } from '../../../../components/DialogFocusBoundary.jsx';
import { useDialogBehavior } from '../../../../hooks/useDialogBehavior.js';

export const identityRoleAsset = (url) => url;

export function RoleReadState({ loading, error, retry, empty, children }) {
  if (error)
    return (
      <div className="cv-role-error" role="alert">
        <p>{error}</p>
        {retry && <button onClick={retry}>重试</button>}
        {children}
      </div>
    );
  if (loading)
    return (
      <div className="cv-role-empty" role="status">
        <LoaderCircle size={20} className="cv-role-spinner" />
        <span>加载中…</span>
      </div>
    );
  return empty ? <div className="cv-role-empty">{empty}</div> : null;
}

export function RolePagination({ page, pageSize, pageSizes, total, onPage, onPageSize }) {
  const [jump, setJump] = useState('');
  const count = Math.max(1, Math.ceil(total / pageSize));
  if (total <= 0) return null;
  const numbers = [
    ...new Set([
      1,
      ...Array.from(
        { length: Math.min(5, count) },
        (_, index) => Math.max(1, Math.min(count - 4, page - 2)) + index,
      ),
      count,
    ]),
  ].filter((number) => number <= count);
  return (
    <div className="cv-role-pagination">
      <nav aria-label="素材分页">
        <button aria-label="上一页" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} />
        </button>
        {numbers.map((number, index) => (
          <span key={number}>
            {index > 0 && number - numbers[index - 1] > 1 && (
              <span className="cv-role-dots">…</span>
            )}
            <button
              aria-label={`第${number}页`}
              aria-current={number === page ? 'page' : undefined}
              onClick={() => onPage(number)}
            >
              {number}
            </button>
          </span>
        ))}
        <button aria-label="下一页" disabled={page >= count} onClick={() => onPage(page + 1)}>
          <ChevronRight size={14} />
        </button>
      </nav>
      <select
        aria-label="每页素材数量"
        value={pageSize}
        onChange={(event) => onPageSize(Number(event.target.value))}
      >
        {pageSizes.map((size) => (
          <option key={size} value={size}>
            {size}条/页
          </option>
        ))}
      </select>
      {count > 1 && (
        <label>
          跳至
          <input
            aria-label="跳至页码"
            inputMode="numeric"
            value={jump}
            onChange={(event) => setJump(event.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              const value = Number(jump);
              if (Number.isInteger(value) && value >= 1 && value <= count) onPage(value);
              setJump('');
              event.currentTarget.blur();
            }}
          />
          页
        </label>
      )}
    </div>
  );
}

/** Public preview has its own source layout; all overlays use the shared stack. */
export function RoleMediaPreview({
  item,
  asset = identityRoleAsset,
  onClose,
  onPrevious,
  onNext,
  position,
  total,
  publicPreview = false,
}) {
  const ref = useRef(null);
  const video = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const gesture = useRef(null);
  useDialogBehavior(ref, { onClose });
  useEffect(() => {
    const element = ref.current;
    const key = (event) => {
      if (event.defaultPrevented || !element?.contains(document.activeElement)) return;
      if (event.key === 'ArrowLeft' && onPrevious) {
        event.preventDefault();
        onPrevious();
      }
      if (event.key === 'ArrowRight' && onNext) {
        event.preventDefault();
        onNext();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onPrevious, onNext]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.play()?.catch(() => {});
    return () => {
      element.pause();
      element.removeAttribute('src');
      element.load();
    };
  }, [item.assetUrl]);
  const url = item.assetUrl ?? item.url;
  const type = item.assetType ?? 'image';
  return createPortal(
    <div
      className={`cv-role-preview nopan ${publicPreview ? 'cv-role-public-preview' : ''}`}
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="素材预览"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <DialogFocusBoundary edge="start" />
        <button className="cv-role-preview-close" aria-label="关闭素材预览" onClick={onClose}>
          <X size={20} />
        </button>
        {onPrevious && (
          <button className="cv-role-preview-prev" aria-label="上一张" onClick={onPrevious}>
            <ChevronLeft size={20} />
          </button>
        )}
        {onNext && (
          <button className="cv-role-preview-next" aria-label="下一张" onClick={onNext}>
            <ChevronRight size={20} />
          </button>
        )}
        {item.name && <div className="cv-role-preview-name">{item.name}</div>}
        {type === 'image' ? (
          <div
            className="cv-role-preview-image"
            onWheel={(event) => {
              if (publicPreview || (!event.ctrlKey && !event.metaKey)) return;
              event.preventDefault();
              setScale((value) =>
                Math.max(0.5, Math.min(5, value + (event.deltaY > 0 ? -0.06 : 0.06))),
              );
            }}
            onPointerDown={(event) => {
              if (publicPreview || event.button !== 0) return;
              gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, offset };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = gesture.current;
              if (!start || start.id !== event.pointerId) return;
              const box = event.currentTarget.getBoundingClientRect();
              const maxX = Math.max(0, (box.width * (scale - 1)) / 2),
                maxY = Math.max(0, (box.height * (scale - 1)) / 2);
              setOffset({
                x: Math.max(-maxX, Math.min(maxX, start.offset.x + event.clientX - start.x)),
                y: Math.max(-maxY, Math.min(maxY, start.offset.y + event.clientY - start.y)),
              });
            }}
            onPointerUp={(event) => {
              if (gesture.current?.id !== event.pointerId) return;
              gesture.current = null;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
          >
            <img
              src={asset(url)}
              alt={item.name || '参考图片'}
              draggable={false}
              style={
                publicPreview
                  ? undefined
                  : { transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})` }
              }
              onDoubleClick={() => {
                if (!publicPreview) {
                  setScale(1);
                  setOffset({ x: 0, y: 0 });
                }
              }}
            />
          </div>
        ) : type === 'video' ? (
          <video ref={video} src={asset(url)} controls playsInline tabIndex={0} />
        ) : (
          <audio src={asset(url)} controls tabIndex={0} />
        )}
        {position !== undefined && (
          <div className="cv-role-preview-count">
            {position + 1} / {total}
          </div>
        )}
        <DialogFocusBoundary edge="end" />
      </section>
    </div>,
    document.body,
  );
}
