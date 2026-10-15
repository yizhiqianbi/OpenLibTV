import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetUploadDialog } from './AssetLibraryDialogs.jsx';
import { emptyAssetLibrary } from '../../../services/asset-library/model.ts';

let readers;
class Reader {
  constructor() {
    readers.push(this);
  }
  abort = vi.fn();
  readAsDataURL = vi.fn();
  complete() {
    this.result = 'data:image/png;base64,AA==';
    this.onload();
  }
}
beforeEach(() => {
  readers = [];
  vi.stubGlobal('FileReader', Reader);
});
afterEach(() => vi.unstubAllGlobals());
function setup(options = {}) {
  const props = {
    library: emptyAssetLibrary,
    currentFolder: null,
    onClose: vi.fn(),
    onSave: vi.fn(() => true),
    onCreateFolder: vi.fn(),
    ...options,
  };
  const view = render(<AssetUploadDialog {...props} />);
  const upload = (files) =>
    fireEvent.change(screen.getByLabelText('上传素材文件'), { target: { files } });
  return { props, view, upload };
}
it('opens an empty upload dialog without throwing and enables save only after reading', () => {
  const { props, upload } = setup();
  expect(screen.getByRole('button', { name: '保存', exact: true }).disabled).toBe(true);
  upload([new File(['x'], 'a.png', { type: 'image/png' })]);
  act(() => readers[0].complete());
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(props.onSave.mock.calls[0][0][0]).toMatchObject({
    name: 'a',
    type: 'image',
    status: 'ready',
  });
  expect(props.onClose).toHaveBeenCalledOnce();
});
it('keeps ready files and user input after persistence fails', () => {
  const { props, upload } = setup({ onSave: vi.fn(() => false) });
  upload([new File(['x'], 'a.png', { type: 'image/png' })]);
  act(() => readers[0].complete());
  fireEvent.change(screen.getByLabelText('资产名称'), { target: { value: '保留输入' } });
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('资产名称').value).toBe('保留输入');
  expect(screen.getByText('已读取')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('仍保留');
});
it('preserves failed files after saving only the successful queue without duplicate saves', () => {
  const { props, upload } = setup();
  upload([new File(['x'], 'good.png', { type: 'image/png' }), new File(['x'], 'bad.glb')]);
  act(() => readers[0].complete());
  fireEvent.click(screen.getByRole('button', { name: '保存', exact: true }));
  expect(props.onSave.mock.calls[0][0]).toHaveLength(1);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(screen.queryByText('good.png')).toBeNull();
  expect(screen.getByText('bad.glb')).toBeTruthy();
  expect(screen.getByRole('button', { name: '重试', exact: true })).toBeTruthy();
  expect(screen.getByRole('button', { name: '保存', exact: true }).disabled).toBe(true);
});
it('does not reuse an edited name after replacing a file', () => {
  const { upload } = setup();
  upload([new File(['x'], 'first.png', { type: 'image/png' })]);
  fireEvent.change(screen.getByLabelText('资产名称'), { target: { value: '手改旧名称' } });
  fireEvent.click(screen.getByRole('button', { name: '移除 first.png' }));
  upload([new File(['x'], 'second.png', { type: 'image/png' })]);
  expect(screen.getByLabelText('资产名称').value).toBe('second');
});
