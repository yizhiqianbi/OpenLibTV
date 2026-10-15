import { readFile } from 'node:fs/promises';
import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glbBufferToDataUrl } from '../glb.js';
import { deleteStudioDocument, persistStudioDocument, readStudioDocument } from '../persistence.js';
import { useStudioAutosave, useStudioDocument } from './useStudioDocument.js';

const user = { id: 'local-test-user' };
const emptyDocument = (id = 'studio') => ({
  id,
  title: '场景',
  objects: [],
  frames: [],
  duration: 10,
  ratio: '16:9',
});
const callbacks = () => ({ setSaved: vi.fn(), notify: vi.fn() });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('studio autosave lifecycle', () => {
  it('flushes an imported GLB on unmount before the 500 ms debounce expires', async () => {
    const bytes = await readFile('artifacts/studio-import-fixture.glb');
    const imported = {
      id: 'imported',
      type: 'glb',
      name: 'fixture.glb',
      dataUrl: glbBufferToDataUrl(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ),
      position: [1, 2, 3],
      rotation: [0, 30, 0],
      scale: [1, 1, 1],
    };
    const document = { ...emptyDocument(), objects: [imported] };
    const state = callbacks();
    const { unmount } = renderHook(() =>
      useStudioAutosave(document, { loaded: true, user, ...state }),
    );
    expect(state.setSaved).toHaveBeenLastCalledWith(false);
    act(() => vi.advanceTimersByTime(100));
    expect(readStudioDocument(document.id)).toBeNull();
    unmount();
    expect(readStudioDocument(document.id).objects).toEqual([imported]);
    expect(state.setSaved).toHaveBeenLastCalledWith(true);
    act(() => vi.advanceTimersByTime(500));
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('debounces consecutive edits and flushes the latest document on pagehide only once', () => {
    const state = callbacks();
    const first = emptyDocument();
    const { rerender, unmount } = renderHook(
      ({ document }) => useStudioAutosave(document, { loaded: true, user, ...state }),
      { initialProps: { document: first } },
    );
    act(() => vi.advanceTimersByTime(100));
    const latest = { ...first, title: '更新标题', objects: [{ id: 'cube', type: 'cube' }] };
    rerender({ document: latest });
    expect(readStudioDocument(first.id)).toBeNull();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readStudioDocument(first.id)).toMatchObject(latest);
    const saved = readStudioDocument(first.id);
    act(() => {
      vi.advanceTimersByTime(600);
      window.dispatchEvent(new Event('pagehide'));
    });
    unmount();
    expect(readStudioDocument(first.id).date).toBe(saved.date);
    expect(state.setSaved.mock.calls.filter(([value]) => value === true)).toHaveLength(1);
  });

  it.each([
    { loaded: false, user },
    { loaded: true, user: null },
  ])('never queues an invalid document with options %o', (options) => {
    const document = emptyDocument();
    const state = callbacks();
    const { unmount } = renderHook(() => useStudioAutosave(document, { ...options, ...state }));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      vi.advanceTimersByTime(1000);
    });
    unmount();
    expect(readStudioDocument(document.id)).toBeNull();
    expect(state.setSaved).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('keeps failed writes unsaved and reports storage quota errors during a final flush', () => {
    const document = emptyDocument();
    const state = callbacks();
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const { unmount } = renderHook(() =>
      useStudioAutosave(document, { loaded: true, user, ...state }),
    );
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(state.setSaved).toHaveBeenLastCalledWith(false);
    expect(state.notify).toHaveBeenCalledWith('保存失败，请检查浏览器存储空间，或导出 GLB 备份。');
    expect(localStorage.getItem('libtv.studio.studio')).toBeNull();
    failure.mockRestore();
    unmount();
    expect(readStudioDocument(document.id)).toMatchObject(document);
  });

  it('does not recreate a deleted project when its pending save is explicitly discarded', () => {
    const document = emptyDocument();
    persistStudioDocument(document);
    const state = callbacks();
    const { result, unmount } = renderHook(() =>
      useStudioAutosave(
        { ...document, title: '尚未自动保存的修改' },
        { loaded: true, user, ...state },
      ),
    );
    act(() => {
      deleteStudioDocument(document.id);
      result.current();
    });
    unmount();
    act(() => vi.advanceTimersByTime(600));
    expect(readStudioDocument(document.id)).toBeNull();
    expect(JSON.parse(localStorage.getItem('libtv-studio-projects'))).toEqual([]);
  });

  it('flushes the previous project without writing its state into the next project identity', () => {
    const first = { ...emptyDocument('first'), objects: [{ id: 'first-cube' }] };
    const next = { ...emptyDocument('next'), title: '下个场景', objects: [{ id: 'next-sphere' }] };
    persistStudioDocument(first);
    persistStudioDocument(next);
    const state = callbacks();
    const { result, rerender, unmount } = renderHook(
      ({ id }) => {
        const [title, setTitle] = useState(''),
          [objects, setObjects] = useState([]),
          [frames, setFrames] = useState([]),
          [duration, setDuration] = useState(10),
          [ratio, setRatio] = useState('16:9'),
          [loaded, setLoaded] = useState(false);
        const loadedId = useStudioDocument(id, true, user, {
          setTitle,
          setObjects,
          setFrames,
          setDuration,
          setRatio,
          setLoaded,
        });
        useStudioAutosave(
          { id, title, objects, frames, duration, ratio },
          { loaded: loaded && loadedId === id, user, ...state },
        );
        return { objects, setObjects };
      },
      { initialProps: { id: first.id } },
    );
    const changed = [{ id: 'first-cube', position: [7, 0, 0] }];
    act(() => result.current.setObjects(changed));
    rerender({ id: next.id });
    expect(readStudioDocument(first.id).objects).toEqual(changed);
    expect(result.current.objects).toEqual(next.objects);
    unmount();
    expect(readStudioDocument(next.id)).toMatchObject(next);
    expect(state.notify).not.toHaveBeenCalled();
  });
  it('retains a failed animation cursor and clip selection for retry without overwriting the previous saved state', () => {
    const object = {
      id: 'animated',
      type: 'glb',
      dataUrl: 'original-source',
      clips: [{ name: 'Slide', duration: 2 }],
    };
    const previous = {
      ...emptyDocument(),
      objects: [object],
      time: 0.25,
      animationSelection: null,
    };
    const changed = {
      ...previous,
      time: 1.5,
      animationSelection: { objectId: object.id, index: 0 },
    };
    persistStudioDocument(previous);
    const state = callbacks();
    const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const { unmount } = renderHook(() =>
      useStudioAutosave(changed, { loaded: true, user, ...state }),
    );
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readStudioDocument(previous.id)).toMatchObject(previous);
    expect(state.setSaved).toHaveBeenLastCalledWith(false);
    expect(state.notify).toHaveBeenCalledOnce();
    failed.mockRestore();
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(readStudioDocument(changed.id)).toMatchObject(changed);
    unmount();
  });
});
