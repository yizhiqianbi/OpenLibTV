import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FocusConfirmEntry from './FocusConfirmEntry.jsx';

const region = { relX: 0.1, relY: 0.2, width: 0.3, height: 0.4 };
const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function LoadedBar({ ownerKey, region, onConfirm, onCancel, selectedRatio }) {
  return (
    <div role="region" aria-label="loaded bar" data-owner={ownerKey?.label}>
      <output>{JSON.stringify(region)}</output>
      <span>{selectedRatio}</span>
      <button onClick={onConfirm}>测试确认</button>
      <button onClick={onCancel}>测试取消</button>
    </div>
  );
}
const module = { default: LoadedBar };
const settle = async (request, value = module) => {
  await act(async () => request.resolve(value));
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('focus confirmation lazy entry', () => {
  it('does not request inactive code and preloads at mode entry before a rectangle exists', async () => {
    const request = pending();
    const loader = vi.fn(() => request.promise);
    const owner = {};
    const page = render(<FocusConfirmEntry ownerKey={owner} loader={loader} />);
    await act(async () => {});
    expect(loader).not.toHaveBeenCalled();
    page.rerender(<FocusConfirmEntry modeActive ownerKey={owner} loader={loader} />);
    await act(async () => {});
    expect(loader).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region')).toBeNull();
    await settle(request);
    page.rerender(
      <FocusConfirmEntry modeActive ownerKey={owner} loader={loader} region={region} />,
    );
    expect(screen.getByRole('region', { name: 'loaded bar' })).toBeTruthy();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('preloads while drawing but renders only the latest completed region and selected ratio', async () => {
    const request = pending();
    const loader = vi.fn(() => request.promise);
    const owner = {};
    const page = render(
      <FocusConfirmEntry modeActive drawing ownerKey={owner} loader={loader} region={region} />,
    );
    await settle(request);
    expect(loader).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region')).toBeNull();
    const latestRegion = { ...region, width: 0.5 };
    page.rerender(
      <FocusConfirmEntry
        modeActive
        ownerKey={owner}
        loader={loader}
        region={latestRegion}
        selectedRatio="4:3"
      />,
    );
    expect(screen.getByRole('region', { name: 'loaded bar' }).textContent).toContain(
      JSON.stringify(latestRegion),
    );
    expect(screen.getByText('4:3')).toBeTruthy();
    page.rerender(
      <FocusConfirmEntry
        modeActive
        active={false}
        ownerKey={owner}
        loader={loader}
        region={region}
      />,
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('retains pending data after a failed import and really calls the loader again on retry', async () => {
    const first = pending();
    const second = pending();
    const loader = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const confirm = vi.fn();
    const cancel = vi.fn();
    render(
      <FocusConfirmEntry
        modeActive
        ownerKey={{}}
        loader={loader}
        region={region}
        onConfirm={confirm}
        onCancel={cancel}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('正在加载聚焦确认工具…');
    await act(async () => first.reject(new Error('network failed')));
    expect(screen.getByRole('alert').textContent).toBe('聚焦确认工具加载失败，请重试');
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重新加载聚焦确认工具' }));
    await act(async () => {});
    expect(loader).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    await settle(second);
    expect(screen.getByRole('region', { name: 'loaded bar' }).textContent).toContain(
      JSON.stringify(region),
    );
    fireEvent.click(screen.getByRole('button', { name: '测试确认' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(region).toEqual({ relX: 0.1, relY: 0.2, width: 0.3, height: 0.4 });
  });

  it('allows cancellation during loading without creating a modal or rendering a late pending tool', async () => {
    const request = pending();
    const loader = vi.fn(() => request.promise);
    const owner = {};
    const cancel = vi.fn();
    const page = render(
      <FocusConfirmEntry
        modeActive
        ownerKey={owner}
        loader={loader}
        region={region}
        onCancel={cancel}
      />,
    );
    const originalOverflow = document.body.style.overflow;
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region').parentElement).toBe(document.body);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(cancel).toHaveBeenCalledOnce();
    page.rerender(
      <FocusConfirmEntry modeActive ownerKey={owner} loader={loader} onCancel={cancel} />,
    );
    await settle(request);
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.body.style.overflow).toBe(originalOverflow);
    expect(document.body.hasAttribute('inert')).toBe(false);
  });

  it('isolates opaque A→B→A mode identities and publishes only current callbacks', async () => {
    const request = pending();
    const loader = vi.fn(() => request.promise);
    const firstA = { label: 'A' };
    const b = { label: 'B' };
    const nextA = { label: 'A' };
    const oldConfirm = vi.fn();
    const currentConfirm = vi.fn();
    const page = render(
      <FocusConfirmEntry
        modeActive
        ownerKey={firstA}
        loader={loader}
        region={region}
        onConfirm={oldConfirm}
      />,
    );
    await act(async () => {});
    page.rerender(<FocusConfirmEntry modeActive ownerKey={b} loader={loader} region={region} />);
    page.rerender(
      <FocusConfirmEntry
        modeActive
        ownerKey={nextA}
        loader={loader}
        region={{ ...region, relX: 0.6 }}
        onConfirm={currentConfirm}
      />,
    );
    await settle(request);
    const bar = screen.getByRole('region', { name: 'loaded bar' });
    expect(bar.textContent).toContain('"relX":0.6');
    fireEvent.click(screen.getByRole('button', { name: '测试确认' }));
    expect(currentConfirm).toHaveBeenCalledOnce();
    expect(oldConfirm).not.toHaveBeenCalled();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('does not publish after exit or unmount, and a new mode can reuse code without old UI', async () => {
    const request = pending();
    const loader = vi.fn(() => request.promise);
    const owner = {};
    const page = render(
      <FocusConfirmEntry modeActive ownerKey={owner} loader={loader} region={region} />,
    );
    await act(async () => {});
    page.rerender(<FocusConfirmEntry ownerKey={owner} loader={loader} region={region} />);
    await settle(request);
    expect(screen.queryByRole('region')).toBeNull();
    page.unmount();
    render(<FocusConfirmEntry modeActive ownerKey={{}} loader={loader} region={region} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'loaded bar' })).toBeTruthy());
    expect(loader).toHaveBeenCalledOnce();
  });

  it('ignores a rejection after unmount and lets a new owner load again without cached failure', async () => {
    const request = pending();
    const loader = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValueOnce(module);
    const page = render(
      <FocusConfirmEntry modeActive ownerKey={{}} loader={loader} region={region} />,
    );
    await act(async () => {});
    page.unmount();
    await act(async () => request.reject(new Error('late failure')));
    expect(screen.queryByRole('alert')).toBeNull();
    render(<FocusConfirmEntry modeActive ownerKey={{}} loader={loader} region={region} />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'loaded bar' })).toBeTruthy());
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('deduplicates StrictMode preloading and hides old failure immediately on owner or loader change', async () => {
    const failure = pending();
    const firstLoader = vi.fn(() => failure.promise);
    const nextRequest = pending();
    const nextLoader = vi.fn(() => nextRequest.promise);
    const owner = {};
    const page = render(
      <StrictMode>
        <FocusConfirmEntry modeActive ownerKey={owner} loader={firstLoader} region={region} />
      </StrictMode>,
    );
    await act(async () => failure.reject(new Error('unavailable')));
    expect(firstLoader).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toBeTruthy();
    page.rerender(
      <FocusConfirmEntry modeActive ownerKey={{}} loader={nextLoader} region={region} />,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
    await settle(nextRequest);
    expect(nextLoader).toHaveBeenCalledOnce();
  });

  it('treats a missing component as a failed module and preserves retry and disabled cancellation', async () => {
    const loader = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce(module);
    render(
      <FocusConfirmEntry
        modeActive
        ownerKey={{}}
        loader={loader}
        region={region}
        disabled
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('button', { name: '取消' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '重新加载聚焦确认工具' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '重新加载聚焦确认工具' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'loaded bar' })).toBeTruthy());
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('isolates pointer and native Space activation but leaves Escape to the existing mode owner', async () => {
    const user = userEvent.setup();
    const request = pending();
    const loader = vi.fn(() => request.promise);
    const cancel = vi.fn();
    const pointer = vi.fn();
    const keydown = vi.fn();
    render(
      <div onPointerDown={pointer} onKeyDown={keydown}>
        <FocusConfirmEntry
          modeActive
          ownerKey={{}}
          loader={loader}
          region={region}
          onCancel={cancel}
        />
      </div>,
    );
    const button = screen.getByRole('button', { name: '取消' });
    fireEvent.pointerDown(button, { button: 0 });
    expect(pointer).not.toHaveBeenCalled();
    button.focus();
    await user.keyboard(' ');
    expect(cancel).toHaveBeenCalledOnce();
    expect(keydown).not.toHaveBeenCalled();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(keydown).toHaveBeenCalledOnce();
  });

  it('loads the actual default module and forwards source confirmation, save retry, ratios and positioning', async () => {
    const surface = document.createElement('div');
    surface.getBoundingClientRect = () => ({
      left: 20,
      top: 40,
      width: 200,
      height: 100,
      bottom: 140,
    });
    document.body.append(surface);
    const ratio = vi.fn();
    const confirm = vi.fn();
    const cancel = vi.fn();
    const retrySave = vi.fn();
    const page = render(
      <FocusConfirmEntry
        modeActive
        ownerKey={{}}
        surfaceElement={surface}
        region={region}
        selectedRatio="4:3"
        onRatioChange={ratio}
        onConfirm={confirm}
        onCancel={cancel}
        error="保存失败"
        onRetrySave={retrySave}
      />,
    );
    const bar = await screen.findByRole('region', { name: '确认聚焦区域' });
    expect(bar.parentElement).toBe(document.body);
    expect(bar.style.left).toBe('120px');
    expect(bar.style.top).toBe('148px');
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16', '取消', '确认', '重试保存']);
    expect(within(bar).getByRole('button', { name: '4:3' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(within(bar).getByRole('button', { name: '1:1' }));
    fireEvent.click(within(bar).getByRole('button', { name: '确认' }));
    fireEvent.click(within(bar).getByRole('button', { name: '取消' }));
    fireEvent.click(within(bar).getByRole('button', { name: '重试保存' }));
    expect(ratio).toHaveBeenCalledExactlyOnceWith('1:1');
    expect(confirm).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(retrySave).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
    page.unmount();
    surface.remove();
  });
});
