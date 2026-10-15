import { useEffect, useRef } from 'react';
import { createLocalId as uid, cloneSnapshot as clone } from '../../editor/model.js';
import { duplicateCanvasSelection } from '../model.js';
import { canvasCopyMembers, canvasSelectionRoots } from '../domain/groups.js';
export function useCanvasKeyboard(actions) {
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    let deletePressed = false;
    const down = (e) => {
      const {
        addNode,
        change,
        copied,
        duplicate,
        edges,
        fit,
        nodes,
        readonly,
        referencePick,
        focusMode,
        markMode,
        ready = true,
        redo,
        remove,
        removeSelected = remove,
        selected,
        setContext,
        setDialog,
        setLinking,
        setMenu,
        setPanel,
        setSelected,
        setTool,
        setView,
        space,
        tool,
        undo,
        setSpaceHeld,
      } = latest.current;
      const target = e.composedPath?.()[0] || e.target;
      if (
        e.defaultPrevented ||
        target?.closest?.(
          '.modal-overlay,.cv-modal-overlay,.cv-agent,[role="dialog"],[role="listbox"],[role="menu"]',
        )
      )
        return;
      if ((focusMode?.active || markMode?.active) && e.key === 'Escape') {
        e.preventDefault();
        if (markMode?.active) markMode.onEscape();
        else focusMode.onEscape();
        return;
      }
      if (
        target?.nodeType === 1 &&
        (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.nodeName) ||
          target.hasAttribute('contenteditable') ||
          target.closest('.nokey'))
      )
        return;
      if (!ready && !['Escape', '?'].includes(e.key)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.code === 'Space' && !mod && !e.altKey) {
        space.current = true;
        setSpaceHeld?.(true);
        e.preventDefault();
      }
      if (referencePick?.active || focusMode?.active || markMode?.active) {
        if (e.key === 'Escape') {
          e.preventDefault();
          referencePick.exit();
        } else if (
          ['Delete', 'Backspace'].includes(e.key) ||
          (mod && ['a', 'v', 'd', 'z', 'y'].includes(e.key.toLowerCase())) ||
          (!mod && ['t', 'i', 'f'].includes(e.key))
        )
          e.preventDefault();
        else if (e.key === '1' && !mod) fit();
        else if (e.key === '0' && !mod) setView((value) => ({ ...value, z: 1 }));
        return;
      }
      if (e.key === 'Escape') {
        setDialog(null);
        setPanel(null);
        setMenu(null);
        setContext(null);
        setSelected([]);
        setLinking(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (readonly || tool === 'hand' || space.current) return;
        e.preventDefault();
        if (deletePressed) return;
        deletePressed = true;
        removeSelected();
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(nodes.map((n) => n.id));
      }
      if (mod && e.key.toLowerCase() === 'c') {
        const items = canvasCopyMembers(nodes, selected);
        copied.current = clone(items);
        copied.edges = clone(
          edges.filter(
            (edge) =>
              items.some((n) => n.id === edge.source) && items.some((n) => n.id === edge.target),
          ),
        );
      }
      if (mod && e.key.toLowerCase() === 'v' && copied.current.length && !readonly) {
        e.preventDefault();
        const result = duplicateCanvasSelection(
          copied.current,
          copied.edges || [],
          copied.current.map((n) => n.id),
          uid,
        );
        change([...nodes, ...result.nodes], [...edges, ...result.edges]);
        setSelected(
          canvasSelectionRoots(
            result.nodes,
            result.nodes.map((n) => n.id),
          ).map((n) => n.id),
        );
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      }
      if (e.key === '1' && !mod) fit();
      if (e.key === '0' && !mod) setView((v) => ({ ...v, z: 1 }));
      if (!mod && !e.altKey) {
        if (e.key === 'h') setTool('hand');
        if (e.key === 'v') setTool('select');
        if (e.key === 't') addNode('text');
        if (e.key === 'i') addNode('image');
        if (e.key === 'f') addNode('video');
      }
      if (e.key === '?') setDialog('shortcuts');
    };
    const up = (e) => {
      if (['Delete', 'Backspace', 'Meta'].includes(e.key)) deletePressed = false;
      if (e.code === 'Space') {
        latest.current.space.current = false;
        latest.current.setSpaceHeld?.(false);
      }
    };
    const blur = () => {
      deletePressed = false;
      latest.current.space.current = false;
      latest.current.setSpaceHeld?.(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('contextmenu', blur);
    return () => {
      deletePressed = false;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('contextmenu', blur);
      latest.current.space.current = false;
      latest.current.setSpaceHeld?.(false);
    };
  }, []);
}
