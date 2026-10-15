import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canvasReferenceMenuModel } from './candidate-model.js';

export function useCanvasReferenceMenu({ candidates, hiddenKinds, onSelect, onClose, rootRef }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(null);
  const [connectedLimit, setConnectedLimit] = useState(12);
  const [selected, setSelected] = useState(-1);
  const timer = useRef(null);
  const latest = useRef({ onSelect, onClose });
  useLayoutEffect(() => {
    latest.current = { onSelect, onClose };
  });
  const model = useMemo(
    () => canvasReferenceMenuModel(candidates, { search, kind, connectedLimit, hiddenKinds }),
    [candidates, search, kind, connectedLimit, hiddenKinds],
  );
  const cancelKindClose = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const closeKind = useCallback(() => {
    cancelKindClose();
    timer.current = setTimeout(() => {
      timer.current = null;
      setKind(null);
    }, 180);
  }, [cancelKindClose]);
  const openKind = useCallback(
    (next) => {
      cancelKindClose();
      setKind(next);
    },
    [cancelKindClose],
  );
  useEffect(() => cancelKindClose, [cancelKindClose]);
  useEffect(() => {
    setSelected(-1);
    if (model.query) setKind(null);
    else setConnectedLimit(12);
  }, [model.query]);
  useEffect(() => {
    setSelected(-1);
  }, [kind]);
  useEffect(() => {
    setSelected((index) => Math.min(index, model.keyboardOptions.length - 1));
  }, [model.keyboardOptions.length]);
  useEffect(() => {
    const document = rootRef.current.ownerDocument;
    const outside = (event) => {
      if (event.target.closest?.('[data-popover-safe]')) return;
      if (!rootRef.current?.contains(event.target)) latest.current.onClose();
    };
    const keydown = (event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onClose({ restoreEditorFocus: true });
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setSelected((index) =>
          event.key === 'ArrowDown'
            ? Math.min(index + 1, model.keyboardOptions.length - 1)
            : Math.max(-1, index - 1),
        );
      } else if (event.key === 'Enter' && selected >= 0 && model.keyboardOptions[selected]) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onSelect(model.keyboardOptions[selected]);
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', keydown, true);
    };
  }, [rootRef, model.keyboardOptions, selected]);
  return {
    ...model,
    search,
    setSearch,
    kind,
    openKind,
    closeKind,
    cancelKindClose,
    selected,
    activeNodeId: model.keyboardOptions[selected]?.nodeId,
    showAll: () => setConnectedLimit(model.connected.length),
  };
}
