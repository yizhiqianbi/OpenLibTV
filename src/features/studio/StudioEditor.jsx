import { StudioStage } from './components/StudioStage.jsx';
import { StudioDialogs } from './components/StudioDialogs.jsx';

import { StudioMonitor } from './components/StudioMonitor.jsx';
import { StudioInspector } from './components/StudioInspector.jsx';
import { StudioTimeline } from './components/StudioTimeline.jsx';
import StudioFloatingPreview from './components/StudioFloatingPreview.jsx';
import React, { useState, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Move3D,
  Play,
  Share2,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Clock,
} from 'lucide-react';

import '../canvas/canvas.css';
import { presets } from './catalog.jsx';
import { EditorDialog as StudioModal } from '../../components/EditorDialog.jsx';
import { cloneSnapshot, createLocalId } from '../editor/model.js';
import { download as saveFile, downloadBlob } from '../editor/browser.js';
import { useSnapshotHistory } from '../editor/useSnapshotHistory.js';
import { useStudioDocument, useStudioAutosave } from './hooks/useStudioDocument.js';
import { useStudioPlayback } from './hooks/useStudioPlayback.js';
import { useStudioImport } from './hooks/useStudioImport.js';
import { useStudioKeyboard } from './hooks/useStudioKeyboard.js';
import {
  resolveStudioRoute,
  createStudioObject,
  createStudioKeyframe,
  createStudioNodeCopy,
  patchStudioKeyframe,
  upsertStudioKeyframe,
  duplicateStudioObject,
  transformAt,
} from './model.js';

import { writeCanvasSnapshot } from '../canvas/document-api.js';
const uid = () => createLocalId('studio');
import './studio.css';
import { importedClipTracks, sameClip } from './animation-model.js';
import {
  patchStudioRow,
  studioNameError,
  studioNodeCopyId,
  studioOutlinerRows,
} from './outliner/model.js';
import { useStudioCameras } from './hooks/useStudioCameras.js';
import { CameraMotionPanel } from './camera/CameraMotionPanel.jsx';
import { studioRowRelations } from './outliner/model.js';
import { useStudioMonitor } from './hooks/useStudioMonitor.js';
import { materialPatch } from './material.js';

