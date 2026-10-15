import {
  createPromptBadge,
  disposePromptMedia,
  readPromptDOM,
  selectionOffsets,
  setPromptCaret,
} from './node-prompt-dom.js';

function textPosition(editor, offset, bias = 'left') {
  let consumed = 0;
  const visit = (parent) => {
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const end = consumed + node.textContent.length;
        if (offset >= consumed && (bias === 'right' ? offset < end : offset <= end))
          return { node, offset: offset - consumed };
        consumed = end;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.dataset.mentionSuggest || node.dataset.promptAffordanceChip) continue;
        if (node.dataset.promptToken) consumed += node.dataset.promptToken.length;
        else if (node.tagName === 'BR') consumed += 1;
        else {
          const found = visit(node);
          if (found) return found;
        }
      }
    }
    return null;
  };
  return visit(editor);
}

export function removePromptGhost(ghost) {
  if (!ghost?.isConnected) return;
  disposePromptMedia(ghost);
  ghost.remove();
}

export function stripPromptGhosts(editor) {
  editor?.querySelectorAll('[data-mention-suggest]').forEach(removePromptGhost);
}

export function insertPromptGhost(editor, match, option, asset) {
  const position = textPosition(editor, match.end);
  if (!position) return null;
  const caret = selectionOffsets(editor);
  const ghost = createPromptBadge(editor.ownerDocument, option, asset, true);
  ghost.classList.add('node-generator-prompt-ghost');
  for (const key of [
    'promptToken',
    'mentionType',
    'mentionIndex',
    'mentionNodeId',
    'mentionMissing',
  ])
    delete ghost.dataset[key];
  ghost.dataset.mentionSuggest = '1';
  ghost.dataset.suggestElementId = match.nodeId;
  if (match.replaceMatched) ghost.dataset.suggestConsume = String(match.matchedText.length);
  ghost.setAttribute('aria-hidden', 'true');
  const tail = position.node.splitText(position.offset);
  tail.before(ghost);
  if (caret?.start === caret?.end) setPromptCaret(editor, caret.start);
  return ghost;
}

function sibling(ghost, direction) {
  let node = direction === 'before' ? ghost.previousSibling : ghost.nextSibling;
  while (
    node &&
    (node.dataset?.mentionSuggest || (node.nodeType === Node.TEXT_NODE && !node.textContent))
  )
    node = direction === 'before' ? node.previousSibling : node.nextSibling;
  return node;
}

/** Source 838978: ordinal words are consumed; ordinary names stay before the new badge. */
export function acceptPromptGhost(ghost, option, asset, editor) {
  const parent = ghost.parentNode;
  if (!parent || !ghost.isConnected) return null;
  const consume = Number(ghost.dataset.suggestConsume || 0);
  if (consume > 0) {
    const before = editor.ownerDocument.createRange();
    before.selectNodeContents(editor);
    before.setEndBefore(ghost);
    const start = textPosition(
      editor,
      readPromptDOM(before.cloneContents(), false).length - consume,
      'right',
    );
    if (!start) return null;
    before.setStart(start.node, start.offset);
    before.deleteContents();
  }
  const previous = sibling(ghost, 'before');
  const needsSpace =
    previous &&
    (previous.nodeType === Node.TEXT_NODE
      ? previous.textContent.length && !/[ \n]$/.test(previous.textContent)
      : previous.nodeName !== 'BR');
  if (needsSpace) ghost.before(parent.ownerDocument.createTextNode(' '));
  ghost.before(createPromptBadge(parent.ownerDocument, option, asset, false));
  let tail = sibling(ghost, 'after');
  if (tail?.nodeType !== Node.TEXT_NODE || !tail.textContent.startsWith(' ')) {
    tail = parent.ownerDocument.createTextNode(' ');
    ghost.before(tail);
  }
  removePromptGhost(ghost);
  return { node: tail, offset: 1 };
}
