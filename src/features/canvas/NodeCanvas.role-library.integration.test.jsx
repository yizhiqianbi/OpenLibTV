import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../public/data/models.json';
import { createRoleLibrarySource } from '../../services/canvas-role-library.ts';
import { LOCAL_WORKSPACE_USER } from '../../services/workspace-access';
import { readPromptDOM } from './generator/node-prompt-dom.js';
import NodeCanvas from './NodeCanvas.jsx';

const catalogue = vi.hoisted(() => ({ available: true }));
vi.mock('../../hooks/useContent', () => ({
  useContent: (name) => ({
    data: name === 'models' ? (catalogue.available ? models : undefined) : { items: [] },
    loading: name === 'models' && !catalogue.available,
    error: null,
    reload: vi.fn(),
  }),
}));

const projectId = 'role-library-app-review';
const key = `libtv.canvas.${projectId}`;
const photoUrl = 'https://public-role.example.test/public-photo.png';
const read = (storageKey = key) => JSON.parse(localStorage.getItem(storageKey));
const graph = (value) => ({ nodes: value.nodes, edges: value.edges });
const target = (value = read()) => value.nodes.find((node) => node.id === 'video-target');
const flush = () => act(() => window.dispatchEvent(new Event('pagehide')));
const settlePrompt = () => act(() => new Promise((resolve) => setTimeout(resolve, 180)));
const frame = () => document.querySelector('.cv-inline-generator');
const input = () => within(frame()).getByRole('textbox', { name: '提示词' });
const deferred = () => {
  let resolve;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
};

// Only this test adapter supplies synthetic public directory records. No account,
// certification writer, graph/history implementation or generated result is mocked.
function publicSource() {
  const summary = {
    characterUuid: 'public-role',
    name: '公开测试角色',
    coverUrl: photoUrl,
    materialCount: 1,
  };
  const listCharacters = vi.fn(async () => ({ list: [summary], total: 1 }));
  const getCharacterDetail = vi.fn(async () => ({
    ...summary,
    mediaBlocks: [{ blockName: '公开参考图', items: [{ url: photoUrl, label: '自然比例照片' }] }],
  }));
  return {
    source: createRoleLibrarySource({ listCharacters, getCharacterDetail }),
    listCharacters,
    getCharacterDetail,
  };
}

function snapshot() {
  return {
    title: '角色库实际画布回归',
    view: { x: -40, y: 20, z: 0.8 },
    nodes: [
      {
        id: 'video-target',
        type: 'video',
        position: { x: 1200, y: 200 },
        width: 350,
        height: 230,
        data: {
          type: 'video',
          name: '视频生成目标',
          action: 'video_generate',
          params: {
            model: 'kling-v3-omni',
            modeType: 'text2video',
            prompt: '初始视频提示词',
            count: 1,
            settings: { ratio: '16:9' },
          },
        },
      },
      {
        id: 'unrelated-text',
        type: 'text',
        position: { x: 1800, y: 100 },
        width: 260,
        height: 160,
        data: { type: 'text', name: '无关资源', action: 'text_resource', content: ['保持不变'] },
      },
    ],
    edges: [],
  };
}

