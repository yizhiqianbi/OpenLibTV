import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Play,
  Download,
  Upload,
  Undo2,
  Redo2,
  Check,
  Copy,
  Trash2,
  PanelLeft,
  SlidersHorizontal,
  X,
  Film,
  GitBranch,
  Flag,
  MousePointer2,
  Zap,
  Braces,
  FolderOpen,
} from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import { useDialogBehavior } from '../../hooks/useDialogBehavior.js';
import AgentAssetPicker from '../../components/agent/AgentAssetPicker.jsx';
import { useFilmDocument } from './hooks/useFilmDocument.js';
import FilmGraph, { FILM_LABELS } from './components/FilmGraph.jsx';
import FilmInspector from './components/FilmInspector.jsx';
import FilmPlayer from './components/FilmPlayer.jsx';
import {
  createFilmNode,
  duplicateFilmNodes,
  removeFilmNodes,
  validateFilmDocument,
  compileFilmDocument,
  filmNodePorts,
} from '../../services/interactive-film/document.ts';
import {
  storeFilmMedia,
  importFilmMediaUrl,
  createFilmMediaUrls,
} from '../../services/interactive-film/media.ts';
import { exportFilmDocument } from '../../services/interactive-film/export.ts';
import { publishFilmDocument } from '../../services/interactive-film/publish.ts';
import { createFilmDemo } from '../../services/interactive-film/demo.ts';
import { listCanvasFilmSources } from '../../services/interactive-film/canvas-source.ts';
import { downloadBlob } from '../editor/browser.js';
import { pickerAssetReferences } from '../../services/asset-picker/model.ts';
import { asset } from '../../services/assets.ts';

const ICONS = {
  start: Flag,
  play: Film,
  choice: GitBranch,
  set: Braces,
  condition: GitBranch,
  hotspot: MousePointer2,
  qte: Zap,
  ending: Flag,
};
const editable = (target) =>
  target?.closest?.('input,textarea,select,[contenteditable],[role=dialog]');

