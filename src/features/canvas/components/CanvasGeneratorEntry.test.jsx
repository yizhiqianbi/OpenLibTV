import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasGeneratorEntry } from './CanvasGeneratorEntry.jsx';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const props = (overrides = {}) => ({
  node: {
    id: 'node',
    type: 'script-v2',
    position: { x: 100, y: 200 },
    width: 350,
    height: 350,
    data: { name: '测试节点' },
  },
  documentKey: 'doc-a',
  ready: true,
  readonly: false,
  position: { x: 100, y: 200 },
  coordinateOrigin: { x: 100, y: 200 },
  zoom: 0.8,
  view: { x: 0, y: 0, z: 0.8 },
  ...overrides,
});
function Implementation({ documentKey, node, readonly, marker }) {
  return (
    <p data-testid="implementation">{`${documentKey}:${node.id}:${readonly}:${marker || ''}`}</p>
  );
}

describe('canvas generator mount-only loading boundary', () => {
  it('waits for readiness, then loads generic readonly content and forwards permissions to the implementation', async () => {
    const loader = vi.fn().mockResolvedValue({ default: Implementation });
    const page = render(
      <CanvasGeneratorEntry loader={loader} {...props({ ready: false, readonly: true })} />,
    );
    expect(screen.getByRole('status').textContent).toContain('画布加载中');
    expect(loader).not.toHaveBeenCalled();
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ readonly: true })} />);
    expect((await screen.findByTestId('implementation')).textContent).toBe('doc-a:node:true:');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('publishes a shared late module only with the latest document props, without mounting the previous owner', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const mounts = vi.fn();
    function Tracked(value) {
      mounts(value.documentKey);
      return <Implementation {...value} />;
    }
    const page = render(<CanvasGeneratorEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ documentKey: 'doc-b' })} />);
    await act(() => request.resolve({ default: Tracked }));
    expect(screen.getByTestId('implementation').textContent).toBe('doc-b:node:false:');
    expect(mounts.mock.calls.flat()).toEqual(['doc-b']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('isolates A→B→A while an import is pending and renders only the final A values', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const mounts = vi.fn();
    function Tracked(value) {
      mounts(value.marker);
      return <Implementation {...value} />;
    }
    const page = render(<CanvasGeneratorEntry loader={loader} {...props({ marker: 'old-a' })} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(
      <CanvasGeneratorEntry loader={loader} {...props({ documentKey: 'doc-b', marker: 'b' })} />,
    );
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ marker: 'fresh-a' })} />);
    await act(() => request.resolve({ default: Tracked }));
    expect(screen.getByTestId('implementation').textContent).toBe('doc-a:node:false:fresh-a');
    expect(mounts.mock.calls.flat()).toEqual(['fresh-a']);
  });

  it('does not mount late success after readiness is lost and uses current data once readiness returns', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const page = render(<CanvasGeneratorEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ ready: false })} />);
    await act(() => request.resolve({ default: Implementation }));
    expect(screen.queryByTestId('implementation')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('画布加载中');
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ marker: 'resumed' })} />);
    expect((await screen.findByTestId('implementation')).textContent).toBe(
      'doc-a:node:false:resumed',
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retires a rejected old owner and allows only the current owner to retry the failed import', async () => {
    const first = deferred();
    const loader = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue({ default: Implementation });
    const page = render(<CanvasGeneratorEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ documentKey: 'doc-b' })} />);
    await act(() => first.reject(new Error('temporary chunk failure')));
    expect(screen.queryByTestId('implementation')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('生成器加载失败');
    fireEvent.click(screen.getByRole('button', { name: '重新加载生成器' }));
    expect((await screen.findByTestId('implementation')).textContent).toBe('doc-b:node:false:');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('clears rejected import cache for a genuine retry without reloading the page', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: Implementation });
    render(<CanvasGeneratorEntry loader={loader} {...props()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('offline');
    fireEvent.click(screen.getByRole('button', { name: '重新加载生成器' }));
    expect(await screen.findByTestId('implementation')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('catches implementation render errors and retries the same loaded code with current props', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken({ fail, ...value }) {
      if (fail) throw new Error('render failed');
      return <Implementation {...value} />;
    }
    const loader = vi.fn().mockResolvedValue({ default: Broken });
    const page = render(<CanvasGeneratorEntry loader={loader} {...props({ fail: true })} />);
    expect((await screen.findByRole('alert')).textContent).toContain('render failed');
    page.rerender(<CanvasGeneratorEntry loader={loader} {...props({ fail: false })} />);
    fireEvent.click(screen.getByRole('button', { name: '重新加载生成器' }));
    expect(await screen.findByTestId('implementation')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('never mounts a late implementation after the entry is removed', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const implementation = vi.fn(() => <p>late implementation</p>);
    const page = render(<CanvasGeneratorEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.unmount();
    await act(() => request.resolve({ default: implementation }));
    expect(implementation).not.toHaveBeenCalled();
    expect(screen.queryByText('late implementation')).toBeNull();
  });

  it.each([
    ['script', '366px'],
    ['generic', '370px'],
  ])(
    'keeps the %s loading fallback in the original overlay geometry without altering node data',
    (kind, top) => {
      const request = deferred();
      const loader = vi.fn(() => request.promise);
      const value = props();
      const original = structuredClone(value.node);
      render(<CanvasGeneratorEntry loader={loader} kind={kind} {...value} />);
      const frame = screen.getByRole('status').closest('section');
      expect(frame.style.left).toBe('175px');
      expect(frame.style.top).toBe(top);
      expect(frame.style.transform).toBe('scale(1.25) translateX(-50%)');
      expect(value.node).toEqual(original);
    },
  );

  it('isolates loading/retry pointer and double-click while preserving button Space defaults and Escape propagation', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('offline'));
    const pointer = vi.fn(),
      doubleClick = vi.fn(),
      key = vi.fn();
    render(
      <div onPointerDown={pointer} onDoubleClick={doubleClick} onKeyDown={key}>
        <CanvasGeneratorEntry loader={loader} {...props()} />
      </div>,
    );
    const retry = await screen.findByRole('button', { name: '重新加载生成器' });
    fireEvent.pointerDown(retry, { pointerId: 7 });
    fireEvent.doubleClick(retry);
    const space = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(retry, space);
    expect(space.defaultPrevented).toBe(false);
    expect(pointer).not.toHaveBeenCalled();
    expect(doubleClick).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
    fireEvent.keyDown(retry, { key: 'Escape' });
    expect(key).toHaveBeenCalledTimes(1);
  });
});
