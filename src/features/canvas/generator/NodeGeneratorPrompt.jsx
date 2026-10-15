import { forwardRef, useCallback, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image, Film, Music, UserRound } from 'lucide-react';
import {
  NODE_PROMPT_MENTION_MIME,
  NODE_PROMPT_REFERENCE_MIME,
  promptReferenceFromDrop,
} from './node-prompt-model.js';
import {
  placeDropCaret,
  readPromptDOM,
  selectionOffsets,
  updatePromptMagicBadges,
} from './node-prompt-dom.js';
import { useNodePromptController } from './useNodePromptController.js';
import { useNodePromptMentions } from './useNodePromptMentions.js';
import { useNodePromptKeyboard } from './useNodePromptKeyboard.js';
import { useNodePromptSuggestions } from './useNodePromptSuggestions.js';
import { useNodePromptSwap } from './useNodePromptSwap.js';
import { useNodePromptAssetPicker } from './useNodePromptAssetPicker.js';
import NodePromptAssetPicker from './NodePromptAssetPicker.jsx';
import PromptSuggestionTip from './PromptSuggestionTip.jsx';
import CanvasReferenceMenu from './mentions-enhanced/CanvasReferenceMenu.jsx';
import MarkPromptBadge from './mark/MarkPromptBadge.jsx';
import {
  mapMarkPromptSelectionOffset,
  resolveMarkPromptToken,
  selectMarkPromptSuggestion,
} from './mark/mark-prompt-model.js';
import './node-generator-prompt.css';

const identity = (url) => url;
const EMPTY_REFERENCES = {};
const icons = { image: Image, video: Film, audio: Music, subject: UserRound };

