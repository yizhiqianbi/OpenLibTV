import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canvasNodeSize } from '../domain/groups.js';
import {
  inlineGeneratorCenter,
  inlineGeneratorWidth,
  resolveInlineGeneratorVerticalPlacement,
} from './inline-placement-model.js';

const positive = (value) => Number.isFinite(value) && value > 0;
const fields = ['left', 'top', 'width', 'maxHeight', 'minHeight', 'overflowY', 'transform'];
const sameGeometry = (a, b) =>
  a?.boardWidth === b?.boardWidth &&
  a?.side === b?.side &&
  fields.every((field) => a?.style?.[field] === b?.style?.[field]);

function visibleBoard(rect) {
  const viewport = window.visualViewport;
  const viewportLeft = Number.isFinite(viewport?.offsetLeft) ? viewport.offsetLeft : 0;
  const viewportTop = Number.isFinite(viewport?.offsetTop) ? viewport.offsetTop : 0;
  const viewportWidth = positive(viewport?.width) ? viewport.width : window.innerWidth;
  const viewportHeight = positive(viewport?.height) ? viewport.height : window.innerHeight;
  const left = Math.max(rect.left, viewportLeft);
  const top = Math.max(rect.top, viewportTop);
  const right = Math.min(rect.left + rect.width, viewportLeft + viewportWidth);
  const bottom = Math.min(rect.top + rect.height, viewportTop + viewportHeight);
  return { left, top, width: right - left, height: bottom - top };
}

