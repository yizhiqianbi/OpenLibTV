import { Component, useEffect, useMemo, useRef, useState } from 'react';
// Old CanvasScriptNode static-import DFS: keep its entire CSS closure eager, in order.
import './script-prompt-input.css';
import './script-media-history.css';
import './script-prompt-compose.css';
import './storyboard.css';
import './ScriptCompactProgress.css';
import './ScriptCardTaskStatus.css';
import './ScriptEmptyCard.css';
import './ScriptCardSurface.css';
import '../../../components/agent/rich-agent-input.css';
import './script-assets.css';
import '@mantine/core/styles/Slider.css';
import '../generator/voices/voices.css';
import '../generator/generator-settings.css';
import './V2GenerationSelector.css';
import '@mantine/core/styles/Input.css';
import '@mantine/core/styles/NumberInput.css';
import '@mantine/core/styles/Tooltip.css';
import './ScriptV2VideoConfiguration.css';
import './ScriptV2ImageConfiguration.css';
import '../components/storyboard-group-controls.css';
import './ScriptNodeToolbar.css';
import './ScriptRegenerateConfirmation.css';
import './CanvasScriptNodeEntry.css';

const defaultLoader = () => import('./CanvasScriptNode.jsx');
const modules = new WeakMap();

function loadScriptNode(loader) {
  let request = modules.get(loader);
  if (!request) {
    request = Promise.resolve()
      .then(loader)
      .then((module) => {
        const implementation = module?.default;
        if (
          typeof implementation !== 'function' &&
          !(implementation && typeof implementation === 'object' && implementation.$$typeof)
        )
          throw new Error('脚本节点模块缺少默认组件');
        return implementation;
      });
    modules.set(loader, request);
    request.catch(() => {
      if (modules.get(loader) === request) modules.delete(loader);
    });
  }
  return request;
}

class ScriptNodeRenderBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

const stop = (event) => event.stopPropagation();

/** Only code is cached. Data, open requests and callbacks belong to the current node owner. */
export default function CanvasScriptNodeEntry({ loader = defaultLoader, ...props }) {
  const { documentKey, node, ready = true } = props;
  const owner = useMemo(
    () => ({ documentKey, nodeId: node?.id, nodeType: node?.type, dataType: node?.data?.type }),
    [documentKey, node?.id, node?.type, node?.data?.type],
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const latest = useRef(null);
  latest.current = { owner, loader, attempt, ready };
  useEffect(() => {
    let current = true;
    if (ready)
      loadScriptNode(loader).then(
        (Implementation) => {
          if (current) setResult({ owner, loader, attempt, Implementation });
        },
        (error) => {
          if (current) setResult({ owner, loader, attempt, error });
        },
      );
    return () => {
      current = false;
    };
  }, [owner, loader, attempt, ready]);

  const retry = () => {
    const value = latest.current;
    if (
      value.ready &&
      value.owner === owner &&
      value.loader === loader &&
      value.attempt === attempt
    )
      setAttempt((count) => count + 1);
  };
  const fallback = (error) => (
    <div className="cv-script-node-load-state" aria-busy={ready && !error}>
      <p role={error ? 'alert' : 'status'}>
        {error
          ? '脚本节点加载失败，请重试'
          : ready
            ? '正在加载脚本节点…'
            : '画布加载中，脚本节点暂不可用'}
      </p>
      {error && (
        <button
          type="button"
          className="nodrag nopan"
          disabled={!ready}
          onPointerDown={stop}
          onMouseDown={stop}
          onDoubleClick={stop}
          onClick={(event) => {
            event.stopPropagation();
            retry();
          }}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.code === 'Space') event.stopPropagation();
          }}
        >
          重新加载脚本节点
        </button>
      )}
    </div>
  );
  const resolved =
    ready && result?.owner === owner && result.loader === loader && result.attempt === attempt;
  if (!resolved) return fallback(null);
  if (result.error) return fallback(result.error);
  const Implementation = result.Implementation;
  return (
    <ScriptNodeRenderBoundary fallback={fallback}>
      <Implementation {...props} />
    </ScriptNodeRenderBoundary>
  );
}
