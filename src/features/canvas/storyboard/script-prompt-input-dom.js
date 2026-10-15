import {
  buildScriptAssetIdToNameMap,
  findScriptPromptRefMatches,
  parseScriptAssetMentions,
} from './prompt-compose-model.js';

const zeroWidth = /\u200b/g;
const suffixBoundary = /^[\s，。！？、；：,.!?;:）】》〉」』]/;
const isText = (node) => node?.nodeType === 3;
const isBreak = (node) => node?.nodeType === 1 && node.tagName === 'BR';
const isChip = (node) => node?.nodeType === 1 && node.getAttribute('contenteditable') === 'false';

/** oF: chip labels can change, but their saved source text does not. */
export function readScriptPromptDOM(editor) {
  if (!editor) return '';
  return Array.from(editor.childNodes)
    .map((node, index, nodes) => {
      if (isText(node)) return (node.textContent ?? '').replace(zeroWidth, '');
      if (isChip(node)) return node.dataset.mentionText ?? node.textContent ?? '';
      if (isBreak(node))
        return index === nodes.length - 1 && node.dataset.sentinel === 'true' ? '' : '\n';
      return node.textContent ?? '';
    })
    .join('');
}

export function scriptPromptSuppressedRanges(value, labels = []) {
  const ranges = [];
  for (const label of labels) {
    const prefix = `${label}：`;
    let offset = 0;
    while (offset <= value.length) {
      const start = value.indexOf(prefix, offset);
      if (start < 0) break;
      if (start && value[start - 1] !== '\n') {
        offset = start + prefix.length;
        continue;
      }
      const next = value.indexOf('\n\n', start);
      const end = next < 0 ? value.length : next;
      ranges.push([start, end]);
      offset = end;
    }
  }
  return ranges;
}

export function createScriptPromptChip(document, { label, assetId, mentionText }) {
  const chip = document.createElement('span');
  chip.setAttribute('contenteditable', 'false');
  chip.className = 'script-prompt-chip';
  chip.textContent = label;
  chip.dataset.atMention = label.replace(/^[@＠]/, '');
  if (assetId) chip.dataset.assetId = assetId;
  if (mentionText) chip.dataset.mentionText = mentionText;
  return chip;
}

/** oB renders only outside editing, preserving native selection and undo while focused. */
export function renderScriptPromptDOM(
  editor,
  { value = '', assets, entityRefs, readonly = false, suppressChipSectionLabels = [] },
) {
  const document = editor.ownerDocument;
  const names = buildScriptAssetIdToNameMap(assets);
  const parsed = parseScriptAssetMentions(value, assets);
  const refs = [
    ...(entityRefs ?? []),
    ...parsed.flatMap((part) =>
      part.type === 'mention' && part.assetId
        ? [{ text: part.value.slice(1), assetId: part.assetId }]
        : [],
    ),
  ].filter(
    (ref, index, all) =>
      all.findIndex((other) => other.assetId === ref.assetId && other.text === ref.text) === index,
  );
  const fragment = document.createDocumentFragment();
  const appendText = (text) => text && fragment.appendChild(document.createTextNode(text));
  if (refs.length) {
    const suppressed = scriptPromptSuppressedRanges(value, suppressChipSectionLabels);
    const matches = findScriptPromptRefMatches(value, refs).filter(
      (match) =>
        /^[@＠]/.test(match.sourceText) ||
        !suppressed.some(([start, end]) => match.start >= start && match.start < end),
    );
    let offset = 0;
    for (const { ref, start, end, sourceText } of matches) {
      appendText(value.slice(offset, start));
      const name = names.get(ref.assetId) ?? ref.text;
      fragment.appendChild(
        createScriptPromptChip(document, {
          label: readonly ? name : `@${name}`,
          assetId: ref.assetId,
          mentionText: sourceText,
        }),
      );
      offset = end;
    }
    appendText(value.slice(offset));
  } else {
    for (const part of parsed) {
      if (part.type === 'mention')
        fragment.appendChild(
          createScriptPromptChip(document, {
            label: readonly ? part.value.replace(/^[@＠]/, '') : part.value,
            assetId: part.assetId,
            mentionText: part.value,
          }),
        );
      else appendText(part.value);
    }
  }
  if (!fragment.childNodes.length) fragment.appendChild(document.createTextNode(''));
  editor.replaceChildren(fragment);
}

