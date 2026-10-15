import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SkillPage from './SkillPage.jsx';
import { agentContentFromJSON } from '../../services/agent-content.js';

vi.mock('../../hooks/useContent.ts', () => ({
  useContent: () => ({ data: { items: [] }, loading: false, error: null }),
}));
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
const source = (item) => ({
  list: vi.fn(async () => ({ items: [item], hasMore: false, nextCursor: null, total: 1 })),
});
async function openPicker() {
  fireEvent.click(screen.getByTitle('添加附件'));
  fireEvent.click(screen.getByRole('button', { name: '从资产库添加' }));
  return screen.findByRole('dialog', { name: '从资产库添加' });
}
async function composer() {
  const input = screen.getByRole('textbox', {
    name: '请输入你的创作灵感，或从下方挑选一个 Skill 开始',
  });
  await waitFor(() => expect(input.editor).toBeTruthy());
  act(() => {
    input.editor.commands.insertContent('前后');
    input.editor.commands.setTextSelection(2);
  });
  return input;
}
describe('Skill consumes the shared asset protocol', () => {
  it('inserts literal standalone text at the retained caret and restores focus after modal cleanup', async () => {
    render(
      <SkillPage
        user={{ uuid: 'fixture' }}
        assetSource={source({ id: 'text', name: '文本资产', type: 'text', content: '<b>原样</b>' })}
        navigate={vi.fn()}
      />,
    );
    const input = await composer();
    const dialog = await openPicker();
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: '选择 文本资产' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '添加 (1)' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(agentContentFromJSON(input.editor.getJSON())).toEqual([
      { type: 'text', text: '前<b>原样</b>后' },
    ]);
    expect(input.querySelector('b')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });
  it('retains selection and original content when one v2 collection exceeds the batch limit', async () => {
    const toast = vi.fn();
    render(
      <SkillPage
        user={{ uuid: 'fixture' }}
        assetSource={source({
          id: 'large',
          name: '超限资产',
          type: 'image',
          url: '/one.png',
          assetData: JSON.stringify({
            version: 2,
            items: [
              { data: { type: 'image', url: Array.from({ length: 21 }, (_, i) => `/${i}.png`) } },
            ],
          }),
        })}
        navigate={vi.fn()}
        toast={toast}
      />,
    );
    const input = await composer();
    const dialog = await openPicker();
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: '选择 超限资产' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '添加 (1)' }));
    expect(toast).toHaveBeenCalledWith('单次最多各选 20 个图片 / 视频 / 音频');
    expect(agentContentFromJSON(input.editor.getJSON())).toEqual([{ type: 'text', text: '前后' }]);
    expect(within(dialog).getByRole('checkbox', { name: '选择 超限资产' }).checked).toBe(true);
  });
});
