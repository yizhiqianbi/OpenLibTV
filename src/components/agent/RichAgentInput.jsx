import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin } from '@tiptap/pm/state';
import Suggestion, { exitSuggestion } from '@tiptap/suggestion';
import { Box, Sparkles, Image, Film, Music, FileText, Layers, X } from 'lucide-react';
import {
  agentContentToJSON,
  agentContentFromJSON,
  agentReferenceNode,
  isAgentReference,
} from '../../services/agent-content.js';
import { useAgentSuggestions } from './useAgentSuggestions.js';
import MentionSuggestionList from './MentionSuggestionList.jsx';
import AgentNodeReference from './AgentNodeReference.jsx';
import './rich-agent-input.css';

const icons = {
  model: Box,
  node: Layers,
  skill: Sparkles,
  image: Image,
  video: Film,
  audio: Music,
  document: FileText,
};
const signature = (parts) =>
  JSON.stringify(parts, (key, value) => (key === 'referenceKey' ? undefined : value));
const typeName = (type) =>
  type === 'skill' ? 'Skill' : type === 'model' ? '模型' : type === 'node' ? '节点' : '参考素材';

function ReferenceView({ node, editor, extension, getPos, selected }) {
  const reference = node.attrs.reference || {};
  const Glyph = icons[reference.type] || FileText;
  return (
    <NodeViewWrapper
      as="span"
      className={`agent-inline-reference ${selected ? 'is-selected' : ''}`}
      contentEditable={false}
    >
      {reference.type === 'node' ? (
        <AgentNodeReference reference={reference} variant="input" />
      ) : reference.source?.value && extension.options.canPreview?.() ? (
        <button
          type="button"
          className="agent-inline-preview"
          aria-label={`预览 ${reference.name || '参考素材'}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => extension.options.onPreview(reference)}
        >
          {reference.type === 'image' ? (
            <img src={reference.source.value} alt="" />
          ) : (
            <Glyph size={14} />
          )}
        </button>
      ) : reference.type === 'image' && reference.source?.value ? (
        <img src={reference.source.value} alt="" />
      ) : (
        <Glyph size={14} />
      )}
      {reference.type !== 'node' && (
        <span title={reference.name || reference.id}>{reference.name || reference.id}</span>
      )}
      {reference.status === 'uploading' && <small>上传中…</small>}
      {reference.status === 'error' && <small title={reference.error}>读取失败</small>}
      {editor.isEditable && (
        <button
          type="button"
          aria-label={`移除 ${typeName(reference.type)}`}
          title={`移除 ${reference.name || reference.id}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const position = getPos();
            if (typeof position === 'number')
              editor
                .chain()
                .focus()
                .deleteRange({ from: position, to: position + node.nodeSize })
                .run();
          }}
        >
          <X size={12} />
        </button>
      )}
    </NodeViewWrapper>
  );
}

