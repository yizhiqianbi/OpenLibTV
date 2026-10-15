import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeTextToClipboard } from './clipboard-text.js';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete navigator.clipboard;
  if (originalExec) Object.defineProperty(document, 'execCommand', originalExec);
  else delete document.execCommand;
  document.body.innerHTML = '';
});
const clipboard = (writer) =>
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: writer },
  });
const exec = (writer) =>
  Object.defineProperty(document, 'execCommand', { configurable: true, value: writer });

describe('real text clipboard boundary', () => {
  it('awaits native success and does not invoke fallback or modify focus', async () => {
    const write = vi.fn().mockResolvedValue();
    const fallback = vi.fn();
    clipboard(write);
    exec(fallback);
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await writeTextToClipboard('ordered\ntext');
    expect(write).toHaveBeenCalledWith('ordered\ntext');
    expect(fallback).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });
  it('uses an actual fallback after permission failure and restores input selection/focus', async () => {
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const input = document.createElement('input');
    input.value = 'original';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(2, 5, 'backward');
    const fallback = vi.fn((command) => {
      expect(command).toBe('copy');
      expect(document.activeElement.value).toBe('copied');
      document.dispatchEvent(new Event('copy'));
      return true;
    });
    exec(fallback);
    await writeTextToClipboard('copied');
    expect(fallback).toHaveBeenCalledOnce();
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(5);
    expect(input.selectionDirection).toBe('backward');
  });
  it('restores DOM ranges and rejects a false legacy result rather than pretending success', async () => {
    clipboard(vi.fn().mockRejectedValue(new Error('denied')));
    exec(() => false);
    const text = document.createElement('p');
    text.textContent = 'original selection';
    document.body.append(text);
    const range = document.createRange();
    range.setStart(text.firstChild, 1);
    range.setEnd(text.firstChild, 8);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    expect(window.getSelection().toString()).toBe('riginal');
    await expect(writeTextToClipboard('no')).rejects.toThrow('Clipboard copy failed');
    expect(window.getSelection().toString()).toBe('riginal');
    expect(document.querySelector('textarea')).toBeNull();
  });
  it('cancels stale fallback after another copy, user copy, or caller abort', async () => {
    let rejectFirst;
    const first = new Promise((_, reject) => {
      rejectFirst = reject;
    });
    const fallback = vi.fn(() => true);
    exec(fallback);
    clipboard(vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce());
    const pending = writeTextToClipboard('first');
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await writeTextToClipboard('second');
    rejectFirst(new Error('old failure'));
    await rejected;
    expect(fallback).not.toHaveBeenCalled();
    let reject;
    clipboard(
      () =>
        new Promise((_, failure) => {
          reject = failure;
        }),
    );
    const controller = new AbortController();
    const aborted = writeTextToClipboard('abort', { signal: controller.signal });
    const assertion = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    reject(new Error('denied'));
    await assertion;
    expect(fallback).not.toHaveBeenCalled();
    let settle;
    clipboard(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    const interrupted = writeTextToClipboard('interrupted');
    const interruptedAssertion = expect(interrupted).rejects.toMatchObject({ name: 'AbortError' });
    document.dispatchEvent(new Event('copy'));
    settle();
    await interruptedAssertion;
    expect(fallback).not.toHaveBeenCalled();
  });
});
