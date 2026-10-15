import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { fingerprintScriptPromptBundle, getScriptPromptBundle } from './prompt-compose-model.js';
import { scriptPromptSelection, scriptPromptsGenerating } from './workflow-model.js';
import ScriptPromptInput from './ScriptPromptInput.jsx';
import { ScriptMediaHistoryMenu } from './ScriptMediaHistoryMenu.jsx';
import { scriptPromptFailureInfo } from './script-media-history-model.js';
import { writeTextToClipboard } from '../../../services/clipboard-text.js';
import './script-prompt-compose.css';

const modes = [
  {
    value: 'smart',
    label: '智能合成',
    hint: '由 AI 模型基于剧本 / 分镜 / 资产等信息生成结构化的完整提示词，效果更自然，消耗积分。',
  },
  {
    value: 'concat',
    label: '自动拼接',
    hint: '本地把分镜的角色 · 场景 · 道具 · 画面 · 光影 · 运镜 · 对白等字段按模板拼接为提示词，即时完成、不消耗积分。',
  },
];
const draftMessage = {
  idle: '自动保存',
  dirty: '自动保存',
  saving: '自动保存',
  saved: '自动保存',
  conflict: '内容已在其他位置更新，请重新打开后编辑',
  error: '保存失败，请重试',
};
const promptStateLabel = {
  synced: '已生成',
  stale: '检测到您修改了脚本信息，需要检查最终提示词是否需要重新合成',
  generating: '合成中',
  none: '未合成',
};

