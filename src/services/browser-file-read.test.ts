import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocalFile } from './browser-file-read.ts';

/** Controls delivery only; successful byte/text reads below use the real FileReader. */
class ControlledFileReader {
  static instances: ControlledFileReader[] = [];
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  readAsText = vi.fn();
  readAsDataURL = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    ControlledFileReader.instances.push(this);
  }
}
const controlledReader = () => {
  ControlledFileReader.instances = [];
  vi.stubGlobal('FileReader', ControlledFileReader);
};
const detached = (reader: ControlledFileReader) => {
  expect(reader.onload).toBeNull();
  expect(reader.onerror).toBeNull();
  expect(reader.onabort).toBeNull();
};
afterEach(() => vi.unstubAllGlobals());

describe('local file reads own bytes and asynchronous lifetime', () => {
  it('reads the actual selected file bytes as a data URL', async () => {
    const file = new File([new Uint8Array([0, 1, 2, 255])], 'take.MOV', { type: 'video/mp4' });
    expect(await readLocalFile(file)).toBe('data:video/mp4;base64,AAEC/w==');
  });

  it('reads UTF-8 text content, preserving line breaks and literal markup', async () => {
    const text = '# 实际正文\n\n<script>literal</script>\n末尾\n';
    const file = new File([text], 'not-the-content.md', { type: 'text/markdown' });
    expect(await readLocalFile(file, { mode: 'text' })).toBe(text);
  });

  it('rejects a signal cancelled before start without constructing a reader', async () => {
    controlledReader();
    const controller = new AbortController();
    controller.abort();
    await expect(
      readLocalFile(new File(['x'], 'before.txt'), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(ControlledFileReader.instances).toHaveLength(0);
  });

  it('aborts once, detaches callbacks/listener and rejects a late successful callback', async () => {
    controlledReader();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = readLocalFile(new File(['x'], 'cancel.png'), { signal: controller.signal });
    const reader = ControlledFileReader.instances[0];
    const lateLoad = reader.onload!;
    const resolved = vi.fn();
    const rejected = vi.fn();
    const observed = pending.then(resolved, rejected);
    controller.abort();
    await observed;
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ name: 'AbortError' }));
    expect(reader.abort).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    detached(reader);
    reader.result = 'data:image/png;base64,eA==';
    lateLoad();
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledOnce();
  });

  it('reports a read error with the filename and cannot be revived by a late result', async () => {
    controlledReader();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = readLocalFile(new File(['x'], 'broken.txt'), {
      signal: controller.signal,
      mode: 'text',
    });
    const reader = ControlledFileReader.instances[0];
    const lateLoad = reader.onload!;
    const rejection = expect(pending).rejects.toThrow('broken.txt：读取失败，请重新选择文件');
    reader.onerror!();
    await rejection;
    expect(reader.readAsText).toHaveBeenCalledOnce();
    expect(reader.readAsDataURL).not.toHaveBeenCalled();
    detached(reader);
    expect(remove).toHaveBeenCalledOnce();
    reader.result = 'late text';
    lateLoad();
    await expect(pending).rejects.toThrow('broken.txt：读取失败');
    controller.abort();
    expect(reader.abort).not.toHaveBeenCalled();
  });

  it('cleans up a synchronous reader exception without replacing its error', async () => {
    controlledReader();
    const error = new Error('reader unavailable');
    class ThrowingFileReader extends ControlledFileReader {
      constructor() {
        super();
        this.readAsDataURL.mockImplementation(() => {
          throw error;
        });
      }
    }
    vi.stubGlobal('FileReader', ThrowingFileReader);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(
      readLocalFile(new File(['x'], 'throw.png'), { signal: controller.signal }),
    ).rejects.toBe(error);
    detached(ControlledFileReader.instances[0]);
    expect(remove).toHaveBeenCalledOnce();
  });

  it.each([null, new ArrayBuffer(1)])('rejects a non-string load result %s', async (result) => {
    controlledReader();
    const pending = readLocalFile(new File(['x'], 'invalid.txt'), { mode: 'text' });
    const reader = ControlledFileReader.instances[0];
    const rejection = expect(pending).rejects.toThrow('invalid.txt：读取失败');
    reader.result = result;
    reader.onload!();
    await rejection;
    detached(reader);
  });

  it('cleans up success before later cancellation and does not read or settle twice', async () => {
    controlledReader();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const file = new File(['body'], 'success.txt');
    const pending = readLocalFile(file, { signal: controller.signal, mode: 'text' });
    const reader = ControlledFileReader.instances[0];
    const lateLoad = reader.onload!;
    reader.result = 'body';
    lateLoad();
    expect(await pending).toBe('body');
    detached(reader);
    expect(remove).toHaveBeenCalledOnce();
    controller.abort();
    reader.result = 'wrong late result';
    lateLoad();
    expect(await pending).toBe('body');
    expect(reader.readAsText).toHaveBeenCalledExactlyOnceWith(file);
    expect(reader.abort).not.toHaveBeenCalled();
  });
});
