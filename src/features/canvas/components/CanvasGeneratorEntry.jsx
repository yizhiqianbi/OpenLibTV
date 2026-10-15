import { Component, useEffect, useRef, useState } from 'react';
import { useGeneratorSurfacePlacement } from '../generator/useGeneratorSurfacePlacement.js';
// Keep the prior prompt/inline cascade eager; loading JS must not reorder styles.
import '../generator/prompt-badge-swap.css';
import '../generator/node-prompt-asset-picker.css';
import '../generator/mentions-enhanced/canvas-reference-menu.css';
import '../generator/node-generator-prompt.css';
import '../generator/inline-generator.css';
import '../generator/roles/role-library.css';
import '../storyboard/ScriptV2GeneratorView.css';
import './CanvasGeneratorEntry.css';
import '../clip-editor/clip-node.css';
import '../clip-editor/clip-entry.css';

const loadGenericGenerator = () => import('../generator/CanvasNodeInlineGenerator.jsx');
const loadScriptGenerator = () => import('../storyboard/ScriptV2NodeGenerator.jsx');
const loadClipComposer = () => import('../clip-editor/VideoClipComposer.jsx');
const modules = new WeakMap();

function loadModule(loader) {
  let request = modules.get(loader);
  if (!request) {
    request = Promise.resolve()
      .then(loader)
      .then((module) => {
        if (!module?.default) throw new Error('生成器模块缺少默认组件');
        return module.default;
      });
    modules.set(loader, request);
    request.catch(() => {
      if (modules.get(loader) === request) modules.delete(loader);
    });
  }
  return request;
}

class GeneratorRenderBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

function GeneratorLoadState({ node, ready, error, retry, ...config }) {
  const placement = useGeneratorSurfacePlacement({
    ...config,
    node,
    minimumPanelHeight: 80,
  });
  return (
    <section
      ref={placement.ref}
      className="cv-inline-generator cv-floating cv-generator-load-state nodrag nopan nowheel"
      aria-label={`${node?.data?.name || '节点'}生成器`}
      data-generator-side={placement.side}
      style={placement.style}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if ((event.code === 'Space' || event.key === ' ') && event.target.closest('button'))
          event.stopPropagation();
      }}
    >
      {error ? (
        <div role="alert">
          <p>生成器加载失败，请重试</p>
          <small title={error.message}>{error.message}</small>
          <button type="button" onClick={retry} disabled={!ready}>
            重新加载生成器
          </button>
        </div>
      ) : (
        <p role="status">{ready ? '正在加载生成器…' : '画布加载中，生成器暂不可用'}</p>
      )}
    </section>
  );
}

/** Small mount-only entry. Imports are shared; late publication belongs to this document owner. */
export function CanvasGeneratorEntry({ loader, kind = 'generic', ...props }) {
  const { node, documentKey, ready = true, position, coordinateOrigin, zoom, view, board } = props;
  const ownerKey = JSON.stringify([documentKey, node?.id, kind]);
  const latest = useRef(null);
  latest.current = { ownerKey, ready };
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    let current = true;
    if (ready) {
      setResult(null);
      loadModule(loader).then(
        (Implementation) => {
          if (current) setResult({ ownerKey, attempt, Implementation });
        },
        (error) => {
          if (current) setResult({ ownerKey, attempt, error });
        },
      );
    } else setResult(null);
    return () => {
      current = false;
    };
  }, [loader, ownerKey, attempt, ready]);

  const retry = () => {
    if (latest.current.ownerKey === ownerKey && latest.current.ready)
      setAttempt((value) => value + 1);
  };
  const fallback = (error) => (
    <GeneratorLoadState
      node={node}
      documentKey={documentKey}
      kind={kind}
      position={position}
      coordinateOrigin={coordinateOrigin}
      zoom={zoom}
      view={view}
      board={board}
      ready={ready}
      error={error}
      retry={retry}
    />
  );
  if (!ready || result?.ownerKey !== ownerKey || result?.attempt !== attempt) return fallback(null);
  if (result.error) return fallback(result.error);
  const Implementation = result.Implementation;
  return (
    <GeneratorRenderBoundary key={`${ownerKey}:${attempt}`} fallback={fallback}>
      <Implementation {...props} />
    </GeneratorRenderBoundary>
  );
}

export function LazyCanvasNodeInlineGenerator(props) {
  return <CanvasGeneratorEntry {...props} kind="generic" loader={loadGenericGenerator} />;
}

export function LazyScriptV2NodeGenerator(props) {
  return <CanvasGeneratorEntry {...props} kind="script" loader={loadScriptGenerator} />;
}

export function LazyVideoClipComposer(props) {
  return <CanvasGeneratorEntry {...props} kind="clip" loader={loadClipComposer} />;
}
