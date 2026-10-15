import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import videoSupport from '../../../public/data/video-model-support.json';
import imageSupport from '../../../public/data/image-model-support.json';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { createCanvasScriptNode } from './storyboard/script-model.js';
import NodeCanvas from './NodeCanvas.jsx';

vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data:
      name === 'models'
        ? models
        : name === 'video-model-support'
          ? videoSupport
          : name === 'image-model-support'
            ? imageSupport
            : { items: [] },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'script-card-pointer';
const storageKey = `libtv.canvas.${projectId}`;
const title = '脚本卡片交互验收';
const read = () => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));

function snapshot() {
  const script = createCanvasScriptNode({
    id: 'script',
    label: title,
    position: { x: 400, y: 300 },
  });
  return {
    title,
    view: { x: 0, y: 0, z: 1 },
    edges: [],
    nodes: [
      {
        ...script,
        data: {
          ...script.data,
          rows: [10, 30].map((shotNumber, index) => ({
            id: `row-${index}`,
            hiddenUuid: `shot-${index}`,
            shotNumber,
            durationSeconds: 5,
            plotDescription: '角色沿海岸行走',
            imageGenerationPrompt: '海岸晨光下的角色',
            videoMotionPrompt: '镜头缓慢推进',
            imagePromptState: 'synced',
            videoPromptState: 'synced',
            characters: [{ characterAssetId: 'character' }],
          })),
          assets: {
            characters: [
              { id: 'character', name: '主角', thumbnailUrl: '/fixture-character.webp' },
            ],
            scenes: [],
            props: [],
          },
        },
      },
      {
        id: 'companion',
        type: 'text',
        position: { x: 60, y: 200 },
        width: 260,
        height: 160,
        data: { type: 'text', name: '同行文本', action: 'text_resource', text: '保持同行内容' },
      },
    ],
  };
}

// Keep genuine pointer identity and release coordinates even where jsdom lacks
// PointerEvent. The real pointer, history, draft and storage controllers run.
function pointer(element, type, { x, y, shiftKey = false, pointerId = 7 } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    shiftKey,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: true },
  });
  fireEvent(element, event);
}

function installCapture(element) {
  const captured = new Set();
  element.setPointerCapture = vi.fn((id) => captured.add(id));
  element.hasPointerCapture = vi.fn((id) => captured.has(id));
  element.releasePointerCapture = vi.fn((id) => captured.delete(id));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  // These cases remain within the board, so no auto-pan frame should run.
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
  });
});
afterEach(() => vi.unstubAllGlobals());

