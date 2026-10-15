export interface DialogOptions {
  onClose?: () => void;
  closeOnEscape?: boolean;
  initialFocus?: 'container' | 'first';
}

type Dialog = {
  container: HTMLElement;
  previousFocus: Element | null;
  lastFocus: HTMLElement | null;
  options: () => DialogOptions;
};
type BackgroundState = { inert: boolean; ariaHidden: string | null };

const dialogs: Dialog[] = [];
const childDismissals: {
  container: HTMLElement;
  trigger?: HTMLElement | null;
  close: () => void;
  keyDown?: (event: KeyboardEvent) => boolean;
}[] = [];

/** Non-modal menus inside a dialog share its Escape owner without another scroll/focus lock. */
export function registerDialogChildDismissal(
  container: HTMLElement,
  close: () => void,
  trigger?: HTMLElement | null,
  keyDown?: (event: KeyboardEvent) => boolean,
) {
  const entry = { container, trigger, close, keyDown };
  childDismissals.push(entry);
  return () => {
    const index = childDismissals.indexOf(entry);
    if (index >= 0) childDismissals.splice(index, 1);
  };
}
const backgrounds = new Map<HTMLElement, BackgroundState>();
const initializingFocus = new WeakMap<HTMLElement, HTMLElement>();
const focusableSelector =
  'button,input:not([type="hidden"]),textarea,select,a[href],[tabindex]:not([tabindex="-1"])';
let previousOverflow = '';
let observer: MutationObserver | undefined;

function restoreBackgrounds() {
  for (const [element, previous] of backgrounds) {
    element.inert = previous.inert;
    if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', previous.ariaHidden);
  }
  backgrounds.clear();
}

