const hiddenGuard = {
  position: 'fixed',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

// Native media controls have a browser-owned focus subtree. Let Tab traverse it,
// then return from the boundary without exposing a new visible control.
export function DialogFocusBoundary({ edge }) {
  return (
    <span data-dialog-focus-boundary={edge} tabIndex={0} aria-hidden="true" style={hiddenGuard} />
  );
}
