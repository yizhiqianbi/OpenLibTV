import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../services/content.ts';
import { fetchJson } from '../../services/json.ts';
import {
  canvasDocumentState,
  loadCanvasDocument,
  persistCanvasDocument,
  writeCanvasSnapshot,
} from './persistence.js';
import { resolveCanvasRoute } from './model.js';
import { removeStoredValue } from '../../services/storage.ts';

vi.mock('../../services/content.ts', () => ({ loadContent: vi.fn() }));
vi.mock('../../services/json.ts', () => ({ fetchJson: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('canvas persistence boundary', () => {
  it('loads legacy raw JSON without requesting remote content', async () => {
    const snapshot = { title: '旧项目', nodes: [], edges: [], view: { x: 1, y: 2, z: 0.5 } };
    localStorage.setItem('libtv.canvas.legacy', JSON.stringify(snapshot));
    expect(await loadCanvasDocument(resolveCanvasRoute('/canvas?project=legacy'))).toEqual({
      snapshot,
      title: '旧项目',
      source: 'local',
    });
    expect(loadContent).not.toHaveBeenCalled();
  });

  it('loads the requested template record and its compressed snapshot only', async () => {
    const snapshot = { nodes: [{ id: 'specific' }], edges: [] };
    vi.mocked(loadContent).mockResolvedValue({
      detail: { name: '对应作品', snapshotPath: '/data/canvas-snapshots/actual.json.gz' },
    });
    vi.mocked(fetchJson).mockResolvedValue(snapshot);
    expect(
      await loadCanvasDocument(resolveCanvasRoute('/detail/actual', '', 'actual', true)),
    ).toEqual({ snapshot, title: '对应作品', source: 'template' });
    expect(loadContent).toHaveBeenCalledExactlyOnceWith('gallery-details/actual');
    expect(fetchJson).toHaveBeenCalledExactlyOnceWith('/data/canvas-snapshots/actual.json.gz');
  });

  it('surfaces an invalid chat share without falling back to another share', async () => {
    vi.mocked(loadContent).mockResolvedValue({ valid: { snapshot: { nodes: [], edges: [] } } });
    await expect(
      loadCanvasDocument(resolveCanvasRoute('/canvas/chat-share?shareId=missing')),
    ).rejects.toThrow('加载分享失败');
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('rejects damaged JSON, invalid local shape and failed reads without replacing the original', async () => {
    const key = 'libtv.canvas.damaged';
    const route = resolveCanvasRoute('/canvas?projectId=damaged');
    const damaged = '{"messages":[broken';
    localStorage.setItem(key, damaged);
    await expect(loadCanvasDocument(route)).rejects.toMatchObject({ code: 'INVALID_DATA' });
    expect(localStorage.getItem(key)).toBe(damaged);
    const invalid = JSON.stringify({ title: '原文档', nodes: [], messages: 'not-an-array' });
    localStorage.setItem(key, invalid);
    await expect(loadCanvasDocument(route)).rejects.toThrow('原数据已保留');
    expect(localStorage.getItem(key)).toBe(invalid);
    localStorage.setItem(key, JSON.stringify({ title: '原文档', nodes: [], edges: [] }));
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new DOMException('storage denied', 'SecurityError');
    });
    await expect(loadCanvasDocument(route)).rejects.toMatchObject({ code: 'READ_FAILED' });
    read.mockRestore();
    expect(JSON.parse(localStorage.getItem(key)).title).toBe('原文档');
    expect(loadContent).not.toHaveBeenCalled();
  });

  it('keeps public chat messages outside the snapshot, including serialized content and duplicate parts', async () => {
    const parts = [
      { type: 'text', text: '前{{skill:s}}中{{skill:s}}后' },
      { type: 'skill', id: 's', name: '导演一', referenceKey: 'first' },
      { type: 'skill', id: 's', name: '导演二', referenceKey: 'second' },
    ];
    const messages = [{ role: 'user', content: JSON.stringify(parts) }];
    vi.mocked(loadContent).mockResolvedValue({
      public: {
        title: '公开对话',
        snapshot: { nodes: [], edges: [], messages: [{ role: 'user', text: '旧快照文字' }] },
        messages,
      },
    });
    const document = await loadCanvasDocument(
      resolveCanvasRoute('/canvas/chat-share?shareId=public'),
    );
    expect(canvasDocumentState(document).messages).toBe(messages);
    expect(canvasDocumentState(document).messages[0].content).toBe(JSON.stringify(parts));
  });

  it('reopens readable snapshots and empty keys after failed writes/removes without hiding real read errors', async () => {
    const key = 'libtv.canvas.quota-readable';
    const route = resolveCanvasRoute('/canvas?projectId=quota-readable');
    const original = {
      title: '上次保存',
      nodes: [],
      edges: [],
      messages: [{ role: 'user', text: '原消息' }],
    };
    localStorage.setItem(key, JSON.stringify(original));
    await loadCanvasDocument(route);
    const setItem = Storage.prototype.setItem;
    const write = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (target, value) {
        if (target === key) throw new DOMException('quota', 'QuotaExceededError');
        return setItem.call(this, target, value);
      });
    expect(() => writeCanvasSnapshot('quota-readable', { ...original, messages: [] })).toThrow();
    write.mockRestore();
    expect((await loadCanvasDocument(route)).snapshot).toEqual(original);
    const removeItem = Storage.prototype.removeItem;
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (target) {
      if (target === key) throw new DOMException('denied', 'SecurityError');
      return removeItem.call(this, target);
    });
    expect(() => removeStoredValue(key)).toThrow();
    remove.mockRestore();
    expect((await loadCanvasDocument(route)).snapshot).toEqual(original);

    const emptyRoute = resolveCanvasRoute('/canvas?projectId=quota-empty');
    await loadCanvasDocument(emptyRoute);
    const emptyWrite = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (target, value) {
        if (target === emptyRoute.storageKey) throw new DOMException('quota', 'QuotaExceededError');
        return setItem.call(this, target, value);
      });
    expect(() => writeCanvasSnapshot('quota-empty', original)).toThrow();
    emptyWrite.mockRestore();
    expect((await loadCanvasDocument(emptyRoute)).source).toBe('empty');
  });

  it('uses snapshot messages for local chat shares and preserves them through normal persistence', async () => {
    const messages = [
      {
        role: 'user',
        parts: [
          { type: 'text', text: '前{{node:n}}后' },
          { type: 'node', id: 'n', nodeKey: 'n', name: '节点' },
        ],
      },
    ];
    const snapshot = { title: '本地分享', nodes: [], messages };
    localStorage.setItem('libtv.canvas.local-chat', JSON.stringify(snapshot));
    const document = await loadCanvasDocument(
      resolveCanvasRoute('/canvas/chat-share?shareId=local-chat'),
    );
    expect(document.source).toBe('local');
    expect(canvasDocumentState(document).messages).toEqual(messages);
    expect(loadContent).not.toHaveBeenCalled();
    const state = canvasDocumentState(document);
    persistCanvasDocument({
      ...state,
      key: 'copy-chat',
      storageKey: 'libtv.canvas.copy-chat',
      view: { x: 0, y: 0, z: 1 },
    });
    const copy = await loadCanvasDocument(resolveCanvasRoute('/canvas?projectId=copy-chat'));
    expect(canvasDocumentState(copy).messages).toEqual(messages);
  });

  it('saves the old canvas key and project list while preserving folders', () => {
    localStorage.setItem(
      'libtv-projects',
      JSON.stringify([
        { id: 'current', name: 'old', folder: 'folder' },
        { id: 'other', name: 'untouched' },
      ]),
    );
    const nodes = [{ id: 'cover', type: 'image', data: { url: ['image.png'] } }];
    persistCanvasDocument(
      {
        storageKey: 'libtv.canvas.current',
        key: 'current',
        title: 'new',
        nodes,
        edges: [],
        view: { x: 0, y: 0, z: 1 },
      },
      123,
    );
    expect(JSON.parse(localStorage.getItem('libtv.canvas.current'))).toMatchObject({
      title: 'new',
      savedAt: 123,
    });
    expect(JSON.parse(localStorage.getItem('libtv-projects'))).toEqual([
      expect.objectContaining({
        id: 'current',
        name: 'new',
        folder: 'folder',
        nodeCount: 1,
        cover: 'image.png',
      }),
      { id: 'other', name: 'untouched' },
    ]);
  });
});
