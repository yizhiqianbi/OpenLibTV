import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { download } from '../../editor/browser.js';
import NodeCanvas from '../NodeCanvas.jsx';

vi.mock('../../editor/browser.js', () => ({ download: vi.fn() }));
vi.mock('../../../hooks/useContent.ts', async (original) => ({
  ...(await original()),
  useContent: (name) => ({
    data: name === 'models' ? models : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'inline-pending-snapshot';
const title = '内嵌草稿快照';
const pendingPrompt = '最新提示词 {{Mixed 1}} 与 {{SlashPreset:scene}}';
const user = { name: 'local' };
const savedDocument = (id) => JSON.parse(localStorage.getItem(`libtv.canvas.${id}`));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(
    `libtv.canvas.${projectId}`,
    JSON.stringify({
      title,
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mountPendingPrompt(props = {}) {
  const page = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={user} {...props} />,
  );
  await waitFor(() => expect(page.container.querySelector('.cv-node')).toBeTruthy());
  fireEvent.click(page.container.querySelector('.cv-node'));
  const input = await screen.findByRole('textbox', { name: '提示词' });
  await waitFor(() => expect(input.getAttribute('contenteditable')).toBe('true'));
  vi.useFakeTimers();
  input.textContent = pendingPrompt;
  input.focus();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  fireEvent.input(input, { inputType: 'insertText' });
  // All actions below run without advancing the 150ms prompt or 600ms autosave timers.
  expect(savedDocument(projectId).nodes[0].data.params.prompt).toBe('原提示词');
  return page;
}

describe('inline draft projection into project snapshots', () => {
  it('copies the latest serialized prompt through the header project-copy action before debounce', async () => {
    const navigate = vi.fn();
    const page = await mountPendingPrompt({ navigate });
    fireEvent.click(screen.getByRole('button', { name: title, exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '创建副本', exact: true }));
    expect(navigate).toHaveBeenCalledOnce();
    const copiedId = new URL(navigate.mock.calls[0][0], window.location.origin).searchParams.get(
      'projectId',
    );
    expect(copiedId).toBeTruthy();
    expect(copiedId).not.toBe(projectId);
    expect(savedDocument(copiedId)).toMatchObject({
      title: title + ' 副本',
      nodes: [{ id: 'video', data: { params: { model: 'star-video2', prompt: pendingPrompt } } }],
    });
    page.unmount();
  });

  it('shares a local snapshot containing the latest prompt and copies its real local share URL before debounce', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'navigator',
      new Proxy(navigator, {
        get: (target, property) =>
          property === 'clipboard' ? { writeText } : Reflect.get(target, property),
      }),
    );
    const page = await mountPendingPrompt();
    fireEvent.click(screen.getByRole('button', { name: '分享', exact: true }));
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '开启分享并复制链接' })),
    );
    const shareUrl = within(screen.getByRole('dialog', { name: '分享项目' })).getByRole(
      'textbox',
    ).value;
    const url = new URL(shareUrl);
    expect(url.pathname).toBe('/canvas/share');
    expect(url.origin).toBe(window.location.origin);
    const sharedId = url.searchParams.get('shareId');
    expect(sharedId).toBeTruthy();
    expect(savedDocument(sharedId).nodes[0].data.params.prompt).toBe(pendingPrompt);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(shareUrl);
    page.unmount();
  });

  it('exports JSON and TXT with the latest ordinary prompt tokens without waiting for the editor timer', async () => {
    const page = await mountPendingPrompt();
    fireEvent.click(screen.getByRole('button', { name: '导出', exact: true }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '导出画布' })).getByRole('button', {
        name: /画布文件/,
      }),
    );
    expect(download).toHaveBeenCalledOnce();
    const [jsonName, jsonContent] = download.mock.calls[0];
    expect(jsonName).toBe(title + '.json');
    expect(JSON.parse(jsonContent).nodes[0].data.params.prompt).toBe(pendingPrompt);
    fireEvent.click(screen.getByRole('button', { name: '导出', exact: true }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '导出画布' })).getByRole('button', {
        name: /提示词与文本/,
      }),
    );
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[1]).toEqual([
      title + '.txt',
      '视频生成器\n' + pendingPrompt,
      'text/plain',
    ]);
    page.unmount();
  });
});
