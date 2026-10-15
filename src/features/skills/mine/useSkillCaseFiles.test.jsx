import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillCaseFiles } from './useSkillCaseFiles.js';

let readers;
class ControlledReader {
  result = null;
  aborted = false;
  constructor() {
    readers.push(this);
  }
  readAsDataURL(file) {
    this.file = file;
  }
  abort() {
    this.aborted = true;
  }
  success(value = 'data:image/png;base64,ready') {
    this.result = value;
    this.onload?.();
  }
  fail() {
    this.onerror?.();
  }
}
beforeEach(() => {
  readers = [];
  vi.stubGlobal('FileReader', ControlledReader);
});
afterEach(() => vi.unstubAllGlobals());
const image = (name = 'image.png') => new File(['png'], name, { type: 'image/png' });

describe('Skill publication case upload queue', () => {
  it('limits four cases and retains links through failed reads and retry', () => {
    const { result } = renderHook(() => useSkillCaseFiles([], 2));
    act(() =>
      result.current.addFiles(Array.from({ length: 5 }, (_, index) => image(index + '.png'))),
    );
    expect(result.current.items).toHaveLength(4);
    expect(result.current.error).toContain('4');
    expect(result.current.pending).toBe(true);
    const id = result.current.items[0].id;
    act(() => {
      result.current.setLink(id, 'https://sample.local/canvas');
      readers[0].fail();
    });
    expect(result.current.items[0]).toMatchObject({
      status: 'error',
      link: 'https://sample.local/canvas',
    });
    act(() => result.current.retry(id));
    expect(readers[4].file).toBe(readers[0].file);
    act(() => {
      readers[4].success();
      readers.slice(1, 4).forEach((reader) => reader.success());
    });
    expect(result.current.items[0]).toMatchObject({
      status: 'ready',
      url: 'data:image/png;base64,ready',
      link: 'https://sample.local/canvas',
    });
    expect(result.current.pending).toBe(false);
    act(() => result.current.remove(id));
    expect(result.current.error).toBe('');
    expect(result.current.items).toHaveLength(3);
  });

  it('preserves the previous case and link until replacement succeeds, and ignores aborted readers', () => {
    const original = {
      id: 'old',
      name: '原案例',
      url: '/original.png',
      link: 'https://sample.local/saved',
      status: 'ready',
    };
    const { result } = renderHook(() => useSkillCaseFiles([original], 2));
    act(() => result.current.replace('old', image('replace.png')));
    expect(result.current.items[0]).toMatchObject({ url: '/original.png', status: 'reading' });
    act(() => readers[0].fail());
    expect(result.current.items[0]).toMatchObject({ url: '/original.png', status: 'error' });
    act(() => result.current.retry('old'));
    act(() => result.current.replace('old', image('latest.png')));
    expect(readers[1].aborted).toBe(true);
    act(() => readers[1].success('data:image/png;base64,stale'));
    expect(result.current.items[0].url).toBe('/original.png');
    act(() => readers[2].success('data:image/png;base64,latest'));
    expect(result.current.items[0]).toMatchObject({
      name: '原案例',
      fileName: 'latest.png',
      url: 'data:image/png;base64,latest',
      link: original.link,
      status: 'ready',
    });
  });

  it('cancels removed and unmounted cases, ignoring late success callbacks', () => {
    const { result, unmount } = renderHook(() => useSkillCaseFiles([], 2));
    act(() => result.current.addFiles([image()]));
    act(() => result.current.remove(result.current.items[0].id));
    expect(readers[0].aborted).toBe(true);
    act(() => readers[0].success());
    expect(result.current.items).toEqual([]);
    act(() => result.current.addFiles([image('unmount.png')]));
    unmount();
    expect(readers[1].aborted).toBe(true);
    act(() => readers[1].success());
  });
});
