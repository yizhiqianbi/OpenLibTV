import { createRef, Profiler } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NodeGeneratorPrompt from './NodeGeneratorPrompt.jsx';
import { listNodePromptReferences } from './node-prompt-model.js';
import { PROMPT_BADGE_SWAP_SELECTOR } from './prompt-badge-swap-dom.js';

const references = {
  mixedList: [
    { nodeId: 'image-a', mediaType: 'image', url: '/a.webp' },
    { nodeId: 'image-b', mediaType: 'image', url: '/b.webp' },
    { nodeId: 'video-c', mediaType: 'video', url: '/c.mp4' },
    { nodeId: 'video-d', mediaType: 'video', url: '/d.mp4' },
  ],
};
const options = listNodePromptReferences(references, { mentionListType: 'mixed' });
const editor = () => screen.getByRole('textbox', { name: '提示词' });
function openSwap(badge) {
  fireEvent.pointerOver(badge.querySelector('img, video, .node-generator-prompt-badge-glyph'));
  const overlay = badge.querySelector(PROMPT_BADGE_SWAP_SELECTOR);
  expect(overlay).not.toBeNull();
  fireEvent.click(overlay);
  return overlay;
}
function candidate(nodeId, kind, extra = {}) {
  return { nodeId, label: nodeId, kind, connected: false, ...extra };
}
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

