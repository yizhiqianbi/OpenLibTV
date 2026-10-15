import { useEffect, useState } from 'react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { useStoryboardTable } from './useStoryboardTable.js';
import {
  STORYBOARD_FILTER_OPERATORS,
  storyboardFieldLabel,
  storyboardCellValue,
  storyboardRowKey,
} from './rows.js';
import { StoryboardDialogueDialog, StoryboardPromptDialog } from './StoryboardRowDialogs.jsx';
import { ScriptPromptComposeDialog } from './ScriptPromptComposeDialog.jsx';
import './storyboard.css';

function TextCell({ row, field, label, disabled, onCommit, onOpen }) {
  const value = storyboardCellValue(row, field.key) ?? '';
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    if (disabled || text === String(value)) return;
    const result = field.type === 'number' ? Number(text) : text;
    if (field.type === 'number' && (!text.trim() || !Number.isFinite(result))) return;
    onCommit(result);
  };
  if (field.key === 'shotNumber') return <span>{row.shotNumber}</span>;
  if (field.type === 'dialogue' || field.type === 'prompt')
    return (
      <button type="button" aria-label={`${label} ${row.shotNumber}`} onClick={onOpen}>
        {field.type === 'dialogue'
          ? (Array.isArray(value) ? value : []).map((line) => line.text).join('\n') ||
            '添加对白 / 旁白'
          : `图片 ${row.imagePromptState || 'none'} · 视频 ${row.videoPromptState || 'none'}`}
      </button>
    );
  if (field.type === 'image') {
    const url = typeof value === 'string' ? value : value?.url;
    return url ? (
      <img className="cv-storyboard-reference" src={url} alt={label} loading="lazy" />
    ) : (
      <span>—</span>
    );
  }
  return (
    <textarea
      aria-label={`${label} ${row.shotNumber}`}
      rows={field.type === 'number' ? 1 : 2}
      value={text}
      readOnly={disabled}
      inputMode={field.type === 'number' ? 'decimal' : undefined}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229
        ) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function FieldsDialog({ controller, onClose }) {
  const visible = controller.tableConfig.columnVisibility || {};
  const change = (columnVisibility) =>
    controller.setTableConfig({ ...controller.tableConfig, columnVisibility });
  return (
    <EditorDialog title="字段显示" onClose={onClose}>
      <div className="cv-storyboard-fields">
        <div className="cv-storyboard-actions">
          <button
            type="button"
            disabled={controller.disabled}
            onClick={() =>
              change(Object.fromEntries(controller.fields.map((field) => [field.key, true])))
            }
          >
            显示全部
          </button>
          <button
            type="button"
            disabled={controller.disabled}
            onClick={() =>
              change(
                Object.fromEntries(
                  controller.fields.map((field) => [field.key, field.key === 'shotNumber']),
                ),
              )
            }
          >
            隐藏全部
          </button>
        </div>
        {controller.fields.map((field) => (
          <label key={field.key}>
            <input
              type="checkbox"
              checked={visible[field.key] !== false}
              disabled={controller.disabled}
              onChange={() => change({ ...visible, [field.key]: visible[field.key] === false })}
            />
            {storyboardFieldLabel(field, controller.data.shotColumns)}
          </label>
        ))}
      </div>
    </EditorDialog>
  );
}
function FiltersDialog({ controller, onClose }) {
  const [field, setField] = useState('plotDescription');
  const [operator, setOperator] = useState('contains');
  const [value, setValue] = useState('');
  const filters = controller.tableConfig.columnFilters || [];
  const change = (columnFilters) =>
    controller.setTableConfig({ ...controller.tableConfig, columnFilters });
  const add = async () => {
    if (!value.trim() || controller.disabled) return;
    if (await change([...filters, { id: field, value: { operator, value: value.trim() } }]))
      setValue('');
  };
  return (
    <EditorDialog title="筛选条件" onClose={onClose}>
      <div className="cv-storyboard-filters">
        {filters.map((filter, index) => (
          <div key={index}>
            <span>
              {controller.fields.find((item) => item.key === filter.id)?.label || filter.id}{' '}
              {
                STORYBOARD_FILTER_OPERATORS.find((item) => item.value === filter.value?.operator)
                  ?.label
              }{' '}
              {String(filter.value?.value ?? filter.value ?? '')}
            </span>
            <button
              type="button"
              disabled={controller.disabled}
              aria-label={`删除筛选 ${index + 1}`}
              onClick={() => change(filters.filter((_, position) => position !== index))}
            >
              删除
            </button>
          </div>
        ))}
        <label>
          字段
          <select
            value={field}
            disabled={controller.disabled}
            onChange={(event) => setField(event.target.value)}
          >
            {controller.fields.map((item) => (
              <option value={item.key} key={item.key}>
                {storyboardFieldLabel(item, controller.data.shotColumns)}
              </option>
            ))}
          </select>
        </label>
        <label>
          条件
          <select
            value={operator}
            disabled={controller.disabled}
            onChange={(event) => setOperator(event.target.value)}
          >
            {STORYBOARD_FILTER_OPERATORS.map((item) => (
              <option value={item.value} key={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          筛选值
          <input
            value={value}
            disabled={controller.disabled}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                add();
              }
            }}
          />
        </label>
        <div className="cv-storyboard-actions">
          <button type="button" disabled={controller.disabled || !value.trim()} onClick={add}>
            添加筛选
          </button>
          <button
            type="button"
            disabled={controller.disabled || !filters.length}
            onClick={() => change([])}
          >
            清除全部筛选
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}

function TableView({ controller, onDelete, onOpen, emphasizePromptColumn }) {
  const fields = controller.fields.filter(
    (field) => controller.tableConfig.columnVisibility?.[field.key] !== false,
  );
  const [dragKey, setDragKey] = useState(null);
  return (
    <div className="cv-storyboard-table-scroll">
      <table className="cv-storyboard-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="选择全部镜头"
                checked={
                  controller.rows.length > 0 &&
                  controller.selected.size ===
                    controller.rows.filter((row) => row.hiddenUuid).length
                }
                onChange={controller.toggleAll}
              />
            </th>
            {fields.map((field) => (
              <th
                key={field.key}
                className={
                  emphasizePromptColumn && field.key === 'promptEntry'
                    ? 'cv-script-prompt-emphasis'
                    : undefined
                }
              >
                {storyboardFieldLabel(field, controller.data.shotColumns)}
              </th>
            ))}
            {!controller.disabled && <th>镜头操作</th>}
          </tr>
        </thead>
        <tbody>
          {controller.visibleRows.map((row) => {
            const index = controller.rows.indexOf(row);
            const key = storyboardRowKey(row, index);
            return (
              <tr
                key={key}
                onDragOver={(event) => {
                  if (dragKey && !controller.disabled) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragKey && !controller.disabled) controller.move(dragKey, key);
                  setDragKey(null);
                }}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`选择镜头 ${row.shotNumber}`}
                    checked={controller.selected.has(row.hiddenUuid)}
                    disabled={!row.hiddenUuid}
                    onChange={() => controller.toggle(row.hiddenUuid)}
                  />
                </td>
                {fields.map((field) => (
                  <td
                    key={field.key}
                    className={
                      emphasizePromptColumn && field.key === 'promptEntry'
                        ? 'cv-script-prompt-emphasis'
                        : undefined
                    }
                  >
                    <TextCell
                      {...{ row, field }}
                      label={storyboardFieldLabel(field, controller.data.shotColumns)}
                      disabled={controller.disabled}
                      onCommit={(value) => controller.edit(key, field.key, value)}
                      onOpen={() => onOpen({ type: field.type, key })}
                    />
                  </td>
                ))}
                {!controller.disabled && (
                  <td>
                    <div className="cv-storyboard-row-actions">
                      <button
                        type="button"
                        aria-label={`拖动镜头 ${row.shotNumber}`}
                        draggable
                        onDragStart={(event) => {
                          setDragKey(key);
                          event.dataTransfer?.setData('text/plain', key);
                        }}
                        onDragEnd={() => setDragKey(null)}
                      >
                        ↕
                      </button>
                      <button
                        type="button"
                        aria-label={`上移镜头 ${row.shotNumber}`}
                        disabled={index === 0}
                        onClick={() =>
                          controller.move(
                            key,
                            storyboardRowKey(controller.rows[index - 1], index - 1),
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`下移镜头 ${row.shotNumber}`}
                        disabled={index === controller.rows.length - 1}
                        onClick={() =>
                          controller.move(
                            key,
                            storyboardRowKey(controller.rows[index + 1], index + 1),
                          )
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`在镜头 ${row.shotNumber} 后插入`}
                        onClick={() => controller.insert(key)}
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        aria-label={`删除镜头 ${row.shotNumber}`}
                        onClick={() => onDelete({ key, number: row.shotNumber })}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!controller.visibleRows.length && <p role="status">没有符合筛选条件的镜头</p>}
    </div>
  );
}

/** Opt-in script table. No task, fee, asset upload or group mutation is submitted here. */
export function StoryboardTableView({
  controller,
  identity = '',
  readonly,
  ready,
  hideHeader = false,
  hideViewSwitcher = false,
  footer,
  onViewChange,
  emphasizePromptColumn = false,
  promptCompose,
  mediaHistory,
}) {
  const [dialog, setDialog] = useState(null);
  useEffect(() => setDialog(null), [identity, readonly, ready]);
  const mode = controller.data.viewMode || 'table';
  const activeRow = dialog?.key
    ? controller.rows.find((row, index) => storyboardRowKey(row, index) === dialog.key)
    : null;
  return (
    <section className="cv-storyboard-script">
      {!hideHeader && (
        <div className="cv-storyboard-script-header">
          <strong>{controller.data.title || controller.data.name || '分镜脚本'}</strong>
          <span>{controller.rows.length} 个镜头</span>
        </div>
      )}
      <div className="cv-storyboard-actions">
        {!hideViewSwitcher && (
          <>
            <button
              type="button"
              disabled={controller.disabled}
              aria-pressed={mode === 'table'}
              onClick={() => (onViewChange || controller.setView)('table')}
            >
              表格
            </button>
            <button
              type="button"
              disabled={controller.disabled}
              aria-pressed={mode === (controller.data.type === 'script-v2' ? 'asset' : 'creative')}
              onClick={() =>
                (onViewChange || controller.setView)(
                  controller.data.type === 'script-v2' ? 'asset' : 'creative',
                )
              }
            >
              {controller.data.type === 'script-v2' ? '资产视图' : '创意视图'}
            </button>
          </>
        )}
        <button
          type="button"
          disabled={controller.disabled}
          onClick={() => setDialog({ type: 'fields' })}
        >
          字段
        </button>
        <button
          type="button"
          disabled={controller.disabled}
          onClick={() => setDialog({ type: 'filters' })}
        >
          筛选
        </button>
        <span>已选 {controller.selected.size}</span>
      </div>
      {controller.error && (
        <div role="alert" className="cv-storyboard-error">
          {controller.error}
          <button type="button" disabled={controller.disabled} onClick={controller.retry}>
            重试保存
          </button>
        </div>
      )}
      {controller.pending && <p role="status">正在保存分镜修改…</p>}
      {mode === 'creative' ? (
        <div className="cv-storyboard-creative">
          {controller.visibleRows.map((row) => (
            <article key={storyboardRowKey(row, controller.rows.indexOf(row))}>
              <label>
                <input
                  type="checkbox"
                  disabled={!row.hiddenUuid}
                  checked={controller.selected.has(row.hiddenUuid)}
                  onChange={() => controller.toggle(row.hiddenUuid)}
                />
                镜头 {row.shotNumber}
              </label>
              <p>{row.plotDescription}</p>
              <small>{row.durationSeconds ?? 5}s</small>
            </article>
          ))}
        </div>
      ) : (
        <TableView
          controller={controller}
          onDelete={(row) => setDialog({ type: 'delete', ...row })}
          onOpen={setDialog}
          emphasizePromptColumn={emphasizePromptColumn}
        />
      )}
      <button type="button" disabled={controller.disabled} onClick={() => controller.insert()}>
        添加镜头
      </button>
      {footer}
      {dialog?.type === 'dialogue' && activeRow && (
        <StoryboardDialogueDialog
          key={activeRow.id}
          controller={controller}
          row={activeRow}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'prompt' &&
        activeRow &&
        (promptCompose ? (
          <ScriptPromptComposeDialog
            key={activeRow.id}
            kind="single"
            rowId={activeRow.id}
            rows={controller.rows}
            compose={promptCompose}
            mediaHistory={mediaHistory}
            readonly={readonly}
            onClose={() => setDialog(null)}
          />
        ) : (
          <StoryboardPromptDialog
            key={activeRow.id}
            controller={controller}
            row={activeRow}
            onClose={() => setDialog(null)}
          />
        ))}
      {dialog?.type === 'fields' && (
        <FieldsDialog controller={controller} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'filters' && (
        <FiltersDialog controller={controller} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'delete' && (
        <EditorDialog title={`删除镜头 ${dialog.number}？`} onClose={() => setDialog(null)}>
          <div className="cv-storyboard-confirm">
            <p>删除后将重新排列镜号。</p>
            <div className="cv-storyboard-actions">
              <button type="button" onClick={() => setDialog(null)}>
                取消
              </button>
              <button
                type="button"
                disabled={controller.disabled}
                onClick={async () => {
                  if (await controller.remove(dialog.key)) setDialog(null);
                }}
              >
                删除
              </button>
            </div>
          </div>
        </EditorDialog>
      )}
    </section>
  );
}

export function StoryboardTable(props) {
  const controller = useStoryboardTable(props);
  return (
    <StoryboardTableView
      controller={controller}
      identity={JSON.stringify([props.documentKey, props.node?.id])}
      {...props}
    />
  );
}