/** Measures presentation only. Node documents, camera and selection never enter this writer. */
export function useGeneratorSurfacePlacement(config, enabled = true) {
  const [surface, setSurface] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const attach = useCallback((element) => setSurface(element), []);
  const measureNow = useRef(null);
  const node = config?.node;
  const size = canvasNodeSize(node);
  const position = config?.position || node?.position || { x: 0, y: 0 };
  const zoom = positive(config?.zoom) ? config.zoom : positive(config?.view?.z) ? config.view.z : 1;
  const gapWorld = config?.kind === 'script' ? 16 : 16 / zoom;
  const boardRef = config?.board;
  const documentKey = config?.documentKey;
  const nodeId = node?.id;
  const owner = useMemo(
    () => ({ documentKey, nodeId, board: boardRef, surface, enabled }),
    [documentKey, nodeId, boardRef, surface, enabled],
  );
  const latest = useRef(null);
  latest.current = { config, size, position, zoom, gapWorld, owner, enabled };

  useLayoutEffect(() => {
    const { surface, enabled, nodeId } = owner;
    const board = owner.board?.current;
    if (!enabled || !board || !surface) {
      setGeometry(null);
      return;
    }
    let current = true;
    let animating = false;
    let frame = null;
    const nodeElement = surface.closest('[data-node-id]');
    const world = surface.closest('.cv-world');
    const toolbar = board.querySelector('.cv-left-tools');
    const alive = () =>
      current && latest.current.owner === owner && latest.current.enabled && surface.isConnected;
    const publish = (next) => {
      if (alive()) setGeometry((previous) => (sameGeometry(previous, next) ? previous : next));
    };
    const measure = () => {
      if (!alive()) return;
      const value = latest.current;
      const rect = board.getBoundingClientRect();
      const boardWidth = positive(rect.width) ? rect.width : undefined;
      if (!positive(rect.height) || !positive(boardWidth)) {
        publish({ boardWidth });
        return;
      }
      const viewport = visibleBoard(rect);
      if (!positive(viewport.width) || !positive(viewport.height)) {
        publish({ boardWidth });
        return;
      }
      const matchingNode = nodeElement?.dataset.nodeId === value.config.node?.id;
      const actualNode = matchingNode ? nodeElement.getBoundingClientRect() : null;
      const title = matchingNode ? nodeElement.querySelector('.cv-node-title') : null;
      const titleRect = title?.getBoundingClientRect();
      const liveScale =
        actualNode && positive(actualNode.width) && positive(value.size.width)
          ? actualNode.width / value.size.width
          : value.zoom;
      const anchor =
        actualNode && positive(actualNode.width) && positive(actualNode.height)
          ? actualNode
          : {
              left: rect.left + (value.config.view?.x || 0) + value.position.x * value.zoom,
              top: rect.top + (value.config.view?.y || 0) + value.position.y * value.zoom,
              width: value.size.width * value.zoom,
              height: value.size.height * value.zoom,
            };
      const border = getComputedStyle(surface);
      const borderHeight =
        (parseFloat(border.borderTopWidth) || 0) + (parseFloat(border.borderBottomWidth) || 0);
      // scrollHeight preserves overflowing natural content; clientHeight would oscillate after a cap.
      const naturalHeight = Math.max(
        surface.scrollHeight + borderHeight,
        surface.offsetHeight,
        value.config.minimumPanelHeight || 0,
      );
      if (!positive(liveScale) || !positive(naturalHeight)) {
        publish({ boardWidth });
        return;
      }
      const topMargin = Math.min(20, viewport.height / 4);
      const bottomMargin = Math.min(60, viewport.height / 4);
      const vertical = resolveInlineGeneratorVerticalPlacement({
        nodeTop:
          titleRect && positive(titleRect.width) && positive(titleRect.height)
            ? Math.min(anchor.top, titleRect.top)
            : anchor.top,
        nodeBottom: anchor.top + anchor.height,
        panelHeight: naturalHeight,
        viewportTop: viewport.top + topMargin,
        viewportBottom: viewport.top + viewport.height - bottomMargin,
        gap: value.config.kind === 'script' ? 16 * liveScale : 16,
      });
      if (!vertical) {
        publish({ boardWidth });
        return;
      }
      const toolbarRect = toolbar?.getBoundingClientRect();
      const toolbarVisible =
        toolbar?.isConnected &&
        positive(toolbarRect?.width) &&
        positive(toolbarRect?.height) &&
        toolbarRect.right > viewport.left &&
        toolbarRect.left < viewport.left + viewport.width &&
        toolbarRect.bottom > viewport.top &&
        toolbarRect.top < viewport.top + viewport.height;
      const leftInset = toolbarVisible ? Math.max(20, toolbarRect.right - viewport.left + 20) : 20;
      const width = inlineGeneratorWidth(viewport.width - Math.max(0, leftInset - 20));
      const sourceCenter = anchor.left + anchor.width / 2;
      const minCenter = viewport.left + width / 2 + leftInset;
      const maxCenter = viewport.left + viewport.width - width / 2 - 20;
      const center =
        minCenter <= maxCenter
          ? Math.max(minCenter, Math.min(sourceCenter, maxCenter))
          : viewport.left + viewport.width / 2;
      const offsetParent = surface.offsetParent;
      const origin =
        offsetParent instanceof HTMLElement && offsetParent !== document.body
          ? offsetParent.getBoundingClientRect()
          : anchor;
      publish({
        boardWidth,
        side: vertical.side,
        style: {
          left: (center - origin.left) / liveScale,
          top: (vertical.top - origin.top) / liveScale,
          width,
          maxHeight: vertical.maxHeight,
          minHeight: vertical.maxHeight === undefined ? undefined : 0,
          overflowY: vertical.scrollable ? 'auto' : undefined,
          transform: `scale(${1 / liveScale}) translateX(-50%)`,
        },
      });
    };
    const cancelFrame = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
    };
    const tick = () => {
      frame = null;
      if (!alive()) return;
      measure();
      if (animating && typeof requestAnimationFrame === 'function')
        frame = requestAnimationFrame(tick);
    };
    const transitionStart = (event) => {
      if (event.target !== world || event.propertyName !== 'transform') return;
      animating = true;
      if (frame == null && typeof requestAnimationFrame === 'function')
        frame = requestAnimationFrame(tick);
    };
    const transitionEnd = (event) => {
      if (event.target !== world || event.propertyName !== 'transform') return;
      animating = false;
      cancelFrame();
      measure();
    };
    const scroll = (event) => {
      if (event.target instanceof Node && surface.contains(event.target)) return;
      measure();
    };
    const visibility = () => {
      if (document.hidden) {
        animating = false;
        cancelFrame();
      } else measure();
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(board);
    observer?.observe(surface);
    if (toolbar) observer?.observe(toolbar);
    if (matchingElement(nodeElement, nodeId)) observer?.observe(nodeElement);
    world?.addEventListener('transitionrun', transitionStart);
    world?.addEventListener('transitionstart', transitionStart);
    world?.addEventListener('transitionend', transitionEnd);
    world?.addEventListener('transitioncancel', transitionEnd);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    document.addEventListener('visibilitychange', visibility);
    measureNow.current = measure;
    measure();
    return () => {
      current = false;
      animating = false;
      cancelFrame();
      observer?.disconnect();
      world?.removeEventListener('transitionrun', transitionStart);
      world?.removeEventListener('transitionstart', transitionStart);
      world?.removeEventListener('transitionend', transitionEnd);
      world?.removeEventListener('transitioncancel', transitionEnd);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      document.removeEventListener('visibilitychange', visibility);
      if (measureNow.current === measure) measureNow.current = null;
    };
  }, [owner]);

  useLayoutEffect(() => {
    measureNow.current?.();
  }, [position.x, position.y, size.width, size.height, zoom, config?.view?.x, config?.view?.y]);

  if (!config) return { ref: attach, style: undefined, side: undefined };
  const center = inlineGeneratorCenter(
    position.x + size.width / 2,
    config.view,
    geometry?.boardWidth,
  );
  return {
    ref: attach,
    side: geometry?.side,
    style: geometry?.style || {
      left: center - (config.coordinateOrigin?.x ?? 0),
      width: inlineGeneratorWidth(geometry?.boardWidth),
      top: position.y + size.height + gapWorld - (config.coordinateOrigin?.y ?? 0),
      transform: `scale(${1 / zoom}) translateX(-50%)`,
    },
  };
}

function matchingElement(element, nodeId) {
  return element?.dataset.nodeId === nodeId;
}
