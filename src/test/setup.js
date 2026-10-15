import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Canvas keeps the ScriptV2 implementation genuinely lazy. In a cold Vitest
// worker its CSS-heavy module can take several seconds to transform before the
// async query sees the view; keep the query bound above that one-time import.
configure({ asyncUtilTimeout: 3000 });
// jsdom has no media-query engine; actual responsive layouts are checked in a
// browser. Mantine's provider reads the platform method even with a fixed theme.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function')
  window.matchMedia = (media) => ({
    media,
    get matches() {
      // Keep the existing dimension-based player orientation checks usable.
      // Other queries have no layout engine and default to false in jsdom.
      return media === '(orientation: landscape)' ? window.innerWidth > window.innerHeight : false;
    },
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  });
// jsdom has no layout engine. ProseMirror still asks a Range for geometry when
// moving the selection; browser verification covers the actual caret position.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects)
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  });
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect)
  Range.prototype.getBoundingClientRect = () => new DOMRect();
// Node 25 introduces a host localStorage global. Vitest preserves existing host
// properties, so explicitly use jsdom's origin-scoped browser storage in tests.
if (globalThis.jsdom) {
  for (const scope of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, scope, {
      configurable: true,
      value: globalThis.jsdom.window[scope],
    });
  }
}
afterEach(cleanup);
