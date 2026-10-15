import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import secondary from '../../../../public/data/secondary.json';
import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';
import SkillCreatePage from './SkillCreatePage.jsx';
import { getCodeEditor, replaceCode } from './editor-test-utils.js';

vi.mock('../../../data.js', async (original) => ({
  ...(await original()),
  useContent: () => ({ data: secondary, loading: false, error: null, reload: vi.fn() }),
}));
const key = 'libtv-created-skills';
const t = secondary.commonLocale;
const baseDraft = () => ({
  skillUuid: 'local-draft',
  name: 'Tree Skill',
  description: 'A local draft',
  useScenario: 'Local test scenario',
  inputType: 'Markdown',
  outputContent: 'Local output',
  resultType: 1,
  skillFiles: [
    { path: 'SKILL.md', content: '# Main', primary: true },
    { path: 'guide/notes.md', content: 'Existing notes' },
  ],
  skillDirectories: ['empty/nested'],
});
const actions = () => ({
  login: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  asset: (value) => value,
  user: { name: '本地测试' },
});
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/skill/create?skillUuid=local-draft');
});

describe('Skill create persistence boundaries', () => {
  it('saves and reloads moved files, their text and locally persisted empty directories', async () => {
    const user = userEvent.setup(),
      props = actions();
    writeStoredValue(key, [baseDraft()]);
    const view = render(<SkillCreatePage {...props} />);
    const dataTransfer = { setData: vi.fn() };
    await user.click(screen.getByTitle('guide/notes.md'));
    fireEvent.dragStart(screen.getByTitle('guide/notes.md').closest('.secondary-skill-tree-row'), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByLabelText('文件树根目录'), { dataTransfer });
    await user.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
    replaceCode(await getCodeEditor('notes.md 内容'), 'Text survives root move and reload');
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(props.navigate).toHaveBeenCalledWith('/skill?tab=mine');
    const [saved] = readStoredValue(key, []);
    expect(saved.skillFiles.find((file) => file.path === 'notes.md').content).toBe(
      'Text survives root move and reload',
    );
    expect(saved.skillDirectories).toEqual(['empty/nested']);
    expect(saved.markdownContent).toBe('# Main');
    view.unmount();
    render(<SkillCreatePage {...actions()} />);
    expect(screen.getByTitle('empty/nested')).toBeTruthy();
    await user.click(screen.getByTitle('notes.md'));
    await user.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
    expect((await getCodeEditor('notes.md 内容')).state.doc.toString()).toBe(
      'Text survives root move and reload',
    );
    expect(screen.queryByTitle('guide/notes.md')).toBeNull();
  });

  it('keeps the stored draft and edited form intact after quota failure, then permits a retry', async () => {
    const user = userEvent.setup(),
      props = actions();
    writeStoredValue(key, [baseDraft()]);
    const original = localStorage.getItem(key);
    render(<SkillCreatePage {...props} />);
    await user.click(screen.getByRole('button', { name: '更多操作 guide/notes.md' }));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    await user.keyboard('renamed{Enter}');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(props.toast).toHaveBeenCalledWith('本地保存失败，请检查浏览器存储空间');
    expect(localStorage.getItem(key)).toBe(original);
    expect(props.navigate).not.toHaveBeenCalled();
    expect(screen.getByTitle('guide/renamed.md')).toBeTruthy();
    expect(screen.getByPlaceholderText(t.createSkillNamePlaceholder).value).toBe('Tree Skill');
    expect(screen.getByRole('button', { name: t.save }).disabled).toBe(false);
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: t.save }));
    expect(readStoredValue(key, [])[0].skillFiles[1].path).toBe('guide/renamed.md');
    expect(props.navigate).toHaveBeenCalledOnce();
  });

  it('blocks saving malformed local data without overwriting the original storage', () => {
    localStorage.setItem(key, '{invalid JSON');
    render(<SkillCreatePage {...actions()} />);
    expect(screen.getByRole('alert').textContent).toContain('原数据未覆盖');
    expect(screen.queryByRole('button', { name: t.save })).toBeNull();
    expect(localStorage.getItem(key)).toBe('{invalid JSON');
  });

  it('reports malformed file records before rendering or replacing a draft', () => {
    const malformed = { ...baseDraft(), skillFiles: [{ path: 'SKILL.md', content: null }] };
    writeStoredValue(key, [malformed]);
    const original = localStorage.getItem(key);
    render(<SkillCreatePage {...actions()} />);
    expect(screen.getByRole('alert').textContent).toContain('原数据未覆盖');
    expect(localStorage.getItem(key)).toBe(original);
  });

  it('loads legacy markdown-only drafts and accepts historical null as an empty library', async () => {
    const legacy = baseDraft();
    delete legacy.skillFiles;
    delete legacy.skillDirectories;
    legacy.markdownContent = '# Legacy content';
    writeStoredValue(key, [legacy]);
    const view = render(<SkillCreatePage {...actions()} />);
    fireEvent.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
    expect((await getCodeEditor('SKILL.md 内容')).state.doc.toString()).toBe('# Legacy content');
    view.unmount();
    writeStoredValue(key, null);
    window.history.replaceState({}, '', '/skill/create');
    render(<SkillCreatePage {...actions()} />);
    expect(screen.getByRole('button', { name: t.save })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('prevents saving until an imported file finishes reading and includes it in the eventual save', async () => {
    let resolve;
    const reading = new Promise((yes) => {
        resolve = yes;
      }),
      props = actions();
    writeStoredValue(key, [baseDraft()]);
    render(<SkillCreatePage {...props} />);
    fireEvent.change(screen.getByLabelText('上传 Markdown 文件'), {
      target: { files: [{ name: 'new.md', size: 10, text: () => reading }] },
    });
    expect(screen.getByRole('button', { name: t.save }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    expect(props.navigate).not.toHaveBeenCalled();
    await act(async () => resolve('New document'));
    await waitFor(() => expect(screen.getByRole('button', { name: t.save }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    expect(
      readStoredValue(key, [])[0].skillFiles.find((file) => file.path === 'new.md').content,
    ).toBe('New document');
  });
});
