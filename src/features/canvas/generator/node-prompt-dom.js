import { parseNodePrompt } from './node-prompt-model.js';

export function readPromptDOM(root, trimTerminalNewline = true) {
  let value = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) value += node.textContent ?? '';
    else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.dataset.mentionSuggest || node.dataset.promptAffordanceChip) return;
      if (node.dataset.promptToken) value += node.dataset.promptToken;
      else if (node.tagName === 'BR') value += '\n';
      else node.childNodes.forEach(walk);
    }
  };
  root.childNodes.forEach(walk);
  return trimTerminalNewline && value.endsWith('\n') ? value.slice(0, -1) : value;
}

export function createPromptBadge(document, part, asset, blocked) {
  const badge = document.createElement('span');
  badge.className = 'node-generator-prompt-badge mention-badge';
  badge.contentEditable = 'false';
  badge.setAttribute('contenteditable', 'false');
  badge.draggable = !blocked;
  badge.dataset.promptToken = part.token;
  badge.dataset.mentionType =
    part.tokenType === 'Element' ? 'subject' : part.tokenType.toLowerCase();
  badge.dataset.mentionIndex = String(part.index);
  badge.dataset.mentionNodeId = part.nodeId;
  badge.dataset.mentionMissing = String(part.missing);
  if (part.mediaType === 'audio' || !part.url) {
    const glyph = document.createElement('span');
    glyph.className = 'node-generator-prompt-badge-glyph';
    glyph.textContent = part.mediaType === 'audio' ? '♪' : part.mediaType === 'video' ? '▷' : '▧';
    glyph.setAttribute('aria-hidden', 'true');
    badge.appendChild(glyph);
  } else {
    const media = document.createElement(part.mediaType === 'video' ? 'video' : 'img');
    media.src = asset(part.url);
    media.draggable = false;
    if (part.mediaType === 'video') {
      media.muted = true;
      media.playsInline = true;
      media.preload = 'metadata';
    } else media.alt = '';
    badge.appendChild(media);
  }
  const label = document.createElement('span');
  label.dataset.mentionLabel = 'true';
  label.textContent = part.label;
  badge.appendChild(label);
  return badge;
}

function createMagicBadge(document, part, asset, blocked) {
  const badge = document.createElement('span');
  badge.className = 'node-generator-magic-badge magic-chip';
  badge.contentEditable = 'false';
  badge.setAttribute('contenteditable', 'false');
  badge.draggable = false;
  badge.dataset.promptToken = part.token;
  badge.dataset.magicId = part.magicId;
  badge.dataset.magicIndex = String(part.magicIndex);
  if (!blocked && part.options.length > 1) {
    badge.tabIndex = 0;
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', `元素 ${part.label}`);
    badge.setAttribute('aria-haspopup', 'menu');
  }
  if (part.imageUrl) {
    const image = document.createElement('img');
    image.src = asset(part.imageUrl);
    image.alt = '';
    image.draggable = false;
    badge.append(image);
  } else {
    const glyph = document.createElement('span');
    glyph.className = 'node-generator-magic-glyph';
    glyph.textContent = '✦';
    glyph.setAttribute('aria-hidden', 'true');
    badge.append(glyph);
  }
  const label = document.createElement('span');
  label.dataset.magicLabel = 'true';
  label.textContent = part.label;
  badge.append(label);
  if (part.options.length > 1) {
    const arrow = document.createElement('span');
    arrow.className = 'node-generator-magic-arrow';
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden', 'true');
    badge.append(arrow);
  }
  return badge;
}

/** Source prompt menus update same-ID spans in place before reading the new value. */
export function updatePromptMagicBadges(editor, id, index, label) {
  editor.querySelectorAll('[data-magic-id]').forEach((badge) => {
    if (badge.dataset.magicId !== id) return;
    badge.dataset.magicIndex = String(index);
    badge.dataset.promptToken = `{{magic:${id}:${index}}}`;
    const caption = badge.querySelector('[data-magic-label]');
    if (caption) caption.textContent = label;
    if (badge.hasAttribute('aria-label')) badge.setAttribute('aria-label', `元素 ${label}`);
  });
}

export function renderPromptDOM(editor, value, references, asset, blocked, { magicList } = {}) {
  const document = editor.ownerDocument;
  const fragment = document.createDocumentFragment();
  for (const part of parseNodePrompt(value, references, { magicList })) {
    if (part.kind === 'text') {
      part.text.split('\n').forEach((line, index) => {
        if (index) fragment.appendChild(document.createElement('br'));
        fragment.appendChild(document.createTextNode(line));
      });
      continue;
    }
    fragment.appendChild(
      part.kind === 'magic'
        ? createMagicBadge(document, part, asset, blocked)
        : createPromptBadge(document, part, asset, blocked),
    );
  }
  if (fragment.lastChild?.nodeName === 'BR' || value.endsWith('\n'))
    fragment.appendChild(document.createElement('br'));
  disposePromptMedia(editor);
  editor.replaceChildren(fragment);
}

export function disposePromptMedia(editor) {
  editor?.querySelectorAll('video').forEach((video) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  });
}

export function hasUnrenderedPromptTokens(editor, magicList) {
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE)
      return parseNodePrompt(node.textContent, {}, { magicList }).some((part) =>
        ['reference', 'magic'].includes(part.kind),
      );
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      (node.dataset.promptToken || node.dataset.mentionSuggest || node.dataset.promptAffordanceChip)
    )
      return false;
    return Array.from(node.childNodes).some(visit);
  };
  return visit(editor);
}

export function selectionOffsets(editor) {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(editor);
  before.setEnd(range.startContainer, range.startOffset);
  const start = readPromptDOM(before.cloneContents(), false).length;
  before.setEnd(range.endContainer, range.endOffset);
  return { start, end: readPromptDOM(before.cloneContents(), false).length };
}

export function setPromptCaret(editor, offset) {
  let remaining = Math.max(0, offset);
  const range = editor.ownerDocument.createRange();
  const find = (parent) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) return (void range.setStart(node, remaining), true);
        remaining -= length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.dataset.mentionSuggest || node.dataset.promptAffordanceChip) continue;
        if (node.dataset.promptToken) {
          const length = node.dataset.promptToken.length;
          if (remaining === 0) return (void range.setStartBefore(node), true);
          if (remaining <= length) return (void range.setStartAfter(node), true);
          remaining -= length;
        } else if (node.tagName === 'BR') {
          if (remaining === 0) return (void range.setStartBefore(node), true);
          remaining -= 1;
          if (remaining === 0) return (void range.setStartAfter(node), true);
        } else if (find(node)) return true;
      }
    }
    return false;
  };
  if (!find(editor)) (range.selectNodeContents(editor), range.collapse(false));
  else range.collapse(true);
  const selection = editor.ownerDocument.defaultView?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function placeDropCaret(editor, event) {
  const document = editor.ownerDocument;
  const point = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  const range = point
    ? document.createRange()
    : document.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (point) (range.setStart(point.offsetNode, point.offset), range.collapse(true));
  if (!range || !editor.contains(range.startContainer)) return;
  const selection = document.defaultView?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
