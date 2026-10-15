import { StrictMode, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRoleLibrarySource,
  unavailableRoleLibrarySource,
} from '../../../../services/canvas-role-library.ts';
import RoleLibraryDialog from './RoleLibraryDialog.jsx';
import { RoleMediaPreview } from './RoleLibraryChrome.jsx';
import { DeleteRoleAsset } from './ComplianceAssetLibrary.jsx';
import { useCanvasPointer } from '../../hooks/useCanvasPointer.js';

const context = {
  seedanceTabVisible: false,
  imageSelectableCount: 4,
  videoSelectableCount: 2,
  audioSelectableCount: 1,
};
const now = () => Date.now();
const character = (
  id,
  materials = [
    { url: '/a.jpg', label: '第一张' },
    { url: '/b.jpg', label: '第二张' },
  ],
) => ({
  characterUuid: id,
  name: `角色${id}`,
  coverUrl: `/cover-${id}.jpg`,
  subtitle: '目录说明',
  mediaBlocks: [{ blockName: '造型', items: materials }],
});
const assetRecord = (index, assetType = 'image', overrides = {}) => ({
  uuid: `asset-${index}`,
  assetId: `id-${index}`,
  assetUrl: `/asset-${index}.jpg`,
  assetType,
  status: 1,
  complianceCheckedAtMs: now(),
  ...overrides,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function operator(overrides = {}) {
  const item = character('A');
  const adapter = {
    listCharacters: vi.fn(async () => ({ list: [item], total: 1 })),
    getCharacterDetail: vi.fn(async () => item),
    ...overrides,
  };
  return { adapter, source: createRoleLibrarySource(adapter) };
}
function Harness({
  source = unavailableRoleLibrarySource,
  suppliedContext = context,
  confirm = async () => true,
  notice,
  ownerKey,
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>打开角色库</button>
      {open && (
        <RoleLibraryDialog
          source={source}
          context={suppliedContext}
          onConfirm={confirm}
          onNotice={notice}
          ownerKey={ownerKey}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
const noop = () => {};
function PortalAncestorHarness({ kind = 'library', ancestor, closed, removed, capture = false }) {
  const [selected, setSelected] = useState(true);
  const [opened, setOpened] = useState(false);
  const board = useRef(null);
  const space = useRef(false);
  const viewRef = useRef({ x: 0, y: 0, z: 1 });
  const pointer = useCanvasPointer({
    storageKey: 'role-portal-capture-fixture',
    readonly: false,
    documentReady: true,
    touchMode: false,
    tool: 'select',
    board,
    space,
    viewRef,
    nodes: [],
    edges: [],
    selected: selected ? ['video-target'] : [],
    setSelected: (ids) => {
      if (!ids.length) {
        ancestor('capture-selection');
        setSelected(false);
        setOpened(false);
      }
    },
    setSelectionRect: noop,
    setLinking: noop,
    setMenu: noop,
    setContext: noop,
    point: (event) => ({ x: event.clientX, y: event.clientY }),
  });
  const close = () => {
    closed?.();
    setOpened(false);
  };
  const leak = (event) => {
    ancestor(event.type);
    setSelected(false);
    setOpened(false);
  };
  return (
    <div
      ref={board}
      data-testid="portal-node-owner"
      data-selected={String(selected)}
      onPointerDownCapture={capture ? pointer.begin : undefined}
      onClick={leak}
      onPointerDown={leak}
      onMouseDown={leak}
      onDoubleClick={leak}
    >
      <button
        onClick={(event) => {
          event.stopPropagation();
          setOpened(true);
        }}
      >
        打开祖先下的弹窗
      </button>
      {selected && <div data-testid="portal-inline-generator">保持当前生成器</div>}
      {opened &&
        (kind === 'library' ? (
          <RoleLibraryDialog context={context} onConfirm={async () => true} onClose={close} />
        ) : kind === 'preview' ? (
          <RoleMediaPreview item={{ url: '/a.jpg', name: '独立图片预览' }} onClose={close} />
        ) : (
          <DeleteRoleAsset
            item={assetRecord('one')}
            pending={false}
            error={null}
            unavailable={false}
            onClose={close}
            onDelete={removed}
          />
        ))}
    </div>
  );
}
const openAncestorPortal = () => {
  const trigger = screen.getByRole('button', { name: '打开祖先下的弹窗' });
  trigger.focus();
  fireEvent.click(trigger);
};
const expectAncestorUntouched = (ancestor) => {
  expect(ancestor).not.toHaveBeenCalled();
  expect(screen.getByTestId('portal-node-owner').getAttribute('data-selected')).toBe('true');
  expect(screen.getByTestId('portal-inline-generator')).toBeTruthy();
};
const nativePointerDown = (target) => {
  const event = new MouseEvent('pointerdown', {
    button: 0,
    buttons: 1,
    clientX: 20,
    clientY: 100,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperties(event, {
    pointerId: { value: 37 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  fireEvent(target, event);
};
const open = () => {
  const trigger = screen.getByRole('button', { name: '打开角色库' });
  trigger.focus();
  fireEvent.click(trigger);
};
const publicTab = () => fireEvent.click(screen.getByRole('tab', { name: '公共角色库' }));
const detail = async (name = '角色A') => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
  await screen.findByRole('button', { name: '选择第一张' });
};
const choose = (name = '第一张') =>
  fireEvent.click(screen.getByRole('button', { name: `选择${name}` }));
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('actual role-library views with an injected operator source', () => {
  it.each([
    ['library', '角色库'],
    ['preview', '素材预览'],
    ['delete', '确实删除？'],
  ])(
    'isolates the %s mask before the actual canvas pointer capture can clear its owner',
    async (kind, name) => {
      const ancestor = vi.fn(),
        closed = vi.fn();
      render(
        <PortalAncestorHarness
          kind={kind}
          ancestor={ancestor}
          closed={closed}
          removed={vi.fn()}
          capture
        />,
      );
      openAncestorPortal();
      if (kind === 'library') await screen.findByRole('alert');
      const dialog = screen.getByRole('dialog', { name }),
        mask = dialog.parentElement;
      nativePointerDown(mask);
      expect(screen.getByRole('dialog', { name })).toBe(dialog);
      expectAncestorUntouched(ancestor);
      expect(closed).not.toHaveBeenCalled();
      fireEvent.mouseDown(mask, { button: 0, clientX: 20, clientY: 100 });
      fireEvent.click(mask, { detail: 1, clientX: 20, clientY: 100 });
      expectAncestorUntouched(ancestor);
      if (kind === 'preview') {
        expect(screen.queryByRole('dialog', { name })).toBeNull();
        expect(closed).toHaveBeenCalledOnce();
      } else {
        expect(screen.getByRole('dialog', { name })).toBe(dialog);
        expect(closed).not.toHaveBeenCalled();
        fireEvent.click(
          within(dialog).getByRole('button', { name: kind === 'library' ? '关闭角色库' : '取消' }),
        );
      }
      // Positive control: the same native press on the actual board must still begin selection.
      nativePointerDown(screen.getByTestId('portal-node-owner'));
      expect(ancestor).toHaveBeenCalledWith('capture-selection');
      expect(screen.getByTestId('portal-node-owner').getAttribute('data-selected')).toBe('false');
      expect(screen.queryByTestId('portal-inline-generator')).toBeNull();
    },
  );

  it('keeps source library mask and content clicks inside its React portal instead of deselecting the ancestor node', async () => {
    const ancestor = vi.fn(),
      closed = vi.fn();
    render(<PortalAncestorHarness ancestor={ancestor} closed={closed} />);
    openAncestorPortal();
    await screen.findByRole('alert');
    const dialog = screen.getByRole('dialog', { name: '角色库' }),
      mask = dialog.parentElement;
    fireEvent.pointerDown(mask, { button: 0, clientX: 20, clientY: 100 });
    fireEvent.mouseDown(mask, { button: 0, clientX: 20, clientY: 100 });
    fireEvent.click(mask, { detail: 1, clientX: 20, clientY: 100 });
    fireEvent.doubleClick(mask, { detail: 2 });
    expect(screen.getByRole('dialog', { name: '角色库' })).toBe(dialog);
    expect(closed).not.toHaveBeenCalled();
    expectAncestorUntouched(ancestor);
    fireEvent.click(within(dialog).getByRole('button', { name: '重试' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('dialog', { name: '角色库' })).toBe(dialog);
    expectAncestorUntouched(ancestor);
    fireEvent.click(screen.getByRole('button', { name: '关闭角色库' }));
    expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
    expect(closed).toHaveBeenCalledOnce();
    expectAncestorUntouched(ancestor);
  });

  it('closes only a standalone preview on its backdrop while keeping image gestures and the ancestor node isolated', () => {
    const ancestor = vi.fn(),
      closed = vi.fn();
    render(<PortalAncestorHarness kind="preview" ancestor={ancestor} closed={closed} />);
    openAncestorPortal();
    const preview = screen.getByRole('dialog', { name: '素材预览' }),
      image = within(preview).getByRole('img');
    fireEvent.pointerDown(image, { button: 0 });
    fireEvent.mouseDown(image, { button: 0 });
    fireEvent.click(image, { detail: 1 });
    fireEvent.doubleClick(image);
    expect(screen.getByRole('dialog', { name: '素材预览' })).toBe(preview);
    expect(closed).not.toHaveBeenCalled();
    expectAncestorUntouched(ancestor);
    fireEvent.click(preview.parentElement, { detail: 1 });
    expect(screen.queryByRole('dialog', { name: '素材预览' })).toBeNull();
    expect(closed).toHaveBeenCalledOnce();
    expectAncestorUntouched(ancestor);
  });

  it('keeps a standalone deletion mask and confirm callbacks inside their own portal without closing the owner', () => {
    const ancestor = vi.fn(),
      closed = vi.fn(),
      removed = vi.fn();
    render(
      <PortalAncestorHarness kind="delete" ancestor={ancestor} closed={closed} removed={removed} />,
    );
    openAncestorPortal();
    const confirmation = screen.getByRole('dialog', { name: '确实删除？' }),
      mask = confirmation.parentElement;
    fireEvent.pointerDown(mask, { button: 0 });
    fireEvent.mouseDown(mask, { button: 0 });
    fireEvent.click(mask, { detail: 1 });
    fireEvent.doubleClick(mask);
    expect(screen.getByRole('dialog', { name: '确实删除？' })).toBe(confirmation);
    expect(closed).not.toHaveBeenCalled();
    expectAncestorUntouched(ancestor);
    fireEvent.click(within(confirmation).getByRole('button', { name: '删除' }));
    expect(removed).toHaveBeenCalledOnce();
    expectAncestorUntouched(ancestor);
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }));
    expect(closed).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: '确实删除？' })).toBeNull();
    expectAncestorUntouched(ancestor);
  });

  it('shows the default unavailable directory and retry without manufacturing an empty or roles', async () => {
    const confirm = vi.fn();
    render(<Harness confirm={confirm} />);
    open();
    expect((await screen.findByRole('alert')).textContent).toContain('公共角色目录服务未连接');
    expect(screen.queryByText('暂无数据')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Seedance/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('公共角色目录服务未连接'),
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it('preserves the source tab default and tab memory, with four compliance types even at zero capacity', async () => {
    const library = operator({ listAssets: vi.fn(async () => []) });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true, videoSelectableCount: 0 }}
      />,
    );
    open();
    expect(screen.getByRole('tab', { name: /Seedance/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    for (const label of ['真人人像NEW', '图片', '视频', '音频'])
      expect(screen.getByRole('tab', { name: label })).toBeTruthy();
    publicTab();
    await screen.findByRole('button', { name: /角色A/ });
    fireEvent.click(screen.getByRole('button', { name: '关闭角色库' }));
    open();
    expect(screen.getByRole('tab', { name: '公共角色库' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('requests exact public paging and resets to page one when the page size changes', async () => {
    const library = operator({
      listCharacters: vi.fn(async () => ({ list: [character('A')], total: 60 })),
    });
    render(<Harness source={library.source} />);
    open();
    await screen.findByRole('button', { name: /角色A/ });
    expect(library.adapter.listCharacters.mock.calls[0][0]).toEqual({
      page: 1,
      pageSize: 10,
      orderBy: 'updated_at_desc',
    });
    fireEvent.click(screen.getByRole('button', { name: '第2页' }));
    await waitFor(() =>
      expect(library.adapter.listCharacters).toHaveBeenCalledWith(
        { page: 2, pageSize: 10, orderBy: 'updated_at_desc' },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    fireEvent.change(screen.getByLabelText('每页素材数量'), { target: { value: '50' } });
    await waitFor(() =>
      expect(library.adapter.listCharacters).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 50, orderBy: 'updated_at_desc' },
        expect.anything(),
      ),
    );
  });

  it('deduplicates real detail URLs and limits keyboard selection without inserting preview thumbnails', async () => {
    const item = character('A', [
      { url: '/a.jpg', thumbUrl: '/thumb-a.jpg', label: '第一张' },
      { url: '/a.jpg', label: '重复' },
      { url: '/b.jpg', label: '第二张' },
    ]);
    const library = operator({ getCharacterDetail: async () => item });
    const confirm = vi.fn(async () => false);
    render(
      <Harness
        source={library.source}
        suppliedContext={{
          ...context,
          imageSelectableCount: 2,
          existingImageUris: ['/existing.jpg'],
        }}
        confirm={confirm}
      />,
    );
    open();
    await detail();
    expect(screen.queryByRole('button', { name: '选择重复' })).toBeNull();
    choose();
    expect(screen.getByRole('button', { name: '选择第二张' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '选择第二张' }), { key: 'Enter' });
    expect(screen.getByText('已选择 1 项')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: '选择第一张' }), { key: ' ' });
    fireEvent.keyDown(screen.getByRole('button', { name: '选择第二张' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith({
        images: ['/existing.jpg', '/b.jpg'],
        videos: [],
        audios: [],
        assets: [],
      }),
    );
  });

  it('keeps a rejected document commit selected and closes only after a successful retry', async () => {
    const library = operator(),
      confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<Harness source={library.source} confirm={confirm} />);
    const previousOverflow = document.body.style.overflow;
    const opener = screen.getByRole('button', { name: '打开角色库' });
    open();
    await detail();
    choose();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect((await screen.findByRole('alert')).textContent).toContain('已保留选择');
    expect(screen.getByRole('button', { name: '选择第一张' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
      expect(document.activeElement).toBe(opener);
      expect(document.body.style.overflow).toBe(previousOverflow);
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[0][0]).toEqual({
      images: ['/a.jpg'],
      videos: [],
      audios: [],
      assets: [],
    });
    expect(confirm.mock.calls[1][0]).toBe(confirm.mock.calls[0][0]);
  });

  it('uses cached nonexpired certificates without invoking a missing writer', async () => {
    const item = character('A', [
      { url: '/a.jpg', label: '第一张', assetId: 'approved', complianceCheckedAtMs: now() },
    ]);
    const library = operator({ getCharacterDetail: async () => item }),
      confirm = vi.fn(async () => false);
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
      />,
    );
    open();
    publicTab();
    await detail();
    choose();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          images: ['asset://approved'],
          assets: [expect.objectContaining({ assetId: 'approved', assetUrl: '/a.jpg', status: 1 })],
        }),
      ),
    );
  });

  it('keeps selection when certification is unavailable and does not fabricate a token or callback', async () => {
    const library = operator(),
      confirm = vi.fn();
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
      />,
    );
    open();
    publicTab();
    await detail();
    choose();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect((await screen.findByRole('alert')).textContent).toContain('素材合规校验服务未连接');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '选择第一张' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('preserves the accepted subset and true resolver records while publishing partial failures to its caller', async () => {
    const approved = assetRecord('a', 'image', { assetUrl: '/a.jpg', assetId: 'approved-a' });
    const library = operator({
      certifyImages: vi.fn(async () => ({
        images: ['asset://approved-a'],
        assets: [approved],
        partial: true,
      })),
    });
    const confirm = vi.fn(async () => true),
      notice = vi.fn();
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
        notice={notice}
      />,
    );
    open();
    publicTab();
    await detail();
    choose();
    choose('第二张');
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith({
        images: ['asset://approved-a'],
        videos: [],
        audios: [],
        assets: [approved],
      }),
    );
    expect(notice).toHaveBeenCalledOnce();
    expect(notice.mock.calls[0][0]).toContain('未通过Seedance');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
  });

  it('handles preview arrows and Escape before the library, restores its trigger, and never selects through preview key events', async () => {
    const library = operator();
    render(
      <StrictMode>
        <Harness source={library.source} />
      </StrictMode>,
    );
    open();
    await detail();
    const first = screen.getAllByRole('button', { name: '预览详情' })[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(screen.queryByText(/已选择/)).toBeNull();
    fireEvent.click(first);
    const preview = screen.getByRole('dialog', { name: '素材预览' });
    expect(within(preview).getByRole('img').getAttribute('src')).toBe('/a.jpg');
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(
      within(screen.getByRole('dialog', { name: '素材预览' }))
        .getByRole('img')
        .getAttribute('src'),
    ).toBe('/b.jpg');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '素材预览' })).toBeNull();
    expect(screen.getByRole('dialog', { name: '角色库' })).toBeTruthy();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '打开角色库' }));
  });

  it('aborts a closed detail and prevents its late result from taking over a reopened library', async () => {
    const pending = deferred(),
      library = operator({ getCharacterDetail: vi.fn(() => pending.promise) });
    render(<Harness source={library.source} />);
    open();
    await detail();
    const signal = library.adapter.getCharacterDetail.mock.calls[0][1].signal;
    fireEvent.click(screen.getByRole('button', { name: '关闭角色库' }));
    expect(signal.aborted).toBe(true);
    open();
    await act(async () =>
      pending.resolve(character('A', [{ url: '/late.jpg', label: '迟到结果' }])),
    );
    await screen.findByRole('button', { name: /角色A/ });
    expect(screen.queryByRole('button', { name: '选择迟到结果' })).toBeNull();
  });

  it('replaces a source owner without leaking a late directory, selection or callback', async () => {
    const pending = deferred(),
      a = operator({ listCharacters: vi.fn(() => pending.promise) }),
      b = operator({
        listCharacters: async () => ({ list: [character('B')], total: 1 }),
        getCharacterDetail: async () => character('B'),
      });
    const confirm = vi.fn();
    const page = render(
      <Harness source={a.source} confirm={confirm} ownerKey={{ document: 'A' }} />,
    );
    open();
    await waitFor(() => expect(a.adapter.listCharacters).toHaveBeenCalled());
    const signal = a.adapter.listCharacters.mock.calls[0][1].signal;
    page.rerender(<Harness source={b.source} confirm={confirm} ownerKey={{ document: 'B' }} />);
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ list: [character('A')], total: 1 }));
    await screen.findByRole('button', { name: /角色B/ });
    expect(screen.queryByRole('button', { name: /角色A/ })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('cancels certification before close and cannot write or close a replacement owner', async () => {
    const pending = deferred(),
      library = operator({ certifyImages: vi.fn(() => pending.promise) }),
      confirm = vi.fn();
    const page = render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
        ownerKey={{ document: 'A' }}
      />,
    );
    open();
    publicTab();
    await detail();
    choose();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(library.adapter.certifyImages).toHaveBeenCalled());
    const signal = library.adapter.certifyImages.mock.calls[0][1].signal;
    page.rerender(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
        ownerKey={{ document: 'B' }}
      />,
    );
    expect(signal.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ images: ['asset://late'], assets: [assetRecord('late')] }),
    );
    await screen.findByRole('button', { name: /角色A/ });
    expect(screen.getByRole('dialog', { name: '角色库' })).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps three media selections across local pages and confirms canonical URIs without portrait records', async () => {
    const records = [
      ...Array.from({ length: 16 }, (_, index) => assetRecord(index)),
      assetRecord('video', 'video'),
      assetRecord('audio', 'audio'),
    ];
    const library = operator({ listAssets: async () => records }),
      confirm = vi.fn(async () => false);
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true, imageSelectableCount: 2 }}
        confirm={confirm}
      />,
    );
    open();
    fireEvent.click(await screen.findByRole('button', { name: '选择asset-0' }));
    fireEvent.click(screen.getByRole('button', { name: '第2页' }));
    choose('asset-15');
    fireEvent.click(screen.getByRole('tab', { name: '视频' }));
    choose('asset-video');
    fireEvent.click(screen.getByRole('tab', { name: '音频' }));
    choose('asset-audio');
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          images: ['asset://id-0', 'asset://id-15'],
          videos: ['asset://id-video'],
          audios: ['asset://id-audio'],
          assets: expect.arrayContaining([records[0], records[15], records[16], records[17]]),
        }),
      ),
    );
  });

  it('keeps pending, rejected and expired assets unselectable, while missing portrait/history/upload writers remain explicit', async () => {
    const records = [
      assetRecord('pending', 'image', { status: 0 }),
      assetRecord('rejected', 'image', { status: 2, errorMessage: '未通过同人校验' }),
      assetRecord('expired', 'image', { complianceCheckedAtMs: now() - 5_184_000_000 }),
    ];
    const library = operator({ listAssets: async () => records }),
      confirm = vi.fn();
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
      />,
    );
    open();
    await screen.findByRole('button', { name: '选择asset-pending' });
    for (const item of records)
      expect(
        screen.getByRole('button', { name: `选择${item.uuid}` }).getAttribute('aria-disabled'),
      ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '本地上传' }));
    expect(screen.getByRole('alert').textContent).toContain('素材上传服务未连接');
    fireEvent.click(screen.getByRole('button', { name: '历史资产选择' }));
    expect(screen.getByRole('alert').textContent).toContain('历史资产选择服务未连接');
    fireEvent.click(screen.getByRole('tab', { name: '真人人像NEW' }));
    expect(screen.getByRole('button', { name: '录入新的真人' })).toBeTruthy();
    expect(screen.getByText('真人资产授权与录入服务未连接')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /二维码/ })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps failed deletion in the child dialog and only retries its writer after confirmation', async () => {
    let records = [assetRecord('one')];
    const remove = vi
      .fn()
      .mockRejectedValueOnce(new Error('删除失败，请重试'))
      .mockImplementationOnce(async () => {
        records = [];
      });
    const library = operator({ listAssets: async () => records, removeAsset: remove });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    fireEvent.click(await screen.findByRole('button', { name: '删除asset-one' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '确实删除？' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('删除失败，请重试');
    expect(screen.getByRole('dialog', { name: '确实删除？' })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: '确实删除？' })).getByRole('button', {
        name: '删除',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '确实删除？' })).toBeNull());
    await waitFor(() => expect(screen.queryByRole('button', { name: '选择asset-one' })).toBeNull());
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('dismisses a delete confirmation before the library and returns to its own trigger', async () => {
    const library = operator({ listAssets: async () => [assetRecord('one')] });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    const button = await screen.findByRole('button', { name: '删除asset-one' });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: '确实删除？' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '确实删除？' })).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole('dialog', { name: '角色库' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull();
  });

  it('preflights real file metadata before invoking an explicit upload adapter and refreshing its directory', async () => {
    const images = [],
      OriginalURL = URL;
    const release = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL() {
          return 'blob:owned-role';
        }
        static revokeObjectURL = release;
      },
    );
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          const element = document.createElement('img');
          images.push(element);
          return element;
        }
      },
    );
    let records = [];
    const upload = vi.fn(async () => {
      const record = assetRecord('uploaded');
      records = [record];
      return record;
    });
    const library = operator({ listAssets: async () => records, uploadAsset: upload });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    await waitFor(() => expect(screen.getByRole('button', { name: '确定' }).disabled).toBe(false));
    const file = new File(['fixture bytes'], 'valid.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('上传合规素材'), { target: { files: [file] } });
    expect(upload).not.toHaveBeenCalled();
    Object.defineProperties(images[0], {
      naturalWidth: { value: 640 },
      naturalHeight: { value: 480 },
    });
    await act(async () => images[0].onload());
    await screen.findByRole('button', { name: '选择asset-uploaded' });
    expect(upload).toHaveBeenCalledWith(
      file,
      'image',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it('cancels an unread file owner and cannot upload its late decoding into a reopened library', async () => {
    const images = [],
      OriginalURL = URL,
      release = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL() {
          return 'blob:cancelled-role';
        }
        static revokeObjectURL = release;
      },
    );
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          const element = document.createElement('img');
          images.push(element);
          return element;
        }
      },
    );
    const upload = vi.fn(async () => assetRecord('late')),
      library = operator({ listAssets: async () => [], uploadAsset: upload });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    await waitFor(() => expect(screen.getByRole('button', { name: '确定' }).disabled).toBe(false));
    fireEvent.change(screen.getByLabelText('上传合规素材'), {
      target: { files: [new File(['bytes'], 'a.png', { type: 'image/png' })] },
    });
    const late = images[0].onload;
    fireEvent.click(screen.getByRole('button', { name: '关闭角色库' }));
    expect(release).toHaveBeenCalledExactlyOnceWith('blob:cancelled-role');
    open();
    await act(async () => late());
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '选择asset-late' })).toBeNull();
  });

  it('rejects a file above the source size boundary before allocating a browser reader or adapter request', async () => {
    const makeUrl = vi.fn(),
      OriginalURL = URL;
    vi.stubGlobal(
      'URL',
      class extends OriginalURL {
        static createObjectURL = makeUrl;
      },
    );
    const upload = vi.fn(),
      library = operator({ listAssets: async () => [], uploadAsset: upload });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    await waitFor(() => expect(screen.getByRole('button', { name: '确定' }).disabled).toBe(false));
    const file = new File(['small fixture'], 'oversized.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 30 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByLabelText('上传合规素材'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('图片大小不能超过 30MB');
    expect(makeUrl).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('forwards force for an expired public certificate and preserves its selected URL when all results fail', async () => {
    const item = character('A', [
      {
        url: '/a.jpg',
        label: '第一张',
        assetId: 'expired',
        complianceCheckedAtMs: now() - 5_184_000_000,
      },
    ]);
    const certify = vi.fn(async () => ({ images: [], assets: [] }));
    const library = operator({ getCharacterDetail: async () => item, certifyImages: certify }),
      confirm = vi.fn();
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
      />,
    );
    open();
    publicTab();
    await detail();
    choose();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() =>
      expect(certify).toHaveBeenCalledWith(
        [expect.objectContaining({ url: '/a.jpg', assetId: 'expired', force: true })],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: '选择第一张' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it('rechecks an expired image through a real adapter result and removes the superseded record only after success', async () => {
    const expired = assetRecord('expired', 'image', {
        complianceCheckedAtMs: now() - 5_184_000_000,
      }),
      replacement = assetRecord('replacement', 'image', { assetUrl: expired.assetUrl });
    let records = [expired];
    const certify = vi.fn(async () => {
      records = [expired, replacement];
      return { images: [`asset://${replacement.assetId}`], assets: [replacement] };
    });
    const remove = vi.fn(async () => {
      records = [replacement];
    });
    const library = operator({
      listAssets: async () => records,
      certifyImages: certify,
      removeAsset: remove,
    });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    fireEvent.click(await screen.findByRole('button', { name: '重新核验' }));
    await screen.findByRole('button', { name: '选择asset-replacement' });
    expect(certify).toHaveBeenCalledWith(
      [expect.objectContaining({ url: expired.assetUrl, assetId: expired.assetId, force: true })],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      expired.uuid,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByRole('button', { name: '选择asset-expired' })).toBeNull();
  });

  it('retains a rejected recheck and never removes its original record', async () => {
    const expired = assetRecord('expired', 'image', {
        complianceCheckedAtMs: now() - 5_184_000_000,
      }),
      remove = vi.fn();
    const library = operator({
      listAssets: async () => [expired],
      certifyImages: async () => ({ images: [], assets: [] }),
      removeAsset: remove,
    });
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
      />,
    );
    open();
    fireEvent.click(await screen.findByRole('button', { name: '重新核验' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('已保留原素材');
    expect(screen.getByRole('button', { name: '选择asset-expired' })).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
  });

  it('retries the exact accepted canonical payload after quota failure even when the committed context has changed', async () => {
    const approved = assetRecord('quota', 'image', { assetUrl: '/a.jpg' });
    const certify = vi.fn(async () => ({
      images: [`asset://${approved.assetId}`],
      assets: [approved],
    }));
    const library = operator({ certifyImages: certify }),
      attempts = vi.fn();
    function QuotaHarness() {
      const [current, setCurrent] = useState({
        ...context,
        seedanceTabVisible: true,
        existingImageUris: ['/old.jpg'],
      });
      const confirm = async (selection) => {
        attempts(selection);
        if (attempts.mock.calls.length === 1) {
          setCurrent((previous) => ({
            ...previous,
            existingImageUris: ['/old.jpg', `asset://${approved.assetId}`],
          }));
          throw new Error('浏览器存储空间不足');
        }
        return true;
      };
      return <Harness source={library.source} suppliedContext={current} confirm={confirm} />;
    }
    render(<QuotaHarness />);
    open();
    publicTab();
    await detail();
    choose();
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('浏览器存储空间不足');
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(attempts).toHaveBeenCalledTimes(2));
    expect(certify).toHaveBeenCalledOnce();
    expect(attempts.mock.calls[1][0]).toBe(attempts.mock.calls[0][0]);
    expect(attempts.mock.calls[1][0]).toEqual({
      images: ['/old.jpg', `asset://${approved.assetId}`],
      videos: [],
      audios: [],
      assets: [approved],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '角色库' })).toBeNull());
  });

  it('retires a changed confirmation while keeping genuinely successful partial certificates reusable in its owner', async () => {
    const approved = assetRecord('partial', 'image', { assetUrl: '/a.jpg' });
    const certify = vi.fn(async () => ({
      images: [`asset://${approved.assetId}`],
      assets: [approved],
      partial: true,
    }));
    const library = operator({ certifyImages: certify }),
      confirm = vi.fn(async () => false);
    render(
      <Harness
        source={library.source}
        suppliedContext={{ ...context, seedanceTabVisible: true }}
        confirm={confirm}
      />,
    );
    open();
    publicTab();
    await detail();
    choose();
    choose('第二张');
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    choose('第二张');
    fireEvent.click(screen.getByRole('button', { name: '应用' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(certify).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[1][0]).not.toBe(confirm.mock.calls[0][0]);
    expect(confirm.mock.calls[1][0]).toEqual(confirm.mock.calls[0][0]);
  });
});
