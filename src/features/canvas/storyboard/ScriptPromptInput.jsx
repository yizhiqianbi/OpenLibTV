import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';
import {
  deleteScriptPromptChipBeforeCaret,
  extractScriptPromptPaste,
  findScriptPromptTrigger,
  focusScriptPromptRange,
  insertScriptPromptLineBreak,
  insertScriptPromptMention,
  insertScriptPromptText,
  normalizeScriptPromptDOM,
  readScriptPromptDOM,
  renderScriptPromptDOM,
} from './script-prompt-input-dom.js';
import './script-prompt-input.css';

const EMPTY = [];
const roles = [
  ['characters', 'character', '角色'],
  ['scenes', 'scene', '场景'],
  ['props', 'prop', '道具'],
];

function ScriptAssetMentionThumbnail({ option, portal }) {
  const anchor = useRef(null);
  const timer = useRef(null);
  const [failed, setFailed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const source = option.thumbnailUrl;
  const available = source && failed !== source;
  const previewOpen = !!preview;
  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const close = useCallback(() => {
    cancel();
    setPreview(null);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  useLayoutEffect(() => {
    if (!previewOpen || !anchor.current || !available) return;
    const window = anchor.current.ownerDocument.defaultView;
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(4, Math.min(rect.left + rect.width / 2 - 84, window.innerWidth - 172));
      setPreview(
        rect.top >= 176
          ? { bottom: window.innerHeight - rect.top + 8, left }
          : { top: rect.bottom + 8, left },
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [available, previewOpen]);
  const open = () => {
    if (!available) return;
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      if (anchor.current?.isConnected) setPreview({ visibility: 'hidden' });
    }, 200);
  };
  return (
    <>
      <span
        ref={anchor}
        className="script-prompt-mention-icon"
        onMouseEnter={open}
        onMouseLeave={close}
      >
        <img
          src={available ? source : `/assets/icons/asset-${option.role}.svg`}
          alt=""
          draggable="false"
          className={available ? undefined : 'is-role-icon'}
          onError={() => {
            if (available) {
              setFailed(source);
              close();
            }
          }}
        />
      </span>
      {preview &&
        available &&
        createPortal(
          <div
            className="script-prompt-resource-preview"
            data-testid="script-prompt-resource-preview"
            style={preview}
          >
            <div className="script-prompt-resource-preview-frame">
              {loaded !== source && <div className="script-prompt-resource-preview-loading" />}
              <img
                src={source}
                alt=""
                draggable="false"
                onLoad={() => setLoaded(source)}
                onError={() => {
                  setFailed(source);
                  close();
                }}
                style={{ opacity: loaded === source ? 1 : 0 }}
              />
            </div>
          </div>,
          portal,
        )}
    </>
  );
}

function ScriptAssetMentionMenu({ editor, trigger, options, id, onSelect, onClose }) {
  const root = useRef(null);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState(null);
  const portal = editor.closest('[role="dialog"]') || editor.ownerDocument.body;
  useLayoutEffect(() => {
    const document = editor.ownerDocument;
    const window = document.defaultView;
    const update = () => {
      if (!editor.contains(trigger.node)) return onClose();
      const rect = trigger.anchor.getBoundingClientRect();
      const left = Math.max(4, Math.min(rect.left, window.innerWidth - 244));
      setPosition(
        window.innerHeight - rect.bottom - 4 >= 220
          ? { top: rect.bottom + 4, left }
          : { bottom: window.innerHeight - rect.top + 4, left },
      );
    };
    update();
    const outside = (event) => {
      if (!root.current?.contains(event.target) && !editor.contains(event.target)) onClose();
    };
    const keyboard = (event) => {
      if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        setActive((previous) =>
          event.key === 'ArrowDown'
            ? Math.min(previous + 1, options.length - 1)
            : Math.max(-1, previous - 1),
        );
      } else if (event.key === 'Enter' && active >= 0 && options[active]) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(options[active]);
      } else if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const option = options[Number(event.key) - 1];
        if (option) onSelect(option);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard, true);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, editor, onClose, onSelect, options, trigger]);
  useLayoutEffect(() => {
    if (!root.current) return;
    return registerDialogChildDismissal(root.current, onClose, editor);
  }, [editor, onClose]);
  useLayoutEffect(() => {
    if (active >= options.length) setActive(options.length - 1);
    root.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, options.length]);
  return createPortal(
    <div
      ref={root}
      id={id}
      role="listbox"
      aria-label="引用资产"
      className="script-prompt-mention-menu"
      data-script-mention-dropdown="true"
      data-popover-safe="true"
      style={position ?? { visibility: 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {options.length ? (
        options.map((option, index) => (
          <button
            key={`${option.role}-${option.id}-${index}`}
            type="button"
            role="option"
            aria-selected={index === active}
            data-index={index}
            className={index === active ? 'is-active' : ''}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(option);
            }}
            onClick={(event) => {
              if (event.detail === 0) onSelect(option);
            }}
          >
            <ScriptAssetMentionThumbnail option={option} portal={portal} />
            <span>
              {option.label} · {option.name}
            </span>
          </button>
        ))
      ) : (
        <div className="script-prompt-mention-empty">暂无可引用资产，请连入后操作</div>
      )}
    </div>,
    portal,
  );
}

/** ScriptV2 oB/oH: no draft timer, persistence, generation, or node token protocol. */
const ScriptPromptInput = forwardRef(function ScriptPromptInput(
  {
    value = '',
    onChange,
    assets,
    entityRefs,
    readonly = false,
    ariaLabel = '提示词',
    onBlur,
    suppressChipSectionLabels = EMPTY,
    placeholder,
    onAssetJump,
    assetRoleFilter,
    readonlySelectionEnabled = true,
    minHeightPx = 20,
    maxHeightPx,
    showEntityRefOverview = false,
    showInputHint = false,
  },
  forwardedRef,
) {
  const editor = useRef(null);
  const composing = useRef(false);
  const latest = useRef(null);
  const insertion = useRef(0);
  const [editing, setEditing] = useState(false);
  const [trigger, setTrigger] = useState(null);
  const menuId = useId();
  latest.current = { value, onChange, readonly, onBlur };
  const options = useMemo(
    () =>
      roles.flatMap(([key, role, label]) =>
        (Array.isArray(assets?.[key]) ? assets[key] : []).flatMap((item) =>
          item &&
          typeof item.id === 'string' &&
          item.id.trim() &&
          typeof item.name === 'string' &&
          item.name.trim() &&
          (!assetRoleFilter || assetRoleFilter.includes(item.role || role))
            ? [{ ...item, role: item.role || role, label, name: item.name }]
            : [],
        ),
      ),
    [assets, assetRoleFilter],
  );
  const publish = useCallback(() => {
    const current = latest.current;
    const text = readScriptPromptDOM(editor.current);
    if (!current.readonly && text !== current.value) current.onChange?.(text);
    return text;
  }, []);
  const closeMenu = useCallback(() => setTrigger(null), []);
  const detect = useCallback(() => {
    if (latest.current.readonly || composing.current || !editor.current) return;
    const next = findScriptPromptTrigger(editor.current);
    if (next) setTrigger(next);
    else
      setTrigger((previous) =>
        previous &&
        editor.current.contains(previous.node) &&
        ['@', '＠'].includes(previous.node.textContent?.[previous.offset])
          ? previous
          : null,
      );
  }, []);
  const select = useCallback(
    (option) => {
      if (latest.current.readonly || composing.current || !editor.current || !trigger) return;
      if (
        insertScriptPromptMention(
          editor.current,
          trigger,
          option,
          `script-mention-${++insertion.current}`,
        )
      )
        publish();
      closeMenu();
    },
    [closeMenu, publish, trigger],
  );
  useLayoutEffect(() => {
    if (readonly) {
      composing.current = false;
      setEditing(false);
      closeMenu();
    }
    if (editor.current && (!editing || readonly))
      renderScriptPromptDOM(editor.current, {
        value,
        assets,
        entityRefs,
        readonly,
        suppressChipSectionLabels,
      });
  }, [assets, closeMenu, editing, entityRefs, readonly, suppressChipSectionLabels, value]);
  useImperativeHandle(
    forwardedRef,
    () => ({
      getValue: () => readScriptPromptDOM(editor.current),
      flush: () => {
        if (editor.current) normalizeScriptPromptDOM(editor.current);
        return publish();
      },
      focus: () => editor.current?.focus({ preventScroll: true }),
    }),
    [publish],
  );
  const blur = () => {
    if (!editor.current || latest.current.readonly) return;
    normalizeScriptPromptDOM(editor.current);
    const text = publish();
    setEditing(false);
    closeMenu();
    latest.current.onBlur?.(text);
  };
  const paste = (event, transfer) => {
    if (latest.current.readonly || !editor.current) return;
    event.preventDefault();
    const text = extractScriptPromptPaste(transfer, editor.current.ownerDocument);
    if (text && insertScriptPromptText(editor.current, text)) {
      detect();
      publish();
    }
  };
  return (
    <div className="script-prompt-input">
      {showEntityRefOverview && entityRefs?.length > 0 && (
        <div className="script-prompt-ref-overview">
          {entityRefs.map((ref, index) => {
            const asset = roles
              .flatMap(([key]) => (Array.isArray(assets?.[key]) ? assets[key] : []))
              .find((option) => option.id === ref.assetId);
            const name = asset?.name ?? ref.text;
            const canJump = !!asset && !!onAssetJump;
            return (
              <button
                type="button"
                key={`${ref.assetId}-${index}`}
                disabled={!canJump}
                title={canJump ? `跳转到资产：${name}` : name}
                onClick={(event) => {
                  event.stopPropagation();
                  if (canJump) onAssetJump(asset.id);
                }}
              >
                <span>{name}</span>
                {['scene', 'prop'].includes(asset?.role) && (
                  <span className="script-prompt-ref-role">
                    {asset.role === 'scene' ? '场景' : '道具'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div
        ref={editor}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        aria-readonly={readonly}
        aria-controls={trigger ? menuId : undefined}
        aria-expanded={!!trigger}
        contentEditable={!readonly}
        suppressContentEditableWarning
        tabIndex={0}
        className="script-prompt-editor"
        data-role="entity-ref-editor"
        data-placeholder={placeholder}
        data-prevent-global-shortcut="true"
        data-readonly-selection-enabled={readonly && readonlySelectionEnabled ? 'true' : undefined}
        style={{
          minHeight: minHeightPx,
          maxHeight: maxHeightPx,
          userSelect: readonly && readonlySelectionEnabled ? 'text' : undefined,
        }}
        onFocus={() => {
          if (!readonly) {
            setEditing(true);
          }
        }}
        onBlur={blur}
        onInput={() => {
          if (!readonly && !composing.current) {
            detect();
            publish();
          }
        }}
        onPaste={(event) => paste(event, event.clipboardData)}
        onDrop={(event) => {
          if (readonly || !editor.current) return;
          const text = extractScriptPromptPaste(event.dataTransfer, editor.current.ownerDocument);
          if (!text) return;
          event.preventDefault();
          const document = editor.current.ownerDocument;
          const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
          if (range && editor.current.contains(range.startContainer))
            focusScriptPromptRange(editor.current, range);
          if (insertScriptPromptText(editor.current, text)) {
            detect();
            publish();
          }
        }}
        onKeyDown={(event) => {
          if (readonly || composing.current || event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && trigger) {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
          } else if (event.key === 'Enter') {
            if (trigger && options.length) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            if (insertScriptPromptLineBreak(editor.current)) {
              closeMenu();
              publish();
            }
          } else if (
            event.key === 'Backspace' &&
            deleteScriptPromptChipBeforeCaret(editor.current)
          ) {
            event.preventDefault();
            closeMenu();
            publish();
          }
        }}
        onCompositionStart={() => {
          composing.current = true;
          closeMenu();
        }}
        onCompositionEnd={() => {
          composing.current = false;
          if (!readonly) {
            detect();
            publish();
          }
        }}
        onClick={(event) => {
          const chip = event.target.closest?.('[data-at-mention]');
          if (!chip || !editor.current.contains(chip)) return;
          if (readonly && readonlySelectionEnabled && !onAssetJump) return;
          event.preventDefault();
          event.stopPropagation();
          if (chip.dataset.assetId && onAssetJump) {
            if (!readonly) blur();
            onAssetJump(chip.dataset.assetId);
          }
        }}
      />
      {trigger && !readonly && editor.current && (
        <ScriptAssetMentionMenu
          editor={editor.current}
          trigger={trigger}
          options={options}
          id={menuId}
          onSelect={select}
          onClose={closeMenu}
        />
      )}
      {showInputHint && <div className="script-prompt-input-hint">输入@选择资产；失焦自动保存</div>}
    </div>
  );
});

export default ScriptPromptInput;
