import React, { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { undo, redo } from '@codemirror/commands';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillRichEditor from './SkillRichEditor.jsx';
import SkillCodeEditor from './SkillCodeEditor.jsx';
import SkillFileEditor from './SkillFileEditor.jsx';
import { getCodeEditor, replaceCode } from '../editor-test-utils.js';
import secondary from '../../../../../public/data/secondary.json';

const t = secondary.commonLocale;
afterEach(() => vi.useRealTimers());
async function readyRich(ref) {
  await waitFor(() => expect(ref.current?.getEditor()?.view.dom.isConnected).toBe(true));
  return ref.current.getEditor();
}
function Harness({ original, baseline, diffEnabled = false }) {
  const [files, setFiles] = useState(original),
    [dirs, setDirs] = useState([]),
    [selected, setSelected] = useState('SKILL.md'),
    [mode, setMode] = useState('preview');
  return (
    <>
      <output aria-label="Files">{JSON.stringify(files)}</output>
      <SkillFileEditor
        files={files}
        setFiles={setFiles}
        dirs={dirs}
        setDirs={setDirs}
        selected={selected}
        setSelected={setSelected}
        mode={mode}
        setMode={setMode}
        onlineContents={baseline}
        diffEnabled={diffEnabled}
        t={t}
        toast={vi.fn()}
      />
    </>
  );
}

describe('real Skill Markdown editors', () => {
  it('uses editable TipTap headings, marks and lists while treating raw HTML as literal text', async () => {
    const ref = createRef(),
      onChange = vi.fn();
    render(
      <SkillRichEditor
        ref={ref}
        value={'# Title\n\n**bold** and *italic*\n\n- item\n\n<b>literal</b>'}
        onChange={onChange}
        label="Rich"
      />,
    );
    const editor = await readyRich(ref);
    const input = screen.getByRole('textbox', { name: 'Rich' });
    expect(input.getAttribute('contenteditable')).toBe('true');
    expect(input.querySelector('h1').textContent).toBe('Title');
    expect(input.querySelector('strong').textContent).toBe('bold');
    expect(input.querySelector('em').textContent).toBe('italic');
    expect(input.querySelector('li').textContent).toBe('item');
    expect(input.querySelector('b')).toBeNull();
    expect(input.textContent).toContain('<b>literal</b>');
    expect(onChange).not.toHaveBeenCalled();
    act(() => editor.commands.setTextSelection({ from: 1, to: 6 }));
    fireEvent.keyDown(input, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(onChange.mock.lastCall[0]).toContain('# **Title**');
  });

  it('parses plain clipboard Markdown into rich nodes and copies Markdown rather than flattened text', async () => {
    const ref = createRef(),
      onChange = vi.fn();
    render(<SkillRichEditor ref={ref} value="" onChange={onChange} label="Paste" />);
    const editor = await readyRich(ref);
    fireEvent.paste(editor.view.dom, {
      clipboardData: {
        getData: (type) => (type === 'text/plain' ? '## Pasted\n\n**strong**' : ''),
      },
    });
    expect(editor.view.dom.querySelector('h2').textContent).toBe('Pasted');
    expect(editor.view.dom.querySelector('strong').textContent).toBe('strong');
    expect(onChange.mock.lastCall[0]).toBe('## Pasted\n\n**strong**');
    const selected = editor.state.doc.slice(0, editor.state.doc.content.size);
    let serialized;
    editor.view.someProp('clipboardTextSerializer', (serialize) => {
      serialized = serialize(selected, editor.view);
      return true;
    });
    expect(serialized).toBe('## Pasted\n\n**strong**');
  });

  it('applies external rich replacements without emitting edits and preserves a clamped cursor', async () => {
    const ref = createRef(),
      onChange = vi.fn();
    const view = render(
      <SkillRichEditor
        ref={ref}
        value="Existing"
        onChange={onChange}
        label="Rich"
        position={{ anchor: 4, head: 4 }}
      />,
    );
    const editor = await readyRich(ref);
    await waitFor(() => expect(editor.state.selection.anchor).toBe(4));
    view.rerender(<SkillRichEditor ref={ref} value="New" onChange={onChange} label="Rich" />);
    await waitFor(() => expect(editor.getText()).toBe('New'));
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.state.selection.anchor).toBe(4);
  });

  it('edits through CodeMirror history, preserves cursor and does not echo external values', async () => {
    const ref = createRef(),
      onChange = vi.fn();
    const view = render(
      <SkillCodeEditor
        ref={ref}
        value="abcdef"
        onChange={onChange}
        label="Code"
        position={{ anchor: 2, head: 4 }}
      />,
    );
    const editor = await getCodeEditor('Code');
    expect(editor.state.selection.main).toMatchObject({ anchor: 2, head: 4 });
    replaceCode(editor, 'changed');
    expect(onChange).toHaveBeenLastCalledWith('changed');
    act(() => undo(editor));
    expect(editor.state.doc.toString()).toBe('abcdef');
    act(() => redo(editor));
    expect(editor.state.doc.toString()).toBe('changed');
    onChange.mockClear();
    view.rerender(<SkillCodeEditor ref={ref} value="remote" onChange={onChange} label="Code" />);
    expect(editor.state.doc.toString()).toBe('remote');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders editable current diff lines and read-only removed blocks, then recomputes after edits', async () => {
    const ref = createRef();
    const view = render(
      <SkillCodeEditor
        ref={ref}
        value={'new\nsame'}
        diffOriginal={'old\nsame\ntail'}
        onChange={vi.fn()}
        label="Diff"
      />,
    );
    const editor = await getCodeEditor('Diff');
    expect(view.container.querySelector('.cm-skillDiffChanged').textContent).toBe('new');
    const removed = view.container.querySelectorAll('.cm-skillDiffRemoved');
    expect([...removed].map((element) => element.textContent)).toEqual(['old', 'tail']);
    expect(
      [...removed].every((element) => element.getAttribute('contenteditable') === 'false'),
    ).toBe(true);
    replaceCode(editor, 'old\nsame\ntail');
    await waitFor(() => expect(view.container.querySelector('.cm-skillDiffRemoved')).toBeNull());
    expect(view.container.querySelector('.cm-skillDiffChanged')).toBeNull();
    replaceCode(editor, 'late');
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 270));
    expect(ref.current).toBeNull();
  });
});

