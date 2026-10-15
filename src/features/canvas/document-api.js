// Public document boundary for asset imports and Studio → Canvas conversion.
// Keep UI and hooks out of this entry so consumers do not load the editor.
export { createCanvasNode } from './model.js';
export { persistCanvasDocument, writeCanvasSnapshot } from './persistence.js';
