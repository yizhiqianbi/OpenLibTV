import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import CanvasAssetSelector from './CanvasAssetSelector.jsx';
import RichAgentInput from '../../../components/agent/RichAgentInput.jsx';

vi.mock('../../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));
beforeEach(() => localStorage.clear());
function Harness({ inputRef, fileInput, toast = vi.fn(), source, readOnly = false }) {
  const [parts, setParts] = useState([{ type: 'text', text: '' }]);
  return (
    <>
      <RichAgentInput ref={inputRef} parts={parts} onChange={setParts} disabled={readOnly} />
      <CanvasAssetSelector
        inputRef={inputRef}
        fileInput={fileInput}
        toast={toast}
        assetSource={source}
        user={{ uuid: 'local' }}
        readOnly={readOnly}
      />
    </>
  );
}
const asset = (id, extra = {}) => ({
  id,
  name: `素材 ${id}`,
  type: 'image',
  mimeType: 'image/png',
  url: `/${id}.png`,
  folderId: null,
  bytes: 1,
  createdAt: '2026-10-11',
  updatedAt: '2026-10-11',
  deletedAt: null,
  ...extra,
});
const source = (items) => ({
  list: vi.fn(async () => ({ items, total: items.length, hasMore: false, nextCursor: null })),
});
async function library() {
  fireEvent.click(screen.getByRole('button', { name: '添加参考素材' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '素材库添加' }));
  return screen.findByRole('dialog', { name: '从资产库添加' });
}
async function ready(ref) {
  await waitFor(() => expect(ref.current?.getEditor()).toBeTruthy());
  return ref.current.getEditor();
}
describe('Canvas attachment toolbar uses the shared asset picker', () => {
  it('restores the stable trigger after library Escape and the editor after a successful pick', async () => {
    const inputRef = createRef();
    render(
      <Harness inputRef={inputRef} fileInput={createRef()} source={source([asset('focus')])} />,
    );
    await ready(inputRef);
    const ui = userEvent.setup();
    const trigger = screen.getByRole('button', { name: '添加参考素材' });
    await ui.click(trigger);
    await ui.click(screen.getByRole('menuitem', { name: '素材库添加' }));
    const first = await screen.findByRole('dialog', { name: '从资产库添加' });
    await ui.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(first.isConnected).toBe(false);
    await ui.click(trigger);
    await ui.click(screen.getByRole('menuitem', { name: '素材库添加' }));
    const second = await screen.findByRole('dialog', { name: '从资产库添加' });
    await ui.click(await within(second).findByRole('checkbox', { name: '选择 素材 focus' }));
    await ui.click(within(second).getByRole('button', { name: '添加 (1)' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
    expect(inputRef.current.getParts()[1].metadata.mediaAssetUuid).toBe('focus');
  });
  it('keeps the menu lifecycle separate from the local file picker and restores Escape focus', async () => {
    const inputRef = createRef(),
      fileInput = { current: { click: vi.fn() } };
    render(<Harness inputRef={inputRef} fileInput={fileInput} source={null} />);
    await ready(inputRef);
    const trigger = screen.getByRole('button', { name: '添加参考素材' });
    fireEvent.click(trigger);
    expect(fileInput.current.click).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: '本地上传' }));
    expect(fileInput.current.click).toHaveBeenCalledOnce();
  });
  it('previews without choosing and inserts selected media at the caret in one batch', async () => {
    const inputRef = createRef(),
      fileInput = { current: { click: vi.fn() } };
    render(
      <Harness
        inputRef={inputRef}
        fileInput={fileInput}
        source={source([
          asset('one'),
          asset('two', { type: 'video', mimeType: 'video/mp4', url: '/two.mp4' }),
        ])}
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('开场结尾'));
    act(() => editor.commands.setTextSelection(3));
    const modal = await library();
    fireEvent.click(await within(modal).findByRole('button', { name: '预览 素材 one' }));
    const preview = screen.getByRole('dialog', { name: '素材 one' });
    expect(preview.querySelector('img').getAttribute('src')).toBe('/one.png');
    fireEvent.keyDown(preview, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '素材 one' })).toBeNull());
    expect(within(modal).getByRole('checkbox', { name: '选择 素材 one' }).checked).toBe(false);
    fireEvent.click(within(modal).getByRole('checkbox', { name: '选择 素材 one' }));
    fireEvent.click(within(modal).getByRole('checkbox', { name: '选择 素材 two' }));
    fireEvent.click(within(modal).getByRole('button', { name: '添加 (2)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const parts = inputRef.current.getParts();
    expect(parts.slice(1).map((part) => [part.type, part.metadata.mediaAssetUuid])).toEqual([
      ['image', 'one'],
      ['video', 'two'],
    ]);
    expect(parts[0].text).toMatch(/^开场\{\{ image:.+\}\} \{\{ video:.+\}\} 结尾$/);
  });
  it('rejects a v2 batch over its per-kind limit atomically and retains selection for correction', async () => {
    const inputRef = createRef(),
      toast = vi.fn();
    const assetData = JSON.stringify({
      version: 2,
      items: [{ data: { type: 'image', url: Array.from({ length: 21 }, (_, i) => `/${i}.png`) } }],
    });
    render(
      <Harness
        inputRef={inputRef}
        fileInput={createRef()}
        toast={toast}
        source={source([asset('oversize', { assetData })])}
      />,
    );
    const editor = await ready(inputRef);
    act(() => editor.commands.insertContent('原始文字'));
    const modal = await library();
    fireEvent.click(await within(modal).findByRole('checkbox', { name: '选择 素材 oversize' }));
    fireEvent.click(within(modal).getByRole('button', { name: '添加 (1)' }));
    expect(toast).toHaveBeenCalledWith('单次最多各选 20 个图片 / 视频 / 音频');
    expect(inputRef.current.getParts()).toEqual([{ type: 'text', text: '原始文字' }]);
    expect(within(modal).getByRole('checkbox').checked).toBe(true);
  });
  it('falls back to literal text for v2 collections with no media and never parses it as HTML', async () => {
    const inputRef = createRef();
    const assetData = JSON.stringify({
      version: 2,
      items: [{ data: { type: 'text', content: ['<b>原样文字</b>', '第二行'] } }],
    });
    render(
      <Harness
        inputRef={inputRef}
        fileInput={createRef()}
        source={source([asset('text', { assetData })])}
      />,
    );
    await ready(inputRef);
    const modal = await library();
    fireEvent.click(await within(modal).findByRole('checkbox', { name: '选择 素材 text' }));
    fireEvent.click(within(modal).getByRole('button', { name: '添加 (1)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(inputRef.current.getParts()).toEqual([
      { type: 'text', text: '<b>原样文字</b>\n第二行' },
    ]);
    expect(screen.getByRole('textbox').querySelector('b')).toBeNull();
  });
});
