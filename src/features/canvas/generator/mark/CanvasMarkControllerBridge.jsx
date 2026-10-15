import { useLayoutEffect, useRef } from 'react';
import { useCanvasMarkMode } from './useCanvasMarkMode.js';
import CanvasMarkSurface from './CanvasMarkSurface.jsx';
import CanvasMarkModeBar from './CanvasMarkModeBar.jsx';
import './controller-bridge.css';

export default function CanvasMarkControllerBridge({
  apiRef,
  entryRequest,
  onPublish,
  onEntryConsumed,
  ...props
}) {
  const controller = useCanvasMarkMode(props);
  const callbacks = useRef(null);
  const currentController = useRef(controller);
  currentController.current = controller;
  callbacks.current = { onPublish, onEntryConsumed, entryRequest };
  apiRef.current = controller;
  const { active, targetId, ownerKey, state, documentOwner } = controller;
  const { notify } = props;
  // StrictMode replays layout effects without another render. Republish the
  // current API before consuming the pending entry after the replay cleanup.
  useLayoutEffect(() => {
    apiRef.current = currentController.current;
    return () => {
      if (apiRef.current?.documentOwner === documentOwner) apiRef.current = null;
    };
  }, [apiRef, documentOwner]);
  useLayoutEffect(() => {
    callbacks.current.onPublish({
      active,
      targetId,
      ownerKey,
      state,
      documentOwner,
      Surface: CanvasMarkSurface,
    });
  }, [active, targetId, ownerKey, state, documentOwner]);
  useLayoutEffect(() => {
    if (
      !entryRequest ||
      entryRequest.owner !== documentOwner ||
      callbacks.current.entryRequest !== entryRequest
    )
      return;
    if (!apiRef.current.enter(entryRequest.targetId, entryRequest.options))
      notify?.('生成器已变化，元素选择模式未打开');
    callbacks.current.onEntryConsumed(entryRequest);
  }, [entryRequest, documentOwner, apiRef, notify]);
  return (
    <div className="cv-mark-tool-shell">
      <CanvasMarkModeBar
        top={0}
        active={active}
        onReturnToTarget={controller.returnToTarget}
        onExit={controller.exit}
      />
      {active && state.error && (
        <div
          role="alert"
          className="cv-mark-operation-status nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
          }}
        >
          <span>{state.error}</span>
          {state.saveError && (
            <button type="button" onClick={controller.retrySave}>
              重试保存
            </button>
          )}
        </div>
      )}
    </div>
  );
}
