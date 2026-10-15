import { useLayoutEffect, useRef } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendPromptBadgeSwapOverlay,
  isSwappablePromptBadge,
  PROMPT_BADGE_SWAP_SELECTOR,
  promptBadgeRange,
  stripPromptBadgeSwapOverlays,
} from './prompt-badge-swap-dom.js';
import {
  readPromptDOM,
  renderPromptDOM,
  selectionOffsets,
  setPromptCaret,
} from './node-prompt-dom.js';
import { useNodePromptSwap } from './useNodePromptSwap.js';

const identity = (url) => url;
const references = {
  mixedList: [
    { nodeId: 'image-a', mediaType: 'image', url: '/a.webp' },
    { nodeId: 'video-b', mediaType: 'video', url: '/b.mp4' },
  ],
};
const roots = [];
function prompt(value) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  roots.push(root);
  renderPromptDOM(root, value, references, identity, false);
  return root;
}
afterEach(() => roots.splice(0).forEach((root) => root.remove()));

function SwapHarness({
  blocked = false,
  mentionEnabled = true,
  menu = null,
  composing = false,
  onOpenSwap = () => {},
}) {
  const editorRef = useRef(null);
  const latest = useRef({});
  const composingRef = useRef(false);
  useLayoutEffect(() => {
    latest.current = { blocked, mentionEnabled };
    composingRef.current = composing;
  });
  useNodePromptSwap({ editorRef, latest, menu, composing: composingRef }, { onOpenSwap });
  return (
    <div ref={editorRef} data-testid="editor">
      <span
        className="node-generator-prompt-badge"
        data-prompt-token="{{Mixed 1}}"
        data-mention-type="mixed"
        data-mention-node-id="image-a"
        data-mention-missing="false"
      >
        <img src="/a.webp" alt="" />
        <span data-mention-label="true">图片1</span>
      </span>
      <span
        className="node-generator-prompt-badge"
        data-prompt-token="{{Mixed 2}}"
        data-mention-type="mixed"
        data-mention-node-id="video-b"
        data-mention-missing="false"
      >
        <video src="/b.mp4" />
        <span data-mention-label="true">视频2</span>
      </span>
    </div>
  );
}

