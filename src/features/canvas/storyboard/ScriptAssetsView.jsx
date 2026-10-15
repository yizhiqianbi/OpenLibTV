import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Expand, Image, MoreHorizontal, Plus, Sparkles } from 'lucide-react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import AgentReferencePreview from '../../../components/agent/AgentReferencePreview.jsx';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import {
  normalizeScriptAssets,
  scriptAssetById,
  scriptAssetCandidates,
  scriptAssetDeleteInfo,
  scriptAssetFingerprint,
  scriptAssetImageUrl,
  scriptAssetRenamePreview,
} from './script-assets-model.js';
import { useScriptAssets } from './useScriptAssets.js';
import './script-assets.css';

const roleLabels = { character: '角色', scene: '场景', prop: '道具' };
const identitySrc = (url) => url;
const imageAction = (item, nodes) => (scriptAssetImageUrl(item, nodes) ? '替换图片' : '选择图片');

function AssetActions({
  item,
  nodes,
  disabled,
  onPick,
  onDelete,
  onClear,
  onJumpToNode,
  onSaveToPersonalAsset,
}) {
  const menu = useAgentToolbarPopover({ width: 170, maxHeight: 280, offset: 4 });
  const act = (callback) => () => {
    menu.close({ restoreFocus: true });
    callback();
  };
  const linked = nodes.find((node) => node.id === item.linkedNodeId);
  return (
    <div className="cv-script-asset-menu" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        ref={menu.triggerRef}
        {...menu.triggerProps}
        data-script-asset-menu-trigger
        aria-label={`更多操作 ${item.name || roleLabels[item.role]}`}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu.open &&
        createPortal(
          <div
            ref={menu.popoverRef}
            {...menu.popoverProps}
            className="cv-script-asset-menu-dropdown"
            style={menu.popoverStyle}
            role="group"
            aria-label="资产卡操作菜单"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
              const index = buttons.indexOf(event.target);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
            }}
          >
            <button type="button" disabled={disabled} onClick={act(() => onPick(item.id, 'pick'))}>
              {imageAction(item, nodes)}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={act(() => onPick(item.id, 'generate'))}
            >
              AI 生{roleLabels[item.role]}
            </button>
            <button
              type="button"
              disabled={!linked || !onJumpToNode}
              title={!linked ? '资产未关联画布节点' : undefined}
              onClick={act(() => onJumpToNode?.(linked.id))}
            >
              跳转至节点
            </button>
            <button
              type="button"
              disabled={disabled || !scriptAssetImageUrl(item, nodes)}
              onClick={act(() => onClear(item))}
            >
              清除图片
            </button>
            {onSaveToPersonalAsset && (
              <button
                type="button"
                disabled={disabled || !linked || !scriptAssetImageUrl(item, nodes)}
                onClick={act(() =>
                  onSaveToPersonalAsset({ nodeId: linked.id, initialName: item.name.trim() }),
                )}
              >
                保存到个人资产
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              className="cv-script-asset-danger"
              onClick={act(() => onDelete(item))}
            >
              删除
            </button>
          </div>,
          menu.triggerRef.current?.closest('[role="dialog"][aria-modal="true"]') || document.body,
        )}
    </div>
  );
}

