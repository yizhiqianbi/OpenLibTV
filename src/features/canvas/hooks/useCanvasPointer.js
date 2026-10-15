import { useGraphPointer } from '../../editor/useGraphPointer.js';
import { canvasSelectionRoots } from '../domain/groups.js';
import { resolveCanvasNodeDragCopyMode } from '../domain/selection-copy-model.js';
import { selectIntersectingNodes } from '../geometry.js';
const profile = {
  isolatedSurface: '.cv-floating,.cv-storyboard,.cv-inline-generator,.nopan',
  editableSurface: 'button,textarea,input,select,a,audio,video,[contenteditable],.cv-handle',
  selectionSelector: '.cv-selection-overlay',
  nodeSelector: '.cv-node',
  panningClass: 'cv-panning',
  clickCaptureSelector: '.cv-storyboard-title-label,.cv-group-title-label',
};
export function useCanvasPointer(options) {
  return useGraphPointer(options, {
    profile,
    selectionRoots: canvasSelectionRoots,
    resolveDragCopyMode: resolveCanvasNodeDragCopyMode,
    selectIntersectingNodes,
  });
}