function usePromptDraft({ rowId, track, bundle, compose }) {
  const fingerprint = fingerprintScriptPromptBundle(bundle);
  const owner = useRef(null);
  const lifetime = useRef({ mounted: true });
  const working = useRef({
    text: bundle.text,
    base: fingerprint,
    dirty: false,
    conflict: false,
    revision: 0,
  });
  const timer = useRef(null);
  const inFlight = useRef(null);
  const [view, setView] = useState({ text: bundle.text, status: 'idle' });
  owner.current = { rowId, track, fingerprint, compose };
  const show = useCallback((status) => {
    if (lifetime.current.mounted) setView({ text: working.current.text, status });
  }, []);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (inFlight.current) return inFlight.current;
    if (!working.current.dirty) return Promise.resolve({ status: 'saved' });
    const captured = owner.current;
    const job = (async () => {
      while (working.current.dirty) {
        if (working.current.conflict) return { status: 'conflict' };
        if (owner.current.compose.identity !== captured.compose.identity)
          return { status: 'missing' };
        const revision = working.current.revision;
        show('saving');
        let result;
        try {
          result = await captured.compose.commitPrompt({
            rowId: captured.rowId,
            track: captured.track,
            text: working.current.text,
            expectedFingerprint: working.current.base,
            identity: captured.compose.identity,
          });
        } catch {
          result = { status: 'error' };
        }
        if (result.status !== 'saved') {
          working.current.conflict = result.status === 'conflict';
          show(working.current.conflict ? 'conflict' : 'error');
          return result;
        }
        working.current.base = result.contentFingerprint;
        working.current.conflict = false;
        if (working.current.revision === revision) {
          working.current.dirty = false;
          show('saved');
        } else show('dirty');
      }
      return { status: 'saved' };
    })();
    inFlight.current = job;
    job.finally(() => {
      if (inFlight.current === job) inFlight.current = null;
    });
    return job;
  }, [show]);
  useEffect(() => {
    if (!working.current.dirty) {
      working.current.text = bundle.text;
      working.current.base = fingerprint;
      setView({ text: bundle.text, status: 'idle' });
    }
  }, [bundle.text, fingerprint]);
  const registerPromptDraft = compose.registerPromptDraft;
  const identity = compose.identity;
  useEffect(
    () =>
      registerPromptDraft?.(
        `${rowId}:${track}`,
        () => ({
          rowId,
          track,
          value: working.current.text,
          baseFingerprint: working.current.base,
          dirty: working.current.dirty && !working.current.conflict,
        }),
        identity,
      ),
    [registerPromptDraft, identity, rowId, track],
  );
  const registerDraftFlusher = compose.registerDraftFlusher;
  useEffect(
    () => registerDraftFlusher(`${rowId}:${track}`, flush),
    [registerDraftFlusher, rowId, track, flush],
  );
  useEffect(() => {
    const currentLifetime = lifetime.current;
    const currentWork = working.current;
    currentLifetime.mounted = true;
    return () => {
      currentLifetime.mounted = false;
      clearTimeout(timer.current);
      if (currentWork.dirty && !currentWork.conflict) void flush();
    };
  }, [flush]);
  const change = (text) => {
    if (!working.current.dirty || working.current.conflict)
      working.current.base = owner.current.fingerprint;
    working.current.conflict = false;
    working.current.text = text;
    working.current.dirty = true;
    working.current.revision += 1;
    show('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };
  return { ...view, change, flush };
}

function PromptTrack({ row, track, assets, compose, PromptInput }) {
  const bundle = getScriptPromptBundle(row, track);
  const draft = usePromptDraft({ rowId: row.id, track, bundle, compose });
  const label = track === 'image' ? '分镜提示词' : '视频提示词';
  const state = row[track === 'image' ? 'imagePromptState' : 'videoPromptState'] || 'none';
  return (
    <section className="cv-script-compose-track">
      <div className="cv-script-compose-track-heading">
        <strong>{label}</strong>
        {state !== 'none' && (
          <span className={`cv-script-compose-state cv-script-compose-state-${state}`}>
            {state === 'stale'
              ? promptStateLabel.stale
              : `${track === 'image' ? '分镜图提示词' : '视频运动提示词'}·${promptStateLabel[state] || state}`}
          </span>
        )}
        <span className="cv-script-compose-autosave" role="status">
          {draftMessage[draft.status]}
        </span>
      </div>
      <PromptInput
        minHeightPx={180}
        maxHeightPx={368}
        value={draft.text}
        onChange={draft.change}
        assets={assets}
        entityRefs={bundle.entityRefs}
        readonly={compose.disabled || compose.pending}
        ariaLabel={label}
        onBlur={(text) => {
          if (typeof text === 'string' && text !== draft.text) draft.change(text);
          void draft.flush();
        }}
      />
    </section>
  );
}

function ComposeMode({ name, mode, onChange, disabled }) {
  return (
    <fieldset className="cv-script-compose-modes" aria-label="合成方式" disabled={disabled}>
      {modes.map((item) => (
        <label key={item.value} title={item.hint}>
          <input
            type="radio"
            name={name}
            value={item.value}
            checked={mode === item.value}
            onChange={() => onChange(item.value)}
          />
          {item.label}
        </label>
      ))}
    </fieldset>
  );
}
function PromptModel({ modelOptions, modelId, onModelChange, disabled }) {
  return (
    <label className="cv-script-compose-model">
      模型
      <select
        aria-label="提示词合成模型"
        value={modelId || ''}
        disabled={disabled || !modelOptions.length}
        onChange={(event) => onModelChange?.(event.target.value)}
      >
        {!modelOptions.length && <option value="">模型配置尚未加载</option>}
        {modelOptions.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name || model.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function PromptTaskInfo({ taskInfo, generating, identity }) {
  const failure = scriptPromptFailureInfo(taskInfo, generating);
  const taskId = failure?.taskId;
  const [copyError, setCopyError] = useState('');
  const operation = useRef(null);
  useEffect(() => {
    setCopyError('');
    const controller = new AbortController();
    operation.current = controller;
    return () => controller.abort();
  }, [taskId, identity]);
  const copy = async () => {
    const controller = operation.current;
    if (!taskId || controller?.signal.aborted) return;
    setCopyError('');
    try {
      await writeTextToClipboard(taskId, { signal: controller.signal });
    } catch (error) {
      if (!controller.signal.aborted && error.name !== 'AbortError')
        setCopyError('任务编号复制失败，请重试');
    }
  };
  if (!failure || (!taskId && !failure.failedReason)) return null;
  return (
    <div className="cv-script-compose-task-info">
      {taskId && (
        <button type="button" onClick={copy} title="点击复制任务 ID">
          任务 #{taskId}
        </button>
      )}
      {failure.failedReason && <span title={failure.failedReason}>{failure.failedReason}</span>}
      {copyError && <span role="alert">{copyError}</span>}
    </div>
  );
}

/** Mount this shared confirmation once beside the node, above the main prompt dialog. */
export function ScriptPromptComposeConfirmation({ compose }) {
  const request = compose.confirmRequest;
  if (!request) return null;
  return createPortal(
    <div className="cv-script-compose-portal cv-script-compose-confirm">
      <EditorDialog title="替换已有提示词内容？" onClose={compose.cancelOverwrite}>
        <p>
          将替换 {request.shotCount} 个镜头中的 {request.trackCount} 条已有提示词内容。
        </p>
        <div className="cv-script-compose-confirm-actions">
          <button type="button" onClick={compose.cancelOverwrite}>
            取消
          </button>
          <button type="button" onClick={compose.confirmOverwrite}>
            确认
          </button>
        </div>
      </EditorDialog>
    </div>,
    document.body,
  );
}

export function ScriptPromptComposeNotice({ compose }) {
  if (!compose.notice && !compose.error && !compose.canUndo) return null;
  return (
    <div className="cv-script-compose-notice">
      {compose.notice && <span role="status">{compose.notice}</span>}
      {compose.error && <span role="alert">{compose.error}</span>}
      {compose.canUndo && (
        <span className="cv-script-compose-undo">
          已替换当前稿
          <button
            type="button"
            disabled={compose.disabled || compose.pending}
            onClick={() => void compose.undo()}
          >
            撤销
          </button>
        </span>
      )}
    </div>
  );
}

export function ScriptPromptComposeDialog({
  kind = 'single',
  rowId,
  rows = [],
  compose,
  mediaHistory,
  readonly = false,
  onClose,
  initialSelectedIds,
  PromptInput = ScriptPromptInput,
  modelOptions = [],
  modelId,
  onModelChange,
  recomputeProgressPercent,
}) {
  const [selected, setSelected] = useState(() => scriptPromptSelection(rows, initialSelectedIds));
  const [expanded, setExpanded] = useState(new Set());
  const closing = useRef(false);
  const initialKey = initialSelectedIds === undefined ? '__ALL__' : initialSelectedIds.join(',');
  const initialRef = useRef(initialKey);
  const rowsRef = useRef(rows);
  useEffect(() => {
    if (initialRef.current !== initialKey) {
      initialRef.current = initialKey;
      setSelected(scriptPromptSelection(rows, initialSelectedIds));
      setExpanded(new Set());
    } else if (rowsRef.current !== rows) {
      const valid = new Set(rows.map((row) => row.id));
      const missing = scriptPromptSelection(rows);
      setSelected(
        (current) => new Set([...current].filter((id) => valid.has(id)).concat([...missing])),
      );
    }
    rowsRef.current = rows;
  }, [rows, initialSelectedIds, initialKey]);
  const single = kind === 'single';
  const row = rows.find((value) => value.id === rowId);
  const mode = single ? compose.singleMode : compose.batchMode;
  const generating = single ? scriptPromptsGenerating(row) : false;
  const blocked = compose.disabled || compose.pending || generating;
  const close = async () => {
    if (closing.current || compose.pending) return;
    closing.current = true;
    try {
      if (await compose.flushAll()) await onClose?.();
    } finally {
      closing.current = false;
    }
  };
  const submit = async () => {
    if (blocked || (!single && !selected.size) || (single && !row)) return;
    if (!(await compose.flushAll())) return;
    const request = { rowIds: single ? [row.id] : [...selected], tracks: ['image', 'video'] };
    const result =
      mode === 'concat'
        ? await compose.composeLocally(request)
        : await compose.composeSmart(request);
    if (!single && ['applied', 'empty', 'failed'].includes(result.status)) await onClose?.();
  };
  const data = compose.latestNode()?.data ?? {};
  const anyText = row && (row.imageGenerationPrompt?.trim() || row.videoMotionPrompt?.trim());
  const singleSubmitLabel = anyText ? '重新合成提示词' : '立即合成提示词';
  const title = single ? `镜头${row?.shotNumber ?? ''}最终提示词` : '合成最终提示词';
  return createPortal(
    <div className={`cv-script-compose-portal cv-script-compose-${single ? 'single' : 'batch'}`}>
      <EditorDialog
        title={title}
        titleActions={
          single && row && mediaHistory ? (
            <div className="cv-script-compose-history-actions">
              {['image', 'video'].map((track) => {
                const versions = row[`${track}Versions`];
                return Array.isArray(versions) && versions.length > 1 ? (
                  <ScriptMediaHistoryMenu
                    key={track}
                    kind={track}
                    versions={versions}
                    readonly={readonly}
                    disabled={blocked || mediaHistory.pending}
                    onJumpToNode={mediaHistory.jump}
                    onSetActive={(versionId) => mediaHistory.setActive(row.id, track, versionId)}
                  />
                ) : null;
              })}
            </div>
          ) : undefined
        }
        wide
        onClose={compose.pending ? undefined : close}
        closeOnBackdrop={!single && !compose.pending}
      >
        <div className="cv-script-compose-content">
          {single ? (
            row ? (
              <div className="cv-script-compose-tracks" key={`${compose.identity}:${row.id}`}>
                <PromptTrack
                  row={row}
                  track="image"
                  assets={data.assets}
                  compose={compose}
                  PromptInput={PromptInput}
                />
                <PromptTrack
                  row={row}
                  track="video"
                  assets={data.assets}
                  compose={compose}
                  PromptInput={PromptInput}
                />
              </div>
            ) : (
              <p>当前镜头已不存在</p>
            )
          ) : (
            <div className="cv-script-compose-selection">
              {rows.map((item) => (
                <div
                  className={`cv-script-compose-selection-row${expanded.has(item.id) ? ' is-expanded' : ''}`}
                  key={item.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`选择镜头 ${item.shotNumber}`}
                      checked={selected.has(item.id)}
                      disabled={blocked}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        })
                      }
                    />
                    <span>镜头 {item.shotNumber}</span>
                    <span>{item.plotDescription?.trim() || '（空）'}</span>
                  </label>
                  <button
                    type="button"
                    aria-label={`展开镜头 ${item.shotNumber}`}
                    aria-expanded={expanded.has(item.id)}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      })
                    }
                  >
                    {expanded.has(item.id) ? '收起' : '详情'}
                  </button>
                </div>
              ))}
              {!rows.length && <p>无可选分镜</p>}
            </div>
          )}
        </div>
        <footer className="cv-script-compose-footer">
          <div className="cv-script-compose-controls">
            {!single && (
              <div className="cv-script-compose-selection-heading">
                <label>
                  <input
                    type="checkbox"
                    aria-label="全选镜头"
                    disabled={blocked}
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked ? new Set(rows.map((item) => item.id)) : new Set(),
                      )
                    }
                  />
                  全选镜头
                </label>
                <span>
                  已选{selected.size}/{rows.length}
                </span>
              </div>
            )}
            {mode === 'smart' && (
              <PromptModel
                modelOptions={modelOptions}
                modelId={modelId}
                onModelChange={onModelChange}
                disabled={blocked}
              />
            )}
            {single && (
              <PromptTaskInfo
                key={compose.identity}
                taskInfo={data.taskInfo}
                generating={generating || compose.pending}
                identity={compose.identity}
              />
            )}
            <ComposeMode
              name={`script-compose-${kind}`}
              mode={mode}
              disabled={blocked}
              onChange={single ? compose.setSingleMode : compose.setBatchMode}
            />
            {mode === 'smart' && <span title="预计消耗积分">⚡ --</span>}
            <button
              type="button"
              className="cv-script-compose-submit"
              aria-label={single ? singleSubmitLabel : undefined}
              disabled={blocked || (single ? !row : !selected.size)}
              onClick={() => void submit()}
            >
              {compose.pending || generating
                ? generating && typeof recomputeProgressPercent === 'number'
                  ? `合成中 ${recomputeProgressPercent}%...`
                  : '合成中...'
                : single
                  ? singleSubmitLabel
                  : '确认合成'}
            </button>
          </div>
          <ScriptPromptComposeNotice compose={compose} />
          {single && mediaHistory?.error && (
            <p className="cv-script-compose-history-error" role="alert">
              {mediaHistory.error}
            </p>
          )}
        </footer>
      </EditorDialog>
    </div>,
    document.body,
  );
}
