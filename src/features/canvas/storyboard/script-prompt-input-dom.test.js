import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createScriptPromptChip,
  deleteScriptPromptChipBeforeCaret,
  extractScriptPromptPaste,
  findScriptPromptTrigger,
  insertScriptPromptLineBreak,
  insertScriptPromptMention,
  normalizeScriptPromptDOM,
  readScriptPromptDOM,
  renderScriptPromptDOM,
} from './script-prompt-input-dom.js';

const assets = {
  characters: [{ id: 'alice', name: 'Alice', role: 'character' }],
  scenes: [],
  props: [],
};
const editor = (text = '') => {
  const element = document.createElement('div');
  element.setAttribute('contenteditable', 'true');
  element.tabIndex = 0;
  element.appendChild(document.createTextNode(text));
  document.body.appendChild(element);
  return element;
};
const caret = (node, offset) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};
afterEach(() => {
  document.body.replaceChildren();
  delete document.execCommand;
});

describe('ScriptV2 prompt DOM transactions', () => {
  it('renders current labels while serializing retained source mentions and suppressing only bare sections', () => {
    const input = editor();
    const renamed = { ...assets, characters: [{ id: 'alice', name: 'Alicia' }] };
    const value = '对白与旁白：\nAlice and @Alice\n\n画面：Alice';
    renderScriptPromptDOM(input, {
      value,
      assets: renamed,
      entityRefs: [{ text: 'Alice', assetId: 'alice' }],
      suppressChipSectionLabels: ['对白与旁白'],
    });
    const chips = input.querySelectorAll('[data-at-mention]');
    expect(chips).toHaveLength(2);
    expect(Array.from(chips, (chip) => chip.textContent)).toEqual(['@Alicia', '@Alicia']);
    expect(Array.from(chips, (chip) => chip.dataset.mentionText)).toEqual(['@Alice', 'Alice']);
    expect(readScriptPromptDOM(input)).toBe(value);
    renderScriptPromptDOM(input, {
      value: '@Alice',
      assets: renamed,
      entityRefs: [{ text: 'Alice', assetId: 'alice' }],
      readonly: true,
    });
    expect(input.textContent).toBe('Alicia');
    expect(readScriptPromptDOM(input)).toBe('@Alice');
  });

  it('replaces only the trigger, adds source spacing, and ignores stale node identities', () => {
    const input = editor('before @tail');
    caret(input.firstChild, 8);
    const trigger = findScriptPromptTrigger(input);
    expect(
      insertScriptPromptMention(input, trigger, { id: 'alice', name: 'Alice' }, 'test-insert'),
    ).toBe(true);
    expect(readScriptPromptDOM(input)).toBe('before @Alice tail');
    expect(input.querySelector('[data-asset-id]').dataset.assetId).toBe('alice');
    expect(insertScriptPromptMention(input, trigger, { id: 'alice', name: 'Alice' }, 'stale')).toBe(
      false,
    );
    const email = editor('mail@');
    caret(email.firstChild, 5);
    expect(findScriptPromptTrigger(email)).toBeNull();
  });

  it('uses native chip insertion and deletion to preserve browser undo, with a fallback caret', () => {
    const input = editor('@');
    caret(input.firstChild, 1);
    document.execCommand = vi.fn((command, _ui, html) => {
      const range = window.getSelection().getRangeAt(0);
      if (command === 'insertHTML') {
        range.deleteContents();
        const template = document.createElement('template');
        template.innerHTML = html;
        range.insertNode(template.content);
      } else if (command === 'delete') range.deleteContents();
      return true;
    });
    expect(
      insertScriptPromptMention(
        input,
        findScriptPromptTrigger(input),
        { id: 'alice', name: 'Alice' },
        'native',
      ),
    ).toBe(true);
    expect(document.execCommand.mock.calls[0][0]).toBe('insertHTML');
    expect(readScriptPromptDOM(input)).toBe('@Alice');
    const chip = input.querySelector('[data-asset-id]');
    caret(chip.nextSibling, 0);
    expect(deleteScriptPromptChipBeforeCaret(input)).toBe(true);
    expect(document.execCommand.mock.calls[1][0]).toBe('delete');
    expect(readScriptPromptDOM(input)).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('preserves trailing newlines without serializing the sentinel and flattens browser divs on blur', () => {
    const input = editor('line');
    caret(input.firstChild, 4);
    insertScriptPromptLineBreak(input);
    expect(readScriptPromptDOM(input)).toBe('line\n');
    expect(input.lastChild.dataset.sentinel).toBe('true');
    input.innerHTML = 'one<div>two</div><div>three</div>';
    normalizeScriptPromptDOM(input);
    expect(readScriptPromptDOM(input)).toBe('one\ntwo\nthree');
  });

  it('deletes one chip and restores the between-text caret while leaving other occurrences', () => {
    const input = editor('left');
    const first = createScriptPromptChip(document, {
      label: '@Alice',
      assetId: 'alice',
      mentionText: '@Alice',
    });
    const tail = document.createTextNode('right');
    input.append(
      first,
      tail,
      createScriptPromptChip(document, {
        label: '@Alice',
        assetId: 'alice',
        mentionText: '@Alice',
      }),
    );
    caret(tail, 0);
    expect(deleteScriptPromptChipBeforeCaret(input)).toBe(true);
    expect(readScriptPromptDOM(input)).toBe('leftright@Alice');
    expect(input.querySelectorAll('[data-asset-id]')).toHaveLength(1);
    expect(window.getSelection().anchorOffset).toBe(4);
  });

  it('extracts plain text first and safely reads HTML fallback block boundaries', () => {
    const transfer = {
      getData: (type) =>
        type === 'text/html' ? '<p>one<script>evil()</script></p><p>two<br>three</p>' : '',
    };
    expect(extractScriptPromptPaste(transfer, document)).toBe('one\ntwo\nthree\n');
    expect(
      extractScriptPromptPaste(
        { getData: (type) => (type === 'text/plain' ? 'a\r\n\n\n\nb' : '<b>ignored</b>') },
        document,
      ),
    ).toBe('a\n\nb');
  });
});