export function normalizeScriptPromptDOM(editor) {
  const document = editor.ownerDocument;
  for (const block of Array.from(editor.querySelectorAll('div'))) {
    const previous = block.previousSibling;
    if (previous && !isBreak(previous)) block.before(document.createElement('br'));
    const next = block.nextSibling;
    if (next && !isBreak(next) && next.nodeName !== 'DIV')
      block.after(document.createElement('br'));
    block.replaceWith(...block.childNodes);
  }
  if (!editor.childNodes.length) editor.appendChild(document.createTextNode(''));
}

export function scriptPromptSelection(editor) {
  const document = editor.ownerDocument;
  const selection = document.defaultView?.getSelection();
  if (!selection) return null;
  let range = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  const sentinel = editor.lastChild;
  if (
    isBreak(sentinel) &&
    sentinel.dataset.sentinel === 'true' &&
    (range.startContainer === sentinel ||
      (range.startContainer === editor && range.startOffset > editor.childNodes.length - 1))
  ) {
    range = document.createRange();
    range.setStartBefore(sentinel);
    range.collapse(true);
  }
  return { selection, range };
}

export function focusScriptPromptRange(editor, range) {
  if (
    !editor.isConnected ||
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  )
    return false;
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (!selection) return false;
  editor.focus({ preventScroll: true });
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

const nativeCommand = (document, command, value) => {
  try {
    return !!document.execCommand?.(command, false, value);
  } catch {
    return false;
  }
};

export function insertScriptPromptText(editor, text) {
  const current = scriptPromptSelection(editor);
  if (!current) return false;
  const { selection, range } = current;
  const document = editor.ownerDocument;
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  text.split('\n').forEach((line, index) => {
    if (index) fragment.appendChild(document.createElement('br'));
    if (line) fragment.appendChild(document.createTextNode(line));
  });
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    const caret = document.createRange();
    caret.setStartAfter(last);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
  }
  return true;
}

export function insertScriptPromptLineBreak(editor) {
  if (nativeCommand(editor.ownerDocument, 'insertLineBreak')) return true;
  const current = scriptPromptSelection(editor);
  if (!current) return false;
  const { range } = current;
  const document = editor.ownerDocument;
  range.deleteContents();
  const lineBreak = document.createElement('br');
  range.insertNode(lineBreak);
  const after = lineBreak.nextSibling;
  if (isText(after) && !after.textContent) after.remove();
  if (!lineBreak.nextSibling) {
    const sentinel = document.createElement('br');
    sentinel.dataset.sentinel = 'true';
    lineBreak.after(sentinel);
  }
  const caret = document.createRange();
  caret.setStartAfter(lineBreak);
  caret.collapse(true);
  return focusScriptPromptRange(editor, caret);
}

/** The source stores a text-node identity and replaces just the @ trigger. */
export function findScriptPromptTrigger(editor) {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  const offset = range.startOffset - 1;
  if (!editor.contains(node) || !isText(node) || offset < 0) return null;
  const text = node.textContent ?? '';
  if (!['@', '＠'].includes(text[offset]) || (offset && /[a-zA-Z0-9]/.test(text[offset - 1])))
    return null;
  const anchor = editor.ownerDocument.createRange();
  anchor.setStart(node, offset);
  anchor.setEnd(node, offset + 1);
  return { node, offset, anchor };
}