describe('actual NodeGeneratorPrompt badge swap integration', () => {
  it('opens from the thumbnail and replaces only the clicked duplicate without spaces, preserving other media and one undo boundary', () => {
    const ref = createRef();
    const onChange = vi.fn();
    const value = '前{{Mixed 1}}中{{Mixed 1}}后{{Mixed 3}}';
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value={value}
        references={references}
        mentionListType="mixed"
        onChange={onChange}
      />,
    );
    const root = editor();
    const badges = root.querySelectorAll('[data-prompt-token]');
    const untouchedFirst = badges[0];
    const untouchedVideo = badges[2].querySelector('video');
    openSwap(badges[1]);
    expect(screen.getByRole('listbox', { name: '引用素材' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: '图片2' }));
    expect(ref.current.getValue()).toBe('前{{Mixed 1}}中{{Mixed 2}}后{{Mixed 3}}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('前{{Mixed 1}}中{{Mixed 2}}后{{Mixed 3}}');
    expect(root.querySelector('[data-prompt-token]')).toBe(untouchedFirst);
    expect(root.querySelector('video')).toBe(untouchedVideo);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(ref.current.getValue()).toBe(value);
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(ref.current.getValue()).toBe(value);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('hides text and the asset entry while connecting a new media reference, then swaps to its latest token without deleting old nodes or edges', async () => {
    const ref = createRef();
    const onChange = vi.fn();
    const initialReferences = { mixedList: [references.mixedList[0], references.mixedList[2]] };
    const afterConnect = {
      mixedList: [...initialReferences.mixedList, references.mixedList[1]],
    };
    const oldOption = listNodePromptReferences(initialReferences, { mentionListType: 'mixed' })[0];
    const latestOption = listNodePromptReferences(afterConnect, { mentionListType: 'mixed' })[2];
    const nodes = [{ id: 'image-a' }, { id: 'image-b' }, { id: 'target' }];
    const originalNodes = [...nodes];
    const edges = [{ source: 'image-a', target: 'target' }];
    const oldEdge = edges[0];
    const connect = vi.fn((source, target) => {
      edges.push({ source, target });
      return true;
    });
    const getLatestReference = vi.fn(() => latestOption);
    const onOpenAssetPicker = vi.fn();
    const canvasMentions = {
      targetNodeId: 'target',
      source: {
        load: vi.fn(async () => [
          candidate('image-a', 'image', { connected: true, mentionOption: oldOption }),
          candidate('新图片', 'image', { nodeId: 'image-b' }),
          candidate('文本候选', 'text', { connected: true }),
        ]),
      },
      connect,
      getLatestReference,
      onOpenAssetPicker,
    };
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value="左{{Mixed 1}}右{{Mixed 2}}"
        references={initialReferences}
        mentionListType="mixed"
        canvasMentions={canvasMentions}
        onChange={onChange}
      />,
    );
    const video = editor().querySelector('video');
    openSwap(editor().querySelector('[data-prompt-token]'));
    await screen.findByRole('option', { name: 'image-a' });
    expect(screen.queryByRole('option', { name: '文本候选' })).toBeNull();
    expect(screen.queryByRole('button', { name: '文本' })).toBeNull();
    expect(screen.queryByRole('button', { name: '资产' })).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button', { name: '图片' }));
    fireEvent.click(await screen.findByRole('option', { name: '新图片' }));
    expect(connect).toHaveBeenCalledExactlyOnceWith('image-b', 'target');
    expect(getLatestReference).toHaveBeenCalledExactlyOnceWith('image-b');
    expect(ref.current.getValue()).toBe('左{{Mixed 3}}右{{Mixed 2}}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('左{{Mixed 3}}右{{Mixed 2}}');
    expect(editor().querySelector('video')).toBe(video);
    expect(nodes).toEqual(originalNodes);
    expect(edges[0]).toBe(oldEdge);
    expect(edges).toEqual([
      { source: 'image-a', target: 'target' },
      { source: 'image-b', target: 'target' },
    ]);
    expect(onOpenAssetPicker).not.toHaveBeenCalled();
  });

  it('releases only the replaced video thumbnail and keeps another video DOM and its source intact', () => {
    const ref = createRef();
    render(
      <NodeGeneratorPrompt
        ref={ref}
        value="{{Mixed 3}}和{{Mixed 4}}"
        references={references}
        mentionListType="mixed"
      />,
    );
    const root = editor();
    const [targetVideo, otherVideo] = root.querySelectorAll('video');
    const targetPause = vi.fn();
    const targetLoad = vi.fn();
    const otherPause = vi.fn();
    const otherLoad = vi.fn();
    // Own functions distinguish the two media owners from the shared jsdom mock.
    Object.assign(targetVideo, { pause: targetPause, load: targetLoad });
    Object.assign(otherVideo, { pause: otherPause, load: otherLoad });
    openSwap(root.querySelector('[data-prompt-token]'));
    fireEvent.click(screen.getByRole('option', { name: '图片2' }));
    expect(ref.current.getValue()).toBe('{{Mixed 2}}和{{Mixed 4}}');
    expect(targetPause).toHaveBeenCalledTimes(1);
    expect(targetLoad).toHaveBeenCalledTimes(1);
    expect(targetVideo.hasAttribute('src')).toBe(false);
    expect(root.querySelector('video')).toBe(otherVideo);
    expect(otherVideo.getAttribute('src')).toBe('/d.mp4');
    expect(otherPause).not.toHaveBeenCalled();
    expect(otherLoad).not.toHaveBeenCalled();
  });

  it.each(['basic', 'canvas'])(
    'closes an open %s swap on the real compositionStart event without replacing or connecting',
    async (menuType) => {
      const ref = createRef();
      const onChange = vi.fn();
      const connect = vi.fn(() => true);
      const getLatestReference = vi.fn(() => options[1]);
      const canvasMentions = {
        targetNodeId: 'target',
        source: {
          load: vi.fn(async () => [
            candidate('image-a', 'image', { connected: true, mentionOption: options[0] }),
            candidate('image-b', 'image'),
          ]),
        },
        connect,
        getLatestReference,
      };
      const value = '前{{Mixed 1}}后';
      render(
        <NodeGeneratorPrompt
          ref={ref}
          value={value}
          references={references}
          mentionListType="mixed"
          canvasMentions={menuType === 'canvas' ? canvasMentions : undefined}
          onChange={onChange}
        />,
      );
      const root = editor();
      const badge = root.querySelector('[data-prompt-token]');
      openSwap(badge);
      if (menuType === 'canvas') await screen.findByRole('option', { name: 'image-a' });
      else expect(screen.getByRole('option', { name: '图片2' })).toBeTruthy();
      fireEvent.compositionStart(root);
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
      fireEvent.pointerOver(badge);
      expect(root.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
      expect(root.querySelector('[data-prompt-token]')).toBe(badge);
      expect(ref.current.getValue()).toBe(value);
      expect(onChange).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(getLatestReference).not.toHaveBeenCalled();
    },
  );

  it('keeps a wide basic swap menu clamped on a narrow viewport without rendering every animation frame', () => {
    const originalWidth = window.innerWidth;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    let follow;
    let commits = 0;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      follow = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('node-generator-prompt-mentions'))
        return new DOMRect(0, 100, 320, 208);
      if (this.dataset.promptToken) return new DOMRect(330, 100, 16, 16);
      return originalRect.call(this);
    });
    const view = render(
      <Profiler id="narrow-swap" onRender={() => (commits += 1)}>
        <NodeGeneratorPrompt
          value="{{Image 1}}"
          references={{
            imageList: [
              { nodeId: 'a', url: '/a.webp', label: '长素材名称撑开到基础菜单的320px上限' },
            ],
          }}
        />
      </Profiler>,
    );
    try {
      openSwap(editor().querySelector('[data-prompt-token]'));
      expect(screen.getByRole('listbox').style.left).toBe('66px');
      for (let index = 0; index < 2; index += 1) {
        const before = commits;
        act(() => follow(index));
        expect(screen.getByRole('listbox').style.left).toBe('66px');
        expect(commits).toBe(before);
      }
    } finally {
      view.unmount();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it.each([
    ['readonly', { readonly: true }],
    ['disabled', { disabled: true }],
    ['mention disabled', { mentionEnabled: false }],
  ])('does not show or open swap while %s', (_label, props) => {
    const onChange = vi.fn();
    render(
      <NodeGeneratorPrompt
        value="{{Mixed 1}}"
        references={references}
        mentionListType="mixed"
        onChange={onChange}
        {...props}
      />,
    );
    const badge = editor().querySelector('[data-prompt-token]');
    fireEvent.pointerOver(badge.querySelector('img'));
    fireEvent.click(badge);
    expect(editor().querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes an existing swap when mention support is disabled without a reference redraw', () => {
    const onChange = vi.fn();
    const props = {
      value: '{{Mixed 1}}',
      references,
      mentionListType: 'mixed',
      onChange,
    };
    const view = render(<NodeGeneratorPrompt {...props} />);
    const badge = editor().querySelector('[data-prompt-token]');
    openSwap(badge);
    view.rerender(<NodeGeneratorPrompt {...props} mentionEnabled={false} />);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(editor().querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(editor().querySelector('[data-prompt-token]')).toBe(badge);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not treat a ghost badge as an exchange target', () => {
    const onChange = vi.fn();
    render(
      <NodeGeneratorPrompt
        value="{{Mixed 1}}"
        references={references}
        mentionListType="mixed"
        onChange={onChange}
      />,
    );
    const ghost = editor().querySelector('[data-prompt-token]').cloneNode(true);
    ghost.dataset.mentionSuggest = '1';
    editor().appendChild(ghost);
    fireEvent.pointerOver(ghost.querySelector('img'));
    expect(ghost.querySelector(PROMPT_BADGE_SWAP_SELECTOR)).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['external value', 'reference redraw'])(
    'cancels an open swap and ignores a late source response after %s',
    async (changeType) => {
      const ref = createRef();
      const onChange = vi.fn();
      let resolve;
      let requestSignal;
      const connect = vi.fn(() => true);
      const canvasMentions = {
        targetNodeId: 'target',
        source: {
          load: vi.fn(({ signal }) => {
            requestSignal = signal;
            return new Promise((done) => {
              resolve = done;
            });
          }),
        },
        connect,
        getLatestReference: vi.fn(() => options[1]),
      };
      const props = {
        ref,
        value: '旧{{Mixed 1}}提示词',
        references,
        mentionListType: 'mixed',
        canvasMentions,
        onChange,
      };
      const { rerender } = render(<NodeGeneratorPrompt {...props} />);
      openSwap(editor().querySelector('[data-prompt-token]'));
      await waitFor(() => expect(canvasMentions.source.load).toHaveBeenCalledTimes(1));
      const next =
        changeType === 'external value'
          ? { ...props, value: '新的{{Mixed 1}}正文' }
          : {
              ...props,
              references: {
                mixedList: [{ ...references.mixedList[0], url: '/changed.webp' }],
              },
            };
      rerender(<NodeGeneratorPrompt {...next} />);
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(requestSignal.aborted).toBe(true);
      await act(async () => {
        resolve([candidate('迟到图片', 'image', { connected: true, mentionOption: options[1] })]);
      });
      expect(screen.queryByRole('option', { name: '迟到图片' })).toBeNull();
      expect(ref.current.getValue()).toBe(next.value);
      expect(onChange).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
      expect(canvasMentions.getLatestReference).not.toHaveBeenCalled();
    },
  );
});
