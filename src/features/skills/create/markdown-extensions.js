import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DOMParser, DOMSerializer } from '@tiptap/pm/model';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Marked } from 'marked';

const MarkdownClipboard = Extension.create({
  name: 'skillMarkdownClipboard',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('skillMarkdownClipboard'),
        props: {
          clipboardTextSerializer(slice) {
            return editor.markdown.serialize({ type: 'doc', content: slice.content.toJSON() });
          },
          clipboardTextParser(text, context, plain) {
            if (plain) return null;
            const parsed = editor.schema.nodeFromJSON(editor.markdown.parse(text));
            const container = document.createElement('div');
            container.appendChild(
              DOMSerializer.fromSchema(editor.schema).serializeFragment(parsed.content),
            );
            return DOMParser.fromSchema(editor.schema).parseSlice(container, {
              preserveWhitespace: true,
              context,
            });
          },
        },
      }),
    ];
  },
});

export function skillMarkdownExtensions(placeholder) {
  // Use a private lexer: the official Markdown manager otherwise shares marked
  // defaults across all editors. The source's html:false stays local here.
  const marked = new Marked({
    gfm: false,
    breaks: false,
    tokenizer: { html: () => undefined, tag: () => undefined },
  });
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Markdown.configure({
      marked,
    }),
    MarkdownClipboard,
    Placeholder.configure({ placeholder }),
  ];
}
