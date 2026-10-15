import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import NodeCanvas from '../NodeCanvas.jsx';

vi.mock('../../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'inline-pending-persistence';
const user = { name: 'local' };
const savedPrompt = () =>
  JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`)).nodes[0].data.params.prompt;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    `libtv.canvas.${projectId}`,
    JSON.stringify({
      title: '内嵌草稿持久化',
      nodes: [
        {
          id: 'video',
          type: 'video',
          width: 350,
          height: 230,
          position: { x: 100, y: 100 },
          data: {
            name: '视频生成器',
            params: { model: 'star-video2', modeType: 'text2video', prompt: '原提示词' },
          },
        },
      ],
      edges: [],
      view: { x: 0, y: 0, z: 1 },
    }),
  );
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 700,
    width: 1000,
    height: 700,
  });
});
afterEach(() => vi.useRealTimers());

async function mountedPrompt() {
  const page = render(<NodeCanvas path={`/canvas?projectId=${projectId}`} user={user} />);
  await waitFor(() => expect(page.container.querySelector('.cv-node')).toBeTruthy());
  fireEvent.click(page.container.querySelector('.cv-node'));
  const input = await screen.findByRole('textbox', { name: '提示词' });
  await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
  vi.useFakeTimers();
  input.textContent = '最后150ms的输入';
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  fireEvent.input(input, { inputType: 'insertText' });
  return page;
}

describe('complete canvas inline pending persistence', () => {
  it('saves a pending inline draft on immediate canvas unmount and restores it in a new mount', async () => {
    const page = await mountedPrompt();
    expect(savedPrompt()).toBe('原提示词');
    page.unmount();
    expect(savedPrompt()).toBe('最后150ms的输入');
    vi.useRealTimers();
    const restored = render(<NodeCanvas path={`/canvas?projectId=${projectId}`} user={user} />);
    await waitFor(() => expect(restored.container.querySelector('.cv-node')).toBeTruthy());
    fireEvent.click(restored.container.querySelector('.cv-node'));
    expect((await screen.findByRole('textbox', { name: '提示词' })).textContent).toBe(
      '最后150ms的输入',
    );
  });

  it('includes the pending inline draft in the pagehide save before debounce expires', async () => {
    const page = await mountedPrompt();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(savedPrompt()).toBe('最后150ms的输入');
    page.unmount();
  });

  it('does not carry a pending draft into another document that uses the same node id', async () => {
    const secondId = 'inline-pending-second';
    const secondDocument = JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
    secondDocument.nodes[0].data.params.prompt = '第二个项目的原文';
    localStorage.setItem(`libtv.canvas.${secondId}`, JSON.stringify(secondDocument));
    const page = await mountedPrompt();
    page.rerender(<NodeCanvas path={`/canvas?projectId=${secondId}`} user={user} />);
    expect(savedPrompt()).toBe('最后150ms的输入');
    vi.useRealTimers();
    await waitFor(() => expect(page.container.querySelector('.cv-node')).toBeTruthy());
    fireEvent.click(page.container.querySelector('.cv-node'));
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '提示词' }).textContent).toBe('第二个项目的原文'),
    );
    act(() => window.dispatchEvent(new Event('pagehide')));
    page.unmount();
    expect(
      JSON.parse(localStorage.getItem(`libtv.canvas.${secondId}`)).nodes[0].data.params.prompt,
    ).toBe('第二个项目的原文');
  });

  it('never persists an attempted prompt edit from a readonly canvas during pagehide or unmount', async () => {
    const original = localStorage.getItem(`libtv.canvas.${projectId}`);
    const page = render(<NodeCanvas path={`/canvas/share?projectId=${projectId}`} user={user} />);
    await waitFor(() => expect(page.container.querySelector('.cv-node')).toBeTruthy());
    fireEvent.click(page.container.querySelector('.cv-node'));
    const input = await screen.findByRole('textbox', { name: '提示词' });
    expect(input.getAttribute('contenteditable')).toBe('false');
    input.textContent = '只读状态不可保存的 DOM 输入';
    fireEvent.input(input, { inputType: 'insertText' });
    act(() => window.dispatchEvent(new Event('pagehide')));
    page.unmount();
    expect(localStorage.getItem(`libtv.canvas.${projectId}`)).toBe(original);
  });
});