describe('prompt badge swap DOM', () => {
  it('locates only the selected occurrence in serialized UTF-16 text, including repeated tokens and linebreaks', () => {
    const value = '前😀{{Mixed 1}}\n重复{{Mixed 1}}后';
    const root = prompt(value);
    const badges = root.querySelectorAll('[data-prompt-token]');
    const first = promptBadgeRange(root, badges[0]);
    const second = promptBadgeRange(root, badges[1]);
    expect(first).toEqual({ start: 3, end: 14 });
    expect(second).toEqual({ start: 17, end: 28 });
    expect(value.slice(second.start, second.end)).toBe('{{Mixed 1}}');
    badges[1].remove();
    expect(promptBadgeRange(root, badges[1])).toBeNull();
    expect(promptBadgeRange(prompt('其它'), badges[0])).toBeNull();
  });

  it('excludes missing, ghost, special and anonymous references from the affordance', () => {
    const root = prompt('{{Mixed 1}}{{Mixed 9}}');
    const [valid, missing] = root.querySelectorAll('[data-prompt-token]');
    expect(isSwappablePromptBadge(valid)).toBe(true);
    expect(isSwappablePromptBadge(missing)).toBe(false);
    expect(appendPromptBadgeSwapOverlay(missing)).toBeNull();
    const clone = valid.cloneNode(true);
    clone.dataset.mentionSuggest = '1';
    expect(isSwappablePromptBadge(clone)).toBe(false);
    delete clone.dataset.mentionSuggest;
    clone.dataset.mentionNodeId = '';
    expect(isSwappablePromptBadge(clone)).toBe(false);
    clone.dataset.mentionNodeId = 'image-a';
    clone.dataset.mentionType = 'camerapreset';
    expect(isSwappablePromptBadge(clone)).toBe(false);
  });

  it('keeps affordance UI out of copy/value/caret serialization and removes it without touching media', () => {
    const root = prompt('前{{Mixed 1}}{{Mixed 2}}后');
    const badges = root.querySelectorAll('[data-prompt-token]');
    const image = badges[0].querySelector('img');
    const video = badges[1].querySelector('video');
    const pause = vi.spyOn(video, 'pause');
    const load = vi.spyOn(video, 'load');
    const overlay = appendPromptBadgeSwapOverlay(badges[0]);
    expect(appendPromptBadgeSwapOverlay(badges[0])).toBe(overlay);
    appendPromptBadgeSwapOverlay(badges[1]);
    overlay.appendChild(document.createTextNode('临时替换按钮'));
    expect(overlay.dataset.promptAffordanceChip).toBe('true');
    expect(readPromptDOM(root)).toBe('前{{Mixed 1}}{{Mixed 2}}后');
    const isolated = document.createDocumentFragment();
    isolated.appendChild(overlay.cloneNode(true));
    expect(readPromptDOM(isolated, false)).toBe('');
    setPromptCaret(root, 12);
    expect(selectionOffsets(root)).toEqual({ start: 12, end: 12 });
    stripPromptBadgeSwapOverlays(root);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(root.querySelector('img')).toBe(image);
    expect(root.querySelector('video')).toBe(video);
    expect(video.getAttribute('src')).toBe('/b.mp4');
    expect(pause).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('prompt badge swap pointer lifecycle', () => {
  it('moves one hover overlay between badges and opens only when the exchange icon is clicked', () => {
    const onOpenSwap = vi.fn();
    const { getByTestId } = render(<SwapHarness onOpenSwap={onOpenSwap} />);
    const root = getByTestId('editor');
    const badges = root.querySelectorAll('[data-prompt-token]');
    fireEvent.pointerOver(badges[0].querySelector('img'));
    const firstOverlay = root.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
    expect(badges[0].contains(firstOverlay)).toBe(true);
    fireEvent.pointerOver(badges[0].querySelector('[data-mention-label]'));
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBe(firstOverlay);
    fireEvent.click(badges[0].querySelector('[data-mention-label]'));
    expect(onOpenSwap).not.toHaveBeenCalled();
    fireEvent.pointerOver(badges[1].querySelector('video'));
    const secondOverlay = root.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
    expect(root.querySelectorAll(PROMPT_BADGE_SWAP_SELECTOR)).toHaveLength(1);
    expect(badges[1].contains(secondOverlay)).toBe(true);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    secondOverlay.querySelector('svg').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(onOpenSwap).toHaveBeenCalledExactlyOnceWith(badges[1]);
    fireEvent.pointerLeave(root);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
  });

  it('holds the current overlay while the menu is open, clears it on close and uses the latest opener', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByTestId, rerender } = render(<SwapHarness onOpenSwap={first} />);
    const root = getByTestId('editor');
    const badge = root.querySelector('[data-prompt-token]');
    fireEvent.pointerOver(badge);
    const overlay = root.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
    rerender(<SwapHarness menu={{ swapBadge: badge }} onOpenSwap={second} />);
    fireEvent.pointerLeave(root);
    fireEvent.pointerOver(root.querySelectorAll('[data-prompt-token]')[1]);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBe(overlay);
    fireEvent.click(overlay);
    expect(second).toHaveBeenCalledExactlyOnceWith(badge);
    expect(first).not.toHaveBeenCalled();
    rerender(<SwapHarness onOpenSwap={second} />);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
  });

  it.each([
    ['blocked', { blocked: true }],
    ['mention unsupported', { mentionEnabled: false }],
    ['composition', { composing: true }],
  ])('removes an existing overlay and blocks opening during %s', (_label, props) => {
    const onOpenSwap = vi.fn();
    const { getByTestId, rerender } = render(<SwapHarness onOpenSwap={onOpenSwap} />);
    const root = getByTestId('editor');
    const badge = root.querySelector('[data-prompt-token]');
    fireEvent.pointerOver(badge);
    const overlay = root.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
    rerender(<SwapHarness {...props} onOpenSwap={onOpenSwap} />);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    fireEvent.pointerOver(badge);
    fireEvent.click(overlay);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(onOpenSwap).not.toHaveBeenCalled();
  });

  it('releases listeners and transient UI on unmount without releasing the original media', () => {
    const onOpenSwap = vi.fn();
    const { getByTestId, unmount } = render(<SwapHarness onOpenSwap={onOpenSwap} />);
    const root = getByTestId('editor');
    const badge = root.querySelector('[data-prompt-token]');
    const image = badge.querySelector('img');
    fireEvent.pointerOver(badge);
    unmount();
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(badge.querySelector('img')).toBe(image);
    fireEvent.pointerOver(badge);
    expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(onOpenSwap).not.toHaveBeenCalled();
  });
});
