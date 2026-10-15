import { useGraphTouch } from '../../editor/useGraphTouch.js';
const profile = {
  isolatedSurface:
    '.cv-floating,.cv-settings,.cv-storyboard,.cv-inline-generator,.nopan,.nowheel,button,textarea,input,select,a,audio,video,[contenteditable],.cv-handle',
  nodeSelector: '.cv-node,.cv-selection-overlay',
  panningClass: 'cv-panning',
};
export function useCanvasTouch(options) {
  return useGraphTouch(options, profile);
}
