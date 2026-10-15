import { act, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';

export async function getCodeEditor(label) {
  let editor;
  await waitFor(() => {
    const element = screen.getByRole('textbox', { name: label });
    editor = EditorView.findFromDOM(element);
    if (!editor) throw new Error('CodeMirror is not ready');
  });
  return editor;
}

export function replaceCode(editor, value) {
  act(() => {
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  });
}
