import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder as codePlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { skillCodeDiff } from '../code-diff.js';
import '../styles/markdown-editor.css';

const syntax = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--skill-cm-heading)', fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--skill-cm-link)' },
  { tag: tags.monospace, color: 'var(--skill-cm-code)' },
  { tag: tags.quote, color: 'var(--skill-cm-quote)' },
  {
    tag: [tags.meta, tags.processingInstruction, tags.contentSeparator],
    color: 'var(--skill-cm-meta)',
  },
]);

function codePosition(view) {
  const { anchor, head } = view.state.selection.main;
  return { anchor, head };
}

const SkillCodeEditor = forwardRef(function SkillCodeEditor(
  { value, onChange, placeholder, label, position, onPositionChange, diffOriginal, onReady },
  ref,
) {
  const container = useRef(null);
  const view = useRef(null);
  const current = useRef({ onChange, onPositionChange, onReady });
  current.current = { onChange, onPositionChange, onReady };
  const initial = useRef({ value, placeholder, label, position, diffOriginal });
  const replacing = useRef(false);
  useEffect(() => {
    const props = initial.current;
    const selection = props.position && {
      anchor: Math.min(props.position.anchor, props.value.length),
      head: Math.min(props.position.head, props.value.length),
    };
    const instance = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: props.value,
        selection,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(syntax),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': props.label, 'aria-multiline': 'true' }),
          ...(props.placeholder ? [codePlaceholder(props.placeholder)] : []),
          ...(props.diffOriginal !== undefined ? [skillCodeDiff(props.diffOriginal)] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !replacing.current)
              current.current.onChange(update.state.doc.toString());
            if (update.selectionSet || update.docChanged)
              current.current.onPositionChange?.(codePosition(update.view));
          }),
        ],
      }),
    });
    view.current = instance;
    current.current.onReady?.(instance);
    return () => {
      current.current.onPositionChange?.(codePosition(instance));
      view.current = null;
      instance.destroy();
    };
  }, []);
  useEffect(() => {
    const instance = view.current;
    if (!instance || instance.state.doc.toString() === value) return;
    const previous = codePosition(instance);
    replacing.current = true;
    try {
      instance.dispatch({
        changes: { from: 0, to: instance.state.doc.length, insert: value },
        selection: {
          anchor: Math.min(previous.anchor, value.length),
          head: Math.min(previous.head, value.length),
        },
      });
    } finally {
      replacing.current = false;
    }
  }, [value]);
  useImperativeHandle(ref, () => ({
    getEditor: () => view.current,
    getValue: () => view.current?.state.doc.toString() ?? initial.current.value,
    getPosition: () => (view.current ? codePosition(view.current) : initial.current.position),
    focus: () => view.current?.focus(),
  }));
  return <div ref={container} className="secondary-skill-code" />;
});

export default SkillCodeEditor;
