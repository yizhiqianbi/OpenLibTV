import { useEffect, useRef } from 'react';

export function useStudioKeyboard(actions) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const handler = (e) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const {
        addKey,
        cameraMotion,
        copy,
        duplicate,
        objects,
        paste,
        record,
        redo,
        remove,
        selected,
        setDialog,
        setMenu,
        setMode,
        setPlaying,
        setSelected,
        setWorkspace,
        setViewMode,
        viewMode,
        undo,
        viewport,
      } = latest.current;
      if (e.target.closest?.('.modal-overlay,.cv-modal-overlay')) return;
      if (e.target.closest?.('input,textarea,select,[contenteditable=true],[role="textbox"]'))
        return;
      if (e.code === 'Space' && e.target.closest?.('button,a,[role="button"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        setMenu(null);
        setDialog(null);
        setSelected(null);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (!mod && !e.altKey && e.shiftKey && e.key === 'ArrowRight') {
        if (cameraMotion?.stepState?.(1)) e.preventDefault();
        return;
      }
      if (!mod && !e.altKey && e.shiftKey && e.key === 'ArrowLeft') {
        if (cameraMotion?.stepState?.(-1)) e.preventDefault();
        return;
      }
      if (!mod && !e.altKey && e.shiftKey && (e.key.toLowerCase() === 'a' || e.code === 'KeyA')) {
        e.preventDefault();
        setMenu('add');
        return;
      }
      if (!mod && !e.altKey && !e.shiftKey) {
        const workspace =
          e.key === '1' || e.code === 'Digit1'
            ? 'compose'
            : e.key === '2' || e.code === 'Digit2'
              ? 'animation'
              : null;
        if (workspace) {
          e.preventDefault();
          setWorkspace?.(workspace);
          if (workspace === 'compose' && viewMode === 'film') setViewMode('orbit');
          return;
        }
        if (e.key.toLowerCase() === 'c' || e.code === 'KeyC') {
          const camera = objects.find(
            (object) => object.id === selected && object.type === 'camera',
          );
          if (camera) {
            e.preventDefault();
            setViewMode(viewMode === camera.id ? 'orbit' : camera.id);
            return;
          }
        }
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'c') {
        if (e.repeat) return;
        if (copy?.()) e.preventDefault();
        return;
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'v') {
        if (e.repeat) return;
        if (paste?.()) e.preventDefault();
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (
        (mod && !e.shiftKey && e.key.toLowerCase() === 'd') ||
        (!mod && e.shiftKey && e.key.toLowerCase() === 'd')
      ) {
        if (e.repeat) return;
        e.preventDefault();
        duplicate();
      }
      if (!mod && !e.altKey && !e.shiftKey) {
        if (e.code !== 'NumpadDecimal' && (e.key === 'Delete' || e.key === 'Backspace')) remove();
        if (e.key === 'w') setMode('translate');
        if (e.key === 'e') setMode('rotate');
        if (e.key === 'r') setMode('scale');
        if (e.key === 'q') setMode('select');
      }
      if (
        !mod &&
        !e.altKey &&
        (e.key.toLowerCase() === 'f' || e.code === 'NumpadDecimal' || e.code === 'Home')
      ) {
        e.preventDefault();
        setViewMode?.('orbit');
        e.code === 'Home' ? viewport.current?.frameAll() : viewport.current?.focus(selected);
      }
      const axis = {
        Numpad1: e.ctrlKey ? 'back' : 'front',
        Numpad3: e.ctrlKey ? 'left' : 'right',
        Numpad7: e.ctrlKey ? 'bottom' : 'top',
      }[e.code];
      if (axis && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setViewMode?.('orbit');
        viewport.current?.viewAxis(axis);
      }
      if (
        e.key.toLowerCase() === 'i' &&
        !mod &&
        !e.altKey &&
        !e.shiftKey &&
        cameraMotion?.activeRig
      ) {
        e.preventDefault();
        cameraMotion.addState();
      }
      if (!mod && !e.altKey && !e.shiftKey && e.key === 'k') {
        const object = objects.find((o) => o.id === selected);
        if (object) {
          if (object.type !== 'camera') record();
          addKey(object);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
