import { CanvasContextMenu } from './components/CanvasContextMenu.jsx';
import { CanvasProjectMenu } from './components/CanvasProjectMenu.jsx';
import { CanvasHeader } from './components/CanvasHeader.jsx';
import { CanvasViewport } from './components/CanvasViewport.jsx';
import { useCanvasEdgeSelection } from './hooks/useCanvasEdgeSelection.js';

import { CanvasDialogs } from './components/CanvasDialogs.jsx';
import { ChatReplayPanel } from './components/ChatReplayPanel.jsx';
import { CanvasAgentPanel } from './components/CanvasAgentPanel.jsx';
import SkillCreatorIntake from './components/SkillCreatorIntake.jsx';
import { NodeSettingsPanel } from './components/NodeSettingsPanel.jsx';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LockKeyhole } from 'lucide-react';
import './canvas.css';
import { loadContent } from '../../services/content.ts';

import { useSnapshotHistory } from '../editor/useSnapshotHistory.js';
import { resolveCanvasRoute } from './model.js';
import { isCanvasGroup, canvasNodeSize } from './domain/groups.js';
import {
  prepareCanvasNodeDrag,
  projectCanvasNodeDrag,
  finalizeCanvasNodeDrag,
} from './domain/node-drag-drop-model.js';
import { resolveCanvasMultiConnectionEntry } from './domain/multi-connection-entry-model.js';
import { fitCanvasView, screenToCanvas, zoomCanvasView } from './geometry.js';
import { useCanvasDocument, useCanvasAutosave } from './hooks/useCanvasDocument.js';
import { useCanvasDrafts } from './hooks/useCanvasDrafts.js';
import { useCanvasPointer } from './hooks/useCanvasPointer.js';
import { useCanvasTouch } from './hooks/useCanvasTouch.js';
import { useCanvasConnection } from './hooks/useCanvasConnection.js';
import { useCanvasConnectionMenu } from './hooks/useCanvasConnectionMenu.js';
import { useCanvasMultiConnection } from './hooks/useCanvasMultiConnection.js';
import { useEmbeddedCanvasFocus } from './hooks/useEmbeddedCanvasFocus.js';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard.js';
import { useCanvasWheel } from './hooks/useCanvasWheel.js';
import { useChatReplay } from './hooks/useChatReplay.js';
import { useCanvasAgentAttachments } from './hooks/useCanvasAgentAttachments.js';
import { useCanvasNodePresentation } from './hooks/useCanvasNodePresentation.js';
import { AgentNodePresentationProvider } from '../../components/agent/AgentNodePresentationContext.jsx';
import { useContent } from '../../hooks/useContent.ts';
import { SKILL_ATTACHMENT_ACCEPT } from '../../services/agent-handoff.js';
import { useCanvasNodeActions } from './hooks/useCanvasNodeActions.js';
import { useCanvasGraphActions } from './hooks/useCanvasGraphActions.js';
import { useCanvasDeletionHistory } from './hooks/useCanvasDeletionHistory.js';
import { useCanvasClipDisconnectPort } from './hooks/useCanvasClipDisconnectPort.js';
import { useCanvasClipDisconnect } from './clip-disconnect/useCanvasClipDisconnect.js';
import { useCanvasAgentState, useCanvasAgentActions } from './hooks/useCanvasAgentController.js';
import { useCanvasSnapshotActions } from './hooks/useCanvasSnapshotActions.js';
import { useNodeGenerator } from './generator/useNodeGenerator.js';
import BatchRunDialog from './batch/BatchRunDialog.jsx';
import { useCanvasSelectionActions } from './batch/useCanvasSelectionActions.js';
import { useCanvasDeleteConfirmation } from './batch/useCanvasDeleteConfirmation.js';
import { useCanvasSelectedDeletion } from './batch/useCanvasSelectedDeletion.js';
import { CanvasDeleteConfirmation } from './components/CanvasDeleteConfirmation.jsx';
import CanvasSaveSelectionDialog from './batch/CanvasSaveSelectionDialog.jsx';
import { useStoryboardSlots } from './hooks/useStoryboardSlots.js';
import { StoryboardSlotPicker } from './components/StoryboardSlotPicker.jsx';
import { useCanvasGroupControls } from './hooks/useCanvasGroupControls.js';
import { StoryboardGroupConfirmation } from './components/StoryboardGroupConfirmation.jsx';
import { useCanvasScriptGroupControls } from './hooks/useCanvasScriptGroupControls.js';
import { CanvasScriptGroupConfirmation } from './components/CanvasScriptGroupConfirmation.jsx';
import { useCanvasGroupResize } from './hooks/useCanvasGroupResize.js';
import { useCanvasBatchVideo } from './hooks/useCanvasBatchVideo.js';
import CanvasBatchVideoConfiguration from './components/CanvasBatchVideoConfiguration.jsx';
import { useCanvasReferencePick } from './hooks/useCanvasReferencePick.js';
import { useScriptV2ReferenceImport } from './storyboard/useScriptV2ReferenceImport.js';
import ScriptReferenceImports from './storyboard/ScriptReferenceImports.jsx';
import { useCanvasFocusMode } from './generator/focus/useCanvasFocusMode.js';
import { useCanvasMarkEntry } from './generator/mark/useCanvasMarkEntry.js';
import { useCanvasVideoClipNodes } from './clip-editor/useCanvasVideoClipNodes.js';
import { useCanvasClipComposer } from './clip-editor/useCanvasClipComposer.js';
import { useCanvasClipEditor } from './clip-editor/useCanvasClipEditor.js';
import CanvasClipEditorEntry from './clip-editor/CanvasClipEditorEntry.jsx';