// Recompute from the top layer, rather than stacking inert flags on its ancestors.
// This also permits a site modal mounted outside an already-open canvas to gain focus.
function isolateTopDialog() {
  restoreBackgrounds();
  let branch: HTMLElement | undefined = dialogs.at(-1)?.container;
  while (branch?.parentElement && branch.parentElement !== document.documentElement) {
    for (const sibling of branch.parentElement.children) {
      if (
        sibling !== branch &&
        sibling instanceof HTMLElement &&
        !['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName) &&
        !sibling.matches('[role="status"],[role="alert"]')
      ) {
        backgrounds.set(sibling, {
          inert: sibling.inert,
          ariaHidden: sibling.getAttribute('aria-hidden'),
        });
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
      }
    }
    branch = branch.parentElement;
  }
}

function canFocus(element: HTMLElement) {
  if (element.tabIndex < 0 || element.matches(':disabled')) return false;
  for (let branch: HTMLElement | null = element; branch; branch = branch.parentElement) {
    if (branch.inert || branch.hidden || branch.getAttribute('aria-hidden') === 'true')
      return false;
    const style = window.getComputedStyle(branch);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function focusScope(container: HTMLElement) {
  const fullscreen = document.fullscreenElement;
  // A player may fullscreen only part of its enclosing modal. The modal remains
  // the stack owner, but controls outside that visible subtree cannot receive focus.
  return fullscreen instanceof HTMLElement && container.contains(fullscreen)
    ? fullscreen
    : container;
}

function focusableFields(container: HTMLElement) {
  return Array.from(focusScope(container).querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => !element.hasAttribute('data-dialog-focus-boundary') && canFocus(element),
  );
}

function focusDialog(dialog: Dialog) {
  const scope = focusScope(dialog.container);
  if (
    dialog.lastFocus?.isConnected &&
    scope.contains(dialog.lastFocus) &&
    (dialog.lastFocus === scope || canFocus(dialog.lastFocus))
  ) {
    dialog.lastFocus.focus();
  } else if (dialog.options().initialFocus === 'first') {
    (focusableFields(dialog.container)[0] || scope).focus();
  } else scope.focus();
}

function handleFocus(event: FocusEvent) {
  const dialog = dialogs.at(-1);
  if (!dialog || !(event.target instanceof HTMLElement)) return;
  const scope = focusScope(dialog.container);
  // A sibling modal's autoFocus runs before its registration effect. Keep the
  // current trap active, but remember the attempted initial field for that modal.
  const initializing = event.target.closest('[role="dialog"][aria-modal="true"]');
  if (
    initializing instanceof HTMLElement &&
    !dialogs.some((existing) => existing.container === initializing)
  )
    initializingFocus.set(initializing, event.target);
  const boundary = event.target.getAttribute('data-dialog-focus-boundary');
  if (boundary && scope.contains(event.target)) {
    const fields = focusableFields(dialog.container);
    (boundary === 'start' ? fields.at(-1) : fields[0])?.focus();
    if (!fields.length) scope.focus();
    return;
  }
  if (scope.contains(event.target)) dialog.lastFocus = event.target;
  else focusDialog(dialog);
}

function handleKey(event: KeyboardEvent) {
  const dialog = dialogs.at(-1);
  if (!dialog) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    const child = [...childDismissals]
      .reverse()
      .find(
        (entry) =>
          entry.container.isConnected &&
          (dialog.container.contains(entry.container) ||
            (entry.trigger && dialog.container.contains(entry.trigger))),
      );
    if (child) {
      child.close();
      return;
    }
    const options = dialog.options();
    if (options.closeOnEscape !== false) options.onClose?.();
    return;
  }
  if (event.key !== 'Tab') return;
  const scope = focusScope(dialog.container);
  // Native fullscreen media owns its controls' focus subtree.
  if (scope instanceof HTMLMediaElement && scope.controls) return;
  const child = [...childDismissals]
    .reverse()
    .find(
      (entry) =>
        entry.container.isConnected &&
        scope.contains(entry.container) &&
        entry.container.contains(document.activeElement),
    );
  if (child?.keyDown?.(event)) return;
  const fields = focusableFields(dialog.container);
  if (!fields.length) {
    event.preventDefault();
    scope.focus();
    return;
  }
  const first = fields[0];
  const last = fields.at(-1)!;
  const active = document.activeElement;
  // A controls element retargets focus from its browser-owned subtree. Blocking
  // Tab at the element would skip playback, seek and volume controls. Boundaries
  // catch traversal after that subtree and return focus to the dialog.
  if (
    active instanceof HTMLElement &&
    active.matches('video[controls],audio[controls]') &&
    scope.querySelector('[data-dialog-focus-boundary]')
  )
    return;
  if (!scope.contains(active) || active === scope) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleFullscreen() {
  const dialog = dialogs.at(-1);
  if (dialog && !focusScope(dialog.container).contains(document.activeElement)) focusDialog(dialog);
}

/** One lifecycle for site modals, editor dialogs, drawers and embedded canvases. */
export function registerDialog(
  container: HTMLElement,
  options: () => DialogOptions,
  openingFocus: Element | null = document.activeElement,
) {
  const dialog: Dialog = {
    container,
    options,
    previousFocus: openingFocus,
    lastFocus: initializingFocus.get(container) || null,
  };
  initializingFocus.delete(container);
  if (!dialogs.length) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey, true);
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreen);
    observer = new MutationObserver(isolateTopDialog);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  // Child effects mount first in React; an enclosing canvas must stay below them.
  const descendant = dialogs.findIndex((existing) => container.contains(existing.container));
  if (descendant === -1) dialogs.push(dialog);
  else dialogs.splice(descendant, 0, dialog);
  isolateTopDialog();
  if (dialogs.at(-1) === dialog && !container.contains(document.activeElement)) focusDialog(dialog);

  return () => {
    const index = dialogs.indexOf(dialog);
    if (index < 0) return;
    const wasTop = dialogs.at(-1) === dialog;
    dialogs.splice(index, 1);
    // Preserve the opening control when an underlying layer unmounts first.
    for (const remaining of dialogs) {
      if (remaining.previousFocus && container.contains(remaining.previousFocus)) {
        remaining.previousFocus = dialog.previousFocus;
      }
    }
    isolateTopDialog();
    if (!dialogs.length) {
      observer?.disconnect();
      observer = undefined;
      window.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreen);
      document.body.style.overflow = previousOverflow;
    }
    if (wasTop) {
      const next = dialogs.at(-1);
      const previous = dialog.previousFocus;
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (!next || next.container.contains(previous)) &&
        (previous === next?.container || canFocus(previous))
      ) {
        previous.focus();
      } else if (next) focusDialog(next);
    }
  };
}
