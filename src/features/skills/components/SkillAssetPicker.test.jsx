import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeStoredValue } from '../../../services/storage.ts';
import SkillAssetPicker from './SkillAssetPicker.jsx';

vi.mock('../../../services/api-client.ts', () => ({ serverConnected: false, api: {} }));
beforeEach(() => {
  localStorage.clear();
});
const image = {
  id: 'image',
  name: '参考.png',
  type: 'image',
  mimeType: 'image/png',
  url: 'data:image/png;base64,cmVm',
  createdAt: 1,
};

describe('Skill references from the shared local asset library', () => {
  it('reads legacy assets without rewriting the legacy key', () => {
    writeStoredValue('libtv-assets', [image]);
    const before = localStorage.getItem('libtv-assets');
    const onPick = vi.fn();
    render(<SkillAssetPicker onClose={vi.fn()} onPick={onPick} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 参考.png' }));
    fireEvent.click(screen.getByRole('button', { name: /添加/ }));
    expect(onPick.mock.calls[0][0][0]).toMatchObject({
      name: '参考.png',
      type: 'image',
      source: { type: 'data', value: image.url },
      metadata: { mediaAssetUuid: 'image' },
    });
    expect(localStorage.getItem('libtv-assets')).toBe(before);
  });

  it('subscribes to the atomic library and excludes deleted media while retaining selected items', () => {
    const removed = { ...image, id: 'deleted', name: '已删除.png', deletedAt: 2 };
    writeStoredValue(
      'libtv-asset-library',
      { assets: [image, removed], folders: [], tags: [] },
      { version: 1 },
    );
    render(<SkillAssetPicker onClose={vi.fn()} onPick={vi.fn()} />);
    expect(screen.queryByRole('checkbox', { name: '选择 已删除.png' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 参考.png' }));
    fireEvent.click(screen.getByRole('button', { name: '视频' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    expect(screen.getByRole('checkbox', { name: '选择 参考.png' }).checked).toBe(true);
    act(() =>
      writeStoredValue(
        'libtv-asset-library',
        {
          assets: [image, removed, { ...image, id: 'new', name: '新增.png' }],
          folders: [],
          tags: [],
        },
        { version: 1 },
      ),
    );
    expect(screen.getByRole('checkbox', { name: '选择 新增.png' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '选择 参考.png' }).checked).toBe(true);
  });
});