const Reference = Node.create({
  name: 'agentReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addOptions: () => ({ onPreview: null, canPreview: () => false }),
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _previous, state) {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const keys = new Set();
          const transaction = state.tr;
          state.doc.descendants((node, position) => {
            if (node.type.name !== 'agentReference') return;
            const reference = node.attrs.reference;
            if (!isAgentReference(reference)) return;
            let key = reference.referenceKey;
            if (!key || keys.has(key)) {
              key = crypto.randomUUID();
              transaction.setNodeMarkup(position, undefined, {
                reference: { ...reference, referenceKey: key },
              });
            }
            keys.add(key);
          });
          return transaction.docChanged ? transaction.setMeta('addToHistory', false) : null;
        },
      }),
    ];
  },
  addAttributes() {
    return {
      reference: {
        default: null,
        parseHTML: (element) => {
          try {
            const value = JSON.parse(element.getAttribute('data-agent-reference'));
            return isAgentReference(value) ? value : null;
          } catch {
            return null;
          }
        },
        renderHTML: ({ reference }) => ({ 'data-agent-reference': JSON.stringify(reference) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'span[data-agent-reference]' }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'span',
    mergeAttributes(HTMLAttributes),
    node.attrs.reference?.name || '',
  ],
  renderText: ({ node }) => `{{ ${node.attrs.reference?.type}:${node.attrs.reference?.id} }}`,
  addNodeView: () => ReactNodeViewRenderer(ReferenceView, { as: 'span' }),
});

/** Same inline/selection model as the source ChatRichInput; no hidden textarea mirror. */
const RichAgentInput = forwardRef(function RichAgentInput(
  {
    parts = [{ type: 'text', text: '' }],
    onChange,
    onSubmit,
    onFiles,
    onPreview,
    searchSkills,
    mentionItems = [],
    mentionSource,
    onMentionOpen,
    onMentionLoadMore,
    mentionRefreshKey,
    placeholder = '告诉 Agent 你的创作想法，输入 / 选择 Skill',
    disabled = false,
    className = '',
  },
  ref,
) {
  const latest = useRef({
    onChange,
    onSubmit,
    onFiles,
    onPreview,
    searchSkills,
    mentionItems,
    mentionSource,
    onMentionOpen,
    onMentionLoadMore,
    placeholder,
  });
  latest.current = {
    onChange,
    onSubmit,
    onFiles,
    onPreview,
    searchSkills,
    mentionItems,
    mentionSource,
    onMentionOpen,
    onMentionLoadMore,
    placeholder,
  };
  const mentionReferencesKey = JSON.stringify(parts.filter(isAgentReference));
  const { build, suggestion, suggestionRef, selected, selectRow, hoverRow } = useAgentSuggestions({
    latest,
    mentionRefreshKey,
    mentionReferencesKey,
  });
  const [position, setPosition] = useState({ left: 0, top: 0, width: 340 });
  const inputRoot = useRef();
  const listRoot = useRef();
  const initial = useRef(agentContentToJSON(parts));

  const extensions = useMemo(() => {
    return [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: () => latest.current.placeholder }),
      Reference.configure({
        onPreview: (reference) => latest.current.onPreview?.(reference),
        canPreview: () => typeof latest.current.onPreview === 'function',
      }),
      Extension.create({
        name: 'agentSuggestions',
        addProseMirrorPlugins() {
          return [
            Suggestion({ editor: this.editor, ...build('/', 'skill') }),
            Suggestion({ editor: this.editor, ...build('@', 'reference') }),
          ];
        },
      }),
    ];
  }, [build]);

  const editor = useEditor({
    extensions,
    content: initial.current,
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': placeholder,
        'aria-multiline': 'true',
        'data-placeholder': placeholder,
        class: 'agent-rich-surface',
      },
      handleKeyDown: (view, event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          event.keyCode !== 229 &&
          !view.composing
        ) {
          if (
            suggestionRef.current ||
            view.state.plugins.some(
              (plugin) => plugin.key.startsWith('libtv-') && plugin.getState(view.state)?.active,
            )
          )
            return false;
          event.preventDefault();
          latest.current.onSubmit?.();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        if (event.clipboardData?.files?.length) {
          event.preventDefault();
          latest.current.onFiles?.(event.clipboardData.files);
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        if (event.dataTransfer?.files?.length) {
          event.preventDefault();
          latest.current.onFiles?.(event.dataTransfer.files);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => latest.current.onChange?.(agentContentFromJSON(editor.getJSON())),
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (!editor || signature(agentContentFromJSON(editor.getJSON())) === signature(parts)) return;
    let current = true;
    // React node views use flushSync internally. Synchronize controlled reloads
    // outside React's effect commit, and discard superseded renders.
    queueMicrotask(() => {
      if (!current || editor.isDestroyed) return;
      const selection = editor.state.selection;
      editor.commands.setContent(agentContentToJSON(parts), { emitUpdate: false });
      const max = editor.state.doc.content.size - 1;
      editor.commands.setTextSelection({
        from: Math.min(selection.from, max),
        to: Math.min(selection.to, max),
      });
    });
    return () => {
      current = false;
    };
  }, [editor, parts]);
  useEffect(() => {
    if (!suggestion) return;
    const place = () => {
      const rect = suggestion.clientRect?.() || inputRoot.current?.getBoundingClientRect();
      if (!rect) return;
      if (suggestion.grouped) {
        const width = Math.min(188, window.innerWidth - 16);
        const maxHeight = Math.min(288, Math.max(0, rect.top - 14)) || 96;
        const height = Math.min(listRoot.current?.scrollHeight || maxHeight, maxHeight);
        setPosition({
          width,
          maxHeight,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
          top: Math.max(8, rect.top - 6 - height),
        });
      } else {
        const width = Math.min(340, window.innerWidth - 24);
        const top = rect.bottom + 8;
        setPosition({
          width,
          left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
          top: top + 320 > innerHeight ? Math.max(12, rect.top - 328) : top,
        });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [suggestion]);
  useEffect(() => {
    if (!suggestion || !editor) return;
    const outside = (event) => {
      if (!inputRoot.current?.contains(event.target) && !listRoot.current?.contains(event.target))
        exitSuggestion(editor.view, suggestion.pluginKey);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
    };
  }, [suggestion, editor]);
  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus(),
      getParts: () => (editor ? agentContentFromJSON(editor.getJSON()) : parts),
      insertPlainText: (text) =>
        typeof text === 'string' &&
        editor
          ?.chain()
          .focus()
          .insertContent(
            text
              .split('\n')
              .flatMap((line, index) => [
                ...(index ? [{ type: 'hardBreak' }] : []),
                ...(line ? [{ type: 'text', text: line }] : []),
              ]),
          )
          .run(),
      insertReference: (reference) =>
        isAgentReference(reference) &&
        editor
          ?.chain()
          .focus()
          .insertContent([
            agentReferenceNode(reference, { fresh: true }),
            { type: 'text', text: ' ' },
          ])
          .run(),
      insertReferences: (references) =>
        editor
          ?.chain()
          .focus()
          .insertContent(
            references
              .filter(isAgentReference)
              .flatMap((reference) => [
                agentReferenceNode(reference, { fresh: true }),
                { type: 'text', text: ' ' },
              ]),
          )
          .run(),
      hasReference: (id) =>
        editor &&
        agentContentFromJSON(editor.getJSON()).some(
          (part) => isAgentReference(part) && part.id === id,
        ),
      upsertReference: (id, changes) => {
        if (!editor) return;
        const transaction = editor.state.tr;
        let changed = false;
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === 'agentReference' && node.attrs.reference?.id === id) {
            transaction.setNodeMarkup(position, undefined, {
              reference: { ...node.attrs.reference, ...changes },
            });
            changed = true;
          }
        });
        if (changed) editor.view.dispatch(transaction);
      },
      removeReference: (id) => {
        if (!editor) return;
        const positions = [];
        editor.state.doc.descendants((node, position) => {
          if (node.type.name === 'agentReference' && node.attrs.reference?.id === id)
            positions.push({ from: position, to: position + node.nodeSize });
        });
        const transaction = editor.state.tr;
        positions.reverse().forEach(({ from, to }) => transaction.delete(from, to));
        if (positions.length) editor.view.dispatch(transaction);
      },
      getEditor: () => editor,
    }),
    [editor, parts],
  );

  return (
    <div className={`agent-rich-input ${className}`} ref={inputRoot}>
      <EditorContent editor={editor} />
      {suggestion &&
        createPortal(
          <MentionSuggestionList
            {...{ suggestion, selected, listRoot, position }}
            onSelect={selectRow}
            onHover={hoverRow}
          />,
          document.body,
        )}
    </div>
  );
});

export default RichAgentInput;
