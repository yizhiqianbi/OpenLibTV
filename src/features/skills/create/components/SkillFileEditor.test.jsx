import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import secondary from '../../../../../public/data/secondary.json';
import SkillFileEditor from './SkillFileEditor.jsx';
import { getCodeEditor, replaceCode } from '../editor-test-utils.js';

const t = secondary.commonLocale;
const initialFiles = [
  { path: 'SKILL.md', content: '# Main', primary: true },
  { path: 'guide/notes.md', content: 'Notes text' },
  { path: 'guide/deep/extra.markdown', content: 'Nested text' },
  { path: 'outside.md', content: 'Outside text' },
];

function Harness({
  files: original = initialFiles,
  dirs: originalDirs = [],
  toast = vi.fn(),
  busy,
}) {
  const [files, setFiles] = useState(original),
    [dirs, setDirs] = useState(originalDirs),
    [selected, setSelected] = useState('SKILL.md'),
    [mode, setMode] = useState('code');
  return (
    <>
      <output aria-label="Current document">{JSON.stringify({ files, dirs, selected })}</output>
      <SkillFileEditor
        files={files}
        setFiles={setFiles}
        dirs={dirs}
        setDirs={setDirs}
        selected={selected}
        setSelected={setSelected}
        mode={mode}
        setMode={setMode}
        t={t}
        toast={toast}
        asset={(value) => value}
        onUploadBusyChange={busy}
      />
    </>
  );
}
const documentState = () => JSON.parse(screen.getByLabelText('Current document').textContent);
const row = (path) => screen.getByTitle(path).closest('.secondary-skill-tree-row');
function move(from, target) {
  const dataTransfer = { setData: vi.fn(), dropEffect: '', effectAllowed: '' };
  fireEvent.dragStart(row(from), { dataTransfer });
  const destination = target === '' ? screen.getByLabelText('文件树根目录') : row(target);
  fireEvent.dragOver(destination, { dataTransfer });
  fireEvent.drop(destination, { dataTransfer });
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => vi.useRealTimers());

