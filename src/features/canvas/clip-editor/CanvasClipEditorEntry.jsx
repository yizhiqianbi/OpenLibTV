import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import './clip-editor.css';
import './clip-timeline.css';
import './clip-preview.css';

let loading;
function loadWorkspace() {
  if (!loading) {
    loading = import('./ClipEditorWorkspace.jsx').then((module) => module.default);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

class ClipWorkspaceBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

/** One dialog and one stable media host across expanded and node-contained preview. */
export default function CanvasClipEditorEntry({ controller, documentKey, src }) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const root = useRef(null);
  const preview = useRef(null);
  const [host] = useState(() => document.createElement('div'));
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(null);
  const [placement, setPlacement] = useState('pending');
  const [placementAttempt, setPlacementAttempt] = useState(0);
  const session = state?.draftSession;
  const nodeId = state?.nodeId;
  const previewExpanded = state?.previewExpanded;
  host.className = 'cv-clip-editor-media-host';
  useEffect(() => {
    let current = true;
    setLoaded(null);
    loadWorkspace().then(
      (Workspace) => {
        if (current) setLoaded({ Workspace, session });
      },
      (error) => {
        if (current) setLoaded({ error, session });
      },
    );
    return () => {
      current = false;
    };
  }, [session, attempt]);
  useDialogBehavior(root, { enabled: Boolean(state?.previewExpanded), onClose: controller.close });
  useLayoutEffect(() => {
    if (!nodeId) {
      setPlacement('pending');
      return undefined;
    }
    let stopped = false;
    let frame = null;
    let attempts = 0;
    const schedule = (callback) => {
      if (typeof window.requestAnimationFrame === 'function') {
        frame = window.requestAnimationFrame(callback);
        return;
      }
      frame = window.setTimeout(callback, 16);
    };
    const cancel = () => {
      if (frame === null) return;
      if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
      else window.clearTimeout(frame);
      frame = null;
    };
    const place = () => {
      if (stopped) return;
      const target = previewExpanded
        ? preview.current
        : document.getElementById(`clip-preview-drop-${nodeId}`);
      if (target) {
        if (host.parentNode !== target) target.appendChild(host);
        setPlacement('placed');
        frame = null;
        return;
      }
      if (attempts >= 300) {
        setPlacement(previewExpanded ? 'missing-expanded' : 'missing');
        frame = null;
        return;
      }
      attempts += 1;
      schedule(place);
    };
    setPlacement('pending');
    place();
    return () => {
      stopped = true;
      cancel();
    };
  }, [host, nodeId, previewExpanded, placementAttempt]);
  useEffect(() => () => host.remove(), [host]);
  if (!state) return null;
  const result = loaded?.session === session ? loaded : null;
  const failure = (error) => (
    <div className="cv-clip-editor-load-state" role={error ? 'alert' : 'status'}>
      {error ? (
        <>
          <p>剪辑编辑器加载失败，当前时间轴仍保留</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            重新加载编辑器
          </button>
        </>
      ) : (
        <p>正在加载剪辑编辑器…</p>
      )}
    </div>
  );
  const Workspace = result?.Workspace;
  const returnToNode = () => {
    controller.onReturnToNode?.();
    setPlacement('pending');
    setPlacementAttempt((value) => value + 1);
  };
  return createPortal(
    <section
      ref={root}
      className={'cv-clip-editor' + (state.previewExpanded ? ' cv-clip-editor-expanded' : '')}
      role={state.previewExpanded ? 'dialog' : 'region'}
      aria-modal={state.previewExpanded ? true : undefined}
      aria-label="视频剪辑"
      tabIndex={-1}
    >
      {state.previewExpanded && (
        <div className="cv-clip-editor-expanded-preview" style={{ bottom: state.height }}>
          <div className="cv-clip-editor-header">
            <span>智能剪辑</span>
            <button type="button" aria-label="退出剪辑" title="退出剪辑" onClick={controller.close}>
              <X size={14} />
            </button>
          </div>
          <div ref={preview} className="cv-clip-editor-preview-mount" />
        </div>
      )}
      {!state.previewExpanded && placement === 'missing' && (
        <div className="cv-clip-editor-placement-recovery" role="status">
          <span>当前节点暂不可见</span>
          <button type="button" onClick={returnToNode}>
            回到节点
          </button>
        </div>
      )}
      {!Workspace ? (
        <div className="cv-clip-editor-timeline-shell" style={{ height: state.height }}>
          {failure(result?.error)}
        </div>
      ) : (
        <ClipWorkspaceBoundary key={`${documentKey}:${state.nodeId}:${attempt}`} fallback={failure}>
          <Workspace
            controller={controller}
            state={state}
            mediaHost={host}
            src={src}
            documentKey={documentKey}
          />
        </ClipWorkspaceBoundary>
      )}
    </section>,
    document.body,
  );
}