export default function NodeCanvas({
  path = '',
  navigate,
  login,
  toast,
  asset,
  voiceSource,
  roleLibrarySource,
  roleImageReader,
  markSource,
  markImageReader,
  storyboardStitchSource,
  storyboardVideoSource,
  user,
  templateUuid,
  onClose,
  embedded = false,
}) {
  const route = resolveCanvasRoute(path, window.location.search, templateUuid, embedded);
  const { chatShare, readonly, importing, key, storageKey } = route;
  const [nodes, setNodes] = useState([]),
    [edges, setEdgeState] = useState([]),
    [title, setTitle] = useState('未命名项目'),
    [loaded, setLoaded] = useState(false);
  const [replay, setReplay] = useState(0),
    [replayPlaying, setReplayPlaying] = useState(false),
    [sharedMessages, setSharedMessages] = useState([]);
  const [view, setImmediateView] = useState({ x: 0, y: 0, z: readonly ? 0.1 : 1 }),
    [viewAnimation, setViewAnimation] = useState(0),
    [selected, setNodeSelection] = useState([]),
    [spaceHeld, setSpaceHeld] = useState(false),
    [tool, setTool] = useState('select'),
    [menu, setMenu] = useState(null),
    [dialog, setDialog] = useState(null),
    [context, setContext] = useState(null),
    [panel, setPanel] = useState(null),
    [agentOpen, setAgentOpen] = useState(!readonly),
    [agentMode, setAgentMode] = useState('全能创作'),
    [saved, setSaved] = useState(true),
    [rename, setRename] = useState(false),
    [showMap, setShowMap] = useState(false),
    [showEdges, setShowEdges] = useState(true),
    [surface, setSurface] = useState('workflow'),
    [loadError, setLoadError] = useState(''),
    [linking, setLinking] = useState(null),
    [linkPoint, setLinkPoint] = useState(null),
    [search, setSearch] = useState(''),
    [library, setLibrary] = useState([]),
    [libraryTab, setLibraryTab] = useState('图片'),
    [selectionRect, setSelectionRect] = useState(null),
    [shareUrl, setShareUrl] = useState('');
  const [storyboardSlotRequest, setStoryboardSlotRequest] = useState(null);
  const clearEdgeSelection = useRef(null);
  const retireEdgeSelection = useRef(null);
  const getEdgeSelection = useRef(null);
  const deletionHistoryBridge = useRef(null);
  const selectedDeleteGate = useRef(null);
  const setEdges = useCallback((value) => {
    // Accepted graphs retire removed IDs even when two commits share one React event.
    if (Array.isArray(value)) retireEdgeSelection.current?.(value);
    setEdgeState(value);
  }, []);
  const setSelected = useCallback((value) => {
    clearEdgeSelection.current?.();
    setNodeSelection(value);
  }, []);
  const modelContent = useContent('models', null);
  const storyboardVideoSupport = useContent('storyboard-video-support', null);
  const videoModelSupport = useContent('video-model-support', null);
  const imageModelSupport = useContent('image-model-support', null);
  const scriptPresets = useContent('script-presets', null);
  const scriptTextSupport = useContent('script-text-support', null);
  const clipComposeContent = useContent('video-compose-agent-config', null);
  const models = modelContent.data;
  const setView = useCallback((value) => {
    setViewAnimation(0);
    setImmediateView(value);
  }, []);
  const focusNodeView = useCallback((value, options = {}) => {
    setViewAnimation(options.duration ?? 300);
    setImmediateView(value);
  }, []);
  useEffect(() => {
    if (!viewAnimation) return;
    const timer = setTimeout(() => setViewAnimation(0), viewAnimation);
    return () => clearTimeout(timer);
  }, [viewAnimation, view]);
  const canvasRoot = useRef(),
    chatMessages = useRef(),
    board = useRef(),
    fileInput = useRef(),
    agentFileInput = useRef(),
    agentInput = useRef(),
    viewRef = useRef(view),
    currentDocument = useRef(null),
    guarded = useRef(false),
    copied = useRef([]),
    space = useRef(false);
  const pointerCancel = useRef(null);
  const ordinaryPointerActive = useRef(null);
  const cancelAllGestures = useRef(null);
  const focusModeOwner = useRef(null);
  const markModeOwner = useRef(null);
  const storyboardWarning = useRef({ documentKey: storageKey, time: -Infinity });
  viewRef.current = view;
  useEmbeddedCanvasFocus({ canvasRoot, embedded, onClose });
  const notify = (m) => toast?.(m),
    src = (url) => asset?.(url) || url;
  const agentState = useCanvasAgentState(key);
  const {
    prompt,
    setPrompt,
    agentDraft,
    setAgentDraft,
    agentConfig,
    setAgentConfig,
    messages,
    setMessages,
    currentAgentDraft,
    resolvedAgentConfig,
  } = agentState;
  const {
    history,
    future,
    recordSnapshot: rawRecordSnapshot,
    undo: rawUndo,
    redo: rawRedo,
    clearHistory: rawClearHistory,
  } = useSnapshotHistory(
    { nodes, edges },
    {
      restore: (snapshot) => {
        setNodes(snapshot.nodes);
        setEdges(snapshot.edges);
      },
      onRecord: () => setSaved(false),
    },
  );
  const recordSnapshot = useCallback(
    (snapshot) => {
      if (deletionHistoryBridge.current) deletionHistoryBridge.current.recordSnapshot(snapshot);
      else rawRecordSnapshot(snapshot);
    },
    [rawRecordSnapshot],
  );
  const undo = useCallback(() => {
    if (deletionHistoryBridge.current) return deletionHistoryBridge.current.undo();
    rawUndo();
  }, [rawUndo]);
  const redo = useCallback(() => {
    if (deletionHistoryBridge.current) return deletionHistoryBridge.current.redo();
    rawRedo();
  }, [rawRedo]);
  const clearHistory = useCallback(() => {
    deletionHistoryBridge.current?.discard();
    rawClearHistory();
  }, [rawClearHistory]);
  const fit = useCallback(
    (items = nodes) => {
      const bounds = board.current?.getBoundingClientRect();
      if (bounds) setView(fitCanvasView(items, bounds, nodes));
    },
    [nodes, setView],
  );
  useEffect(() => {
    if (!user && !readonly && !guarded.current) {
      guarded.current = true;
      login?.(importing ? { hideCloseButton: true } : undefined);
      if (!importing) navigate?.('/');
    }
  }, [user, readonly, importing, login, navigate]);
  const loadedStorageKey = useCanvasDocument(route, {
    setLoaded,
    setLoadError,
    setAgentOpen,
    setSurface,
    clearHistory,
    setTitle,
    setNodes,
    setEdges,
    setView,
    setSharedMessages,
    setReplay,
    setReplayPlaying,
    board,
    fit,
    setAgentDraft,
    setAgentConfig,
    setPrompt,
    setMessages,
    setSelected,
    setPanel,
    setDialog,
    setContext,
    user,
    notify,
  });
  const documentReady = loaded && loadedStorageKey === storageKey && !loadError;
  const canvasDrafts = useCanvasDrafts({ storageKey, nodes, ready: documentReady });
  currentDocument.current = {
    documentKey: storageKey,
    nodes,
    edges,
    models,
    ready: documentReady,
    readonly,
  };
  const record = () => {
    const graph = currentDocument.current;
    recordSnapshot(canvasDrafts.project({ storageKey, nodes: graph.nodes, edges: graph.edges }));
  };
  const graphActions = useCanvasGraphActions({
    documentKey: storageKey,
    currentDocument,
    setNodes,
    setEdges,
    recordSnapshot,
    projectGraph: (snapshot, options) => canvasDrafts.project({ ...snapshot, storageKey }, options),
    consumeDrafts: (snapshot, options) =>
      canvasDrafts.consume({ ...snapshot, storageKey }, options),
    notify,
  });
  const deletionHistory = useCanvasDeletionHistory({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    recordSnapshot: rawRecordSnapshot,
    captureSnapshot: graphActions.captureDeletionSnapshot,
    undo: rawUndo,
    redo: rawRedo,
    notify,
  });
  deletionHistoryBridge.current = deletionHistory;
  const clipPort = useCanvasClipDisconnectPort({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    getDocument: () => currentDocument.current,
    graphActions,
    history: deletionHistory,
    notify,
  });
  const clipDisconnect = useCanvasClipDisconnect({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    port: clipPort,
    beforeApply: (previous) => deletionHistory.capture(previous),
    notify,
    selectNodes: (ids) => setNodeSelection((current) => [...new Set([...current, ...ids])]),
  });
  const nodePresentation = useCanvasNodePresentation({
    nodes,
    projectId: key,
    documentReady,
    isShareReplay: chatShare,
    board,
    setView: focusNodeView,
  });
  const agentAttachments = useCanvasAgentAttachments({
    documentKey: storageKey,
    enabled:
      documentReady && !readonly && !!user && agentDraft?.skillCreatorIntent?.status !== 'choosing',
    prompt,
    setAgentDraft,
    input: agentInput,
    parts: currentAgentDraft?.parts,
  });
  useEffect(() => {
    if (chatShare && chatMessages.current)
      chatMessages.current.scrollTop = chatMessages.current.scrollHeight;
  }, [replay, chatShare]);
  useChatReplay({ chatShare, replayPlaying, setReplay, setReplayPlaying, sharedMessages });
  const autosave = useCanvasAutosave(
    {
      storageKey,
      key,
      title,
      nodes,
      edges,
      view,
      agentDraft: currentAgentDraft,
      messages,
      agentConfig,
    },
    {
      loaded: loaded && loadedStorageKey === storageKey,
      readonly,
      user,
      setSaved,
      notify,
      projectDrafts: canvasDrafts.project,
      acknowledgeDrafts: (document) => {
        const graph = currentDocument.current;
        if (graph?.documentKey === document.storageKey && graph.ready && !graph.readonly) {
          // A successful save must also settle a draft whose input has unmounted.
          // Project the latest graph so a newer external edit cannot be overwritten.
          const projected = canvasDrafts.project({ ...graph, storageKey: document.storageKey });
          if (projected.nodes !== graph.nodes) {
            currentDocument.current = { ...graph, nodes: projected.nodes };
            setNodes(projected.nodes);
          }
        }
        canvasDrafts.acknowledge(document);
      },
    },
  );
  const point = (event) =>
    screenToCanvas(
      { clientX: event.clientX, clientY: event.clientY },
      board.current.getBoundingClientRect(),
      viewRef.current,
    );
  const referencePick = useCanvasReferencePick({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    getDocument: () => currentDocument.current,
    projectGraph: (graph) => canvasDrafts.project({ ...graph, storageKey }),
    supportContent: scriptTextSupport,
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    cancelOtherGestures: () => {
      focusModeOwner.current?.cancel();
      markModeOwner.current?.cancel();
      cancelAllGestures.current?.();
    },
    setSelected,
    board,
    getView: () => viewRef.current,
    focusView: focusNodeView,
    space,
    tool,
    notify,
    suspended: Boolean(dialog),
    isOtherPointerActive: () => ordinaryPointerActive.current?.() === true,
  });
  const focusMode = useCanvasFocusMode({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    models,
    getDocument: () => currentDocument.current,
    projectGraph: (graph) => canvasDrafts.project({ ...graph, storageKey }),
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    cancelOtherModes: () => {
      referencePick.exit();
      markModeOwner.current?.cancel();
    },
    cancelOtherGestures: () => cancelAllGestures.current?.(),
    setSelected,
    board,
    getView: () => viewRef.current,
    focusView: focusNodeView,
    space,
    tool,
    notify,
    suspended: Boolean(dialog),
    isOtherPointerActive: () => ordinaryPointerActive.current?.() === true,
  });
  focusModeOwner.current = focusMode;
  const markMode = useCanvasMarkEntry({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    models,
    getDocument: () => currentDocument.current,
    projectGraph: (graph) => canvasDrafts.project({ ...graph, storageKey }),
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    source: markSource,
    readImage: markImageReader,
    cancelOtherModes: () => {
      referencePick.exit();
      focusMode.cancel();
    },
    cancelOtherGestures: () => cancelAllGestures.current?.(),
    setSelected,
    board,
    getView: () => viewRef.current,
    focusView: focusNodeView,
    space,
    tool,
    notify,
    suspended: Boolean(dialog),
    isOtherPointerActive: () => ordinaryPointerActive.current?.() === true,
    shouldSuppressClick: (event) => shouldSuppressClick(event),
  });
  markModeOwner.current = markMode;
  const scriptReferences = useScriptV2ReferenceImport({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    getDocument: () => currentDocument.current,
    projectGraph: (graph) => canvasDrafts.project({ ...graph, storageKey }),
    supportContent: scriptTextSupport,
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    notify,
    enterPickMode: referencePick.enter,
  });
  const {
    addNode,
    change,
    update: updateNode,
    connect,
    upload,
    uploadClipFiles,
    uploadShotBreakdownFile,
    updateShotBreakdown,
    generateNode,
  } = useCanvasNodeActions({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    models,
    board,
    point,
    linking,
    record,
    setNodes,
    setEdges,
    setSelected,
    setPanel,
    setMenu,
    setSaved,
    setLinking,
    setLinkPoint,
    connectNodes: graphActions.connectNodes,
    currentDocument,
    commitGraph: graphActions.commitGraph,
    getNodeIncarnation: graphActions.getNodeIncarnation,
    notify,
  });
  const update = (id, data) => {
    const handled = focusMode.patchNode(id, data);
    return handled === null ? updateNode(id, data) : handled;
  };
  const onShotBreakdownUpload = (nodeId, file) => {
    void uploadShotBreakdownFile(nodeId, file);
  };
  const onShotBreakdownPick = (nodeId) => {
    referencePick.enter(nodeId);
  };
  const agentActions = useCanvasAgentActions({
    state: agentState,
    ready: documentReady,
    readonly,
    busy: agentAttachments.busy,
    input: agentInput,
    setAgentOpen,
    projectId: key,
    workspaceId: route.query.get('spaceId')?.trim(),
    title,
    nodes,
    notify,
  });
  const clipComposer = useCanvasClipComposer({
    documentKey: storageKey,
    projectId: key,
    ready: documentReady,
    readonly,
    configContent: clipComposeContent,
    getDocument: () => currentDocument.current,
    getNodeIncarnation: graphActions.getNodeIncarnation,
    projectGraph: (graph) => canvasDrafts.project({ ...graph, storageKey }),
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    mapUrl: src,
    submitRequest: agentActions.requestClipCompose,
    notify,
  });
  const clipEditor = useCanvasClipEditor({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    getDocument: () => currentDocument.current,
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    registerDraft: canvasDrafts.register,
    board,
    viewRef,
    focusView: focusNodeView,
    setSelected,
    cancelOtherGestures: () => cancelAllGestures.current?.(),
    uploadFiles: (files, options) => uploadClipFiles(files, options),
    notify,
  });
  const clipNodes = useCanvasVideoClipNodes({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    nodes,
    edges,
    editingClipNodeId: clipEditor.nodeId,
    editingClipPreviewExpanded: clipEditor.previewExpanded,
    currentDocument,
    setNodes,
    isInteracting: () => ordinaryPointerActive.current?.() === true,
  });
  const openNodePanel = (id) => {
    if (nodes.find((node) => node.id === id)?.type === 'video-clip') {
      setSelected([id]);
      setPanel(null);
    } else setPanel(id);
  };
  const storyboardSlots = useStoryboardSlots({
    nodes,
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    getDocument: () => currentDocument.current,
    change,
    setSelected,
    notify,
    onInserted: (groupId) =>
      queueMicrotask(() => {
        if (currentDocument.current?.documentKey !== storageKey) return;
        const element = [...(canvasRoot.current?.querySelectorAll('[data-node-id]') || [])].find(
          (node) => node.dataset.nodeId === groupId,
        );
        element?.focus();
      }),
  });
  const groupControls = useCanvasGroupControls({
    nodes,
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    getDocument: () => currentDocument.current,
    graphActions,
    flushGraph: autosave.flushGraph,
    setSelected,
    setPanel,
    notify,
    resolveUrl: src,
    stitchSource: storyboardStitchSource,
    onFocusNode: (nodeId, nextNodes) => {
      const bounds = board.current?.getBoundingClientRect();
      const node = nextNodes.find((item) => item.id === nodeId);
      if (bounds && node)
        focusNodeView(
          fitCanvasView([node], bounds, nextNodes, { padding: 0.2, minZoom: 0.6, maxZoom: 1 }),
        );
    },
  });
  const scriptGroupControls = useCanvasScriptGroupControls({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    getDocument: () => currentDocument.current,
  });
  const deleteConfirmation = useCanvasDeleteConfirmation({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    getDocument: () => currentDocument.current,
    deleteNodes: graphActions.deleteNodes,
    selectedIds: selected,
    zoom: view.z,
    isMac:
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(
        navigator.userAgentData?.platform || navigator.platform || navigator.userAgent,
      ),
    notify,
  });
  const edgeRemoval = useCanvasSelectedDeletion({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    getDocument: () => currentDocument.current,
    getSelection: () => ({ nodeIds: selected, edgeIds: getEdgeSelection.current?.() || [] }),
    isDisabled: () =>
      selectedDeleteGate.current?.documentKey !== storageKey ||
      selectedDeleteGate.current.disabled ||
      space.current ||
      ordinaryPointerActive.current?.() === true ||
      Boolean(canvasRoot.current?.closest('[inert]')),
    deleteEdges: graphActions.deleteEdges,
    // The local raw writer is synchronous. A microtask retains the source async
    // launch ordering; its opaque coordinator owner is checked before writing.
    deleteNodes: (ids, options) =>
      Promise.resolve().then(() =>
        options.canCommit() ? graphActions.deleteNodes(ids, options) : false,
      ),
    unlinkStoryboardEdges: graphActions.unlinkStoryboardEdges,
    disconnectClip: clipDisconnect.disconnect,
    history: deletionHistory,
    zoom: view.z,
    isMac:
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/.test(
        navigator.userAgentData?.platform || navigator.platform || navigator.userAgent,
      ),
    onAccepted: (graph) => {
      const surviving = new Set(graph.nodes.map((node) => node.id));
      setNodeSelection((current) => current.filter((id) => surviving.has(id)));
      setPanel((current) => (surviving.has(current) ? current : null));
    },
    notify,
  });
  const selectionActions = useCanvasSelectionActions({
    nodes,
    edges,
    selected,
    documentKey: storageKey,
    projectId: key,
    ready: documentReady,
    readonly,
    zoom: view.z,
    change,
    getDocument: () => currentDocument.current,
    commitGraph: graphActions.commitGraph,
    projectGraph: (snapshot) => canvasDrafts.project({ ...snapshot, storageKey }),
    deleteNodes: (ids, { trigger = 'keyboard' } = {}) =>
      deleteConfirmation.remove(ids, { trigger }),
    onGeneralGroupCommand: groupControls.command,
    setSelected,
    setPanel,
    setDialog,
    asset,
    notify,
    getStoryboardNodeSize: canvasNodeSize,
    onStoryboardGroupCreated: (groupId, nextNodes) => {
      const bounds = board.current?.getBoundingClientRect();
      const group = nextNodes.find((node) => node.id === groupId);
      if (bounds && group) focusNodeView(fitCanvasView([group], bounds, nextNodes));
    },
    onAddToChat: agentActions.addToChat,
    onSkillRequest: agentActions.requestSkill,
  });
  const {
    remove,
    duplicate,
    group: groupSelection,
    ungroup: ungroupSelection,
    layout: layoutSelection,
  } = selectionActions;
  useCanvasKeyboard({
    addNode,
    change,
    copied,
    duplicate,
    edges,
    fit,
    nodes,
    ready: documentReady && !clipEditor.locked,
    readonly,
    referencePick,
    focusMode,
    markMode,
    redo,
    remove,
    removeSelected: () => edgeRemoval.remove(),
    selected,
    setContext,
    setDialog,
    setLinking,
    setMenu,
    setPanel,
    setSelected,
    setTool,
    setView,
    space,
    tool,
    undo,
    setSpaceHeld,
  });
  const {
    touchMode,
    shouldSuppressTouchClick,
    cancel: cancelTouch,
  } = useCanvasTouch({
    board,
    storageKey,
    readonly:
      readonly || referencePick.active || focusMode.active || markMode.active || clipEditor.locked,
    documentReady,
    viewRef,
    setView,
    onFit: ({ padding, duration }) => {
      const bounds = board.current?.getBoundingClientRect();
      if (bounds && nodes.some((node) => !node.hidden))
        focusNodeView(fitCanvasView(nodes, bounds, nodes, { padding }), { duration });
    },
    cancelPointer: () => pointerCancel.current?.(),
    setMenu,
    setContext,
    setLinking,
    tool,
    space,
  });
  const {
    begin,
    drag,
    dragSelection,
    move,
    end,
    shouldSuppressClick: shouldSuppressPointerClick,
    draggingNode,
    altCopy,
    nodeDragPreview,
    cancel,
    pointerActive,
    panning,
    isPointerActive,
  } = useCanvasPointer({
    storageKey,
    readonly: readonly || referencePick.active || focusMode.active || markMode.active,
    documentReady,
    tool,
    touchMode,
    cancelOtherGestures: () => {
      cancelTouch();
      multiConnection.cancel();
      groupResize.cancel();
    },
    space,
    viewRef,
    nodes,
    edges,
    createDragCopy: graphActions.createDragCopy,
    suppressAutoPan: ({ clientX, clientY }) =>
      Boolean(
        board.current?.ownerDocument
          .elementsFromPoint?.(clientX, clientY)
          .some((element) => element.closest?.('[data-workspace-asset-panel]')),
      ),
    onNodeSelection: (value, intent) => {
      if (!intent.additive || readonly) clearEdgeSelection.current?.();
      setNodeSelection(readonly && intent.additive ? [intent.nodeId] : value);
    },
    prepareNodeDrag: prepareCanvasNodeDrag,
    projectNodeDrag: projectCanvasNodeDrag,
    finalizeNodeDrag: finalizeCanvasNodeDrag,
    onNodeDragCommitted: (completion, owner) => {
      if (!completion || owner.documentKey !== storageKey || !documentReady || readonly) return;
      if (completion.warning) {
        const now = performance.now();
        const last = storyboardWarning.current;
        if (
          !completion.throttle ||
          last.documentKey !== storageKey ||
          now - last.time >= completion.throttle
        ) {
          notify(completion.warning);
          if (completion.warningKey === 'storyboardGridFull')
            storyboardWarning.current = { documentKey: storageKey, time: now };
        }
      }
      if (owner.phase === 'stop' && Array.isArray(completion.selectedIds)) {
        setSelected((current) =>
          current.length === owner.selectedIds.length &&
          current.every((id, index) => id === owner.selectedIds[index])
            ? completion.selectedIds
            : current,
        );
      }
    },
    selected,
    selectionRect,
    linking,
    board,
    point,
    record,
    setMenu,
    setContext,
    setView,
    setSelected,
    setSelectionRect,
    setLinking,
    setLinkPoint,
    setNodes,
  });
  pointerCancel.current = cancel;
  ordinaryPointerActive.current = isPointerActive;
  const connectionMenu = useCanvasConnectionMenu({
    documentKey: storageKey,
    ready: documentReady && tool !== 'hand' && !clipEditor.locked,
    readonly,
    getDocument: () => currentDocument.current,
    connectNodes: graphActions.connectNodes,
    nodes,
    edges,
    models,
    setSelected,
    setMenu,
    setContext,
    setLinking,
    setLinkPoint,
    point,
  });
  const connection = useCanvasConnection({
    documentKey: storageKey,
    ready: documentReady && tool !== 'hand' && !clipEditor.locked,
    readonly,
    nodes,
    edges,
    models,
    board,
    point,
    viewRef,
    setView,
    setLinking,
    setLinkPoint,
    cancelPointer: () => {
      cancel();
      multiConnection.cancel();
      groupResize.cancel();
    },
    cancelTouch,
    onConnect: graphActions.connectNodes,
    validate: graphActions.planConnection,
    onOpenMenu: connectionMenu.open,
    closeMenu: () => connectionMenu.close(connectionMenu.menu),
  });
  const multiConnectionEntry = useMemo(
    () =>
      resolveCanvasMultiConnectionEntry({
        nodes,
        selectedIds: selected,
        zoom: view.z,
        getNodeSize: canvasNodeSize,
      }),
    [nodes, selected, view.z],
  );
  const selectionOverlay = multiConnectionEntry?.kind === 'selection' ? multiConnectionEntry : null;
  const multiConnection = useCanvasMultiConnection({
    documentKey: storageKey,
    ready: documentReady && tool !== 'hand' && surface === 'workflow' && !clipEditor.locked,
    readonly,
    nodes,
    edges,
    models,
    board,
    point,
    viewRef,
    setView,
    sourceIds: multiConnectionEntry?.sourceSeedIds || [],
    bounds: multiConnectionEntry?.bounds,
    entryKey: multiConnectionEntry?.entryKey,
    entryNodeId: multiConnectionEntry?.groupId,
    entryFocusSelector: multiConnectionEntry
      ? `[data-canvas-connection-entry="${encodeURIComponent(multiConnectionEntry.entryKey)}"]`
      : undefined,
    getDocument: () => currentDocument.current,
    validate: graphActions.planMultiConnection,
    connectMultiNodes: graphActions.connectMultiNodes,
    setSelected,
    setMenu,
    setContext,
    cancelOtherGestures: () => {
      cancel();
      cancelTouch();
      connection.cancel();
      connectionMenu.close(connectionMenu.menu);
      groupResize.cancel();
    },
  });
  const groupResize = useCanvasGroupResize({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    tool,
    space,
    nodes,
    selected,
    board,
    point,
    getNodeSize: canvasNodeSize,
    getDocument: () => currentDocument.current,
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    isBusy: (groupId) => groupControls.busyGroupIds.includes(groupId),
    suspended: Boolean(
      dialog ||
      groupControls.confirmation ||
      scriptGroupControls.request ||
      deleteConfirmation.request ||
      edgeRemoval.request,
    ),
    cancelOtherGestures: () => {
      cancel();
      cancelTouch();
      connection.cancel();
      multiConnection.cancel();
      connectionMenu.close(connectionMenu.menu);
      setMenu(null);
      setContext(null);
    },
  });
  const cancelGraphGestures = () => {
    cancel();
    cancelTouch();
    connection.cancel();
    multiConnection.cancel();
    groupResize.cancel();
    connectionMenu.close(connectionMenu.menu);
    setMenu(null);
    setContext(null);
  };
  cancelAllGestures.current = cancelGraphGestures;
  useEffect(() => {
    if (deleteConfirmation.request || edgeRemoval.request) cancelAllGestures.current?.();
  }, [deleteConfirmation.request, edgeRemoval.request]);
  const focusCreatedGroup = (groupId, graphNodes) => {
    const group = graphNodes.find((node) => node.id === groupId);
    const bounds = board.current?.getBoundingClientRect();
    if (group && bounds)
      focusNodeView(fitCanvasView([group], bounds, graphNodes, { padding: 0.15 }), {
        duration: 400,
      });
  };
  const batchVideo = useCanvasBatchVideo({
    documentKey: storageKey,
    projectId: key,
    ready: documentReady,
    readonly,
    nodes,
    selected,
    suspended: Boolean(
      dialog ||
      groupControls.confirmation ||
      scriptGroupControls.request ||
      deleteConfirmation.request ||
      edgeRemoval.request,
    ),
    modelContent,
    supportContent: storyboardVideoSupport,
    source: storyboardVideoSource,
    getDocument: () => currentDocument.current,
    commitGraph: graphActions.commitGraph,
    flushGraph: autosave.flushGraph,
    setSelected,
    board,
    getView: () => viewRef.current,
    focusView: focusNodeView,
    focusCreatedGroup,
    notify,
    cancelOtherGestures: cancelGraphGestures,
  });
  pointerCancel.current = () => {
    cancel();
    connection.cancel();
    multiConnection.cancel();
    groupResize.cancel();
  };
  const shouldSuppressClick = (event) =>
    shouldSuppressTouchClick(event) ||
    shouldSuppressPointerClick(event) ||
    connection.shouldSuppressConnectionClick(event) ||
    multiConnection.shouldSuppressClick(event) ||
    groupResize.shouldSuppressClick(event);
  const connectFromClick = (id) => {
    const result = connect(id);
    connectionMenu.close(connectionMenu.menu);
    return result;
  };
  const handleConnectionClick = (event, nodeId, handleType) => {
    if (connection.shouldSuppressConnectionClick(event)) return;
    multiConnection.cancel();
    if (handleType === 'target' && linking) {
      connectFromClick(nodeId);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    connectionMenu.open({
      nodeId,
      handleType,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      opener: event.currentTarget,
    });
  };
  const zoom = (factor, cx, cy) =>
    setView((view) => {
      const bounds = board.current.getBoundingClientRect();
      return zoomCanvasView(view, factor, {
        x: cx == null ? bounds.width / 2 : cx - bounds.left,
        y: cy == null ? bounds.height / 2 : cy - bounds.top,
      });
    });
  useCanvasWheel({ board, setView, zoom });
  const activeNode = nodes.find((n) => n.id === panel);
  const generatorState = useNodeGenerator({
    node: activeNode,
    nodes,
    edges,
    models,
    asset,
    readonly,
    ready: documentReady,
    update,
  });
  const mediaProbe = generatorState.mediaProbe;
  const generate = () => generateNode(activeNode?.id, mediaProbe.metadata);
  const edgeGate = useRef(null);
  selectedDeleteGate.current = {
    documentKey: storageKey,
    disabled: Boolean(
      !documentReady ||
      clipEditor.locked ||
      tool === 'hand' ||
      spaceHeld ||
      surface !== 'workflow' ||
      referencePick.active ||
      focusMode.active ||
      markMode.active ||
      dialog ||
      groupControls.confirmation ||
      scriptGroupControls.request ||
      deleteConfirmation.request ||
      batchVideo.request,
    ),
  };
  edgeGate.current = {
    documentKey: storageKey,
    disabled: Boolean(
      !documentReady ||
      clipEditor.locked ||
      tool === 'hand' ||
      spaceHeld ||
      surface !== 'workflow' ||
      referencePick.active ||
      focusMode.active ||
      markMode.active ||
      dialog ||
      groupControls.confirmation ||
      scriptGroupControls.request ||
      deleteConfirmation.request ||
      edgeRemoval.request ||
      batchVideo.request,
    ),
  };
  const edgeInteractionsDisabled = () =>
    edgeGate.current?.documentKey !== storageKey ||
    edgeGate.current.disabled ||
    space.current ||
    isPointerActive() ||
    Boolean(canvasRoot.current?.closest('[inert]'));
  const edgeSelection = useCanvasEdgeSelection({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    edges,
    isDisabled: edgeInteractionsDisabled,
    clearNodeSelection: () => {
      setNodeSelection([]);
      setPanel(null);
    },
  });
  clearEdgeSelection.current = edgeSelection.clear;
  retireEdgeSelection.current = edgeSelection.retireMissing;
  getEdgeSelection.current = edgeSelection.getSelectedIds;
  const disconnectEdge = (id) => {
    if (edgeInteractionsDisabled()) return false;
    return edgeRemoval.removeEdges([id]);
  };
  const { getSnapshot, copyCanvas, share } = useCanvasSnapshotActions({
    documentKey: storageKey,
    ready: documentReady,
    readonly,
    user,
    login,
    navigate,
    notify,
    setShareUrl,
    projectDrafts: canvasDrafts.project,
    document: {
      title,
      nodes,
      edges,
      view,
      agentDraft: currentAgentDraft,
      messages,
      agentConfig: resolvedAgentConfig,
    },
  });
  const openLibrary = () => {
    setDialog('assets');
    loadContent('gallery')
      .then((d) => setLibrary(Array.isArray(d) ? d : d.list || d.data?.list || []))
      .catch(() => {});
  };
  if (!user && !readonly)
    return (
      <div className="cv-auth-wait">
        <LockKeyhole size={30} />
        <p>登录后开始创作</p>
        <button onClick={() => login?.()}>登录 / 注册</button>
        <button onClick={() => navigate?.('/')}>返回首页</button>
      </div>
    );
  // Canvas surface and dialogs are below.
  return (
    <AgentNodePresentationProvider value={nodePresentation}>
      <div
        ref={canvasRoot}
        className={
          'cv-page ' + (readonly ? 'cv-readonly' : '') + (chatShare ? ' cv-chat-share' : '')
        }
        role={embedded ? 'dialog' : undefined}
        aria-modal={embedded ? true : undefined}
        aria-label={embedded ? '创作过程' : undefined}
        tabIndex={embedded ? -1 : undefined}
      >
        <CanvasHeader
          {...{
            agentOpen,
            chatShare,
            copyCanvas,
            documentReady,
            loadError,
            login,
            menu,
            navigate,
            notify,
            onClose,
            readonly,
            rename,
            saved,
            saveError: autosave.saveError,
            onRetrySave: autosave.retrySave,
            setAgentOpen,
            setDialog,
            setMenu,
            setRename,
            setShareUrl,
            setSurface,
            setTitle,
            surface,
            title,
            user,
          }}
        />
        {menu === 'project' && (
          <CanvasProjectMenu {...{ copyCanvas, navigate, setDialog, setMenu, setRename }} />
        )}
        <div className="cv-layout">
          <CanvasViewport
            {...{
              addNode,
              clip: {
                entries: clipNodes,
                composer: clipComposer,
                onOpen: clipEditor.open,
                onDownload: () => notify('下载处理服务尚未连接，视频源仍保留'),
                onDeleteReference: (nodeId, sourceId) => {
                  const graph = currentDocument.current;
                  const ids = graph.edges
                    .filter((edge) => edge.target === nodeId && edge.source === sourceId)
                    .map((edge) => edge.id);
                  edgeRemoval.removeEdges(ids);
                },
              },
              agentOpen,
              begin,
              shouldSuppressClick,
              board,
              chatShare,
              connect: connectFromClick,
              connection: {
                ...connection,
                disabled:
                  !documentReady ||
                  tool === 'hand' ||
                  referencePick.active ||
                  focusMode.active ||
                  markMode.active,
                onClick: handleConnectionClick,
                menu: connectionMenu,
              },
              context,
              drag,
              dragSelection: (event, ids) => {
                multiConnection.cancel();
                connection.cancel();
                connectionMenu.close(connectionMenu.menu);
                dragSelection(event, ids);
              },
              selectionOverlay,
              groupControls,
              groupResize,
              multiConnectionEntry,
              multiConnection,
              altCopy,
              nodeDragPreview,
              referencePick,
              focusMode,
              markMode,
              onStoryboardSlotClick: (groupId, slotIndex, element) => {
                if (storyboardSlots.open(groupId, slotIndex))
                  setStoryboardSlotRequest({ element, focus: true });
              },
              duplicate,
              edges,
              end,
              fileInput,
              fit,
              future,
              history,
              linkPoint,
              linking,
              loadError,
              loaded,
              menu,
              move,
              navigate,
              nodes: groupResize.nodes,
              onClose,
              openLibrary,
              point,
              readonly,
              record,
              onDeleteEdge: disconnectEdge,
              edgeInteraction: {
                documentKey: storageKey,
                ready: documentReady,
                disabled: edgeGate.current.disabled || pointerActive,
                selected: edgeSelection.selected,
                select: edgeSelection.select,
                deselect: edgeSelection.deselect,
                interacting: pointerActive,
                panning,
              },
              spaceHeld,
              redo,
              replay,
              selected,
              selectionRect,
              setAgentOpen,
              setContext,
              setDialog,
              setEdges,
              setLinkPoint,
              setLinking,
              setMenu,
              setPanel: openNodePanel,
              setSelected,
              setShowEdges,
              setShowMap,
              setTool,
              setView,
              sharedMessages,
              showEdges,
              showMap,
              src,
              surface,
              tool,
              undo,
              update,
              upload,
              view,
              viewAnimation,
              zoom,
              generator: {
                models,
                modelContent,
                videoModelSupport,
                imageModelSupport,
                scriptPresets,
                scriptTextSupport,
                storyboardVideoSource,
                projectId: key,
                selected,
                board,
                flushGraph: autosave.flushGraph,
                setSelected,
                notify,
                suspended: Boolean(
                  dialog ||
                  groupControls.confirmation ||
                  scriptGroupControls.request ||
                  deleteConfirmation.request ||
                  edgeRemoval.request,
                ),
                cancelOtherGestures: cancelGraphGestures,
                focusCreatedGroup,
                asset,
                voiceSource,
                roleLibrarySource,
                roleImageReader,
                ready: documentReady,
                generateNode,
                panel,
                draggingNode: draggingNode || groupResize.active,
                documentKey: storageKey,
                getDocument: () => currentDocument.current,
                registerDraft: canvasDrafts.register,
                graphActions,
                onAddScriptReference: scriptReferences.open,
                onFocusReference: (id) => nodePresentation.onLocate?.({ id }),
              },
              onGroup: groupSelection,
              onUngroup: ungroupSelection,
              onLayout: layoutSelection,
              onGroupRun: (groupId) => {
                const graph = currentDocument.current;
                if (graph?.documentKey !== storageKey || !graph.ready || graph.readonly) return;
                const group = graph.nodes.find((node) => node.id === groupId);
                if (group?.data?.sourceScriptNodeId) scriptGroupControls.open(groupId);
                else if (group?.type === 'group') setDialog({ batchGroupId: groupId });
              },
              onGroupCreateWorkflow: () => notify('工具箱服务尚未连接，当前分组已保留'),
              onGroupBatchGenerateVideo: (groupId) => batchVideo.open(groupId),
              selectionActions,
              onShotBreakdownUpload,
              onShotBreakdownPick,
              onShotBreakdownUpdate: updateShotBreakdown,
              notify,
            }}
          />
          {clipEditor.state && (
            <CanvasClipEditorEntry
              key={`${storageKey}:${clipEditor.nodeId}`}
              controller={clipEditor}
              documentKey={storageKey}
              src={src}
            />
          )}
          <ScriptReferenceImports controller={scriptReferences} />
          {batchVideo.request && (
            <CanvasBatchVideoConfiguration {...batchVideo.props} view={view} board={board} />
          )}
          {chatShare && !loadError && (
            <ChatReplayPanel
              {...{
                chatMessages,
                nodes,
                replay,
                replayPlaying,
                setReplay,
                setReplayPlaying,
                sharedMessages,
                src,
                title,
              }}
            />
          )}
          {agentOpen && !readonly && (
            <CanvasAgentPanel
              {...{
                agentMode,
                nodes,
                projectId: key,
                view,
                board,
                agentConfig: resolvedAgentConfig,
                onAgentConfigChange: agentActions.onAgentConfigChange,
                agentDraft: currentAgentDraft,
                inputRef: agentInput,
                onPartsChange: agentActions.onPartsChange,
                onFiles: agentAttachments.addFiles,
                fileInput: agentFileInput,
                attachmentPending: agentAttachments.pending,
                attachmentErrors: agentAttachments.errors,
                readOnly:
                  readonly ||
                  !documentReady ||
                  agentDraft?.skillCreatorIntent?.status === 'choosing',
                isShareReplay: readonly,
                loading: !loaded || loadedStorageKey !== storageKey,
                menu,
                messages,
                navigate,
                prompt,
                send: agentActions.send,
                setAgentMode,
                setAgentOpen,
                setMenu,
                user,
                login,
                toast,
                onCreateSkill: agentActions.onCreateSkill,
                setPrompt: agentActions.onPromptChange,
              }}
            >
              <SkillCreatorIntake
                {...{
                  path,
                  route,
                  ready: documentReady,
                  nodes,
                  messages,
                  title,
                  prompt,
                  draft: currentAgentDraft,
                  setDraft: setAgentDraft,
                  navigate,
                  setAgentOpen,
                }}
              />
            </CanvasAgentPanel>
          )}
        </div>
        <input
          ref={fileInput}
          aria-label="上传画布素材"
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.txt,.md,.json"
          disabled={readonly || !documentReady}
          hidden
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={agentFileInput}
          aria-label="上传 Agent 参考素材"
          type="file"
          multiple
          accept={SKILL_ATTACHMENT_ACCEPT}
          disabled={
            readonly || !documentReady || agentDraft?.skillCreatorIntent?.status === 'choosing'
          }
          hidden
          onChange={(e) => {
            agentAttachments.addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {context && !readonly && menu !== 'add' && (
          <CanvasContextMenu
            contextNode={nodes.find((node) => node.id === context.nodeId)}
            {...{
              context,
              duplicate,
              fileInput,
              fit,
              remove,
              setContext,
              setDialog,
              setMenu,
              setPanel: openNodePanel,
            }}
          />
        )}
        {activeNode && activeNode.type !== 'video-clip' && !isCanvasGroup(activeNode) && (
          <NodeSettingsPanel
            {...{
              activeNode,
              copyCanvas,
              edges,
              generate,
              generatorState,
              modelContent,
              mediaProbe,
              voiceSource,
              models,
              nodes,
              openLibrary,
              onParamsChange: generatorState.changeParams,
              readonly,
              setPanel,
              update,
            }}
          />
        )}
        {dialog?.batchGroupId && (
          <BatchRunDialog
            groupId={dialog.batchGroupId}
            documentKey={storageKey}
            nodes={nodes}
            edges={edges}
            models={models}
            readonly={readonly}
            ready={documentReady}
            getDocument={() => currentDocument.current}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.saveSelectionIds && (
          <CanvasSaveSelectionDialog
            nodes={nodes}
            selectedIds={dialog.saveSelectionIds}
            documentKey={storageKey}
            projectId={key}
            readonly={readonly}
            ready={documentReady}
            onClose={() => setDialog(null)}
            onSaved={() => notify('已保存到本地资产库')}
          />
        )}
        <StoryboardSlotPicker slots={storyboardSlots} request={storyboardSlotRequest} src={src} />
        <StoryboardGroupConfirmation controls={groupControls} />
        <CanvasScriptGroupConfirmation controls={scriptGroupControls} />
        <CanvasDeleteConfirmation
          controls={{
            ...deleteConfirmation,
            confirm: (request) => {
              const accepted = deleteConfirmation.confirm(request);
              if (accepted && currentDocument.current?.documentKey === storageKey) {
                setSelected([]);
                setPanel(null);
              }
              return accepted;
            },
          }}
        />
        <CanvasDeleteConfirmation controls={edgeRemoval} sourceUnlinkChrome />
        <CanvasDialogs
          {...{
            getSnapshot,
            dialog,
            agentDraft: currentAgentDraft,
            messages,
            agentConfig: resolvedAgentConfig,
            setDialog,
            nodes,
            edges,
            title,
            setTitle,
            view,
            search,
            setSearch,
            setSelected,
            fit,
            setPanel,
            shareUrl,
            setShareUrl,
            share,
            notify,
            library,
            libraryTab,
            setLibraryTab,
            fileInput,
            readonly,
            addNode,
            setNodes,
            src,
          }}
        />
      </div>
    </AgentNodePresentationProvider>
  );
}