describe('Skill create file tree interactions', () => {
  it('collapses nested folders and opens a collapsed parent when creating a file', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const guide = screen.getByTitle('guide');
    await user.click(guide);
    expect(guide.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTitle('guide/notes.md')).toBeNull();
    await user.click(screen.getByRole('button', { name: t.createSkillNewMdFile }));
    expect(guide.getAttribute('aria-expanded')).toBe('true');
    await user.type(screen.getByRole('textbox', { name: '名称' }), 'new{Enter}');
    expect(documentState().files.some((file) => file.path === 'guide/new.md')).toBe(true);
    expect(documentState().selected).toBe('guide/new.md');
    guide.focus();
    await user.keyboard('{Enter}');
    expect(guide.getAttribute('aria-expanded')).toBe('false');
  });

  it('moves to the root or a file parent and preserves selection and directory contents', () => {
    render(<Harness dirs={['guide/empty', 'target']} />);
    fireEvent.click(screen.getByTitle('guide/notes.md'));
    move('guide/notes.md', '');
    expect(documentState().selected).toBe('notes.md');
    expect(documentState().files.find((file) => file.path === 'notes.md').content).toBe(
      'Notes text',
    );
    move('outside.md', 'guide/deep/extra.markdown');
    expect(documentState().files.some((file) => file.path === 'guide/deep/outside.md')).toBe(true);
    fireEvent.click(screen.getByTitle('guide/deep/extra.markdown'));
    move('guide', 'target');
    expect(documentState().selected).toBe('target/guide/deep/extra.markdown');
    expect(documentState().dirs).toContain('target/guide/empty');
    expect(
      documentState().files.find((file) => file.path.endsWith('/extra.markdown')).content,
    ).toBe('Nested text');
  });

  it('explains rejected drops and keeps files unchanged for collisions, cycles and external files', () => {
    const toast = vi.fn();
    render(
      <Harness
        files={[...initialFiles, { path: 'notes.md', content: 'Do not replace' }]}
        toast={toast}
      />,
    );
    const before = documentState();
    move('guide/notes.md', '');
    expect(screen.getByRole('alert').textContent).toBe(t.createSkillMoveConflict);
    expect(documentState()).toEqual(before);
    move('guide', 'guide/deep');
    expect(screen.getByRole('alert').textContent).toContain('自身');
    expect(documentState()).toEqual(before);
    fireEvent.drop(screen.getByLabelText('文件树根目录'), { dataTransfer: { files: [] } });
    expect(screen.getByRole('alert').textContent).toContain('当前文件树');
    expect(documentState()).toEqual(before);
  });

  it('supports keyboard menu navigation, Escape and the primary lock inside the expanded editor', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: t.skillExpand || '展开' }));
    const notes = screen.getByTitle('guide/notes.md');
    notes.focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '重命名' }));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '删除' }));
    await user.keyboard('{Home}{ArrowDown}{ArrowUp}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(notes);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '更多操作 SKILL.md' }));
    expect(screen.getByRole('menuitem', { name: '重命名' }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: '删除' }).disabled).toBe(true);
    await user.keyboard('{Escape}{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: t.skillExpand || '展开' })).toBe(
      document.activeElement,
    );
  });

  it('renames on blur with the original extension and requires confirmation before deleting a subtree', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTitle('guide/deep/extra.markdown'));
    await user.click(screen.getByRole('button', { name: '更多操作 guide/deep/extra.markdown' }));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    const input = screen.getByRole('textbox', { name: '名称' });
    expect(input.value).toBe('extra');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
    await user.keyboard('renamed');
    await user.tab();
    expect(documentState().selected).toBe('guide/deep/renamed.markdown');
    expect(
      documentState().files.filter((file) => file.path.endsWith('renamed.markdown')),
    ).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '更多操作 guide' }));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.getByTitle('guide/deep/renamed.markdown')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '更多操作 guide' }));
    await user.click(screen.getByRole('menuitem', { name: '删除' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(documentState().files.map((file) => file.path)).toEqual(['SKILL.md', 'outside.md']);
    expect(documentState().selected).toBe('SKILL.md');
  });

  it('opens the long-press menu only after 500ms and cancels moved gestures', () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.pointerDown(row('guide/notes.md'), { button: 0, clientX: 20, clientY: 20 });
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole('menu')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerDown(row('guide/notes.md'), { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(row('guide/notes.md'), { clientX: 29, clientY: 20 });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('focuses a newly chosen rename target after a previous collision and preserves unaffected selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '更多操作 outside.md' }));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    await user.keyboard('SKILL{Enter}');
    expect(screen.getByText(t.createSkillEntryNameConflict)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '更多操作 guide/notes.md' }));
    await user.click(screen.getByRole('menuitem', { name: '重命名' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '名称' }));
    await user.keyboard('new-notes{Enter}');
    expect(documentState().files.some((file) => file.path === 'guide/new-notes.md')).toBe(true);
    expect(documentState().files.some((file) => file.path === 'outside.md')).toBe(true);
    expect(documentState().selected).toBe('SKILL.md');
  });

  it('merges a delayed read into the latest edits and preserves current selection', async () => {
    const read = deferred(),
      busy = vi.fn();
    render(<Harness busy={busy} />);
    fireEvent.change(screen.getByLabelText('上传 Markdown 文件'), {
      target: { files: [{ name: 'import.md', size: 20, text: () => read.promise }] },
    });
    expect(screen.getByRole('button', { name: t.createSkillUpload }).disabled).toBe(true);
    replaceCode(await getCodeEditor('SKILL.md 内容'), 'Edited while reading');
    fireEvent.click(screen.getByTitle('outside.md'));
    await act(async () => read.resolve('Imported text'));
    expect(documentState().files.find((file) => file.path === 'SKILL.md').content).toBe(
      'Edited while reading',
    );
    expect(documentState().files.find((file) => file.path === 'import.md').content).toBe(
      'Imported text',
    );
    expect(documentState().selected).toBe('outside.md');
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('retains files after read rejection, replacement cancellation and late completion after unmount', async () => {
    const toast = vi.fn(),
      read = deferred();
    const view = render(<Harness toast={toast} />);
    const original = documentState();
    fireEvent.change(screen.getByLabelText('上传 Markdown 文件'), {
      target: {
        files: [{ name: 'new.md', size: 1, text: () => Promise.reject(new Error('Unreadable')) }],
      },
    });
    await waitFor(() => expect(toast).toHaveBeenCalledWith(t.createSkillReadFolderFailed));
    expect(documentState()).toEqual(original);
    fireEvent.change(screen.getByLabelText('上传 Markdown 文件'), {
      target: { files: [{ name: 'SKILL.md', size: 1, text: async () => 'Replacement' }] },
    });
    await userEvent.click(await screen.findByRole('button', { name: '取消' }));
    expect(documentState()).toEqual(original);
    fireEvent.change(screen.getByLabelText('上传 Markdown 文件'), {
      target: { files: [{ name: 'late.md', size: 1, text: () => read.promise }] },
    });
    view.unmount();
    toast.mockClear();
    await act(async () => read.reject(new Error('Late error')));
    expect(toast).not.toHaveBeenCalled();
  });

  it('ignores a superseded read rather than overwriting a newer import', async () => {
    const oldRead = deferred(),
      newRead = deferred();
    render(<Harness />);
    const input = screen.getByLabelText('上传 Markdown 文件');
    fireEvent.change(input, {
      target: { files: [{ name: 'import.md', size: 1, text: () => oldRead.promise }] },
    });
    fireEvent.change(input, {
      target: { files: [{ name: 'import.md', size: 1, text: () => newRead.promise }] },
    });
    await act(async () => newRead.resolve('New read'));
    await act(async () => oldRead.resolve('Old read'));
    expect(documentState().files.find((file) => file.path === 'import.md').content).toBe(
      'New read',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