function ScriptAssetPicker({
  item,
  initialTab,
  title,
  nodes,
  edges,
  scriptId,
  disabled,
  error,
  onChoose,
  onClose,
  src,
}) {
  const [tab, setTab] = useState(initialTab);
  const candidates = scriptAssetCandidates({ nodes, edges, scriptId });
  return (
    <div className="cv-script-asset-picker">
      <EditorDialog
        title={title || `选择图片${item.name ? `（${item.name}）` : ''}`}
        onClose={onClose}
        wide
      >
        <nav className="cv-script-asset-tabs" aria-label="图片来源">
          {[
            ['generate', 'AI生成'],
            ['pick', '从当前画布选择'],
            ['upload', '本地上传'],
            ['library', '个人资产库'],
          ].map(([key, label]) => (
            <button type="button" key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="cv-script-asset-picker-body">
          {tab === 'pick' ? (
            candidates.length ? (
              <div className="cv-script-asset-candidates">
                {candidates.map((candidate) => (
                  <button
                    type="button"
                    key={candidate.id}
                    disabled={disabled || item.linkedNodeId === candidate.id}
                    aria-label={`选择图片 ${candidate.name}`}
                    onClick={() => onChoose(candidate.id)}
                  >
                    <span>
                      <img src={src(candidate.thumbnailUrl)} alt="" />
                      {item.linkedNodeId === candidate.id && <em>当前</em>}
                    </span>
                    <strong>{candidate.name}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <div className="cv-script-asset-unavailable">
                <Image size={28} />
                <p>当前画布暂无节点</p>
              </div>
            )
          ) : tab === 'generate' ? (
            <div className="cv-script-asset-unavailable">
              <Sparkles size={28} />
              <p>开始你的设计</p>
              <textarea aria-label="资产生成描述" defaultValue={item.description || ''} disabled />
              <p>AI 生成服务尚未连接</p>
              <button type="button" disabled>
                确认生成
              </button>
            </div>
          ) : tab === 'upload' ? (
            <div className="cv-script-asset-unavailable">
              <Image size={28} />
              <p>点击上传 或 拖拽本地图片至此上传</p>
              <p>上传后画布将新建一个图片节点并自动替换当前图源</p>
              <p>图片上传服务尚未连接</p>
              <button type="button" disabled>
                点击上传
              </button>
            </div>
          ) : (
            <div className="cv-script-asset-unavailable">
              <Image size={28} />
              <p>个人资产库图片导入服务尚未连接</p>
            </div>
          )}
        </div>
        {error && (
          <p className="cv-script-asset-error" role="alert">
            {error}
          </p>
        )}
      </EditorDialog>
    </div>
  );
}

function AssetEditDrawer({
  item,
  script,
  nodes,
  controller,
  src,
  onClose,
  onPick,
  onDelete,
  onClear,
  onPreview,
  onJumpToNode,
  onSaveToPersonalAsset,
}) {
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [saved, setSaved] = useState({
    name: item.name,
    description: item.description || '',
    fingerprint: scriptAssetFingerprint(item),
  });
  const [rename, setRename] = useState(null);
  useEffect(() => {
    // Our image operation may update the timestamp while these text drafts remain open.
    // External text changes retain the old baseline and are rejected on submission.
    if (item.name === saved.name && (item.description || '') === saved.description)
      setSaved((value) =>
        value.fingerprint === scriptAssetFingerprint(item)
          ? value
          : { ...value, fingerprint: scriptAssetFingerprint(item) },
      );
  }, [item, saved.name, saved.description]);
  const role = roleLabels[item.role];
  const url = scriptAssetImageUrl(item, nodes);
  const remember = (plan) => {
    const latest = scriptAssetById(plan.nodes.find((node) => node.id === script.id)?.data, item.id);
    if (latest)
      setSaved({
        name: latest.name,
        description: latest.description || '',
        fingerprint: scriptAssetFingerprint(latest),
      });
  };
  const saveName = async (nextName) => {
    const result = await controller.mutate({
      type: 'rename',
      assetId: item.id,
      name: nextName,
      syncRows: true,
      expectedAssetFingerprint: saved.fingerprint,
    });
    if (result) {
      remember(result);
      setName(nextName);
      setRename(null);
    }
  };
  const renamePreview = () => {
    const nextName = name.trim() || saved.name;
    if (nextName === saved.name) {
      setName(saved.name);
      return;
    }
    const preview = scriptAssetRenamePreview({
      data: controller.latestNode()?.data || script.data,
      assetId: item.id,
      name: nextName,
    });
    if (preview.length) setRename({ name: nextName, preview });
    else saveName(nextName);
  };
  const saveDescription = async () => {
    if (description === saved.description || controller.disabled) return;
    const result = await controller.mutate({
      type: 'update',
      assetId: item.id,
      patch: { description },
      expectedAssetFingerprint: saved.fingerprint,
    });
    if (result) remember(result);
  };
  return (
    <>
      <div className="cv-script-asset-drawer">
        <EditorDialog title={`编辑${role}`} onClose={onClose}>
          <div className="cv-script-asset-drawer-body">
            <div className="cv-script-asset-drawer-heading">
              <span>{role}形象</span>
              <AssetActions
                item={item}
                nodes={nodes}
                disabled={controller.disabled}
                onPick={onPick}
                onDelete={onDelete}
                onClear={onClear}
                onJumpToNode={onJumpToNode}
                onSaveToPersonalAsset={onSaveToPersonalAsset}
              />
            </div>
            {url ? (
              <div className="cv-script-asset-editor-image">
                <img src={src(url)} alt={item.name} />
                <button type="button" aria-label="全屏预览" onClick={() => onPreview(item)}>
                  <Expand size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={controller.disabled}
                className="cv-script-asset-editor-empty"
                onClick={() => onPick(item.id, 'pick')}
              >
                <Image size={24} />
                <span>{imageAction(item, nodes)}</span>
              </button>
            )}
            <label className="cv-script-asset-field">
              {role}名称
              <input
                value={name}
                aria-label={`${role}名称`}
                disabled={controller.disabled}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {name !== saved.name && (
              <button
                type="button"
                className="cv-script-asset-save-name"
                disabled={controller.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={renamePreview}
              >
                保存{role}名称
              </button>
            )}
            <label className="cv-script-asset-field">
              {role}描述
              <textarea
                value={description}
                aria-label={`${role}描述`}
                disabled={controller.disabled}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={saveDescription}
              />
            </label>
            {description !== saved.description && (
              <p className="cv-script-asset-muted">失焦自动保存</p>
            )}
            {controller.error && (
              <p role="alert" className="cv-script-asset-error">
                {controller.error}
              </p>
            )}
          </div>
        </EditorDialog>
      </div>
      {rename && (
        <div className="cv-script-asset-rename">
          <EditorDialog
            title="同步替换分镜文本？"
            onClose={() => {
              setName(saved.name);
              setRename(null);
            }}
            wide
          >
            <p>检测到以下分镜文本命中了旧名称：</p>
            <div className="cv-script-asset-rename-preview">
              {rename.preview.slice(0, 8).map((entry, index) => (
                <p key={index}>
                  <small>镜头 {entry.rowId}</small>
                  <del>{entry.before}</del>
                  <ins>{entry.after}</ins>
                </p>
              ))}
            </div>
            {rename.preview.length > 8 && (
              <p>其余 {rename.preview.length - 8} 条将一并同步替换。</p>
            )}
            {controller.error && (
              <p role="alert" className="cv-script-asset-error">
                {controller.error}
              </p>
            )}
            <div className="cv-script-asset-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setName(saved.name);
                  setRename(null);
                }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={controller.disabled}
                onClick={() => saveName(rename.name)}
              >
                同步替换并保存
              </button>
            </div>
          </EditorDialog>
        </div>
      )}
    </>
  );
}

function DeleteAssetDialog({ item, data, controller, onClose, onConfirm }) {
  const [policy, setPolicy] = useState('keep_text');
  const { count } = scriptAssetDeleteInfo({ data, assetId: item.id });
  const role = roleLabels[item.role];
  return (
    <div className="cv-script-asset-delete">
      <EditorDialog title="删除资产" onClose={onClose}>
        <p>
          {count
            ? `资产「${item.name}」（${role}）当前被 ${count} 个分镜引用，删除前请选择处理方式：`
            : `资产「${item.name}」（${role}）所在脚本已存在分镜内容。为避免改名后旧名称残留导致误删，删除前请选择处理方式：`}
        </p>
        <label className="cv-script-asset-delete-option">
          <input
            type="radio"
            name="script-asset-delete-policy"
            checked={policy === 'keep_text'}
            onChange={() => setPolicy('keep_text')}
          />
          仅删除资产，保留分镜中的文字<small>分镜里的角色名 / 描述 / 台词文字保持原样</small>
        </label>
        <label className="cv-script-asset-delete-option">
          <input
            type="radio"
            name="script-asset-delete-policy"
            disabled={item.role === 'prop'}
            checked={policy === 'clear_chars'}
            onChange={() => setPolicy('clear_chars')}
          />
          {item.role === 'character'
            ? '同时从分镜角色列表中移除'
            : item.role === 'scene'
              ? '同时从分镜场景引用中移除'
              : '当前阶段暂无可结构化清理的引用'}
          <small>
            {item.role === 'prop'
              ? '道具/风格仍以保留文字为主，精确替换与文本联动留到后续阶段'
              : `清掉每行${item.role === 'character' ? '角色列表' : '场景引用'} + 提示词里的 @ 提及${item.role === 'scene' ? '（如有）' : ''}，保留普通文字`}
          </small>
        </label>
        {controller.error && (
          <p role="alert" className="cv-script-asset-error">
            {controller.error}
          </p>
        )}
        <div className="cv-script-asset-dialog-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={controller.disabled}
            className="cv-script-asset-danger"
            onClick={() => onConfirm(item, policy)}
          >
            删除
          </button>
        </div>
      </EditorDialog>
    </div>
  );
}

/** Verified ScriptV2 card/edit/selection workflow; server generation and import stay explicit. */
export default function ScriptAssetsView({
  node,
  nodes = [],
  edges = [],
  documentKey = '',
  ready = true,
  readonly = true,
  onMutateAsset,
  getDocument,
  onJumpToNode,
  onSaveToPersonalAsset,
  onNextStep,
  src = identitySrc,
}) {
  const controller = useScriptAssets({
    node,
    documentKey,
    ready,
    readonly,
    onMutateAsset,
    getDocument,
  });
  const [editingId, setEditingId] = useState(null),
    [picking, setPicking] = useState(null),
    [deleting, setDeleting] = useState(null),
    [preview, setPreview] = useState(null);
  const identity = JSON.stringify([documentKey, node.id]);
  useEffect(() => {
    setEditingId(null);
    setPicking(null);
    setDeleting(null);
    setPreview(null);
  }, [identity]);
  useEffect(() => {
    if (!ready || readonly) {
      setPicking(null);
      setDeleting(null);
    }
  }, [ready, readonly]);
  const data = node.data || {};
  const groups = normalizeScriptAssets(data);
  const allItems = groups.flatMap(({ items }) => items);
  const selectedItem = scriptAssetById(data, editingId);
  const pickerItem =
    scriptAssetById(data, picking?.id) ||
    (picking ? scriptAssetById(controller.latestNode()?.data, picking.id) : null);
  const allReady = allItems.every((item) => scriptAssetImageUrl(item, nodes));
  const missing = groups
    .map((group) => ({
      ...group,
      count: group.items.filter((item) => !scriptAssetImageUrl(item, nodes)).length,
    }))
    .filter((group) => group.count);
  const recognized = groups.map((group) => ({
    ...group,
    recognized: group.items.filter(
      (item) => typeof item.confidence === 'number' && item.status === 'ready',
    ),
  }));
  const recognizedCount = recognized.reduce((count, group) => count + group.recognized.length, 0);
  const lowConfidence = recognized
    .flatMap((group) => group.recognized)
    .filter((item) => item.confidence <= 0.5).length;
  const pick = (id, tab = 'pick') => setPicking({ id, tab });
  const clear = (item) => controller.mutate({ type: 'clear', assetId: item.id });
  const confirmDelete = async (item, policy) => {
    const result = await controller.mutate(
      { type: 'delete', assetId: item.id, policy },
      (plan) =>
        `已删除${roleLabels[item.role]}「${item.name}」${plan.referencesCleared ? (item.role === 'character' ? '，已从分镜角色列表中移除' : item.role === 'scene' ? '，已从分镜场景标签中移除' : '') : ''}`,
    );
    if (result) {
      setDeleting(null);
      if (editingId === item.id) setEditingId(null);
    }
  };
  const remove = (item) => {
    const info = scriptAssetDeleteInfo({
      data: controller.latestNode()?.data || data,
      assetId: item.id,
    });
    if (!info.count && !info.hasRows) confirmDelete(item, 'keep_text');
    else setDeleting(item);
  };
  const previewImage = (item) => {
    const url = scriptAssetImageUrl(item, nodes);
    if (url) setPreview({ type: 'image', name: item.name, source: { value: src(url) } });
  };
  const add = async (role) => {
    const result = await controller.mutate({ type: 'add', role });
    if (result) setPicking({ id: result.assetId, tab: 'pick', title: `新增${roleLabels[role]}` });
  };
  return (
    <div className="cv-script-assets-view">
      {!data.confirmedAssetRecognition && recognizedCount > 0 && (
        <div className="cv-script-asset-recognition">
          <Sparkles size={18} />
          <div>
            已识别{' '}
            {recognized
              .filter((group) => group.recognized.length)
              .map((group) => `${group.recognized.length} ${group.label}`)
              .join('、')}
            {lowConfidence > 0 && <small>（含 {lowConfidence} 项低置信度，建议人工确认）</small>}
          </div>
          <button
            type="button"
            disabled={controller.disabled}
            onClick={() => controller.mutate({ type: 'confirmRecognition' })}
          >
            我已确认
          </button>
        </div>
      )}
      {data.styleDescription?.trim() && (
        <div className="cv-script-asset-global-style">
          <span>全局风格</span>
          <p>{data.styleDescription.trim()}</p>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.key}>
          <h3>{group.label}</h3>
          <div className="cv-script-asset-cards">
            {group.items.map((item) => {
              const url = scriptAssetImageUrl(item, nodes);
              const linkedNode = nodes.find((value) => value.id === item.linkedNodeId);
              const loading = linkedNode?.data?.taskInfo?.loading;
              return (
                <article
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  data-asset-id={item.id}
                  data-asset-status={item.status}
                  data-has-image={Boolean(url)}
                  aria-label={`${group.label}资产：${item.name}，${item.status === 'pending' ? '待创建' : '已就绪'}`}
                  onClick={() => setEditingId(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const menu = event.currentTarget.querySelector(
                      '[data-script-asset-menu-trigger]',
                    );
                    if (menu) {
                      if (menu.getAttribute('aria-expanded') !== 'true') menu.click();
                      menu.focus();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      ['Enter', ' '].includes(event.key)
                    ) {
                      event.preventDefault();
                      setEditingId(item.id);
                    }
                  }}
                >
                  <div className="cv-script-asset-cover">
                    {url ? (
                      <img src={src(url)} alt={item.name} />
                    ) : (
                      <span>
                        <Image size={24} />
                        {loading
                          ? '生成中…'
                          : item.status === 'pending'
                            ? '待创建'
                            : `生成或上传${group.label}图`}
                      </span>
                    )}
                    {typeof item.confidence === 'number' &&
                      item.confidence > 0 &&
                      item.confidence <= 0.5 && (
                        <small title="识别置信度较低，建议人工确认">识别置信度低</small>
                      )}
                    <div className="cv-script-asset-cover-actions">
                      {url && (
                        <button
                          type="button"
                          aria-label={`全屏预览 ${item.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            previewImage(item);
                          }}
                        >
                          <Expand size={16} />
                        </button>
                      )}
                      <AssetActions
                        item={item}
                        nodes={nodes}
                        disabled={controller.disabled}
                        onPick={pick}
                        onDelete={remove}
                        onClear={clear}
                        onJumpToNode={onJumpToNode}
                        onSaveToPersonalAsset={onSaveToPersonalAsset}
                      />
                    </div>
                  </div>
                  <strong>{item.name}</strong>
                  {item.description && <p>{item.description}</p>}
                  {['pass', 'pending', 'reject'].includes(item.compliance?.state) && (
                    <small className="cv-script-asset-compliance">
                      {{ pass: '合规', pending: '检测中', reject: '风险' }[item.compliance?.state]}
                    </small>
                  )}
                </article>
              );
            })}
            <button
              type="button"
              className="cv-script-asset-add"
              aria-label={`新增${group.label}`}
              disabled={controller.disabled}
              onClick={() => add(group.role)}
            >
              <Plus size={16} />
              <span>新增</span>
            </button>
          </div>
        </section>
      ))}
      {controller.error && (
        <p className="cv-script-asset-error" role="alert">
          {controller.error}
        </p>
      )}
      {controller.notice && <p role="status">{controller.notice}</p>}
      <footer className="cv-script-asset-footer">
        {allReady ? (
          <>
            <p>资产已生成，如再次生成将会覆盖之前的图片/场景/道具等资产</p>
            {onNextStep && (
              <button type="button" disabled={controller.disabled} onClick={onNextStep}>
                → 下一步：合成提示词
              </button>
            )}
          </>
        ) : (
          <>
            <p>
              {missing.length
                ? `检测到有${missing.map((group) => `${group.count} 个${group.role === 'character' ? '人物角色' : group.label}`).join('和')}没有设定图，您可以手动上传或AI批量生成`
                : '暂无资产可生成'}
            </p>
            <button type="button" disabled title="AI 生成服务尚未连接">
              一键生成所有资产
            </button>
          </>
        )}
      </footer>
      {selectedItem &&
        createPortal(
          <AssetEditDrawer
            key={identity + selectedItem.id}
            item={selectedItem}
            script={node}
            nodes={nodes}
            controller={controller}
            src={src}
            onClose={() => setEditingId(null)}
            onPick={pick}
            onDelete={remove}
            onClear={clear}
            onPreview={previewImage}
            onJumpToNode={onJumpToNode}
            onSaveToPersonalAsset={onSaveToPersonalAsset}
          />,
          document.body,
        )}
      {pickerItem &&
        createPortal(
          <ScriptAssetPicker
            key={identity + pickerItem.id + picking.tab}
            item={pickerItem}
            initialTab={picking.tab}
            title={picking.title}
            nodes={nodes}
            edges={edges}
            scriptId={node.id}
            disabled={controller.disabled}
            error={controller.error}
            src={src}
            onClose={() => setPicking(null)}
            onChoose={async (nodeId) => {
              const result = await controller.mutate({
                type: 'replace',
                assetId: pickerItem.id,
                nodeId,
              });
              if (result) setPicking(null);
            }}
          />,
          document.body,
        )}
      {deleting &&
        createPortal(
          <DeleteAssetDialog
            item={deleting}
            data={data}
            controller={controller}
            onClose={() => setDeleting(null)}
            onConfirm={confirmDelete}
          />,
          document.body,
        )}
      {preview &&
        createPortal(
          <div className="cv-script-asset-preview">
            <AgentReferencePreview reference={preview} onClose={() => setPreview(null)} />
          </div>,
          document.body,
        )}
    </div>
  );
}