export function insertScriptPromptMention(editor, trigger, { id, name }, marker) {
  const { node, offset } = trigger;
  if (!editor.contains(node) || !isText(node) || !['@', '＠'].includes(node.textContent?.[offset]))
    return false;
  const document = editor.ownerDocument;
  const after = (node.textContent ?? '').slice(offset + 1);
  const spacing = !after ? '\u200b' : !suffixBoundary.test(after) ? ' ' : '';
  const chip = createScriptPromptChip(document, {
    label: `@${name}`,
    assetId: id,
    mentionText: `@${name}`,
  });
  chip.dataset.mentionInsertionMarker = marker;
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  focusScriptPromptRange(editor, range);
  const insertedNatively = nativeCommand(document, 'insertHTML', `${chip.outerHTML}${spacing}`);
  let inserted = insertedNatively
    ? editor.querySelector(`[data-mention-insertion-marker="${marker}"]`)
    : null;
  if (!insertedNatively) {
    chip.removeAttribute('data-mention-insertion-marker');
    const before = document.createTextNode((node.textContent ?? '').slice(0, offset));
    const tail = document.createTextNode(`${spacing}${after}`);
    node.replaceWith(before, chip, tail);
    inserted = chip;
  }
  if (inserted) {
    inserted.removeAttribute('data-mention-insertion-marker');
    const caret = document.createRange();
    const next = inserted.nextSibling;
    if (isText(next))
      caret.setStart(
        next,
        Math.min(spacing.length || (/^\s/.test(after) ? 1 : 0), next.textContent.length),
      );
    else caret.setStartAfter(inserted);
    caret.collapse(true);
    focusScriptPromptRange(editor, caret);
  }
  return insertedNatively || !!inserted;
}

export function deleteScriptPromptChipBeforeCaret(editor) {
  const selection = editor.ownerDocument.defaultView?.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;
  const chip = isText(range.startContainer)
    ? range.startOffset === 0 && range.startContainer.previousSibling
    : range.startContainer === editor && range.startOffset > 0
      ? editor.childNodes[range.startOffset - 1]
      : null;
  if (!isChip(chip)) return false;
  const before = chip.previousSibling;
  const after = chip.nextSibling;
  range.selectNode(chip);
  selection.removeAllRanges();
  selection.addRange(range);
  const native = nativeCommand(editor.ownerDocument, 'delete');
  const caret = editor.ownerDocument.createRange();
  if (native) {
    if (isText(after) && after.parentNode === editor) caret.setStart(after, 0);
    else if (isText(before) && before.parentNode === editor)
      caret.setStart(before, before.textContent.length);
    else if (after?.parentNode === editor) caret.setStartBefore(after);
    else caret.setStart(editor, editor.childNodes.length);
  } else {
    chip.remove();
    if (isText(before)) {
      const offset = before.textContent.length;
      if (isText(after)) {
        before.textContent += after.textContent;
        after.remove();
      }
      caret.setStart(before, offset);
    } else {
      if (!editor.childNodes.length) editor.appendChild(editor.ownerDocument.createTextNode(''));
      if (after?.parentNode === editor) caret.setStartBefore(after);
      else caret.setStart(editor, editor.childNodes.length);
    }
  }
  caret.collapse(true);
  focusScriptPromptRange(editor, caret);
  return true;
}

const pasteBlocks = new Set([
  'P',
  'DIV',
  'LI',
  'TR',
  'TABLE',
  'UL',
  'OL',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
]);
const ignoredPasteTags = new Set([
  'STYLE',
  'SCRIPT',
  'HEAD',
  'TITLE',
  'META',
  'LINK',
  'NOSCRIPT',
  'TEMPLATE',
]);
export function extractScriptPromptPaste(dataTransfer, document) {
  let text = dataTransfer?.getData('text/plain') ?? '';
  if (!text) {
    const html = dataTransfer?.getData('text/html');
    const Parser = document.defaultView?.DOMParser;
    if (html && Parser) {
      const parsed = new Parser().parseFromString(html, 'text/html');
      const pieces = [];
      const newline = () => {
        if (pieces.length && !pieces.at(-1).endsWith('\n')) pieces.push('\n');
      };
      const walk = (node) => {
        if (isText(node)) return void pieces.push(node.textContent ?? '');
        if (node.nodeType !== 1 || ignoredPasteTags.has(node.tagName)) return;
        if (isBreak(node)) return void pieces.push('\n');
        const block = pasteBlocks.has(node.tagName);
        if (block) newline();
        node.childNodes.forEach(walk);
        if (block) newline();
      };
      walk(parsed.body);
      text = pieces.join('');
    }
  }
  return text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
}