export default function InteractiveFilmPage({ search, navigate, toast }) {
  const projectId = new URLSearchParams(search || window.location.search).get('projectId');
  const controller = useFilmDocument(projectId);
  const doc = controller.document;
  const [selected, setSelected] = useState([]),
    [linking, setLinking] = useState(null),
    [tab, setTab] = useState('nodes');
  const [panel, setPanel] = useState(null),
    [dialog, setDialog] = useState(null),
    [preview, setPreview] = useState(null);
  const [issues, setIssues] = useState(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(null);
  const [password, setPassword] = useState(''),
    [publishResult, setPublishResult] = useState(null),
    [operationError, setOperationError] = useState(''),
    [failedFiles, setFailedFiles] = useState([]);
  const libraryRef = useRef(null),
    inspectorRef = useRef(null),
    panelOrigin = useRef(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useDialogBehavior(libraryRef, {
    enabled: !!doc && narrow && panel === 'library',
    onClose: () => setPanel(null),
  });
  useDialogBehavior(inspectorRef, {
    enabled: !!doc && narrow && panel === 'inspector',
    onClose: () => setPanel(null),
  });
  const openLibrary = (nextTab = 'nodes') => {
    panelOrigin.current = document.activeElement;
    setTab(nextTab);
    setPanel(panel === 'library' && tab === nextTab ? null : 'library');
  };
  const closePanel = (restoreFocus = false) => {
    setPanel(null);
    if (restoreFocus && !narrow && panelOrigin.current?.isConnected) panelOrigin.current.focus();
  };
  useEffect(() => {
    if (!panel || narrow) return;
    const isModalOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');
    const key = (event) => {
      if (event.key !== 'Escape' || event.isComposing || isModalOpen()) return;
      event.preventDefault();
      setPanel(null);
      if (panelOrigin.current?.isConnected) panelOrigin.current.focus();
    };
    const outside = (event) => {
      if (
        panel !== 'library' ||
        isModalOpen() ||
        libraryRef.current?.contains(event.target) ||
        event.target.closest?.('[data-film-library-trigger]')
      )
        return;
      setPanel(null);
    };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
    };
  }, [panel, narrow]);
  const fileInput = useRef(null),
    operation = useRef(null),
    alive = useRef(true),
    previewDispose = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      operation.current?.abort();
      previewDispose.current?.();
    };
  }, []);
  useEffect(() => {
    if (doc && !projectId)
      navigate(`/interactive-film?projectId=${encodeURIComponent(doc.id)}`, { replace: true });
  }, [doc, projectId, navigate]);
  useEffect(() => {
    if (doc) setSelected((ids) => ids.filter((id) => doc.nodes.some((node) => node.id === id)));
  }, [doc]);
  const deleteSelection = () =>
    controller.commit((previous) => removeFilmNodes(previous, selected));
  useEffect(() => {
    const key = (event) => {
      if (editable(event.target) || event.isComposing || !controller.document) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? controller.redo() : controller.undo();
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) {
        event.preventDefault();
        controller.commit((previous) => removeFilmNodes(previous, selected));
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        controller.commit((previous) => duplicateFilmNodes(previous, selected));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [controller, selected]);
  const run = async (task) => {
    if (operation.current) return false;
    const abort = new AbortController(),
      id = controller.current.current?.id;
    operation.current = abort;
    setBusy(true);
    setOperationError('');
    setProgress(null);
    const valid = () =>
      alive.current && !abort.signal.aborted && controller.current.current?.id === id;
    try {
      await task(abort.signal, valid);
      return valid();
    } catch (error) {
      if (valid()) {
        setOperationError(error.message || '操作失败，请重试');
        if (error.issues) setIssues(error.issues);
        else if (error.mediaId)
          setIssues(
            controller.current.current.nodes
              .filter((node) => node.mediaId === error.mediaId)
              .map((node) => ({
                code: 'media-missing',
                nodeId: node.id,
                message: `${node.title}：${error.message}`,
              })),
          );
      }
      return false;
    } finally {
      if (operation.current === abort) {
        operation.current = null;
        if (alive.current) {
          setBusy(false);
          setProgress(null);
        }
      }
    }
  };
  const snapshot = () => JSON.parse(JSON.stringify(controller.current.current));
  const add = (kind) => {
    const previous = controller.current.current,
      node = createFilmNode(kind, {
        x: (360 - previous.view.x) / previous.view.z,
        y: (180 - previous.view.y) / previous.view.z,
      });
    controller.commit({ ...previous, nodes: [...previous.nodes, node] });
    setSelected([node.id]);
    setPanel('inspector');
  };
  const changeNode = (patch, options) =>
    controller.commit((previous) => {
      const nodes = previous.nodes.map((node) =>
        node.id === selected[0] ? { ...node, ...patch } : node,
      );
      const changed = nodes.find((node) => node.id === selected[0]);
      const ports = new Set(changed ? filmNodePorts(changed).map((port) => port.id) : []);
      return {
        ...previous,
        nodes,
        edges: previous.edges.filter(
          (edge) => edge.source !== selected[0] || ports.has(edge.sourcePort),
        ),
      };
    }, options);
  const importFiles = (files) =>
    run(async (signal, valid) => {
      const failed = [];
      for (let index = 0; index < files.length; index++) {
        setProgress({
          completed: index,
          total: files.length,
          message: `导入 ${files[index].name}`,
        });
        try {
          const media = await storeFilmMedia(files[index], { signal });
          if (valid()) {
            controller.commit((previous) => ({ ...previous, media: [...previous.media, media] }));
            if (!controller.current.current.media.some((item) => item.id === media.id))
              throw new Error('项目无法写入，素材文件已保留，请重新打开项目后重试');
          }
        } catch (error) {
          if (signal.aborted) throw error;
          failed.push({ file: files[index], message: error.message });
        }
      }
      if (valid()) {
        setFailedFiles(failed);
        setTab('media');
        setPanel('library');
        if (failed.length) throw new Error('部分素材导入失败，可重试失败文件');
      }
    });
  const importUrls = (sources) =>
    run(async (signal, valid) => {
      for (let index = 0; index < sources.length; index++) {
        setProgress({
          completed: index,
          total: sources.length,
          message: `导入 ${sources[index].name || sources[index].title}`,
        });
        const media = await importFilmMediaUrl(
          sources[index].name || sources[index].title,
          sources[index].url,
          { signal },
        );
        if (valid()) {
          controller.commit((previous) => ({ ...previous, media: [...previous.media, media] }));
          if (!controller.current.current.media.some((item) => item.id === media.id))
            throw new Error('项目无法写入，素材文件已保留，请重新打开项目后重试');
        }
      }
      if (valid()) {
        setTab('media');
        setPanel('library');
        setDialog(null);
      }
    });
  const attachMedia = (media) => {
    const node = doc.nodes.find((node) => node.id === selected[0]);
    if (node && ['play', 'choice', 'hotspot', 'qte'].includes(node.kind)) {
      if (node.kind === 'hotspot' && media.type === 'audio') {
        setOperationError('热点需要图片或视频背景');
        return;
      }
      changeNode({
        mediaId: media.id,
        trimIn: 0,
        trimOut: media.duration,
        displaySeconds:
          media.type === 'image'
            ? Math.max(node.displaySeconds || 5, node.windowEnd || node.windowStart || 0)
            : node.displaySeconds,
      });
    } else {
      const node = createFilmNode('play', {
        x: (360 - doc.view.x) / doc.view.z,
        y: (180 - doc.view.y) / doc.view.z,
      });
      controller.commit((previous) => ({
        ...previous,
        nodes: [
          ...previous.nodes,
          { ...node, mediaId: media.id, trimIn: 0, trimOut: media.duration },
        ],
      }));
      setSelected([node.id]);
    }
    setPanel('inspector');
  };
  const tryPlay = () =>
    run(async (signal, valid) => {
      const frozen = snapshot(),
        errors = validateFilmDocument(frozen);
      setIssues(errors);
      if (errors.length) return;
      const usedIds = new Set(frozen.nodes.map((node) => node.mediaId).filter(Boolean));
      const resources = await createFilmMediaUrls(
        frozen.media.filter((media) => usedIds.has(media.id)),
        { signal },
      );
      if (!valid()) {
        resources.dispose();
        return;
      }
      try {
        const manifest = compileFilmDocument(frozen, resources.urls);
        previewDispose.current?.();
        previewDispose.current = resources.dispose;
        setPreview(manifest);
      } catch (error) {
        resources.dispose();
        throw error;
      }
    });
  const closeDialog = () => {
    operation.current?.abort();
    setDialog(null);
    setPassword('');
  };
  const closePreview = () => {
    setPreview(null);
    previewDispose.current?.();
    previewDispose.current = null;
  };
  const exportWork = () =>
    run(async (signal, valid) => {
      const blob = await exportFilmDocument(snapshot(), {
        signal,
        onProgress: (value) => {
          if (valid()) setProgress(value);
        },
      });
      if (valid()) downloadBlob(blob, `${controller.current.current.title}.zip`);
    });
  const publish = () =>
    run(async (signal, valid) => {
      const result = await publishFilmDocument(snapshot(), password, {
        signal,
        onProgress: (value) => {
          if (valid())
            setProgress({
              completed: value.uploadedBytes,
              total: value.totalBytes,
              message: {
                preparing: '正在检查素材…',
                uploading: '正在上传素材…',
                completing: '正在完成发布…',
              }[value.phase],
            });
        },
      });
      if (valid()) {
        setPublishResult(result);
        setPassword('');
      }
    });
  const example = () =>
    run(async (signal, valid) => {
      const next = await createFilmDemo(doc.id, { signal });
      if (valid()) {
        controller.commit(next);
        setSelected([]);
        setIssues(null);
        setDialog(null);
        setTab('nodes');
      }
    });
  const addVariable = (type) =>
    controller.commit((previous) => ({
      ...previous,
      variables: [
        ...previous.variables,
        {
          id: crypto.randomUUID(),
          name: type === 'number' ? '新数值变量' : '新状态变量',
          type,
          initial: type === 'number' ? 0 : false,
        },
      ],
    }));
  const updateVariable = (id, patch) =>
    controller.commit((previous) => ({
      ...previous,
      variables: previous.variables.map((variable) =>
        variable.id === id ? { ...variable, ...patch } : variable,
      ),
    }));
  if (!doc)
    return (
      <main className="film-page film-load-error">
        <h1>互动影游</h1>
        <p role="alert">{controller.error?.message}</p>
        <button onClick={() => navigate('/project')}>返回项目</button>
      </main>
    );
  const node = doc.nodes.find((node) => node.id === selected[0]);
  return (
    <main className="film-page">
      <header className="film-topbar">
        <div className="film-project-title">
          <button aria-label="返回项目" onClick={() => navigate('/project')}>
            <ArrowLeft size={18} />
          </button>
          <button className="film-brand" aria-label="PenStudio 首页" onClick={() => navigate('/')}>
            Pen<span>Studio</span>
          </button>
          <i className="film-title-divider" aria-hidden="true" />
          <input
            aria-label="影游项目名称"
            value={doc.title}
            onChange={(event) =>
              controller.commit((previous) => ({ ...previous, title: event.target.value }))
            }
          />
          <span className={controller.saved ? 'film-saved' : 'film-unsaved'}>
            {controller.saved && <Check size={12} />}
            {controller.saved ? '已保存' : '未保存'}
          </span>
        </div>
        <div className="film-actions">
          <button aria-label="撤销" disabled={!controller.canUndo} onClick={controller.undo}>
            <Undo2 size={17} />
          </button>
          <button aria-label="重做" disabled={!controller.canRedo} onClick={controller.redo}>
            <Redo2 size={17} />
          </button>
          <button aria-label="校验剧情" onClick={() => setIssues(validateFilmDocument(doc))}>
            <Check size={16} />
            <span>校验</span>
          </button>
          <button aria-label="试玩" onClick={tryPlay} aria-disabled={busy}>
            <Play size={16} />
            <span>预览</span>
          </button>
          <button aria-label="导出离线包" onClick={exportWork} disabled={busy}>
            <Download size={16} />
            <span>导出</span>
          </button>
          <button
            className="film-primary"
            aria-label="发布作品"
            onClick={() => {
              setDialog('publish');
              setOperationError('');
              setPublishResult(null);
            }}
            disabled={busy}
          >
            <Upload size={16} />
            <span>发布</span>
          </button>
        </div>
      </header>
      {(controller.error || operationError) && (
        <div className="film-error" role="alert">
          {controller.error?.message || operationError}
          {!controller.saved && (
            <>
              <button onClick={controller.retrySave}>重试保存</button>
              <button
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(controller.current.current, null, 2)], {
                      type: 'application/json',
                    }),
                    `${doc.title || '影游'}_草稿.json`,
                  )
                }
              >
                下载剧情草稿
              </button>
            </>
          )}
          <button aria-label="关闭操作提示" onClick={() => setOperationError('')}>
            <X size={14} />
          </button>
        </div>
      )}
      <nav className="film-mobile-nav">
        <button onClick={() => openLibrary(tab)}>
          <PanelLeft size={16} />
          节点与素材
        </button>
        <button onClick={() => setPanel(panel === 'inspector' ? null : 'inspector')}>
          <SlidersHorizontal size={16} />
          属性
        </button>
        {selected.length > 0 && (
          <button onClick={deleteSelection}>
            <Trash2 size={16} />
            删除
          </button>
        )}
      </nav>
      <div className={`film-workspace ${panel ? 'show-' + panel : ''}`}>
        <div
          ref={libraryRef}
          className="film-drawer-root film-library-root"
          hidden={panel !== 'library'}
          role={narrow && panel === 'library' ? 'dialog' : undefined}
          aria-modal={narrow && panel === 'library' ? true : undefined}
          aria-label="创作面板"
          tabIndex={-1}
        >
          <button
            className="film-panel-backdrop"
            aria-label="关闭创作抽屉"
            tabIndex={-1}
            onClick={() => closePanel()}
          />
          <aside className="film-library" aria-label="创作面板">
            <header>
              <strong>{tab === 'nodes' ? '添加节点' : tab === 'media' ? '素材' : '变量'}</strong>
              <button aria-label="关闭创作面板" onClick={() => closePanel(true)}>
                <X size={16} />
              </button>
            </header>
            <nav className="film-tabs">
              {[
                ['nodes', '节点'],
                ['media', '素材'],
                ['variables', '变量'],
              ].map(([id, label]) => (
                <button key={id} aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="film-library-content">
              {tab === 'nodes' && (
                <>
                  <p className="film-section-label">在视频中添加互动</p>
                  <div className="film-node-library">
                    {Object.entries(FILM_LABELS)
                      .filter(([kind]) => kind !== 'start')
                      .map(([kind, label]) => {
                        const Icon = ICONS[kind];
                        return (
                          <button key={kind} onClick={() => add(kind)}>
                            <Icon size={18} />
                            <span>{label}</span>
                            <Plus size={14} />
                          </button>
                        );
                      })}
                  </div>
                  <div className="film-library-note">
                    连接视频片段，在播放中插入选择、热点或小游戏。
                  </div>
                  <button
                    className="film-demo-button"
                    onClick={() => setDialog('demo')}
                    disabled={busy}
                  >
                    <Play size={16} />
                    打开完整示例
                  </button>
                </>
              )}
              {tab === 'media' && (
                <>
                  <div className="film-media-actions">
                    <button onClick={() => fileInput.current.click()} disabled={busy}>
                      <Plus size={16} />
                      上传素材
                    </button>
                    <button onClick={() => setDialog('assets')} disabled={busy}>
                      <FolderOpen size={16} />
                      资产库
                    </button>
                    <button
                      onClick={() => {
                        try {
                          setDialog({ kind: 'canvas', sources: listCanvasFilmSources() });
                        } catch (error) {
                          setOperationError(error.message);
                        }
                      }}
                      disabled={busy}
                    >
                      现有画布
                    </button>
                  </div>
                  <p className="film-help">点击素材添加视频片段，或替换选中片段。</p>
                  {doc.media.map((media) => (
                    <button
                      key={media.id}
                      className="film-media-item"
                      onClick={() => attachMedia(media)}
                    >
                      <Film size={18} />
                      <span>
                        <strong>{media.name}</strong>
                        <small>
                          {media.type} · {(media.bytes / 1024 / 1024).toFixed(2)} MB
                        </small>
                      </span>
                    </button>
                  ))}
                  {!doc.media.length && <p className="film-empty">上传一段视频，开始编排剧情。</p>}
                  {failedFiles.map(({ file, message }, index) => (
                    <p key={`${file.name}-${index}`} className="film-upload-failure">
                      {file.name}：{message}
                    </p>
                  ))}
                  {failedFiles.length > 0 && (
                    <button
                      onClick={() => importFiles(failedFiles.map((item) => item.file))}
                      disabled={busy}
                    >
                      重试失败素材
                    </button>
                  )}
                </>
              )}
              {tab === 'variables' && (
                <>
                  <div className="film-variable-actions">
                    <button onClick={() => addVariable('number')}>＋ 数字</button>
                    <button onClick={() => addVariable('boolean')}>＋ 状态</button>
                  </div>
                  <p className="film-help">用数字表示好感度，用状态记录是否取得线索。</p>
                  {doc.variables.map((variable) => (
                    <section className="film-variable" key={variable.id}>
                      <input
                        aria-label="变量名称"
                        value={variable.name}
                        onChange={(event) =>
                          updateVariable(variable.id, { name: event.target.value })
                        }
                      />
                      <label>
                        初始值
                        {variable.type === 'boolean' ? (
                          <select
                            value={String(variable.initial)}
                            onChange={(event) =>
                              updateVariable(variable.id, {
                                initial: event.target.value === 'true',
                              })
                            }
                          >
                            <option value="false">否</option>
                            <option value="true">是</option>
                          </select>
                        ) : (
                          <input
                            aria-label="变量初始值"
                            type="number"
                            value={variable.initial}
                            onChange={(event) =>
                              updateVariable(variable.id, { initial: Number(event.target.value) })
                            }
                          />
                        )}
                      </label>
                      <button
                        aria-label={`删除变量 ${variable.name}`}
                        onClick={() =>
                          controller.commit((previous) => ({
                            ...previous,
                            variables: previous.variables.filter((item) => item.id !== variable.id),
                          }))
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </section>
                  ))}
                </>
              )}
            </div>
            <footer>
              <span>
                {doc.nodes.length} 节点 · {doc.edges.length} 跳转
              </span>
              <span>互动视频</span>
            </footer>
          </aside>
        </div>
        <FilmGraph
          controller={controller}
          selected={selected}
          setSelected={setSelected}
          linking={linking}
          setLinking={setLinking}
          onFocusNode={() => {
            panelOrigin.current = document.activeElement;
            setPanel('inspector');
          }}
          onAddNode={add}
          onOpenLibrary={openLibrary}
          onUpload={() => {
            panelOrigin.current = document.activeElement;
            fileInput.current.click();
          }}
        />
        <div
          ref={inspectorRef}
          className="film-drawer-root film-inspector-root"
          hidden={panel !== 'inspector'}
          role={narrow && panel === 'inspector' ? 'dialog' : undefined}
          aria-modal={narrow && panel === 'inspector' ? true : undefined}
          aria-label="节点属性"
          tabIndex={-1}
        >
          <button
            className="film-panel-backdrop"
            aria-label="关闭属性抽屉"
            tabIndex={-1}
            onClick={() => closePanel(true)}
          />
          {panel === 'inspector' && (
            <FilmInspector
              doc={doc}
              node={node}
              change={changeNode}
              onDrawStart={controller.record}
              onClose={() => closePanel(true)}
            />
          )}
        </div>
      </div>
      {selected.length > 0 && (
        <div className="film-selection-actions">
          <span>{selected.length} 个节点</span>
          <button
            onClick={() => controller.commit((previous) => duplicateFilmNodes(previous, selected))}
          >
            <Copy size={14} />
            复制
          </button>
          <button onClick={deleteSelection}>
            <Trash2 size={14} />
            删除
          </button>
        </div>
      )}
      {issues && (
        <section className="film-validation" aria-label="剧情校验">
          <header>
            <strong>{issues.length ? `${issues.length} 项需要处理` : '剧情校验通过'}</strong>
            <button aria-label="关闭校验面板" onClick={() => setIssues(null)}>
              <X size={16} />
            </button>
          </header>
          {issues.map((issue, index) => (
            <button
              key={index}
              onClick={() => {
                if (issue.nodeId) {
                  setSelected([issue.nodeId]);
                  setPanel('inspector');
                  const target = doc.nodes.find((item) => item.id === issue.nodeId);
                  if (target)
                    controller.commit(
                      (previous) => ({
                        ...previous,
                        view: {
                          ...previous.view,
                          x: 100 - target.position.x * previous.view.z,
                          y: 100 - target.position.y * previous.view.z,
                        },
                      }),
                      { history: false },
                    );
                }
              }}
            >
              {issue.message}
            </button>
          ))}
        </section>
      )}
      {busy && (
        <div className="film-progress" role="status">
          <span>{progress?.message || '正在处理…'}</span>
          {progress?.total > 0 && <progress max={progress.total} value={progress.completed} />}
          <button onClick={() => operation.current?.abort()}>取消</button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...event.target.files];
          event.target.value = '';
          importFiles(files);
        }}
      />
      {preview && (
        <Modal title="影游试玩" className="film-preview-modal" onClose={closePreview}>
          <FilmPlayer manifest={preview} />
        </Modal>
      )}
      {dialog === 'demo' && (
        <Modal title="完整影游示例" className="film-dialog" onClose={closeDialog}>
          <h2>失踪信号</h2>
          <p>五个片段、三个结局，好感度和线索共同改变剧情。示例影片只保存一份。</p>
          <p>载入会替换当前剧情，可以通过撤销恢复。</p>
          <button className="film-primary" disabled={busy} onClick={example}>
            载入示例
          </button>
        </Modal>
      )}
      {dialog === 'assets' && (
        <AgentAssetPicker
          title="为影游导入素材"
          onClose={closeDialog}
          isAssetDisabled={(item) =>
            item.mediaType === 'text' ? '影游仅支持图片、视频和音频' : false
          }
          onPickAssets={async (items) => {
            const sources = pickerAssetReferences(items).map((item) => ({
              name: item.name,
              url: asset(item.source.value),
            }));
            if (!sources.length) throw new Error('所选资产没有可导入的媒体文件');
            if (!(await importUrls(sources))) throw new Error('导入未完成，请检查提示并重试');
          }}
        />
      )}
      {dialog?.kind === 'canvas' && (
        <Modal title="从现有画布导入" className="film-dialog" onClose={closeDialog}>
          <h2>现有画布素材</h2>
          <p>仅导入选中的媒体文件，原画布保持原样。</p>
          {dialog.sources.length ? (
            dialog.sources.map((source) => (
              <button
                key={source.id}
                className="film-source-row"
                disabled={busy}
                onClick={() => importUrls([source])}
              >
                <Film size={16} />
                <span>
                  {source.title}
                  <small>{source.project}</small>
                </span>
                <Plus size={16} />
              </button>
            ))
          ) : (
            <p>当前浏览器没有可导入的画布媒体。你可以上传本地素材。</p>
          )}
        </Modal>
      )}
      {dialog === 'publish' && (
        <Modal
          title="发布影游"
          className="film-dialog"
          onClose={() => {
            operation.current?.abort();
            setDialog(null);
            setPassword('');
          }}
        >
          <h2>发布作品</h2>
          <p>发布后，观众打开链接即可观看并参与互动。</p>
          {publishResult ? (
            <>
              <a href={publishResult.url} target="_blank" rel="noreferrer">
                打开已发布作品
              </a>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(publishResult.url)
                    .then(() => toast?.('链接已复制'))
                    .catch(() => setOperationError('复制失败，请选择上方链接复制'))
                }
              >
                复制作品链接
              </button>
            </>
          ) : (
            <>
              <label>
                管理口令
                <input
                  type="password"
                  autoComplete="current-password"
                  aria-label="发布管理口令"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <p className="film-help">素材与播放器上传至作品存储，发布后保留该版本。</p>
              <button className="film-primary" disabled={busy || !password} onClick={publish}>
                发布当前版本
              </button>
              {busy && (
                <button
                  onClick={() => {
                    operation.current?.abort();
                    setOperationError('发布已取消。再次发布可继续本版本已上传的素材。');
                  }}
                >
                  取消发布
                </button>
              )}
            </>
          )}
          {operationError && <p role="alert">{operationError}</p>}
        </Modal>
      )}
    </main>
  );
}
