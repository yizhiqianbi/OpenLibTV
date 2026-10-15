import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { skillMarkdownExtensions } from '../markdown-extensions.js';
import '../styles/markdown-editor.css';

function richPosition(editor) {
  const { anchor, head } = editor.state.selection;
  return { anchor, head };
}

const SkillRichEditor = forwardRef(function SkillRichEditor(
  { value, onChange, placeholder, label = 'Skill 内容', position, onPositionChange, onReady },
  ref,
) {
  const current = useRef({ onChange, onPositionChange, onReady });
  current.current = { onChange, onPositionChange, onReady };
  const lastValue = useRef(value);
  const initialPosition = useRef(position);
  const externalUpdate = useRef(0);
  const editor = useEditor({
    extensions: skillMarkdownExtensions(placeholder),
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'secondary-skill-rich markdown-content',
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
      },
    },
    onCreate({ editor }) {
      const saved = initialPosition.current;
      if (saved) {
        const limit = editor.state.doc.content.size;
        editor.commands.setTextSelection({
          from: Math.min(saved.anchor, limit),
          to: Math.min(saved.head, limit),
        });
      }
      current.current.onReady?.(editor);
    },
    onUpdate({ editor }) {
      const markdown = editor.getMarkdown().replace(/[ \t\n\r]+$/g, '');
      lastValue.current = markdown;
      current.current.onChange(markdown);
    },
    onSelectionUpdate({ editor }) {
      current.current.onPositionChange?.(richPosition(editor));
    },
  });
  useImperativeHandle(
    ref,
    () => ({
      getEditor: () => editor,
      getValue: () => lastValue.current,
      getPosition: () => (editor ? richPosition(editor) : initialPosition.current),
      focus: () => editor?.commands.focus(),
    }),
    [editor],
  );
  useEffect(() => {
    if (!editor || value === lastValue.current) return;
    const request = ++externalUpdate.current;
    lastValue.current = value;
    // EditorContent uses a React renderer. Replace content outside the commit.
    queueMicrotask(() => {
      if (editor.isDestroyed || request !== externalUpdate.current) return;
      const previous = richPosition(editor);
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
      const limit = editor.state.doc.content.size;
      editor.commands.setTextSelection({
        from: Math.min(previous.anchor, limit),
        to: Math.min(previous.head, limit),
      });
    });
  }, [editor, value]);
  useEffect(
    () => () => {
      externalUpdate.current += 1;
      if (editor && !editor.isDestroyed) current.current.onPositionChange?.(richPosition(editor));
    },
    [editor],
  );
  return <EditorContent editor={editor} className="secondary-skill-rich-container" />;
});

export default SkillRichEditor;