const NodeGeneratorPrompt = forwardRef(function NodeGeneratorPrompt(
  {
    value = '',
    onChange,
    references = EMPTY_REFERENCES,
    readonly = false,
    disabled = false,
    placeholder = '描述你想要生成的画面内容，@引用素材',
    onHistoryBoundary,
    debounceMs = 150,
    asset = identity,
    sessionKey,
    mentionEnabled = true,
    suggestionAvailable = false,
    mentionListType = 'separate',
    mentionTypes,
    canvasMentions,
    portalTarget,
    className = '',
    magicList,
    onMagicSuggestionChange,
    onSelectionOffset,
  },
  ref,
) {
  const controller = useNodePromptController(
    {
      value,
      onChange,
      references,
      readonly,
      disabled,
      placeholder,
      onHistoryBoundary,
      debounceMs,
      asset,
      sessionKey,
      mentionEnabled,
      mentionListType,
      mentionTypes,
      magicList,
      onSelectionOffset,
    },
    ref,
  );
  const {
    editorRef,
    draft,
    composing,
    history,
    draggedBadge,
    empty,
    menu,
    blocked,
    copy,
    insert,
    change,
    cancelPending,
  } = controller;
  const [magicMenu, setMagicMenu] = useState(null);
  const closeMagic = useCallback(() => setMagicMenu(null), []);
  useLayoutEffect(() => {
    if (
      magicMenu &&
      (blocked ||
        composing.current ||
        magicMenu.sessionKey !== sessionKey ||
        !editorRef.current?.contains(magicMenu.anchor))
    )
      setMagicMenu(null);
  }, [magicMenu, blocked, composing, sessionKey, editorRef, magicList, value, references, asset]);
  const openMagic = (event, focus = false) => {
    const anchor = event.target.closest?.('[data-magic-id]');
    if (!anchor || !editorRef.current?.contains(anchor) || blocked || composing.current)
      return false;
    const part = resolveMarkPromptToken(
      anchor.dataset.promptToken,
      controller.latest.current.magicList,
    );
    if (!part || part.options.length <= 1) return false;
    event.preventDefault();
    event.stopPropagation();
    setMagicMenu({ anchor, sessionKey, focus });
    return true;
  };
  const magicPart =
    magicMenu && magicMenu.sessionKey === sessionKey
      ? resolveMarkPromptToken(magicMenu.anchor.dataset.promptToken, magicList)
      : null;
  const selectMagic = (id, index) => {
    if (
      blocked ||
      composing.current ||
      !magicMenu ||
      magicMenu?.sessionKey !== sessionKey ||
      !editorRef.current?.contains(magicMenu.anchor)
    )
      return;
    const next = selectMarkPromptSuggestion(
      draft.current,
      controller.latest.current.magicList,
      id,
      index,
    );
    if (next === null) return;
    const currentOffset =
      selectionOffsets(editorRef.current)?.start ?? controller.savedSelection.current?.start;
    const caret = mapMarkPromptSelectionOffset(draft.current, id, index, currentOffset);
    const part = resolveMarkPromptToken(
      `{{magic:${id}:${index}}}`,
      controller.latest.current.magicList,
    );
    const returnFocus = editorRef.current.ownerDocument.activeElement?.closest(
      '.node-generator-magic-menu',
    );
    updatePromptMagicBadges(editorRef.current, id, index, part.label);
    if (readPromptDOM(editorRef.current) !== next) controller.redraw(next, caret);
    if (caret !== null) controller.savedSelection.current = { start: caret, end: caret };
    change(next, caret, true);
    onMagicSuggestionChange?.(id, index);
    if (returnFocus) {
      const target = magicMenu.anchor.isConnected ? magicMenu.anchor : editorRef.current;
      target.focus({ preventScroll: true });
    }
    closeMagic();
  };
  const {
    menuRef,
    menuId,
    selected,
    options,
    openAtCaret,
    openSwap,
    selectReference,
    selectCanvasReference,
    closeMenu,
    enhanced,
  } = useNodePromptMentions(controller, {
    references,
    mentionListType,
    mentionTypes,
    canvasMentions,
  });
  useNodePromptSwap(controller, { onOpenSwap: openSwap });
  const assetPicker = useNodePromptAssetPicker(controller, {
    canvasMentions,
    sessionKey,
    closeMenu,
  });
  const suggestions = useNodePromptSuggestions(controller, {
    available: suggestionAvailable && mentionEnabled,
    references,
    mentionListType,
    mentionTypes,
    sessionKey,
  });
  useNodePromptKeyboard(controller, suggestions);
  const input = (event) => {
    if (controller.input(event)) {
      openAtCaret();
      suggestions.schedule();
    }
  };
  return (
    <>
      <div className={`node-generator-prompt-container nodrag nopan nowheel ${className}`}>
        <div
          ref={editorRef}
          className="node-generator-prompt"
          role="textbox"
          aria-label="提示词"
          aria-multiline="true"
          aria-placeholder={placeholder}
          aria-readonly={blocked}
          aria-disabled={disabled || undefined}
          aria-controls={menu ? menuId : undefined}
          aria-activedescendant={
            !enhanced && menu && selected >= 0 ? `${menuId}-${selected}` : undefined
          }
          data-empty={empty}
          data-placeholder={placeholder}
          data-readonly-allow={blocked ? 'true' : undefined}
          contentEditable={!blocked}
          suppressContentEditableWarning
          tabIndex={blocked ? -1 : 0}
          onInput={input}
          onCompositionStart={() => {
            if (blocked) return;
            suggestions.dismiss();
            composing.current = true;
            closeMenu();
            closeMagic();
            cancelPending();
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            if (blocked) return;
            input(event);
          }}
          onFocus={() => {
            history.current.coalesce = false;
            onHistoryBoundary?.('focus', draft.current);
          }}
          onBlur={() => {
            suggestions.dismiss();
            history.current.coalesce = false;
            onHistoryBoundary?.('blur', draft.current);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (!event.target.closest?.('[data-mention-suggest]')) suggestions.dismiss();
          }}
          onMouseDown={(event) => {
            if (event.target.closest?.('[data-mention-suggest]')) event.preventDefault();
            if (!blocked && event.target.closest?.('[data-magic-id]')) event.preventDefault();
          }}
          onClick={(event) => {
            if (openMagic(event)) return;
            const ghost = event.target.closest?.('[data-mention-suggest]');
            if (ghost) {
              event.preventDefault();
              event.stopPropagation();
              suggestions.accept(false, ghost);
            }
          }}
          onKeyDown={(event) => {
            if (
              ['Enter', ' ', 'ArrowDown'].includes(event.key) &&
              event.target.closest?.('[data-magic-id]')
            )
              openMagic(event, true);
          }}
          onPointerOver={(event) =>
            suggestions.hover(event.target.closest?.('[data-mention-suggest]'))
          }
          onPointerLeave={() => suggestions.hover(null)}
          onCopy={copy}
          onCut={(event) => {
            if (blocked) event.preventDefault();
            else copy(event, true);
          }}
          onPaste={(event) => {
            if (blocked) return void event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            event.preventDefault();
            const normalized = text.replace(/\r\n?/g, '\n');
            const start = selectionOffsets(editorRef.current)?.start ?? draft.current.length;
            if (insert(normalized))
              suggestions.schedule({
                mode: 'batch',
                region: { start, end: start + normalized.length },
              });
          }}
          onDragStart={(event) => {
            const badge = event.target.closest?.('[data-prompt-token]');
            if (!badge || !editorRef.current.contains(badge)) return;
            if (badge.dataset.magicId) return void event.preventDefault();
            if (blocked) return void event.preventDefault();
            draggedBadge.current = badge;
            event.dataTransfer.setData(NODE_PROMPT_MENTION_MIME, badge.dataset.promptToken);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={() => {
            draggedBadge.current = null;
          }}
          onDragOver={(event) => {
            if (blocked) return;
            const types = Array.from(event.dataTransfer.types);
            if (
              (mentionEnabled && types.includes(NODE_PROMPT_REFERENCE_MIME)) ||
              types.includes(NODE_PROMPT_MENTION_MIME)
            ) {
              event.preventDefault();
              event.dataTransfer.dropEffect = types.includes(NODE_PROMPT_MENTION_MIME)
                ? 'move'
                : 'copy';
              placeDropCaret(editorRef.current, event);
            }
          }}
          onDrop={(event) => {
            if (blocked) return;
            const types = Array.from(event.dataTransfer.types);
            const editor = editorRef.current;
            placeDropCaret(editor, event);
            if (types.includes(NODE_PROMPT_REFERENCE_MIME)) {
              event.preventDefault();
              if (!mentionEnabled) return;
              const option = promptReferenceFromDrop(
                event.dataTransfer.getData(NODE_PROMPT_REFERENCE_MIME),
                references,
              );
              if (option) insert(option.token);
            } else if (types.includes(NODE_PROMPT_MENTION_MIME)) {
              event.preventDefault();
              const badge = draggedBadge.current;
              const range = window.getSelection()?.rangeCount
                ? window.getSelection().getRangeAt(0)
                : null;
              if (
                !badge ||
                !editor.contains(badge) ||
                !range ||
                !editor.contains(range.startContainer) ||
                range.intersectsNode(badge)
              )
                return;
              range.insertNode(badge);
              range.setStartAfter(badge);
              range.collapse(true);
              const next = readPromptDOM(editor);
              change(next, selectionOffsets(editor)?.start, true);
              draggedBadge.current = null;
            } else if (!event.dataTransfer.files?.length && types.includes('text/plain')) {
              event.preventDefault();
              insert(event.dataTransfer.getData('text/plain').replace(/\r\n?/g, '\n'));
            }
          }}
        />
      </div>
      <PromptSuggestionTip presentation={suggestions.presentation} portalTarget={portalTarget} />
      {magicMenu && magicPart && !blocked && (
        <MarkPromptBadge
          anchor={magicMenu.anchor}
          part={magicPart}
          disabled={blocked || composing.current}
          focus={magicMenu.focus}
          onSelect={selectMagic}
          onClose={closeMagic}
        />
      )}
      <NodePromptAssetPicker picker={assetPicker} />
      {menu &&
        !blocked &&
        createPortal(
          enhanced ? (
            <CanvasReferenceMenu
              key={sessionKey}
              id={menuId}
              position={menu}
              source={canvasMentions.source}
              sessionKey={sessionKey}
              refreshKey={canvasMentions.refreshKey}
              hiddenKinds={
                menu.swapBadge
                  ? ['text', ...(canvasMentions.hiddenKinds || [])]
                  : canvasMentions.hiddenKinds
              }
              onSelect={selectCanvasReference}
              onClose={closeMenu}
              onOpenAssetPicker={
                menu.swapBadge
                  ? undefined
                  : assetPicker.available
                    ? assetPicker.show
                    : canvasMentions.onOpenAssetPicker
              }
              asset={asset}
              portalTarget={portalTarget}
            />
          ) : (
            <div
              ref={menuRef}
              id={menuId}
              role="listbox"
              aria-label="引用素材"
              className="node-generator-prompt-mentions"
              data-popover-safe="true"
              style={{ left: menu.left, top: menu.top, bottom: menu.bottom }}
            >
              {options.length ? (
                options.map((option, index) => {
                  const Glyph = icons[option.mediaType] ?? Image;
                  return (
                    <button
                      key={`${option.tokenType}-${option.nodeId}-${option.index}`}
                      id={`${menuId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected === index}
                      className={selected === index ? 'is-active' : ''}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectReference(option)}
                    >
                      {option.url && option.mediaType === 'image' ? (
                        <img src={asset(option.url)} alt="" draggable={false} />
                      ) : (
                        <span>
                          <Glyph size={14} />
                        </span>
                      )}
                      <span>{option.optionLabel}</span>
                    </button>
                  );
                })
              ) : (
                <div className="node-generator-prompt-mentions-empty">暂无引用素材</div>
              )}
            </div>
          ),
          portalTarget?.() ?? document.body,
        )}
    </>
  );
});
export default NodeGeneratorPrompt;
