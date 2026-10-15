import { readPromptDOM } from './node-prompt-dom.js';

export const PROMPT_BADGE_SWAP_SELECTOR = '[data-mention-swap]';
const HOST_CLASS = 'node-prompt-badge-swap-host';
const SWAPPABLE_TYPES = new Set(['image', 'portrait', 'video', 'audio', 'mixed', 'subject']);
const SWAP_PATH =
  'M6.7334 5.54198C7.38291 5.54201 7.70811 6.32675 7.24902 6.78612L5.70508 8.33006C5.53429 8.50082 5.25777 8.50071 5.08691 8.33006C4.91607 8.15922 4.91609 7.88275 5.08691 7.7119L6.38184 6.41698H0.4375C0.196006 6.41698 0.000211045 6.22092 0 5.97948C0 5.73785 0.195875 5.54198 0.4375 5.54198H6.7334ZM2.16992 0.127913C2.34068 -0.042692 2.61726 -0.0425834 2.78809 0.127913C2.95892 0.298769 2.95893 0.576205 2.78809 0.747054L1.49414 2.04198H7.4375C7.67912 2.04198 7.875 2.23785 7.875 2.47948C7.87479 2.72092 7.67899 2.91698 7.4375 2.91698H1.1416C0.492039 2.91694 0.166719 2.13121 0.625977 1.67186L2.16992 0.127913Z';

export function isSwappablePromptBadge(badge) {
  if (!badge || badge.nodeType !== 1 || badge.closest('[data-mention-suggest]')) return false;
  const missing = badge.dataset.mentionMissing;
  return (
    SWAPPABLE_TYPES.has(badge.dataset.mentionType) &&
    !!badge.dataset.mentionNodeId?.trim() &&
    !!badge.dataset.promptToken &&
    (!missing || missing === 'false')
  );
}

export function promptBadgeRange(editor, badge) {
  if (!editor || !badge?.isConnected || !isSwappablePromptBadge(badge) || !editor.contains(badge))
    return null;
  const range = editor.ownerDocument.createRange();
  range.selectNodeContents(editor);
  range.setEndBefore(badge);
  const start = readPromptDOM(range.cloneContents(), false).length;
  range.setEndAfter(badge);
  return { start, end: readPromptDOM(range.cloneContents(), false).length };
}

export function appendPromptBadgeSwapOverlay(badge) {
  if (!isSwappablePromptBadge(badge)) return null;
  const existing = badge.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
  if (existing) return existing;
  if (!badge.querySelector('[data-mention-thumb], img, video, .node-generator-prompt-badge-glyph'))
    return null;
  const document = badge.ownerDocument;
  const overlay = document.createElement('span');
  overlay.className = 'node-prompt-badge-swap';
  overlay.dataset.mentionSwap = 'true';
  // Existing read/copy/caret paths already omit this transient UI marker.
  overlay.dataset.promptAffordanceChip = 'true';
  overlay.contentEditable = 'false';
  overlay.setAttribute('contenteditable', 'false');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 7.875 8.45809');
  svg.setAttribute('width', '7.875');
  svg.setAttribute('height', '8.458');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', SWAP_PATH);
  path.setAttribute('fill', 'rgba(0, 0, 0, 0.9)');
  svg.appendChild(path);
  overlay.appendChild(svg);
  // Keep the original thumbnail and its media lifecycle under the badge owner.
  badge.classList.add(HOST_CLASS);
  badge.appendChild(overlay);
  return overlay;
}

export function stripPromptBadgeSwapOverlays(editor) {
  editor?.querySelectorAll(PROMPT_BADGE_SWAP_SELECTOR).forEach((overlay) => overlay.remove());
  editor?.querySelectorAll(`.${HOST_CLASS}`).forEach((badge) => badge.classList.remove(HOST_CLASS));
}
