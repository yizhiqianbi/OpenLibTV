import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CanvasScriptNodeEntry from './CanvasScriptNodeEntry.jsx';
import { createCanvasScriptNode } from './script-model.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const props = (overrides = {}) => ({
  node: createCanvasScriptNode({ id: 'script' }),
  documentKey: 'doc-a',
  ready: true,
  readonly: false,
  ...overrides,
});
function Implementation({ node, documentKey, readonly, openRequest = 0 }) {
  return (
    <p data-testid="implementation">
      {`${documentKey}:${node.id}:${node.type}:${readonly}:${openRequest}`}
    </p>
  );
}
function resource() {
  const node = createCanvasScriptNode({ id: 'script' });
  return {
    ...node,
    data: {
      ...node.data,
      rows: [
        { id: 'shot', hiddenUuid: 'shot', shotNumber: 1, plotDescription: '保留真实脚本内容' },
      ],
    },
  };
}

describe('actual script card lazy entry', () => {
  it('defers requests until ready and lets readonly content retry without a writer', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: Implementation });
    const page = render(
      <CanvasScriptNodeEntry loader={loader} {...props({ ready: false, readonly: true })} />,
    );
    expect(screen.getByRole('status').textContent).toContain('画布加载中');
    expect(loader).not.toHaveBeenCalled();
    page.rerender(<CanvasScriptNodeEntry loader={loader} {...props({ readonly: true })} />);
    expect((await screen.findByRole('alert')).textContent).toBe('脚本节点加载失败，请重试');
    fireEvent.click(screen.getByRole('button', { name: '重新加载脚本节点' }));
    expect((await screen.findByTestId('implementation')).textContent).toBe(
      'doc-a:script:script-v2:true:0',
    );
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('shares a single import across StrictMode replay and simultaneous card mounts', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const page = render(
      <StrictMode>
        <CanvasScriptNodeEntry loader={loader} {...props()} />
        <CanvasScriptNodeEntry loader={loader} {...props({ documentKey: 'doc-b' })} />
      </StrictMode>,
    );
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await act(() => request.resolve({ default: Implementation }));
    expect(screen.getAllByTestId('implementation').map((element) => element.textContent)).toEqual([
      'doc-a:script:script-v2:false:0',
      'doc-b:script:script-v2:false:0',
    ]);
    page.unmount();
    render(<CanvasScriptNodeEntry loader={loader} {...props()} />);
    expect(await screen.findByTestId('implementation')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps component identity, local draft, DOM selection and all original props on same-owner updates', async () => {
    const mounted = vi.fn(),
      retired = vi.fn(),
      received = vi.fn();
    function Draft(value) {
      const [draft, setDraft] = useState('original');
      received(value);
      useEffect(() => {
        mounted();
        return retired;
      }, []);
      return (
        <input
          aria-label="local draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    }
    const loader = vi.fn().mockResolvedValue({ default: Draft });
    const first = props();
    const page = render(<CanvasScriptNodeEntry loader={loader} {...first} />);
    const input = await screen.findByRole('textbox', { name: 'local draft' });
    fireEvent.change(input, { target: { value: 'unsaved draft' } });
    input.focus();
    input.setSelectionRange(2, 7);
    const onChange = vi.fn(),
      registerDraft = vi.fn(),
      shouldSuppressClick = vi.fn();
    const next = {
      ...first,
      node: { ...first.node, data: { ...first.node.data, name: 'new name' } },
      nodes: [first.node],
      edges: [{ id: 'edge', source: 'ref', target: 'script' }],
      readonly: true,
      openRequest: 4,
      onChange,
      registerDraft,
      shouldSuppressClick,
      src: (url) => `asset:${url}`,
    };
    page.rerender(<CanvasScriptNodeEntry loader={loader} {...next} />);
    expect(screen.getByRole('textbox', { name: 'local draft' })).toBe(input);
    expect(input.value).toBe('unsaved draft');
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(7);
    expect(document.activeElement).toBe(input);
    expect(received.mock.lastCall[0]).toEqual(next);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(retired).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retires A→B→A request owners and publishes only fresh A props and the latest open request', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const mounted = vi.fn();
    function Tracked(value) {
      useEffect(() => {
        mounted(value.documentKey, value.openRequest);
      }, [value.documentKey, value.openRequest]);
      return <Implementation {...value} />;
    }
    const page = render(<CanvasScriptNodeEntry loader={loader} {...props({ openRequest: 1 })} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(
      <CanvasScriptNodeEntry
        loader={loader}
        {...props({ documentKey: 'doc-b', openRequest: 2 })}
      />,
    );
    page.rerender(<CanvasScriptNodeEntry loader={loader} {...props({ openRequest: 3 })} />);
    await act(() => request.resolve({ default: Tracked }));
    expect(screen.getByTestId('implementation').textContent).toBe('doc-a:script:script-v2:false:3');
    expect(mounted.mock.calls).toEqual([['doc-a', 3]]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it.each(['id', 'type', 'data.type'])(
    'replaces the mounted owner when %s changes',
    async (field) => {
      const retired = vi.fn();
      function Draft(value) {
        const [draft, setDraft] = useState('initial');
        useEffect(() => () => retired(value.node), [value.node]);
        return (
          <input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
        );
      }
      const loader = vi.fn().mockResolvedValue({ default: Draft });
      const value = props();
      const page = render(<CanvasScriptNodeEntry loader={loader} {...value} />);
      const input = await screen.findByRole('textbox');
      fireEvent.change(input, { target: { value: 'old owner draft' } });
      const node =
        field === 'data.type'
          ? { ...value.node, data: { ...value.node.data, type: 'storyboard' } }
          : { ...value.node, [field]: field === 'id' ? 'other' : 'storyboard' };
      page.rerender(<CanvasScriptNodeEntry loader={loader} {...value} node={node} />);
      const fresh = await screen.findByRole('textbox');
      expect(fresh).not.toBe(input);
      expect(fresh.value).toBe('initial');
      expect(retired).toHaveBeenCalledExactlyOnceWith(value.node);
      expect(loader).toHaveBeenCalledTimes(1);
    },
  );

  it('does not publish late code while unready and resumes with current props from the cached module', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const implementation = vi.fn(Implementation);
    const page = render(<CanvasScriptNodeEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(<CanvasScriptNodeEntry loader={loader} {...props({ ready: false })} />);
    await act(() => request.resolve({ default: implementation }));
    expect(implementation).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('画布加载中');
    page.rerender(<CanvasScriptNodeEntry loader={loader} {...props({ openRequest: 7 })} />);
    expect((await screen.findByTestId('implementation')).textContent).toBe(
      'doc-a:script:script-v2:false:7',
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('ignores a retired retry failure without overwriting the new owner or its loader', async () => {
    const retried = deferred();
    const loaderA = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(retried.promise);
    const loaderB = vi.fn().mockResolvedValue({ default: Implementation });
    const page = render(<CanvasScriptNodeEntry loader={loaderA} {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: '重新加载脚本节点' }));
    await waitFor(() => expect(loaderA).toHaveBeenCalledTimes(2));
    page.rerender(<CanvasScriptNodeEntry loader={loaderB} {...props({ documentKey: 'doc-b' })} />);
    expect((await screen.findByTestId('implementation')).textContent).toBe(
      'doc-b:script:script-v2:false:0',
    );
    await act(() => retried.reject(new Error('old retry failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('implementation').textContent).toBe('doc-b:script:script-v2:false:0');
    expect(loaderB).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed modules, removes failure cache and succeeds on a real retry', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({ named: Implementation })
      .mockResolvedValueOnce({ default: Implementation });
    render(<CanvasScriptNodeEntry loader={loader} {...props()} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByTestId('implementation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新加载脚本节点' }));
    expect(await screen.findByTestId('implementation')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('recovers a component render failure with current props while keeping the successful module cached', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Broken({ broken, ...value }) {
      if (broken) throw new Error('render failed');
      return <Implementation {...value} />;
    }
    const loader = vi.fn().mockResolvedValue({ default: Broken });
    const page = render(<CanvasScriptNodeEntry loader={loader} {...props()} broken />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    page.rerender(
      <CanvasScriptNodeEntry loader={loader} {...props({ openRequest: 2 })} broken={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '重新加载脚本节点' }));
    expect((await screen.findByTestId('implementation')).textContent).toBe(
      'doc-a:script:script-v2:false:2',
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('never mounts a late implementation after removal', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const implementation = vi.fn(Implementation);
    const page = render(<CanvasScriptNodeEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.unmount();
    await act(() => request.resolve({ default: implementation }));
    expect(implementation).not.toHaveBeenCalled();
  });

  it('keeps host dragging on the loading surface and isolates retry pointer/double-click/Space without swallowing Escape', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('offline'));
    const pointer = vi.fn(),
      doubleClick = vi.fn(),
      key = vi.fn();
    render(
      <div onPointerDown={pointer} onDoubleClick={doubleClick} onKeyDown={key}>
        <CanvasScriptNodeEntry loader={loader} {...props()} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('status'), { pointerId: 1 });
    expect(pointer).toHaveBeenCalledTimes(1);
    const retry = await screen.findByRole('button', { name: '重新加载脚本节点' });
    fireEvent.pointerDown(retry, { pointerId: 2 });
    fireEvent.doubleClick(retry);
    const space = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(retry, space);
    expect(space.defaultPrevented).toBe(false);
    expect(pointer).toHaveBeenCalledTimes(1);
    expect(doubleClick).not.toHaveBeenCalled();
    expect(key).not.toHaveBeenCalled();
    fireEvent.keyDown(retry, { key: 'Escape' });
    expect(key).toHaveBeenCalledTimes(1);
  });

  it('loads the actual default CanvasScriptNode implementation and keeps readonly resource contents accessible', async () => {
    const node = resource();
    render(<CanvasScriptNodeEntry {...props({ node, nodes: [node], readonly: true })} />);
    // This first default-loader request imports the actual lazy dependency closure.
    expect(
      await screen.findByTestId('scriptv2-resource-card-surface', undefined, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.getByTestId('scriptv2-stage-progress-compact')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开脚本节点 →' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  }, 15_000);

  it('passes accumulated open requests and latest rows to the real card after a delayed import', async () => {
    const request = deferred();
    const loader = vi.fn(async () => {
      await request.promise;
      return import('./CanvasScriptNode.jsx');
    });
    const node = resource();
    const onChange = vi.fn();
    const page = render(
      <CanvasScriptNodeEntry loader={loader} {...props({ node, nodes: [node], onChange })} />,
    );
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    const latestNode = {
      ...node,
      data: { ...node.data, rows: [{ ...node.data.rows[0], plotDescription: '加载期间最新原文' }] },
    };
    page.rerender(
      <CanvasScriptNodeEntry
        loader={loader}
        {...props({ node: latestNode, nodes: [latestNode], onChange, openRequest: 2 })}
      />,
    );
    await act(() => request.resolve());
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('加载期间最新原文')).toBeTruthy();
    expect(screen.queryByText('保留真实脚本内容')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '关闭分镜脚本' })));
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(
      <CanvasScriptNodeEntry
        loader={loader}
        {...props({ node: latestNode, nodes: [latestNode], onChange, openRequest: 2 })}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(
      <CanvasScriptNodeEntry
        loader={loader}
        {...props({ node: latestNode, nodes: [latestNode], onChange, openRequest: 3 })}
      />,
    );
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