beforeEach(() => {
  catalogue.available = true;
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 1280,
    bottom: 720,
    width: 1280,
    height: 720,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function page(value = snapshot(), extra = {}) {
  const directory = publicSource();
  const roleImageReader = vi.fn(async () => ({ width: 1200, height: 800 }));
  const props = {
    path: `/canvas?projectId=${projectId}`,
    user: LOCAL_WORKSPACE_USER,
    roleLibrarySource: directory.source,
    roleImageReader,
    ...extra,
  };
  localStorage.setItem(key, JSON.stringify(value));
  const canvas = render(<NodeCanvas {...props} />);
  const node = (id) => canvas.container.querySelector(`article[data-node-id="${id}"]`);
  await waitFor(() => expect(node('video-target')).toBeTruthy());
  await waitFor(() =>
    expect(screen.getByLabelText('上传画布素材').disabled).toBe(Boolean(extra.embedded)),
  );
  fireEvent.click(node('video-target'));
  if (!extra.embedded)
    await waitFor(() =>
      expect(within(frame()).queryByRole('textbox', { name: '提示词' })).toBeTruthy(),
    );
  flush();
  return {
    ...canvas,
    ...directory,
    props,
    roleImageReader,
    node,
    undo: () => screen.getByTitle('撤销 ⌘Z'),
    redo: () => screen.getByTitle('重做 ⇧⌘Z'),
    selectedIds: () =>
      [...canvas.container.querySelectorAll('article.cv-selected')].map(
        (element) => element.dataset.nodeId,
      ),
  };
}

async function pickPublicPhoto(requireCompliance = false) {
  const trigger = within(frame()).getByRole('button', { name: '角色库' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: '角色库' });
  if (requireCompliance) {
    expect(within(dialog).getByRole('tab', { name: /Seedance/ })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('tab', { name: '公共角色库' }));
  } else expect(within(dialog).queryByRole('tab', { name: /Seedance/ })).toBeNull();
  fireEvent.click(await within(dialog).findByRole('button', { name: /公开测试角色/ }));
  const material = await within(dialog).findByRole('button', { name: '选择自然比例照片' });
  fireEvent.click(material);
  expect(material.getAttribute('aria-pressed')).toBe('true');
  return { trigger, dialog, apply: () => within(dialog).getByRole('button', { name: '应用' }) };
}
async function applyPhoto() {
  const picked = await pickPublicPhoto();
  fireEvent.click(picked.apply());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
  await waitFor(() => expect(read().edges).toHaveLength(1));
  return picked;
}
const baselineWithPrompt = (before, prompt) => ({
  ...before,
  nodes: before.nodes.map((node) =>
    node.id === 'video-target'
      ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt } } }
      : node,
  ),
});

