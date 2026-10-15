// Compatibility entry point for existing pages. New code can import its domain service directly.
export { asset, ensureAssetMap, invalidateAssetMap } from './services/assets.ts';
export { fetchJson } from './services/json.ts';
export { loadContent, invalidateContent } from './services/content.ts';
export { useContent, useData } from './hooks/useContent.ts';
export { useLocalState, useStoredState } from './hooks/useLocalState.ts';
export { localHref, shortCount } from './services/presentation.js';