export default function StudioEditor({ path = '', navigate, login, toast, user }) {
  const { givenId, validEntry } = resolveStudioRoute(path, window.location.search);
  const [localId] = useState(() => uid());
  const id = givenId || localId;
  const [title, setTitle] = useState('未命名 3D-BOX'),
    [objects, setObjects] = useState([]),
    [frames, setFrames] = useState([]),
    [cameraPaths, setCameraPaths] = useState([]),
    [cameraTimeline, setCameraTimeline] = useState(null),
    [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState(null),
    [mode, setMode] = useState('select'),
    [workspace, setWorkspace] = useState('compose'),
    [viewMode, setViewMode] = useState('orbit'),
    [grid, setGrid] = useState(true),
    [leftOpen, setLeftOpen] = useState(true),
    [rightOpen, setRightOpen] = useState(true),
    [timeline, setTimeline] = useState(true),
    [pipCameraId, setPipCameraId] = useState(null),
    [time, setTime] = useState(0),
    [animationSelection, setAnimationSelection] = useState(null),
    [duration, setDuration] = useState(10),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1),
    [loop, setLoop] = useState(true),
    [autoKey, setAutoKey] = useState(false),
    [menu, setMenu] = useState(null),
    [dialog, setDialog] = useState(null),
    [prompt, setPrompt] = useState(''),
    [messages, setMessages] = useState([]),
    [conversation, setConversation] = useState(false),
    [saved, setSaved] = useState(true),
    [error, setError] = useState(''),
    [assetSearch, setAssetSearch] = useState(''),
    [rename, setRename] = useState(false),
    [ratio, setRatio] = useState('16:9'),
    [exportType, setExportType] = useState('image'),
    [busy, setBusy] = useState(false),
    [videoExporting, setVideoExporting] = useState(false),
    [videoExportProgress, setVideoExportProgress] = useState(0),
    [loadingModels, setModelLoading] = useState(0);
  const viewport = useRef(),
    fileInput = useRef(),
    clipboard = useRef(null),
    materialEdit = useRef(null),
    videoExportAbort = useRef(null);
  const notify = (m) => toast?.(m);
  const baseRows = useMemo(() => studioOutlinerRows(objects), [objects]);
  const { history, future, record, undo, redo, clearHistory } = useSnapshotHistory(
    { objects, frames, cameraPaths, cameraTimeline, duration },
    {
      limit: 60,
      restore: (snapshot) => {
        setObjects(snapshot.objects);
        setFrames(snapshot.frames);
        setCameraPaths(snapshot.cameraPaths || []);
        setCameraTimeline(snapshot.cameraTimeline || null);
        if (snapshot.duration) setDuration(snapshot.duration);
      },
    },
  );
  const loadedId = useStudioDocument(id, validEntry, user, {
    setTitle,
    setObjects,
    setFrames,
    setDuration,
    setRatio,
    setLoaded,
    setSelected,
    setTime,
    setAnimationSelection,
    setPlaying,
    setCameraPaths,
    setCameraTimeline,
    setViewMode,
    clearHistory,
  });
  const discardPendingSave = useStudioAutosave(
    {
      id,
      title,
      objects,
      frames,
      cameraPaths,
      cameraTimeline,
      duration,
      ratio,
      time,
      animationSelection,
      viewMode,
    },
    { loaded: loaded && loadedId === id && validEntry, user, setSaved, notify },
  );
  useStudioPlayback({ playing, rate, duration, loop, setTime, setPlaying });
  const cameraMotion = useStudioCameras({
    baseRows,
    cameraPaths,
    setCameraPaths,
    cameraTimeline,
    setCameraTimeline,
    duration,
    setDuration,
    time,
    setTime,
    setPlaying,
    setViewMode,
    setWorkspace,
    selected,
    setSelected,
    record,
    viewport,
    baseAnimationDuration: Math.max(
      0,
      ...objects.flatMap((object) => (object.clips || []).map((clip) => clip.duration)),
    ),
  });
  const outlinerRows = studioRowRelations(cameraMotion.rows);
  const monitors = useStudioMonitor({
    enabled: leftOpen && loaded && loadedId === id && validEntry,
    sceneKey: id,
    topViewActive: viewMode === 'top',
    cameras: cameraMotion.cameras,
  });
  const selectMonitorCamera = (cameraId) => {
    const shot = cameraMotion.shots.find((shot) => shot.cameraId === cameraId);
    if (shot) setTime(shot.start);
    setSelected(cameraId);
    setPlaying(false);
    setViewMode('orbit');
    viewport.current?.focus?.(cameraId);
  };
  const add = (type, lightType = null) => {
    record();
    const label =
      lightType === 'directional'
        ? '平行光'
        : lightType === 'point'
          ? '点光'
          : lightType === 'spot'
            ? '聚光'
            : presets.find((p) => p[0] === type)?.[1] || '模型';
    const object = createStudioObject(type, label, objects);
    if (type === 'light' && lightType) object.lightType = lightType;
    if (type === 'camera') Object.assign(object, viewport.current?.cameraPose?.() || {});
    setObjects((o) => [...o, object]);
    setSelected(object.id);
    setMenu(null);
  };
  const addKey = (object, changes = {}) => {
    if (!object) return;
    if (object.type === 'camera') {
      if (cameraMotion.activeRig?.cameraId === object.id) cameraMotion.addState();
      else cameraMotion.openCamera(object.id);
      return;
    }
    const key = createStudioKeyframe(object, time, changes);
    setFrames((frames) => upsertStudioKeyframe(frames, key, time));
    return key;
  };
  const transform = (objectId, data) => {
    const row = outlinerRows.find((row) => row.id === objectId);
    if (!row) return;
    if (row.cameraRig) {
      cameraMotion.patchEntity(objectId, data);
      return;
    }
    const localFrames = frames.filter((frame) => frame.objectId === objectId);
    const localAnimated = new Set(
      localFrames.flatMap((frame) =>
        ['position', 'rotation', 'scale'].filter((key) => key in frame),
      ),
    );
    const currentKey = localFrames.find((frame) => Math.abs(frame.time - time) < 0.04);
    const baseChanges = Object.fromEntries(
      Object.entries(data).filter(
        ([property]) => !row.animatedProperties?.includes(property) && !localAnimated.has(property),
      ),
    );
    const keyChanges = Object.fromEntries(
      Object.entries(data).filter(
        ([property]) => localAnimated.has(property) && currentKey && property in currentKey,
      ),
    );
    const autoKeyChanges = Object.fromEntries(
      Object.entries(data).filter(([property]) => localAnimated.has(property)),
    );
    const shouldAutoKey =
      autoKey && !row.subtree && !currentKey && Object.keys(autoKeyChanges).length > 0;
    if (!Object.keys(baseChanges).length && !Object.keys(keyChanges).length && !shouldAutoKey)
      return;
    record();
    if (Object.keys(baseChanges).length)
      setObjects((list) => patchStudioRow(list, objectId, baseChanges));
    if (Object.keys(keyChanges).length)
      setFrames((list) => patchStudioKeyframe(list, { objectId, time, changes: keyChanges }));
    if (shouldAutoKey) addKey({ ...transformAt(row, frames, time), id: row.id }, autoKeyChanges);
    else if (autoKey && !row.subtree && !Object.keys(keyChanges).length) addKey(row, baseChanges);
  };
  const materialChange = (objectId, changes) => {
    const row = outlinerRows.find((candidate) => candidate.id === objectId);
    const next = materialPatch(changes);
    if (!row || !Object.keys(next).length) return;
    if (Object.entries(next).every(([key, value]) => row[key] === value)) return;
    if (materialEdit.current?.objectId !== objectId) {
      record();
      materialEdit.current = { objectId };
    }
    setObjects((list) => patchStudioRow(list, objectId, next));
  };
  const materialCommit = (objectId) => {
    if (materialEdit.current?.objectId === objectId) materialEdit.current = null;
  };
  const lightChange = (objectId, changes) => {
    const row = outlinerRows.find((candidate) => candidate.id === objectId);
    if (!row || row.type !== 'light' || !changes || typeof changes !== 'object') return;
    const next = Object.fromEntries(
      Object.entries(changes).filter(([key, value]) => {
        if (key === 'lightType')
          return !row.subtree && ['directional', 'point', 'spot'].includes(value);
        if (key === 'castShadow') return typeof value === 'boolean';
        return Number.isFinite(value);
      }),
    );
    if (!Object.keys(next).length) return;
    record();
    setObjects((list) => patchStudioRow(list, objectId, next));
  };
  const renameObject = (objectId, draft) => {
    const message = studioNameError(outlinerRows, objectId, draft);
    if (message) return message;
    const name = draft.trim();
    if (outlinerRows.find((row) => row.id === objectId)?.name === name) return '';
    const before = outlinerRows.find((row) => row.id === objectId)?.name;
    if (cameraMotion.patchEntity(objectId, { name })) return '';
    record();
    setObjects((list) => patchStudioRow(list, objectId, { name }));
    setCameraPaths((rigs) =>
      rigs.map((rig) =>
        rig.settings.targetName === before
          ? { ...rig, bake: true, settings: { ...rig.settings, targetName: name } }
          : rig,
      ),
    );
    return '';
  };
  const toggleHidden = (objectId) => {
    const row = outlinerRows.find((row) => row.id === objectId);
    if (!row) return;
    if (row.cameraRig) {
      cameraMotion.patchEntity(objectId, { visible: row.visible === false });
      return;
    }
    record();
    setObjects((list) => patchStudioRow(list, objectId, { visible: row.visible === false }));
  };
  const remove = () => {
    const row = outlinerRows.find((candidate) => candidate.id === selected);
    if (!row) return;
    if (row.subtreeCopy) {
      record();
      setObjects((list) =>
        list.map((object) =>
          object.id === row.ownerId
            ? {
                ...object,
                nodeCopies: (object.nodeCopies || []).filter((copy) => copy.id !== row.copyId),
              }
            : object,
        ),
      );
      setSelected(row.parentId);
      return;
    }
    if (row.subtree) {
      // The source editor removes the selected entity from its parent. Keep
      // the source GLB/path stable locally and persist a tombstone instead;
      // this makes the operation reversible and lets the loader reattach the
      // exact original Object3D on undo or reload.
      record();
      setObjects((list) => patchStudioRow(list, selected, { deleted: true }));
      setSelected(row.parentId);
      return;
    }
    if (!objects.some((object) => object.id === selected)) return;
    record();
    setObjects((list) => list.filter((o) => o.id !== selected));
    setFrames((f) => f.filter((k) => k.objectId !== selected));
    setCameraPaths((rigs) =>
      rigs.filter((rig) => rig.cameraId !== selected && rig.sourceOwnerId !== selected),
    );
    setCameraTimeline((timeline) =>
      timeline
        ? {
            ...timeline,
            shots: timeline.shots.filter(
              (shot) =>
                shot.cameraId !== selected && !shot.cameraId.startsWith(`${selected}:node:`),
            ),
          }
        : null,
    );
    setSelected(null);
  };
  const appendDuplicate = (template, offset = 1) => {
    if (!template || template.subtree) return false;
    record();
    const d = duplicateStudioObject(template);
    d.position = [template.position[0] + offset, ...template.position.slice(1)];
    setObjects((list) => [...list, d]);
    setSelected(d.id);
    return true;
  };
  const appendSubtreeCopy = (row) => {
    if (!row?.subtree) return false;
    const owner = objects.find((object) => object.id === row.ownerId);
    const copy = createStudioNodeCopy(row, uid);
    if (!owner || !copy) return false;
    record();
    setObjects((list) =>
      list.map((object) =>
        object.id === owner.id
          ? { ...object, nodeCopies: [...(object.nodeCopies || []), copy] }
          : object,
      ),
    );
    setSelected(studioNodeCopyId(owner.id, copy.id));
    return true;
  };
  const duplicate = () => {
    const row = outlinerRows.find((candidate) => candidate.id === selected);
    if (row?.subtree) return appendSubtreeCopy(row);
    return appendDuplicate(objects.find((o) => o.id === selected));
  };
  const copy = () => {
    const row = outlinerRows.find((candidate) => candidate.id === selected);
    if (row?.subtree) {
      clipboard.current = {
        subtree: { ownerId: row.ownerId, sourcePath: [...(row.sourcePath || row.path)] },
        pasteCount: 0,
      };
      notify('已复制节点');
      return true;
    }
    const object = objects.find((o) => o.id === selected);
    if (!object) return false;
    clipboard.current = { template: cloneSnapshot(object), pasteCount: 0 };
    notify('已复制对象');
    return true;
  };
  const paste = () => {
    const entry = clipboard.current;
    if (entry?.subtree) {
      const owner = objects.find((object) => object.id === entry.subtree.ownerId);
      const source = owner?.subtree?.find(
        (node) =>
          Array.isArray(node.path) && node.path.join('.') === entry.subtree.sourcePath.join('.'),
      );
      if (!source) return false;
      const row = { ...source, ownerId: owner.id, subtree: true };
      return appendSubtreeCopy(row);
    }
    if (!entry?.template) return false;
    const offset = ++entry.pasteCount;
    const pasted = appendDuplicate(entry.template, offset);
    if (pasted) notify('已粘贴对象');
    return pasted;
  };
  useStudioKeyboard({
    addKey,
    cameraMotion,
    copy,
    duplicate,
    frames,
    objects,
    paste,
    record,
    redo,
    remove,
    selected,
    setDialog,
    setMenu,
    setMode,
    setPlaying,
    setSelected,
    setWorkspace,
    time,
    undo,
    viewport,
    setViewMode,
    viewMode,
  });
  const screenshot = () => {
    const image = viewport.current?.capture();
    if (image) {
      const a = document.createElement('a');
      a.href = image;
      a.download = title + '.png';
      a.click();
      notify('导出成功');
    }
  };
  const exportGLB = async () => {
    setBusy(true);
    try {
      const buffer = await viewport.current?.exportGLB();
      if (buffer) saveFile(title + '.glb', buffer, 'model/gltf-binary');
    } catch {
      notify('导出失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  const exportVideo = async () => {
    if (videoExporting) return;
    const abort = new AbortController();
    videoExportAbort.current = abort;
    setVideoExporting(true);
    setVideoExportProgress(0);
    try {
      const result = await viewport.current?.exportVideo({
        duration,
        fps: 30,
        signal: abort.signal,
        onProgress: setVideoExportProgress,
      });
      if (result?.blob) {
        downloadBlob(result.blob, `${title}.webm`);
        notify('视频导出成功');
      }
    } catch (error) {
      if (error?.name === 'AbortError') notify('视频导出已取消');
      else notify(error?.message || '视频导出失败，请重试');
    } finally {
      videoExportAbort.current = null;
      setVideoExporting(false);
      setVideoExportProgress(0);
    }
  };
  const cancelVideoExport = () => videoExportAbort.current?.abort();
  const importFile = useStudioImport(id, {
    viewport,
    record,
    setObjects,
    setSelected,
    setBusy,
    notify,
    onImported: (object) => {
      cameraMotion.refreshCameraData(object.id, object.cameraData);
      if (object.cameraData?.aspect) {
        const aspect = object.cameraData.aspect;
        setRatio(
          ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].find((ratio) => {
            const [width, height] = ratio.split(':').map(Number);
            return Math.abs(width / height - aspect) < 1e-6;
          }) || `${aspect}:1`,
        );
      }
      const clips = importedClipTracks([...objects, object]);
      if (!object.clips?.length) return;
      setDuration(
        Math.max(
          ...clips.map((clip) => clip.duration),
          ...cameraMotion.shots.map((shot) => shot.end),
          object.cameraData?.timeline?.duration || 0,
          0.1,
        ),
      );
      setAnimationSelection(null);
      setTime(0);
      setPlaying(false);
    },
  });
  const animationTracks = importedClipTracks(objects);
  const activeAnimationSelection = animationTracks.some((clip) =>
    sameClip(clip, animationSelection),
  )
    ? animationSelection
    : null;
  const selectAnimation = (clip) => {
    const next = sameClip(activeAnimationSelection, clip)
      ? null
      : { objectId: clip.objectId, index: clip.index };
    setAnimationSelection(next);
    setDuration(
      Math.max(
        next ? clip.duration : Math.max(...animationTracks.map((clip) => clip.duration)),
        ...cameraMotion.shots.map((shot) => shot.end),
        0.1,
      ),
    );
    setTime(0);
    setPlaying(true);
  };
  const refreshAnimations = (objectId, clips) =>
    setObjects((objects) =>
      objects.map((object) =>
        object.id === objectId && JSON.stringify(object.clips) !== JSON.stringify(clips)
          ? { ...object, clips }
          : object,
      ),
    );
  const refreshHierarchy = (objectId, subtree) =>
    setObjects((objects) =>
      objects.map((object) =>
        object.id === objectId && JSON.stringify(object.subtree) !== JSON.stringify(subtree)
          ? { ...object, subtree }
          : object,
      ),
    );
  const toCanvas = () => {
    const image = viewport.current?.capture();
    if (!image) return;
    const project = uid();
    const node = {
      id: uid(),
      type: 'image',
      position: { x: 0, y: 0 },
      width: 500,
      height: 281,
      data: {
        type: 'image',
        name: title,
        url: [image],
        params: { prompt: '', model: 'lib-image-2.5-s' },
      },
    };
    try {
      writeCanvasSnapshot(project, {
        title,
        nodes: [node],
        edges: [],
        view: { x: 170, y: 170, z: 1 },
      });
    } catch {
      notify('保存画布失败，请检查浏览器存储空间后重试。');
      return;
    }
    navigate?.('/canvas?projectId=' + project);
  };
  const send = () => {
    if (!prompt.trim()) return;
    setMessages((m) => [
      ...m,
      { role: 'user', text: prompt },
      {
        role: 'assistant',
        text: '生成服务尚未连接，场景描述已保留。你可以在编辑器中继续添加角色、道具和机位，设置关键帧与镜头。',
      },
    ]);
    setConversation(true);
    setPrompt('');
  };
  const share = async () => {
    const url = window.location.origin + '/animation-preview?projectId=' + id;
    try {
      await navigator.clipboard.writeText(url);
      notify('已复制');
    } catch {
      notify('请手动复制链接');
    }
  };
  const active = outlinerRows.find((o) => o.id === selected);
  const activeLocalFrames = active ? frames.filter((frame) => frame.objectId === active.id) : [];
  const activeAtTime = active ? transformAt(active, frames, time) : active;
  const activeForInspector = active
    ? {
        ...activeAtTime,
        animatedProperties: [
          ...new Set([
            ...(active.animatedProperties || []),
            ...activeLocalFrames.flatMap((frame) =>
              ['position', 'rotation', 'scale'].filter((key) => key in frame),
            ),
          ]),
        ],
        keyframeEditableProperties: activeLocalFrames.find(
          (frame) => Math.abs(frame.time - time) < 0.04,
        )
          ? ['position', 'rotation', 'scale'].filter((key) =>
              activeLocalFrames.some((frame) => Math.abs(frame.time - time) < 0.04 && key in frame),
            )
          : [],
      }
    : active;
  const cameras = cameraMotion.cameras;
  if (!validEntry)
    return (
      <div className="cv-studio cv-studio-invalid">
        <StudioModal title="项目打开失败">
          <p>请检查以下事项：</p>
          <ol>
            <li>是否已切换至项目所在的个人空间或团队</li>
            <li>项目链接是否完整、正确</li>
            <li>项目是否已被删除或停止分享</li>
          </ol>
          <footer>
            <button onClick={() => navigate?.('/3d-box')}>返回首页</button>
            <button
              className="cv-primary"
              onClick={() => navigate?.('/animation-preview?newProject=true')}
            >
              新建项目
            </button>
          </footer>
        </StudioModal>
      </div>
    );
  if (!user)
    return (
      <main className="cv-auth-wait">
        <p>登录后查看你的 3D-BOX</p>
        <button onClick={() => login?.({ closeOnClickOutside: false })}>登录</button>
        <button onClick={() => navigate?.('/3d-box')}>返回 3D-BOX</button>
      </main>
    );
  return (
    <main
      className={'cv-studio ' + (!timeline ? 'cv-studio-no-timeline' : '')}
      style={{
        '--studio-left': leftOpen ? '240px' : '0px',
        '--studio-right': rightOpen ? '240px' : '0px',
        '--studio-timeline': timeline ? '190px' : '0px',
      }}
      onPointerDown={(e) => {
        if (!e.target.closest('.cv-studio-popover,.cv-studio-menu-trigger')) setMenu(null);
      }}
    >
      <div className={'cv-studio-left-chrome ' + (leftOpen ? 'open' : '')}>
        <button
          className="cv-studio-menu-trigger cv-studio-logo"
          title="项目菜单"
          onClick={() => setMenu(menu === 'project' ? null : 'project')}
        >
          PenStudio
          <ChevronDown size={12} />
        </button>
        {rename ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setRename(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setRename(false);
            }}
          />
        ) : (
          <button className="cv-studio-title" onDoubleClick={() => setRename(true)}>
            {title}
          </button>
        )}
        <button
          aria-label={leftOpen ? '收起监视器' : '展开监视器'}
          onClick={() => setLeftOpen(!leftOpen)}
        >
          {leftOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>
      <nav className="cv-studio-modes">
        <button
          className={workspace === 'compose' ? 'active' : ''}
          onClick={() => {
            setWorkspace('compose');
            if (viewMode === 'film') setViewMode('orbit');
            setPlaying(false);
          }}
        >
          <Move3D size={16} />
          场景调度
        </button>
        <button
          className={workspace === 'animation' ? 'active' : ''}
          onClick={() => {
            setWorkspace('animation');
            if (cameraMotion.shots.length) setViewMode('film');
            setTimeline(true);
          }}
        >
          <Play size={16} />
          成片预演
        </button>
      </nav>
      <div className={'cv-studio-right-chrome ' + (rightOpen ? 'open' : '')}>
        <button
          aria-label={rightOpen ? '收起项目资产' : '展开项目资产'}
          onClick={() => setRightOpen(!rightOpen)}
        >
          {rightOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        </button>
        <span>{saved ? '' : '保存中…'}</span>
        <button aria-label="分享 3D-BOX" onClick={() => setDialog('share')}>
          <Share2 size={16} />
        </button>
        <button className="cv-studio-export" onClick={() => setDialog('export')}>
          导出
          <ChevronDown size={12} />
        </button>
      </div>
      {menu === 'project' && (
        <div className="cv-studio-project-menu cv-studio-popover">
          <button onClick={() => navigate?.('/3d-box')}>
            <ArrowLeft size={16} />
            查看全部 3D-BOX
          </button>
          <button
            onClick={() => {
              setRename(true);
              setMenu(null);
            }}
          >
            重命名项目
          </button>
          <button onClick={() => navigate?.('/animation-preview?newProject=true')}>
            <Plus size={16} />
            创建新 3D-BOX
          </button>
          <button onClick={() => setDialog('history')}>
            <Clock size={16} />
            已保存的版本
          </button>
          <button onClick={() => setDialog('delete')}>
            <Trash2 size={16} />
            删除当前 3D-BOX
          </button>
        </div>
      )}
      <StudioStage
        {...{
          active,
          animationSelection: activeAnimationSelection,
          onAnimations: refreshAnimations,
          onHierarchy: refreshHierarchy,
          onCameraData: cameraMotion.refreshCameraData,
          monitor: monitors.channel,
          playing,
          cameraPaths: cameraMotion.validPaths,
          cameraTimeline: cameraMotion.timeline,
          add,
          conversation,
          error,
          loadingModels,
          setModelLoading,
          fileInput,
          frames,
          future,
          grid,
          history,
          menu,
          messages,
          mode,
          notify,
          objects,
          prompt,
          ratio,
          redo,
          screenshot,
          selected,
          send,
          setConversation,
          setError,
          setGrid,
          setMenu,
          setMode,
          setPrompt,
          setRatio,
          setSelected,
          setTimeline,
          setViewMode,
          time,
          timeline,
          title,
          transform,
          undo,
          viewMode,
          viewport,
        }}
      />
      {leftOpen && (
        <StudioMonitor
          {...{ setViewMode, viewMode }}
          monitor={monitors}
          selectedCameraId={cameras.some((camera) => camera.id === selected) ? selected : null}
          onSelectCamera={selectMonitorCamera}
          onOpenPip={setPipCameraId}
          pipCameraId={pipCameraId}
          disabled={!loaded || loadedId !== id}
        />
      )}
      {pipCameraId && cameras.some((camera) => camera.id === pipCameraId) && (
        <StudioFloatingPreview
          label={cameras.find((camera) => camera.id === pipCameraId)?.name || '机位预览'}
          frame={monitors.frames[pipCameraId]}
          playing={playing}
          onTogglePlay={() => setPlaying((value) => !value)}
          onClose={() => setPipCameraId(null)}
        />
      )}
      {rightOpen && (
        <StudioInspector
          {...{
            active: activeForInspector,
            addKey,
            assetSearch,
            duplicate,
            menu,
            objects,
            onMaterialChange: materialChange,
            onMaterialCommit: materialCommit,
            onLightChange: lightChange,
            outlinerRows,
            renameObject,
            toggleHidden,
            record,
            remove,
            selected,
            setAssetSearch,
            setMenu,
            setSelected,
            transform,
            viewport,
            cameraMotion,
            cameraPanel: cameraMotion.activeRig && (
              <CameraMotionPanel
                motion={cameraMotion}
                camera={cameras.find((camera) => camera.id === cameraMotion.activeRig.cameraId)}
                rows={outlinerRows}
                onCameraChange={transform}
              />
            ),
          }}
        />
      )}
      {timeline && (
        <StudioTimeline
          {...{
            addKey,
            animationTracks,
            animationSelection: activeAnimationSelection,
            selectAnimation,
            autoKey,
            duration,
            frames,
            loop,
            objects,
            playing,
            rate,
            record,
            selected,
            setAutoKey,
            setDuration: (value) => {
              record();
              setDuration(value);
              setCameraTimeline((timeline) => (timeline ? { ...timeline, duration: value } : null));
            },
            setFrames,
            setLoop,
            setPlaying,
            setRate,
            setSelected,
            setTime,
            setTimeline,
            time,
            cameras,
            cameraShots: cameraMotion.shots,
            onSelectShot: cameraMotion.selectShot,
            onTrimShot: cameraMotion.trimShot,
          }}
        />
      )}
      <input
        type="file"
        ref={fileInput}
        accept=".glb"
        hidden
        onChange={(e) => {
          importFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <StudioDialogs
        onProjectDeleted={discardPendingSave}
        {...{
          busy,
          dialog,
          duration,
          exportGLB,
          exportVideo,
          exportType,
          frames,
          id,
          navigate,
          notify,
          objects,
          ratio,
          screenshot,
          setDialog,
          setExportType,
          share,
          title,
          hasAnimation:
            frames.length > 0 ||
            objects.some((object) => Array.isArray(object.clips) && object.clips.length),
          videoExporting,
          videoExportProgress,
          onCancelVideoExport: cancelVideoExport,
          toCanvas,
        }}
      />
      {busy && <div className="cv-studio-busy">处理中...</div>}
    </main>
  );
}