describe('Skill file editor mode and lifecycle coordination', () => {
  const source = [
    { path: 'SKILL.md', content: '# Main\n\nraw  \n\n', primary: true },
    { path: 'notes.md', content: 'Notes' },
  ];
  it('retains unedited source bytes, per-file code cursors and text across mode and fullscreen remounts', async () => {
    render(<Harness original={source} />);
    fireEvent.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
    let editor = await getCodeEditor('SKILL.md 内容');
    expect(editor.state.doc.toString()).toBe(source[0].content);
    act(() => editor.dispatch({ selection: { anchor: 5 } }));
    fireEvent.click(screen.getByTitle('notes.md'));
    replaceCode(await getCodeEditor('notes.md 内容'), 'Edited notes');
    fireEvent.click(screen.getByTitle('SKILL.md'));
    editor = await getCodeEditor('SKILL.md 内容');
    expect(editor.state.selection.main.anchor).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: t.createSkillPreviewMode }));
    fireEvent.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
    editor = await getCodeEditor('SKILL.md 内容');
    expect(editor.state.selection.main.anchor).toBe(5);
    fireEvent.click(screen.getByRole('button', { name: t.skillExpand || '展开' }));
    editor = await getCodeEditor('SKILL.md 内容');
    expect(editor.state.selection.main.anchor).toBe(5);
    replaceCode(editor, 'Fullscreen saved');
    fireEvent.click(screen.getByRole('button', { name: t.createSkillCollapse }));
    expect((await getCodeEditor('SKILL.md 内容')).state.doc.toString()).toBe('Fullscreen saved');
    expect(JSON.parse(screen.getByLabelText('Files').textContent)[1].content).toBe('Edited notes');
  });

  it('only exposes diff with explicit capability and never restores deleted baseline files into the draft', async () => {
    const original = [{ path: 'SKILL.md', content: 'new', primary: true }];
    const view = render(
      <Harness
        original={original}
        baseline={{ 'SKILL.md': 'old', 'deleted.md': 'Removed source' }}
      />,
    );
    expect(screen.queryByRole('button', { name: t.createSkillDiffMode })).toBeNull();
    view.rerender(
      <Harness
        original={original}
        baseline={{ 'SKILL.md': 'old', 'deleted.md': 'Removed source' }}
        diffEnabled
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: t.createSkillDiffMode }));
    await getCodeEditor('SKILL.md 内容');
    fireEvent.click(screen.getByTitle('deleted.md'));
    expect(screen.getByLabelText('Markdown 改动比较').textContent).toContain('Removed source');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '更多操作 deleted.md' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.createSkillCodeMode }));
    expect((await getCodeEditor('SKILL.md 内容')).state.doc.toString()).toBe('new');
    expect(screen.queryByTitle('deleted.md')).toBeNull();
    expect(JSON.parse(screen.getByLabelText('Files').textContent)).toEqual(original);
  });

  it('reports the unavailable optimization service without pretending to generate or altering the text', async () => {
    render(<Harness original={source} />);
    fireEvent.click(screen.getByRole('button', { name: t.createSkillContentOptimizeTitle }));
    expect(screen.getByRole('alert').textContent).toContain('内容优化服务尚未连接');
    expect(JSON.parse(screen.getByLabelText('Files').textContent)).toEqual(source);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
