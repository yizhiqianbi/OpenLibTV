import { useGraphWheel } from '../../editor/useGraphWheel.js';
export function useCanvasWheel(options) {
  return useGraphWheel({
    ...options,
    isolatedSurface:
      '.cv-floating,.cv-settings,.cv-storyboard,.cv-inline-generator,.nowheel,input,textarea,select,audio,video,[contenteditable]',
  });
}
