import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planStoryboardStitch } from '../domain/storyboard-stitch-model.js';
import { composeStoryboardStitch } from './runtime.js';

let images, canvases, context, exportBlob, onExport;
const makePlan = (patch = {}) => ({
  ...planStoryboardStitch({
    groupId: 'g',
    nodes: [
      {
        id: 'g',
        type: 'group',
        position: { x: 0, y: 0 },
        width: 212,
        height: 172,
        data: {
          standaloneStoryboardImageGrid: true,
          storyboardGroupType: 'image',
          storyboardManualGridCols: 2,
          storyboardManualGridRows: 2,
          showStoryboardShotNumbers: true,
        },
      },
      {
        id: 'a',
        type: 'image',
        parentId: 'g',
        position: { x: 4, y: 4 },
        width: 100,
        height: 80,
        data: { url: ['https://example.test/a.png?x-oss-process=watermark'], params: {} },
      },
    ],
  }).plan,
  ...patch,
});

beforeEach(() => {
  images = [];
  canvases = [];
  exportBlob = new Blob(['PNG bytes'], { type: 'image/png' });
  context = Object.fromEntries(
    ['fillRect', 'save', 'restore', 'scale', 'drawImage', 'strokeText', 'fillText'].map(
      (method) => [method, vi.fn()],
    ),
  );
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 4000;
      naturalHeight = 1000;
      writes = [];
      constructor() {
        images.push(this);
      }
      set src(value) {
        this.url = value;
        this.writes.push(value);
      }
      get src() {
        return this.url;
      }
    },
  );
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((name, options) => {
    const element = create(name, options);
    if (name === 'canvas') canvases.push(element);
    return element;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context);
  onExport = vi.fn((callback) => callback(exportBlob));
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
    onExport(callback, type),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
const loadFirst = async (task) => {
  await vi.waitFor(() => expect(images).toHaveLength(1));
  images[0].onload();
  return task;
};

describe('real local storyboard Canvas composition lifecycle', () => {
  it('draws center-cover pixels, keeps URL processing, fills empty cells, and creates one PNG File', async () => {
    const plan = makePlan();
    const task = composeStoryboardStitch(plan);
    const output = await loadFirst(task);
    expect(images[0].writes).toEqual([plan.items[0].url, '']);
    expect(images[0].crossOrigin).toBe('anonymous');
    expect(context.drawImage).toHaveBeenCalledOnce();
    const [image, sourceX, sourceY, sourceWidth, sourceHeight, ...destination] =
      context.drawImage.mock.calls[0];
    expect(image).toBe(images[0]);
    expect(sourceX).toBeCloseTo(1111.111111111111, 8);
    expect(sourceWidth).toBeCloseTo(1777.7777777777778, 8);
    expect([sourceY, sourceHeight]).toEqual([0, 1000]);
    expect(destination).toEqual([0, 0, 960, 540]);
    expect(context.scale).toHaveBeenCalledExactlyOnceWith(2048 / 1920, 2048 / 1920);
    expect(context.fillRect.mock.calls).toEqual([
      [0, 0, 2048, 1152],
      [960, 0, 960, 540],
      [0, 540, 960, 540],
      [960, 540, 960, 540],
    ]);
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(onExport).toHaveBeenCalledOnce();
    expect(onExport.mock.calls[0][1]).toBe('image/png');
    expect(output.file).toBeInstanceOf(File);
    expect(output.file.name).toBe('分镜拼接-2k-g.png');
    expect(output.file.type).toBe('image/png');
    expect(output.file.size).toBe(exportBlob.size);
    expect([output.width, output.height]).toEqual([2048, 1152]);
    expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
  });

  it('renders two-digit source numbers for every slot, including empty cells, at the source bottom-left inset', async () => {
    const output = await loadFirst(composeStoryboardStitch(makePlan()));
    expect(output.file).toBeTruthy();
    expect(context.strokeText.mock.calls).toEqual([
      ['01', 14, 526],
      ['02', 974, 526],
      ['03', 14, 1066],
      ['04', 974, 1066],
    ]);
    expect(context.fillText).toHaveBeenCalledTimes(12);
    expect(context.font).toBe('600 16px ui-sans-serif, system-ui, sans-serif');
    expect(context.textAlign).toBe('left');
    expect(context.textBaseline).toBe('bottom');
  });

  it('uses the caller asset URL mapping without changing the original or drawing numbers when disabled', async () => {
    const plan = makePlan({ showShotNumbers: false });
    const resolveUrl = vi.fn(() => '/assets/with-watermark.png');
    const output = await loadFirst(composeStoryboardStitch(plan, { resolveUrl }));
    expect(output.file).toBeTruthy();
    expect(resolveUrl).toHaveBeenCalledExactlyOnceWith(plan.items[0].url);
    expect(images[0].writes[0]).toBe('/assets/with-watermark.png');
    expect(images[0].crossOrigin).toBeUndefined();
    expect(context.strokeText).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
  });

  it('continues after a failed image with a dark cell rather than producing a partial file or rejecting all slots', async () => {
    const task = composeStoryboardStitch(makePlan());
    await vi.waitFor(() => expect(images).toHaveLength(1));
    images[0].onerror(new Event('error'));
    const output = await task;
    expect(output.file).toBeTruthy();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledTimes(5);
    expect(images[0].src).toBe('');
    expect(context.strokeText).toHaveBeenCalledTimes(4);
  });

  it('clears image timeouts after successful loads', async () => {
    vi.useFakeTimers();
    const task = composeStoryboardStitch(makePlan());
    await flush();
    expect(images).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    images[0].onload();
    await task;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a stalled image and still exports the dark slot while clearing resources', async () => {
    vi.useFakeTimers();
    const task = composeStoryboardStitch(makePlan(), { imageTimeoutMs: 150 });
    await flush();
    expect(images).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(150);
    expect((await task).file).toBeTruthy();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(images[0].src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an already aborted request before allocating a canvas or an image', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      composeStoryboardStitch(makePlan(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(canvases).toHaveLength(0);
    expect(images).toHaveLength(0);
  });

  it('aborts during an unresolved URL adapter and ignores its late resolution', async () => {
    const controller = new AbortController();
    let resolve;
    const resolveUrl = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const task = composeStoryboardStitch(makePlan(), { signal: controller.signal, resolveUrl });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(resolveUrl).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    resolve('/late.png');
    await flush();
    expect(images).toHaveLength(0);
    expect(onExport).not.toHaveBeenCalled();
    expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
  });

  it('aborts during loading, detaches callbacks, and ignores a previously queued image callback', async () => {
    const controller = new AbortController();
    const task = composeStoryboardStitch(makePlan(), { signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(images).toHaveLength(1));
    const queuedLoad = images[0].onload;
    controller.abort();
    await rejected;
    queuedLoad();
    await flush();
    expect(images[0].src).toBe('');
    expect(images[0].onload).toBeNull();
    expect(images[0].onerror).toBeNull();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(onExport).not.toHaveBeenCalled();
    expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
  });

  it('aborts while toBlob is pending and ignores its late result without constructing a File', async () => {
    const controller = new AbortController();
    let callback;
    onExport.mockImplementation((done) => {
      callback = done;
    });
    const task = composeStoryboardStitch(makePlan(), { signal: controller.signal });
    const rejected = expect(task).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(images).toHaveLength(1));
    images[0].onload();
    await vi.waitFor(() => expect(callback).toBeTypeOf('function'));
    controller.abort();
    await rejected;
    callback(exportBlob);
    await flush();
    expect(onExport).toHaveBeenCalledOnce();
    expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
  });

  it.each([null, new Blob([], { type: 'image/png' })])(
    'rejects a failed PNG export %s and releases the backing store',
    async (blob) => {
      exportBlob = blob;
      const task = composeStoryboardStitch(makePlan());
      const rejected = expect(task).rejects.toThrow('导出拼接图失败');
      await vi.waitFor(() => expect(images).toHaveLength(1));
      images[0].onload();
      await rejected;
      expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
    },
  );

  it('propagates a security/export exception rather than returning a false upload success', async () => {
    onExport.mockImplementation(() => {
      throw new DOMException('tainted canvas', 'SecurityError');
    });
    const task = composeStoryboardStitch(makePlan());
    const rejected = expect(task).rejects.toMatchObject({ name: 'SecurityError' });
    await vi.waitFor(() => expect(images).toHaveLength(1));
    images[0].onload();
    await rejected;
    expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
  });

  it('reports unavailable Canvas and rejects invalid geometry before exporting', async () => {
    context = null;
    await expect(composeStoryboardStitch(makePlan())).rejects.toThrow('无法创建画布');
    expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
    await expect(composeStoryboardStitch(makePlan({ width: Infinity }))).rejects.toThrow(
      '拼接配置不可用',
    );
    expect(canvases).toHaveLength(1);
    expect(images).toHaveLength(0);
    expect(onExport).not.toHaveBeenCalled();
  });
});
