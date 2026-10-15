import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';

export function useEmbeddedCanvasFocus({ canvasRoot, embedded, onClose }) {
  useDialogBehavior(canvasRoot, { enabled: embedded, onClose, initialFocus: 'first' });
}