async function page() {
  localStorage.setItem(storageKey, JSON.stringify(snapshot()));
  const canvas = render(
    <NodeCanvas path={`/canvas?projectId=${projectId}`} user={LOCAL_WORKSPACE_USER} />,
  );
  await waitFor(() => expect(screen.getByLabelText('上传画布素材').disabled).toBe(false));
  const surface = await screen.findByTestId('scriptv2-resource-card-surface');
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  const board = canvas.container.querySelector('.cv-board');
  installCapture(board);
  installCapture(node('script'));
  installCapture(node('companion'));
  return {
    ...canvas,
    node,
    board,
    surface,
    selectedIds: () =>
      [...canvas.container.querySelectorAll('article.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
  };
}

const pill = (id) => screen.getByTestId(`scriptv2-stage-pill-${id}`);
const openButton = () => screen.getByRole('button', { name: '打开脚本节点 →' });
const expectPosition = (canvas, id, x, y) => {
  expect(canvas.node(id).style.left).toBe(`${x}px`);
  expect(canvas.node(id).style.top).toBe(`${y}px`);
};
async function openScript() {
  const trigger = openButton();
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: await screen.findByRole('dialog', { name: title }) };
}
function currentStage(dialog) {
  return within(dialog)
    .getByRole('navigation', { name: '分镜脚本阶段' })
    .querySelector('[aria-current="step"]');
}

describe('actual ScriptV2 compact card interactions', () => {
  it('drags the non-button resource surface, saves the release position and creates exactly one undo/redo entry', async () => {
    const canvas = await page();
    const original = graph(read());
    expect(canvas.undo().disabled).toBe(true);

    pointer(canvas.surface, 'pointerdown', { x: 450, y: 400 });
    expect(canvas.node('script').setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(canvas.board.setPointerCapture).not.toHaveBeenCalled();
    pointer(canvas.node('script'), 'pointermove', { x: 470, y: 420 });
    expectPosition(canvas, 'script', 420, 320);
    pointer(canvas.node('script'), 'pointermove', { x: 510, y: 440 });
    pointer(canvas.node('script'), 'pointerup', { x: 530, y: 460 });
    fireEvent.click(canvas.surface, { detail: 1 });

    expectPosition(canvas, 'script', 480, 360);
    expectPosition(canvas, 'companion', 60, 200);
    expect(canvas.selectedIds()).toEqual(['script']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(canvas.node('script').releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    flush();
    const moved = graph(read());
    expect(moved).toEqual({
      ...original,
      nodes: original.nodes.map((node) =>
        node.id === 'script' ? { ...node, position: { x: 480, y: 360 } } : node,
      ),
    });
    expect(read().view).toEqual(snapshot().view);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    expect(canvas.redo().disabled).toBe(false);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(moved);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('lets Shift on a static pill append to canvas selection and keeps both nodes selected through drag and trailing click', async () => {
    const canvas = await page();
    const original = graph(read());
    fireEvent.click(canvas.node('companion'));
    pointer(pill('assets'), 'pointerdown', { x: 520, y: 410, shiftKey: true });
    pointer(canvas.node('script'), 'pointerup', { x: 520, y: 410, shiftKey: true });
    fireEvent.click(pill('assets'), { shiftKey: true, detail: 1 });
    expect(new Set(canvas.selectedIds())).toEqual(new Set(['script', 'companion']));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(canvas.undo().disabled).toBe(true);

    pointer(pill('shots'), 'pointerdown', { x: 450, y: 400 });
    pointer(canvas.node('script'), 'pointermove', { x: 480, y: 420 });
    pointer(canvas.node('script'), 'pointerup', { x: 510, y: 440 });
    fireEvent.click(pill('shots'), { detail: 1 });
    expectPosition(canvas, 'script', 460, 340);
    expectPosition(canvas, 'companion', 120, 240);
    expect(new Set(canvas.selectedIds())).toEqual(new Set(['script', 'companion']));
    expect(screen.queryByRole('toolbar', { name: '脚本操作' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    flush();
    const moved = graph(read());
    expect(moved.nodes.map((node) => node.data)).toEqual(original.nodes.map((node) => node.data));
    expect(moved.edges).toEqual(original.edges);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(original);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(moved);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('suppresses a drag-ending double click and allows a later genuine double click to open the card', async () => {
    const canvas = await page();
    pointer(canvas.surface, 'pointerdown', { x: 450, y: 400 });
    pointer(canvas.node('script'), 'pointermove', { x: 470, y: 420 });
    pointer(canvas.node('script'), 'pointerup', { x: 470, y: 420 });
    fireEvent.doubleClick(pill('prompts'), { detail: 2 });
    expect(screen.queryByRole('dialog')).toBeNull();

    pointer(pill('prompts'), 'pointerdown', { x: 470, y: 420 });
    pointer(canvas.node('script'), 'pointerup', { x: 470, y: 420 });
    fireEvent.click(pill('prompts'), { detail: 1 });
    fireEvent.doubleClick(pill('prompts'), { detail: 2 });
    const dialog = await screen.findByRole('dialog', { name: title });
    expect(currentStage(dialog).textContent).toContain('确认镜头');
    expectPosition(canvas, 'script', 420, 320);
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭分镜脚本' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(canvas.undo());
    expectPosition(canvas, 'script', 400, 300);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('keeps the three pills static and preserves a changed stage after closing and reopening through the only card button', async () => {
    const canvas = await page();
    for (const id of ['shots', 'assets', 'prompts']) {
      fireEvent.click(pill(id), { detail: 1 });
      expect(pill(id).tagName).toBe('DIV');
      expect(pill(id).closest('button')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    }
    const { dialog } = await openScript();
    expect(currentStage(dialog).textContent).toContain('确认镜头');
    const steps = within(dialog).getByRole('navigation', { name: '分镜脚本阶段' });
    fireEvent.click(within(steps).getByRole('button', { name: /合成提示词/ }));
    expect(currentStage(dialog).textContent).toContain('合成提示词');
    expect(dialog.querySelector('[data-script-step]')?.dataset.scriptStep).toBe('compose-prompts');
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭分镜脚本' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(pill('assets'), { detail: 1 });
    expect(screen.queryByRole('dialog')).toBeNull();
    const reopened = (await openScript()).dialog;
    expect(currentStage(reopened).textContent).toContain('合成提示词');
    expect(reopened.querySelector('[data-script-step]')?.dataset.scriptStep).toBe(
      'compose-prompts',
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    expect(canvas.undo().disabled).toBe(true);
  });

  it('isolates the open button from board drag while retaining its normal click action', async () => {
    const canvas = await page();
    const trigger = openButton();
    pointer(trigger, 'pointerdown', { x: 500, y: 600 });
    pointer(canvas.board, 'pointermove', { x: 600, y: 650 });
    pointer(canvas.board, 'pointerup', { x: 620, y: 670 });
    expect(canvas.board.setPointerCapture).not.toHaveBeenCalled();
    expect(canvas.node('script').setPointerCapture).not.toHaveBeenCalled();
    expectPosition(canvas, 'script', 400, 300);
    expect(canvas.selectedIds()).toEqual([]);
    expect(canvas.undo().disabled).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    expect(read().view).toEqual(snapshot().view);
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: title })).toBeTruthy();
  });

  it('preserves native Space activation on the open button without arming canvas pan', async () => {
    const canvas = await page();
    const trigger = openButton();
    trigger.focus();
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    act(() => trigger.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(trigger);
    pointer(pill('shots'), 'pointerdown', { x: 450, y: 400 });
    expect(canvas.board.classList.contains('cv-panning')).toBe(false);
    pointer(canvas.node('script'), 'pointerup', { x: 450, y: 400 });
    fireEvent.keyUp(trigger, { key: ' ', code: 'Space' });
    // jsdom has no native keyboard activation. Its default is preserved above;
    // deliver the native follow-up click to verify the actual open callback.
    fireEvent.click(trigger, { detail: 0 });
    expect(await screen.findByRole('dialog', { name: title })).toBeTruthy();
    expectPosition(canvas, 'script', 400, 300);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('does not open the card or an add menu from double clicks on its toolbar portal', async () => {
    const canvas = await page();
    fireEvent.click(canvas.node('script'));
    const bar = screen.getByRole('toolbar', { name: '脚本操作' });
    expect(bar.parentElement).toBe(canvas.board);
    expect(canvas.node('script').contains(bar)).toBe(false);
    fireEvent.doubleClick(bar, { detail: 2 });
    fireEvent.doubleClick(within(bar).getByRole('button', { name: '下载' }), { detail: 2 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(canvas.container.querySelector('.cv-menu-caption')).toBeNull();
    expect(canvas.selectedIds()).toEqual(['script']);
    flush();
    expect(graph(read())).toEqual(graph(snapshot()));
    expect(canvas.undo().disabled).toBe(true);
  });
});
