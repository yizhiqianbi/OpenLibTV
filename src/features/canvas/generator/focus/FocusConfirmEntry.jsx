import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const defaultLoader = () => import('./CanvasFocusConfirmBar.jsx');
const modules = new WeakMap();
function loadBar(loader) {
  let request = modules.get(loader);
  if (!request) {
    request = Promise.resolve()
      .then(loader)
      .then((module) => {
        if (!module?.default) throw new Error('聚焦确认工具模块不可用');
        return module.default;
      });
    modules.set(loader, request);
    request.catch(() => {
      if (modules.get(loader) === request) modules.delete(loader);
    });
  }
  return request;
}
const stop = (event) => event.stopPropagation();

/** Preload code at mode entry; render data and callbacks belong to one opaque mode identity. */
export default function FocusConfirmEntry({
  modeActive = false,
  active = modeActive,
  drawing = false,
  ownerKey,
  loader = defaultLoader,
  ...props
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const latest = useRef(null);
  latest.current = { modeActive, active, drawing, ownerKey, loader, attempt };
  useEffect(() => {
    let current = true;
    if (modeActive) {
      loadBar(loader).then(
        (Implementation) => {
          if (current) setResult({ ownerKey, loader, attempt, Implementation });
        },
        (error) => {
          if (current) setResult({ ownerKey, loader, attempt, error });
        },
      );
    }
    return () => {
      current = false;
    };
  }, [modeActive, ownerKey, loader, attempt]);
  const currentOwner = () => {
    const value = latest.current;
    return (
      value.modeActive &&
      value.active &&
      !value.drawing &&
      value.ownerKey === ownerKey &&
      value.loader === loader &&
      value.attempt === attempt
    );
  };
  const region = props.region;
  if (
    !modeActive ||
    !active ||
    drawing ||
    !region ||
    ![region.relX, region.relY, region.width, region.height].every(Number.isFinite) ||
    region.width <= 0 ||
    region.height <= 0
  )
    return null;
  const resolved =
    result?.ownerKey === ownerKey && result.loader === loader && result.attempt === attempt;
  if (resolved && result.Implementation) {
    const Implementation = result.Implementation;
    return <Implementation {...props} active={active} ownerKey={ownerKey} />;
  }
  if (typeof document === 'undefined') return null;
  const error = resolved && result.error;
  return createPortal(
    <div
      className="cv-focus-confirm-bar nodrag nopan nowheel"
      role="region"
      aria-label="聚焦确认工具加载状态"
      aria-busy={!error}
      style={{ left: '50%', bottom: 16, top: 'auto', visibility: 'visible' }}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onWheel={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      <span role={error ? 'alert' : 'status'}>
        {error ? '聚焦确认工具加载失败，请重试' : '正在加载聚焦确认工具…'}
      </span>
      {error && (
        <button
          type="button"
          aria-label="重新加载聚焦确认工具"
          onClick={() => {
            if (currentOwner()) setAttempt((value) => value + 1);
          }}
        >
          重试加载
        </button>
      )}
      <button
        type="button"
        disabled={props.disabled || typeof props.onCancel !== 'function'}
        onClick={() => {
          if (currentOwner()) props.onCancel?.();
        }}
      >
        取消
      </button>
    </div>,
    document.body,
  );
}
