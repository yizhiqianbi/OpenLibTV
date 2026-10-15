import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VoiceBar from './VoiceBar.jsx';
import sample from './sample.json';
import { voiceSelectionPatch } from './model.ts';

const voices = Array.from({ length: 23 }, (_, i) => ({
  voiceId: `voice-${i + 1}`,
  name: `音色${i + 1}`,
  language: '中文',
  accent: '普通话',
  gender: 'Female',
  voiceUrl: `/voice-${i + 1}.mp3`,
  id: i + 1,
  description: `说明${i + 1}`,
}));
const sourceFactory = () => ({
  mode: 'operator',
  options: sample.options,
  list: vi.fn(async (request) => {
    const list = request.tab === 'my' ? [] : voices;
    return {
      list: list.slice((request.page - 1) * request.pageSize, request.page * request.pageSize),
      total: list.length,
    };
  }),
});
function Host({ source, save = () => true, disabled = false }) {
  const [params, setParams] = useState({
    voice_setting_voice_id: 'custom',
    _voice_setting_voice_id_meta: { voiceId: 'custom', name: '保留的音色' },
  });
  return (
    <>
      <VoiceBar
        value={params.voice_setting_voice_id}
        meta={params._voice_setting_voice_id_meta}
        source={source}
        disabled={disabled}
        onChange={async (voice) => {
          if ((await save(voice)) === false) return false;
          setParams(voiceSelectionPatch({ originalField: 'voice_setting_voice_id' }, voice));
        }}
      />
      <output aria-label="保存音色">{JSON.stringify(params)}</output>
    </>
  );
}
afterEach(() => vi.unstubAllGlobals());
describe('voice bar and complete read picker', () => {
  it('source replacement closes stale filter drafts, stops audition and keeps the current metadata', async () => {
    const user = userEvent.setup();
    const audio = {
      play: vi.fn().mockResolvedValue(),
      pause: vi.fn(),
      src: '',
      currentTime: 0,
      onended: null,
      onerror: null,
    };
    vi.stubGlobal('Audio', function () {
      return audio;
    });
    const oldSource = sourceFactory();
    const newSource = sourceFactory();
    newSource.list.mockImplementation(async () => ({
      list: [{ ...voices[0], voiceId: 'new-voice', name: '新来源音色' }],
      total: 1,
    }));
    const view = render(<Host source={oldSource} />);
    await user.click(screen.getByRole('button', { name: '切换音色' }));
    await user.click(await screen.findByRole('button', { name: '试听 音色1', exact: true }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '暂停 音色1', exact: true })).toBeTruthy(),
    );
    await user.click(screen.getByRole('button', { name: '筛选', exact: true }));
    await user.selectOptions(screen.getByRole('combobox', { name: '语言' }), '中文');
    const before = audio.pause.mock.calls.length;
    view.rerender(<Host source={newSource} />);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '语音过滤器' })).toBeNull());
    await screen.findByRole('button', { name: '选择 新来源音色', exact: true });
    expect(audio.pause.mock.calls.length).toBeGreaterThan(before);
    expect(oldSource.list.mock.calls[0][1].signal.aborted).toBe(true);
    expect(newSource.list.mock.calls.at(-1)[0]).not.toHaveProperty('language');
    expect(JSON.parse(screen.getByLabelText('保存音色').textContent).voice_setting_voice_id).toBe(
      'custom',
    );
    await user.click(screen.getByRole('button', { name: '筛选', exact: true }));
    expect(screen.getByRole('combobox', { name: '语言' }).value).toBe('');
  });
  it('becoming disabled closes an open picker and enabling again requires a fresh click', async () => {
    const user = userEvent.setup();
    const source = sourceFactory();
    const view = render(<Host source={source} />);
    await user.click(screen.getByRole('button', { name: '切换音色' }));
    await screen.findByRole('button', { name: '选择 音色1', exact: true });
    view.rerender(<Host source={source} disabled />);
    expect(screen.queryByRole('dialog', { name: '音色选择' })).toBeNull();
    expect(source.list.mock.calls[0][1].signal.aborted).toBe(true);
    view.rerender(<Host source={source} />);
    expect(screen.queryByRole('dialog', { name: '音色选择' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '切换音色' }));
    await screen.findByRole('button', { name: '选择 音色1', exact: true });
    expect(screen.getByRole('dialog', { name: '音色选择' })).toBeTruthy();
    expect(JSON.parse(screen.getByLabelText('保存音色').textContent).voice_setting_voice_id).toBe(
      'custom',
    );
  });
  it('selects a second page voice, saves exact metadata and restores the strip opener focus', async () => {
    const user = userEvent.setup();
    const source = sourceFactory();
    render(<Host source={source} />);
    const opener = screen.getByRole('button', { name: '切换音色' });
    await user.click(opener);
    await screen.findByRole('button', { name: '选择 音色1', exact: true });
    await user.click(screen.getByRole('button', { name: '下一页' }));
    await user.click(await screen.findByRole('button', { name: '选择 音色21', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '音色选择' })).toBeNull());
    const saved = JSON.parse(screen.getByLabelText('保存音色').textContent);
    expect(saved.voice_setting_voice_id).toBe('voice-21');
    expect(saved._voice_setting_voice_id_meta).toEqual({
      voiceId: 'voice-21',
      name: '音色21',
      language: '中文',
      accent: '普通话',
      gender: 'Female',
      voiceUrl: '/voice-21.mp3',
    });
    expect(document.activeElement).toBe(opener);
    expect(source.list.mock.calls.at(-1)[0]).toMatchObject({ page: 2, pageSize: 20 });
  });
  it('cancels draft filters, resets accent when language changes and applies multi-age request once', async () => {
    const user = userEvent.setup();
    const source = sourceFactory();
    render(<Host source={source} />);
    await user.click(screen.getByRole('button', { name: '切换音色' }));
    await screen.findByRole('button', { name: '选择 音色1', exact: true });
    const filterOpener = screen.getByRole('button', { name: '筛选' });
    await user.click(filterOpener);
    expect(screen.getByRole('combobox', { name: '口音' }).disabled).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: '语言' }), '中文');
    await user.selectOptions(screen.getByRole('combobox', { name: '口音' }), '粤语');
    await user.selectOptions(screen.getByRole('combobox', { name: '语言' }), '英文');
    expect(screen.getByRole('combobox', { name: '口音' }).value).toBe('');
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(filterOpener);
    expect(source.list).toHaveBeenCalledTimes(1);
    await user.click(filterOpener);
    expect(screen.getByRole('combobox', { name: '语言' }).value).toBe('');
    await user.selectOptions(screen.getByRole('combobox', { name: '语言' }), '中文');
    await user.selectOptions(screen.getByRole('combobox', { name: '口音' }), '普通话');
    await user.click(screen.getByRole('button', { name: '青年', exact: true }));
    await user.click(screen.getByRole('button', { name: '成年', exact: true }));
    await user.click(
      within(screen.getByRole('dialog', { name: '语音过滤器' })).getByRole('button', {
        name: '筛选',
        exact: true,
      }),
    );
    await waitFor(() => expect(source.list).toHaveBeenCalledTimes(2));
    expect(source.list.mock.calls[1][0]).toMatchObject({
      language: '中文',
      accent: '普通话',
      ageGroup: ['Youth', 'Adult'],
      page: 1,
    });
    await user.click(screen.getByRole('button', { name: '移除过滤器 语言: 中文' }));
    await waitFor(() => expect(source.list).toHaveBeenCalledTimes(3));
    expect(source.list.mock.calls[2][0]).not.toHaveProperty('accent');
  });
  it('filters long voice option lists with the searchable filter fields before selection', async () => {
    const user = userEvent.setup();
    const source = sourceFactory();
    render(<Host source={source} />);
    await user.click(screen.getByRole('button', { name: '切换音色' }));
    await screen.findByRole('button', { name: '选择 音色1', exact: true });
    await user.click(screen.getByRole('button', { name: '筛选', exact: true }));

    const language = screen.getByRole('combobox', { name: '语言' });
    const languageSearch = screen.getByRole('searchbox', { name: '搜索语言' });
    await user.type(languageSearch, '英文');
    expect(within(language).getByRole('option', { name: '英文' })).toBeTruthy();
    expect(within(language).queryByRole('option', { name: '中文' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '清除语言搜索' }));
    expect(screen.getByRole('searchbox', { name: '搜索语言' }).value).toBe('');
    await user.type(screen.getByRole('searchbox', { name: '搜索语言' }), '英文');
    await user.selectOptions(language, '英文');

    expect(language.value).toBe('英文');
    expect(screen.getByRole('searchbox', { name: '搜索口音' }).disabled).toBe(true);
    expect(screen.getByRole('searchbox', { name: '搜索语言' }).value).toBe('');
  });
  it('keeps the original voice and picker on failed saving, then retries selection successfully', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<Host source={sourceFactory()} save={save} />);
    await user.click(screen.getByRole('button', { name: '切换音色' }));
    await user.click(await screen.findByRole('button', { name: '选择 音色1', exact: true }));
    await screen.findByText('音色设置未保存，请重试');
    expect(JSON.parse(screen.getByLabelText('保存音色').textContent).voice_setting_voice_id).toBe(
      'custom',
    );
    await user.click(screen.getByRole('button', { name: '选择 音色1', exact: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '音色选择' })).toBeNull());
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('stops audio on picker dismissal and closes nested menu/clone before the picker', async () => {
    const user = userEvent.setup();
    const audio = {
      play: vi.fn().mockResolvedValue(),
      pause: vi.fn(),
      src: '',
      currentTime: 0,
      onended: null,
      onerror: null,
    };
    vi.stubGlobal('Audio', function () {
      return audio;
    });
    render(<Host source={sourceFactory()} />);
    const opener = screen.getByRole('button', { name: '切换音色' });
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: '试听 音色1', exact: true }));
    await waitFor(() => expect(audio.play).toHaveBeenCalledTimes(1));
    const more = screen.getByRole('button', { name: '更多 音色1', exact: true });
    await user.click(more);
    expect(screen.getByRole('dialog', { name: '音色操作' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '音色操作' })).toBeNull();
    expect(document.activeElement).toBe(more);
    await user.click(screen.getByRole('button', { name: '克隆新音色', exact: true }));
    expect(screen.getByText(/目前未接入/)).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '音色选择' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '音色选择' })).toBeNull();
    expect(audio.pause).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });
  it('shows a failed list retry, keeps disabled or mismatched strip data immutable and never invents audition URLs', async () => {
    const source = sourceFactory();
    source.list.mockRejectedValueOnce(new Error('公开读取失败'));
    const view = render(<Host source={source} disabled />);
    expect(screen.getByRole('button', { name: '切换音色' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '试听音色' }).disabled).toBe(true);
    view.rerender(<Host source={source} />);
    fireEvent.click(screen.getByRole('button', { name: '切换音色' }));
    await screen.findByRole('alert');
    expect(screen.getByText('公开读取失败')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '重试' })));
    await screen.findByRole('button', { name: '选择 音色1', exact: true });
    fireEvent.click(screen.getByRole('tab', { name: '我的音色' }));
    await screen.findByText(/暂无可用音色/);
    expect(screen.queryByRole('button', { name: '选择 音色1', exact: true })).toBeNull();
    expect(JSON.parse(screen.getByLabelText('保存音色').textContent).voice_setting_voice_id).toBe(
      'custom',
    );
  });
});
