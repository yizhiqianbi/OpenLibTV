import { afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { readCanvasUploadNode } from './uploads.js';
import {
  collectGeneratorMediaInputs,
  validateGeneratorMediaInputs,
} from '../generator/media-input-model.js';

afterEach(() => vi.unstubAllGlobals());
const inputsFor = (node) =>
  collectGeneratorMediaInputs({
    target: { id: 'generator', data: { params: {} } },
    nodes: [node],
    edges: [{ source: node.id, target: 'generator' }],
  });
// Explicit probe fixture values: these are not inferred from MIME, File name or graph size.
const withVerifiedVideoMetadata = (node) => ({
  ...node,
  resourceMeta: {
    items: [{ ...node.resourceMeta.items[0], width: 1280, height: 720, durationSec: 3 }],
  },
});
const validateVideo = (node) =>
  validateGeneratorMediaInputs(
    models.videoModels['kling-v3-omni'],
    'videoEdit2video',
    inputsFor(node),
    {
      prompt: '保留镜头动作',
    },
  );

describe('selected canvas files become actual local nodes', () => {
  it.each([
    ['image', 'picture.final.JPEG', 'image/png', 'jpeg'],
    ['video', 'take.final.MOV', 'video/mp4', 'mov'],
    ['audio', 'sound.WAV', 'audio/mpeg', 'wav'],
  ])(
    'records %s byte size and filename extension against its exact source URL',
    async (type, name, mimeType, extension) => {
      const file = new File([new Uint8Array([0, 1, 2, 255])], name, { type: mimeType });
      const node = await readCanvasUploadNode(file, { makeId: () => 'upload-id' });
      expect(node).toMatchObject({
        id: 'upload-id',
        type,
        data: { name, type, localMediaReady: true, text: '' },
      });
      expect(node.data.url).toEqual([`data:${mimeType};base64,AAEC/w==`]);
      expect(node.resourceMeta.items).toEqual([
        { kind: type, sourceUrl: node.data.url[0], byteSize: file.size, extension, mimeType },
      ]);
      expect(file.size).toBe(4);
      expect(node.resourceMeta.items[0]).not.toHaveProperty('width');
      expect(node.resourceMeta.items[0]).not.toHaveProperty('durationSec');
    },
  );

  it('loads actual markdown text rather than a filename and does not mark it as ready media', async () => {
    const text = '# 正文\n\n一段与文件名不同的内容\n<script>literal</script>\n';
    const file = new File([text], 'just-a-name.md', { type: 'text/markdown' });
    const node = await readCanvasUploadNode(file, { makeId: () => 'text-id' });
    expect(node.type).toBe('text');
    expect(node.data).toMatchObject({
      name: 'just-a-name.md',
      text,
      url: [],
      localMediaReady: false,
      params: { prompt: '', settings: {} },
    });
    expect(node).not.toHaveProperty('resourceMeta');
    expect(inputsFor(node)).toEqual({ imageList: [], videoList: [], audioList: [] });
  });

  it('preserves zero coordinates and offsets subsequent files without replacing zero with the default', async () => {
    const file = new File(['text'], 'position.txt');
    expect((await readCanvasUploadNode(file, { position: { x: 0, y: 0 } })).position).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      (await readCanvasUploadNode(file, { position: { x: 0, y: 0 }, index: 2 })).position,
    ).toEqual({ x: 740, y: 0 });
    expect((await readCanvasUploadNode(file)).position).toEqual({ x: 50, y: 50 });
  });

  it('uses actual .MOV metadata to resolve the public schema format for a completed data URL video', async () => {
    const node = await readCanvasUploadNode(
      new File(['synthetic bytes'], 'take.MOV', { type: 'video/mp4' }),
      {
        makeId: () => 'video-id',
      },
    );
    const beforeProbe = validateVideo(node);
    expect(beforeProbe.unresolved.map((item) => item.field)).toEqual(['duration', 'height']);
    expect(beforeProbe.unresolved.some((item) => item.field === 'formats')).toBe(false);
    const verified = withVerifiedVideoMetadata(node);
    expect(inputsFor(verified).videoList).toEqual([
      expect.objectContaining({
        nodeId: 'video-id',
        url: node.data.url[0],
        extension: 'mov',
        byteSize: 15,
        width: 1280,
        height: 720,
        durationSec: 3,
      }),
    ]);
    expect(validateVideo(verified)).toMatchObject({
      valid: true,
      complete: true,
      unresolved: [],
      blockMessages: [],
    });
    expect(node.resourceMeta.items[0]).not.toHaveProperty('durationSec');
  });

  it('does not guess a missing or unsupported actual extension from a video/mp4 MIME label', async () => {
    const noExtension = await readCanvasUploadNode(
      new File(['x'], 'opaque', { type: 'video/mp4' }),
    );
    expect(noExtension.resourceMeta.items[0].extension).toBeUndefined();
    expect(validateVideo(withVerifiedVideoMetadata(noExtension))).toMatchObject({
      valid: false,
      complete: false,
      unresolved: [expect.objectContaining({ field: 'formats' })],
    });
    const webm = await readCanvasUploadNode(new File(['x'], 'actual.WEBM', { type: 'video/mp4' }));
    expect(validateVideo(withVerifiedVideoMetadata(webm))).toMatchObject({
      valid: false,
      complete: true,
      unresolved: [],
      blockMessages: ['输入视频仅支持MP4和MOV格式'],
    });
  });

  it.each(['cancel', 'error'])(
    'allocates no node on %s and ignores a late reader result',
    async (event) => {
      let reader;
      class PendingReader {
        result = null;
        onload = null;
        onerror = null;
        onabort = null;
        readAsDataURL() {}
        abort = vi.fn(() => this.onabort?.());
        constructor() {
          reader = this;
        }
      }
      vi.stubGlobal('FileReader', PendingReader);
      const controller = new AbortController();
      const makeId = vi.fn(() => 'must-not-exist');
      const pending = readCanvasUploadNode(new File(['x'], 'failed.mp4', { type: 'video/mp4' }), {
        signal: controller.signal,
        makeId,
        position: { x: 0, y: 0 },
      });
      const lateLoad = reader.onload;
      const rejection =
        event === 'cancel'
          ? expect(pending).rejects.toMatchObject({ name: 'AbortError' })
          : expect(pending).rejects.toThrow('failed.mp4：读取失败');
      event === 'cancel' ? controller.abort() : reader.onerror();
      await rejection;
      expect(reader.onload).toBeNull();
      expect(reader.onerror).toBeNull();
      expect(reader.onabort).toBeNull();
      reader.result = 'data:video/mp4;base64,eA==';
      lateLoad();
      await Promise.resolve();
      expect(makeId).not.toHaveBeenCalled();
      expect(reader.abort).toHaveBeenCalledTimes(event === 'cancel' ? 1 : 0);
    },
  );
});