describe('actual public RoleLibrary canvas integration', () => {
  it('creates a naturally sized upstream resource and real edge after a settled prompt edit, and restores one history step and persisted graph', async () => {
    const canvas = await page();
    expect(models.videoModels['kling-v3-omni'].properties.portrait).not.toBe(true);
    expect(canvas.undo().disabled).toBe(true);
    const prompt = '确认前最后输入的剧情 {{magic:unknown:0}}';
    input().textContent = prompt;
    fireEvent.input(input(), { inputType: 'insertText' });
    // Capture the real committed baseline after the debounce normalizes params.
    // The next test freezes that debounce to cover the pending-input transaction.
    await settlePrompt();
    flush();
    const before = graph(read());
    expect(target().data.params.prompt).toBe(prompt);
    expect(canvas.undo().disabled).toBe(true);
    await applyPhoto();
    const committed = graph(read());
    expect(committed.nodes).toHaveLength(before.nodes.length + 1);
    expect(committed.nodes.slice(1).map((node) => node.id)).toEqual(
      before.nodes.map((node) => node.id),
    );
    const image = committed.nodes[0];
    expect(image).toMatchObject({
      type: 'image',
      width: 525,
      height: 350,
      measured: { width: 525, height: 350 },
      data: {
        type: 'image',
        action: 'image_resource',
        url: [photoUrl],
        contentWidth: 525,
        contentHeight: 350,
        portraitCompliantExempt: true,
      },
    });
    expect(image.position).toEqual({ x: 575, y: 200 });
    expect(image.data).not.toHaveProperty('portraitAssetId');
    expect(image.data).not.toHaveProperty('portraitComplianceCheckedAtMs');
    expect(image.data).not.toHaveProperty('task');
    expect(committed.edges).toEqual([
      {
        id: expect.any(String),
        source: image.id,
        sourceHandle: 'source',
        target: 'video-target',
        targetHandle: 'target',
      },
    ]);
    expect(target().data.params.prompt).toBe(prompt);
    expect(target().position).toEqual(target({ ...snapshot() }).position);
    expect(committed.nodes.find((node) => node.id === 'unrelated-text')).toEqual(
      before.nodes.find((node) => node.id === 'unrelated-text'),
    );
    expect(read().view).toEqual(snapshot().view);
    expect(canvas.selectedIds()).toEqual(['video-target']);
    expect(canvas.listCharacters).toHaveBeenCalledWith(
      { page: 1, pageSize: 10, orderBy: 'updated_at_desc' },
      { signal: expect.any(AbortSignal) },
    );
    expect(canvas.getCharacterDetail).toHaveBeenCalledWith('public-role', {
      signal: expect.any(AbortSignal),
    });
    expect(canvas.roleImageReader).toHaveBeenCalledExactlyOnceWith(photoUrl, {
      signal: expect.any(AbortSignal),
    });
    await settlePrompt();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(canvas.redo().disabled).toBe(true);
    canvas.unmount();
    const restored = render(<NodeCanvas {...canvas.props} />);
    await waitFor(() =>
      expect(restored.container.querySelector(`article[data-node-id="${image.id}"]`)).toBeTruthy(),
    );
    fireEvent.click(restored.container.querySelector('article[data-node-id="video-target"]'));
    await waitFor(() => expect(input().textContent).toBe(prompt));
    flush();
    expect(graph(read())).toEqual(committed);
    expect(read().view).toEqual(snapshot().view);
    expect(canvas.roleImageReader).toHaveBeenCalledOnce();
    expect(screen.getByTitle('撤销 ⌘Z').disabled).toBe(true);
  });

  it('a last-150ms user edit prunes orphaned Magic metadata during role confirmation and preserves that text across history and pagehide', async () => {
    const value = snapshot();
    target(value).data.params.prompt = '旧剧情 {{magic:m:0}}';
    target(value).data.params.magicList = {
      m: { imageUrl: photoUrl, suggestions: [{ label: '测试真实元数据标签' }] },
    };
    const canvas = await page(value);
    const before = graph(read());
    expect(input().querySelector('[data-magic-id="m"]')).toBeTruthy();
    const editor = input();
    const latestText = '用户最后删除元素后的纯文本剧情';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    input().textContent = latestText;
    fireEvent.input(input(), { inputType: 'insertText' });
    const trigger = within(frame()).getByRole('button', { name: '角色库' });
    trigger.focus();
    await act(async () => {
      fireEvent.click(trigger);
    });
    const dialog = screen.getByRole('dialog', { name: '角色库' });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /公开测试角色/ }));
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '选择自然比例照片' }));
    expect(target().data.params.prompt).toBe('旧剧情 {{magic:m:0}}');
    expect(readPromptDOM(editor)).toBe(latestText);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '应用' }));
    });
    expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
    const committed = graph(read());
    expect(committed.nodes).toHaveLength(before.nodes.length + 1);
    expect(committed.edges).toHaveLength(1);
    expect(target().data.params.prompt).toBe(latestText);
    expect(target().data.params).not.toHaveProperty('magicList');
    expect(readPromptDOM(input())).toBe(latestText);
    expect(input().querySelector('[data-magic-id="m"]')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    flush();
    expect(graph(read())).toEqual(committed);
    const editedBaseline = structuredClone(baselineWithPrompt(before, latestText));
    delete target(editedBaseline).data.params.magicList;
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(editedBaseline);
    expect(target().data.params).not.toHaveProperty('magicList');
    expect(readPromptDOM(input())).toBe(latestText);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(readPromptDOM(input())).toBe(latestText);
    expect(input().querySelector('[data-magic-id="m"]')).toBeNull();
    expect(canvas.redo().disabled).toBe(true);
    expect(canvas.roleImageReader).toHaveBeenCalledOnce();
  });

  it('deleting the imported reference disconnects its actual edge and retains the resource node with undo and redo', async () => {
    const canvas = await page();
    await applyPhoto();
    const connected = graph(read());
    const imageId = connected.edges[0].source;
    fireEvent.click(within(frame()).getByRole('button', { name: '删除参考素材 1' }));
    flush();
    const disconnected = graph(read());
    expect(disconnected.edges).toEqual([]);
    expect(disconnected.nodes.map((node) => node.id)).toEqual(
      connected.nodes.map((node) => node.id),
    );
    expect(disconnected.nodes.find((node) => node.id === imageId)).toEqual(
      connected.nodes.find((node) => node.id === imageId),
    );
    expect(canvas.node(imageId)).toBeTruthy();
    expect(target().data.params.imageList).toEqual([]);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(connected);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(disconnected);
  });

  it('remaps a last-150ms prompt back to the old raw value without resurrecting a deselected role token from the draft', async () => {
    const value = snapshot();
    const ordinaryUrl = 'https://public-role.example.test/ordinary.png';
    const roleUrl = 'https://public-role.example.test/role-two.png';
    const checkedAt = Date.now();
    value.nodes.unshift(
      {
        id: 'ordinary-image',
        type: 'image',
        position: { x: 50, y: 600 },
        width: 350,
        height: 350,
        data: { type: 'image', name: '普通图片', action: 'image_resource', url: [ordinaryUrl] },
      },
      {
        id: 'role-two-node',
        type: 'image',
        position: { x: 500, y: 600 },
        width: 350,
        height: 350,
        data: {
          type: 'image',
          name: '已选角色图',
          action: 'image_resource',
          url: [roleUrl],
          portraitAssetId: 'role-two',
          portraitComplianceCheckedAtMs: checkedAt,
        },
      },
    );
    const rawPrompt = '{{Image 1}}';
    const draft = '{{Image 1}} {{Image 2}}';
    Object.assign(target(value).data.params, {
      model: 'star-video2',
      modeType: 'image2video',
      prompt: rawPrompt,
      imageList: [
        { nodeId: 'ordinary-image', url: ordinaryUrl },
        {
          nodeId: 'role-two-node',
          url: roleUrl,
          assetId: 'role-two',
          complianceCheckedAtMs: checkedAt,
        },
      ],
      imageListOrder: ['ordinary-image', 'role-two-node'],
    });
    value.edges = ['ordinary-image', 'role-two-node'].map((source, index) => ({
      id: `reference-edge-${index}`,
      source,
      sourceHandle: 'source',
      target: 'video-target',
      targetHandle: 'target',
    }));
    const listAssets = vi.fn(async () => [
      {
        uuid: 'role-two',
        assetId: 'role-two',
        assetUrl: roleUrl,
        assetType: 'image',
        status: 1,
        complianceCheckedAtMs: checkedAt,
      },
    ]);
    const source = createRoleLibrarySource({ listAssets });
    const canvas = await page(value, { roleLibrarySource: source });
    const before = graph(read());
    const editor = input();
    // Freeze only timeout/debounce scheduling after the real lazy editor is mounted.
    // Directory requests and commits still run their genuine promise lifecycles.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    input().textContent = draft;
    fireEvent.input(input(), { inputType: 'insertText' });
    const trigger = within(frame()).getByRole('button', { name: '角色库' });
    trigger.focus();
    await act(async () => {
      fireEvent.click(trigger);
    });
    const dialog = screen.getByRole('dialog', { name: '角色库' });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('tab', { name: 'Seedance、Seedance 2.5 合规素材库' }),
      );
    });
    const selectedRole = within(dialog).getByRole('button', { name: '选择role-two' });
    expect(selectedRole.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(selectedRole);
    expect(selectedRole.getAttribute('aria-pressed')).toBe('false');
    expect(target().data.params.prompt).toBe(rawPrompt);
    expect(readPromptDOM(editor)).toBe(draft);
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));
    });
    expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
    const committed = graph(read());
    expect(committed.edges).toEqual(
      before.edges.filter((edge) => edge.source === 'ordinary-image'),
    );
    expect(committed.nodes.map((node) => node.id)).toEqual(before.nodes.map((node) => node.id));
    expect(committed.nodes.find((node) => node.id === 'role-two-node')).toEqual(
      before.nodes.find((node) => node.id === 'role-two-node'),
    );
    expect(target().data.params.prompt).toBe(rawPrompt);
    expect(target().data.params.imageList.map((ref) => ref.nodeId)).toEqual(['ordinary-image']);
    expect(readPromptDOM(input())).toBe(rawPrompt);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    flush();
    expect(graph(read())).toEqual(committed);
    expect(readPromptDOM(input())).toBe(rawPrompt);
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(baselineWithPrompt(before, draft));
    expect(canvas.undo().disabled).toBe(true);
    expect(readPromptDOM(input())).toBe(draft);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(committed);
    expect(readPromptDOM(input())).toBe(rawPrompt);
    expect(canvas.redo().disabled).toBe(true);
    expect(canvas.roleImageReader).not.toHaveBeenCalled();
  });

  it('retains an accepted graph after quota failure and reapplies the same selection as save-only without duplicate IDs or history', async () => {
    const canvas = await page();
    const before = graph(read());
    const nativeSet = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (storageKey, value) {
      if (blocked && storageKey === key) throw new DOMException('quota', 'QuotaExceededError');
      return nativeSet.call(this, storageKey, value);
    });
    const picked = await pickPublicPhoto();
    fireEvent.click(picked.apply());
    await waitFor(() =>
      expect(within(picked.dialog).getByRole('alert').textContent).toContain('重试只保存当前画布'),
    );
    const acceptedIds = [...canvas.container.querySelectorAll('article[data-node-id]')].map(
      (node) => node.dataset.nodeId,
    );
    expect(acceptedIds).toHaveLength(before.nodes.length + 1);
    const createdId = acceptedIds.find((id) => !before.nodes.some((node) => node.id === id));
    expect(createdId).toBeTruthy();
    expect(graph(read())).toEqual(before);
    expect(
      within(canvas.container.querySelector('.cv-topbar')).getByText('重试保存画布'),
    ).toBeTruthy();
    blocked = false;
    fireEvent.click(picked.apply());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
    const saved = graph(read());
    expect(saved.nodes.map((node) => node.id)).toEqual([
      createdId,
      ...before.nodes.map((node) => node.id),
    ]);
    expect(saved.edges).toEqual([
      {
        id: expect.any(String),
        source: createdId,
        sourceHandle: 'source',
        target: 'video-target',
        targetHandle: 'target',
      },
    ]);
    expect(canvas.roleImageReader).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '重试保存画布' })).toBeNull();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(saved);
    expect(canvas.redo().disabled).toBe(true);
  });

  it('a compliance-required quota retry reuses the first approved payload instead of certifying, probing or creating another graph', async () => {
    const directory = publicSource();
    let approvalNumber = 0;
    const certifyImages = vi.fn(async () => {
      const assetId = `approved-${++approvalNumber}`;
      return {
        images: [`asset://${assetId}`],
        assets: [
          {
            uuid: `record-${approvalNumber}`,
            assetId,
            assetUrl: photoUrl,
            assetType: 'image',
            status: 1,
            complianceCheckedAtMs: Date.now(),
          },
        ],
      };
    });
    const source = createRoleLibrarySource({
      listCharacters: directory.listCharacters,
      getCharacterDetail: directory.getCharacterDetail,
      certifyImages,
    });
    const value = snapshot();
    target(value).data.params.model = 'star-video2';
    const canvas = await page(value, { roleLibrarySource: source });
    const before = graph(read());
    const nativeSet = Storage.prototype.setItem;
    let blocked = true;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (storageKey, stored) {
      if (blocked && storageKey === key) throw new DOMException('quota', 'QuotaExceededError');
      return nativeSet.call(this, storageKey, stored);
    });
    const picked = await pickPublicPhoto(true);
    fireEvent.click(picked.apply());
    await waitFor(() =>
      expect(within(picked.dialog).getByRole('alert').textContent).toContain('重试只保存当前画布'),
    );
    const acceptedIds = [...canvas.container.querySelectorAll('article[data-node-id]')].map(
      (node) => node.dataset.nodeId,
    );
    expect(acceptedIds).toHaveLength(before.nodes.length + 1);
    const createdId = acceptedIds.find((id) => !before.nodes.some((node) => node.id === id));
    expect(createdId).toBeTruthy();
    expect(graph(read())).toEqual(before);
    expect(certifyImages).toHaveBeenCalledOnce();
    expect(canvas.roleImageReader).toHaveBeenCalledOnce();
    blocked = false;
    fireEvent.click(picked.apply());
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
    const saved = graph(read());
    expect(saved.nodes.map((node) => node.id)).toEqual([
      createdId,
      ...before.nodes.map((node) => node.id),
    ]);
    expect(saved.edges).toEqual([
      {
        id: expect.any(String),
        source: createdId,
        sourceHandle: 'source',
        target: 'video-target',
        targetHandle: 'target',
      },
    ]);
    expect(saved.nodes[0].data).toMatchObject({
      portraitAssetId: 'approved-1',
      url: [photoUrl],
      action: 'image_resource',
    });
    expect(target().data.params.imageList.map((ref) => [ref.nodeId, ref.assetId])).toEqual([
      [createdId, 'approved-1'],
    ]);
    expect(certifyImages).toHaveBeenCalledOnce();
    expect(approvalNumber).toBe(1);
    expect(canvas.roleImageReader).toHaveBeenCalledOnce();
    fireEvent.click(canvas.undo());
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.undo().disabled).toBe(true);
    fireEvent.click(canvas.redo());
    flush();
    expect(graph(read())).toEqual(saved);
    expect(canvas.redo().disabled).toBe(true);
    expect(certifyImages).toHaveBeenCalledOnce();
  });

  it('switching to a document with the same target ID cancels a pending image read and rejects its late completion', async () => {
    const pendingRead = deferred();
    const roleImageReader = vi.fn(() => pendingRead.promise);
    const canvas = await page(snapshot(), { roleImageReader });
    const original = graph(read());
    const picked = await pickPublicPhoto();
    fireEvent.click(picked.apply());
    await waitFor(() => expect(roleImageReader).toHaveBeenCalledOnce());
    const signal = roleImageReader.mock.calls[0][1].signal;
    const nextId = `${projectId}-next`,
      nextKey = `libtv.canvas.${nextId}`;
    const next = snapshot();
    next.title = '同ID新画布';
    next.nodes[0].data.params.prompt = '新画布独立提示词';
    localStorage.setItem(nextKey, JSON.stringify(next));
    canvas.rerender(<NodeCanvas {...canvas.props} path={`/canvas?projectId=${nextId}`} />);
    await waitFor(() =>
      expect(canvas.container.querySelector('.cv-topbar').textContent).toContain(next.title),
    );
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
    fireEvent.click(canvas.node('video-target'));
    await waitFor(() => expect(input().textContent).toBe('新画布独立提示词'));
    flush();
    const replacement = graph(read(nextKey));
    await act(async () => {
      pendingRead.resolve({ width: 1200, height: 800 });
    });
    await settlePrompt();
    flush();
    expect(graph(read(nextKey))).toEqual(replacement);
    expect(graph(read())).toEqual(original);
    expect(read(nextKey).nodes.map((node) => node.id)).toEqual(next.nodes.map((node) => node.id));
    expect(read(nextKey).edges).toEqual([]);
    expect(canvas.undo().disabled).toBe(true);
  });

  it('native button Space opens the role picker through the real canvas keyboard lifecycle and Escape restores the chip without writes', async () => {
    const canvas = await page();
    const before = graph(read());
    const originalView = read().view;
    const generatorFrame = frame();
    const trigger = within(generatorFrame).getByRole('button', { name: '角色库' });
    trigger.focus();
    await userEvent.keyboard('[Space]');
    expect(await screen.findByRole('dialog', { name: '角色库' })).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(canvas.selectedIds()).toEqual(['video-target']);
    expect(frame()).toBe(generatorFrame);
    expect(graph(read())).toEqual(before);
    expect(read().view).toEqual(originalView);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    flush();
    expect(graph(read())).toEqual(before);
    expect(read().view).toEqual(originalView);
    expect(canvas.roleImageReader).not.toHaveBeenCalled();
    expect(canvas.undo().disabled).toBe(true);
  });

  it('pointer-clicking the role overlay keeps the selected video and inline owner intact, then Escape restores the stable chip without writes', async () => {
    const canvas = await page();
    const before = graph(read());
    const originalView = read().view;
    const generatorFrame = frame();
    const picked = await pickPublicPhoto();
    await userEvent.click(document.querySelector('[data-role-library-modal]'));
    expect(screen.getByRole('dialog', { name: '角色库' })).toBe(picked.dialog);
    expect(canvas.selectedIds()).toEqual(['video-target']);
    expect(frame()).toBe(generatorFrame);
    expect(generatorFrame.contains(picked.trigger)).toBe(true);
    expect(picked.trigger.getAttribute('aria-expanded')).toBe('true');
    expect(graph(read())).toEqual(before);
    expect(read().view).toEqual(originalView);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(picked.trigger));
    expect(within(frame()).getByRole('button', { name: '角色库' })).toBe(picked.trigger);
    flush();
    expect(graph(read())).toEqual(before);
    expect(read().view).toEqual(originalView);
    expect(canvas.selectedIds()).toEqual(['video-target']);
    expect(canvas.roleImageReader).not.toHaveBeenCalled();
    expect(canvas.undo().disabled).toBe(true);
  });

  it('canceling a selected public photo restores the opener and writes no resources, edge or history', async () => {
    const canvas = await page();
    const before = graph(read());
    const picked = await pickPublicPhoto();
    fireEvent.click(within(picked.dialog).getByRole('button', { name: '关闭角色库' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(picked.trigger));
    flush();
    expect(graph(read())).toEqual(before);
    expect(canvas.roleImageReader).not.toHaveBeenCalled();
    expect(canvas.undo().disabled).toBe(true);
    expect(canvas.selectedIds()).toEqual(['video-target']);
  });

  it.each(['readonly', 'missing-model'])(
    'the %s state cannot open or apply a role library and never changes graph storage',
    async (kind) => {
      catalogue.available = kind !== 'missing-model';
      const value = snapshot();
      const canvas = await page(value, kind === 'readonly' ? { embedded: true } : {});
      const before = graph(read());
      if (kind === 'readonly') {
        expect(screen.queryByRole('button', { name: '角色库' })).toBeNull();
      } else {
        const trigger = within(frame()).getByRole('button', { name: '角色库' });
        expect(trigger.disabled).toBe(true);
        fireEvent.click(trigger);
        expect(within(frame()).getByText('模型配置加载中…')).toBeTruthy();
      }
      expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
      flush();
      expect(graph(read())).toEqual(before);
      expect(canvas.listCharacters).not.toHaveBeenCalled();
      expect(canvas.getCharacterDetail).not.toHaveBeenCalled();
      expect(canvas.roleImageReader).not.toHaveBeenCalled();
    },
  );
});
