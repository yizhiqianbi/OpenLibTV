import type { FilmManifest, FilmNode, FilmValue } from './types.ts';

export type FilmPhase = 'idle' | 'playing' | 'interaction' | 'ended' | 'error';
export interface FilmRuntimeState {
  phase: FilmPhase;
  node: FilmNode | null;
  nodeId: string | null;
  epoch: number;
  elapsed: number;
  paused: boolean;
  interactionOpen: boolean;
  variables: Record<string, FilmValue>;
  error: string;
}
const instantKinds = new Set(['start', 'set', 'condition']);
const interactionKinds = new Set(['choice', 'hotspot', 'qte']);

/** No clock, browser state or media effects: all time and input are supplied by a player. */
export function createFilmRuntime(manifest: FilmManifest) {
  if (manifest.schemaVersion !== 1 || manifest.runtimeVersion !== '1')
    throw new Error('此作品的播放器版本暂不支持');
  const nodes = new Map(manifest.nodes.map((node) => [node.id, node]));
  const listeners = new Set<(state: FilmRuntimeState) => void>();
  let state: FilmRuntimeState = {
    phase: 'idle',
    node: null,
    nodeId: null,
    epoch: 0,
    elapsed: 0,
    paused: false,
    interactionOpen: false,
    variables: {},
    error: '',
  };
  const snapshot = (): FilmRuntimeState => ({ ...state, variables: { ...state.variables } });
  const emit = () => {
    const next = snapshot();
    listeners.forEach((listener) => listener(next));
  };
  const fail = (message: string) => {
    state = {
      ...state,
      phase: 'error',
      error: message,
      interactionOpen: false,
      epoch: state.epoch + 1,
    };
  };
  const target = (node: FilmNode, port: string) => {
    const edges = manifest.edges.filter(
      (edge) => edge.source === node.id && edge.sourcePort === port,
    );
    if (edges.length !== 1 || !nodes.has(edges[0].target)) {
      fail(`「${node.title}」的 ${port} 出口没有有效连接`);
      return null;
    }
    return edges[0].target;
  };
  const compare = (node: FilmNode) => {
    const current = state.variables[node.variableId || ''];
    switch (node.comparator) {
      case 'eq':
        return current === node.value;
      case 'ne':
        return current !== node.value;
      case 'gt':
        return (
          typeof current === 'number' && typeof node.value === 'number' && current > node.value
        );
      case 'gte':
        return (
          typeof current === 'number' && typeof node.value === 'number' && current >= node.value
        );
      case 'lt':
        return (
          typeof current === 'number' && typeof node.value === 'number' && current < node.value
        );
      case 'lte':
        return (
          typeof current === 'number' && typeof node.value === 'number' && current <= node.value
        );
      default:
        fail(`「${node.title}」缺少有效条件`);
        return false;
    }
  };
  const enter = (id: string) => {
    let next: string | null = id;
    let steps = 0;
    while (next !== null) {
      const node = nodes.get(next);
      if (!node) {
        fail('作品连接的节点不存在');
        return;
      }
      state = {
        ...state,
        node,
        nodeId: node.id,
        epoch: state.epoch + 1,
        elapsed: 0,
        interactionOpen: false,
        error: '',
      };
      if (!instantKinds.has(node.kind)) {
        state.phase =
          node.kind === 'ending'
            ? 'ended'
            : interactionKinds.has(node.kind)
              ? 'interaction'
              : 'playing';
        state.interactionOpen = interactionKinds.has(node.kind) && (node.windowStart ?? 0) <= 0;
        if (!['play', 'ending', 'choice', 'hotspot', 'qte'].includes(node.kind))
          fail('作品包含未知行为节点');
        return;
      }
      if (++steps > 100) {
        fail('连续逻辑执行超过 100 步，请检查循环连接');
        return;
      }
      if (node.kind === 'set') {
        const variable = manifest.variables.find((item) => item.id === node.variableId);
        if (!variable || node.value === undefined || typeof node.value !== variable.type) {
          fail(`「${node.title}」的变量赋值无效`);
          return;
        }
        const current = state.variables[variable.id];
        const value =
          node.operation === 'add' && typeof current === 'number' && typeof node.value === 'number'
            ? current + node.value
            : node.value;
        if (typeof value === 'number' && !Number.isFinite(value)) {
          fail('变量计算超出有效数值范围');
          return;
        }
        state.variables = { ...state.variables, [variable.id]: value };
      }
      const port = node.kind === 'condition' ? (compare(node) ? 'yes' : 'no') : 'next';
      if (state.phase === 'error') return;
      next = target(node, port);
    }
  };
  const active = (epoch: number) =>
    epoch === state.epoch && !state.paused && !['idle', 'error', 'ended'].includes(state.phase);
  const follow = (port: string) => {
    if (!state.node) return;
    const next = target(state.node, port);
    if (next) enter(next);
    emit();
  };
  const updateElapsed = (seconds: number) => {
    const node = state.node!;
    state = { ...state, elapsed: seconds };
    if (state.phase === 'interaction') {
      state.interactionOpen = state.elapsed >= (node.windowStart ?? 0);
      if (node.windowEnd !== undefined && state.elapsed >= node.windowEnd) {
        follow(node.kind === 'choice' ? 'timeout' : 'failure');
        return;
      }
    } else if (
      node.kind === 'play' &&
      manifest.media[node.mediaId || '']?.type === 'image' &&
      state.elapsed >= (node.displaySeconds ?? 0)
    ) {
      follow('next');
      return;
    }
    emit();
  };
  return {
    getSnapshot: snapshot,
    subscribe(listener: (state: FilmRuntimeState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      state = {
        ...state,
        phase: 'idle',
        node: null,
        nodeId: null,
        elapsed: 0,
        paused: false,
        error: '',
        variables: Object.fromEntries(
          manifest.variables.map((variable) => [variable.id, variable.initial]),
        ),
      };
      enter(manifest.startNodeId);
      emit();
    },
    setPaused(paused: boolean) {
      if (state.paused === paused) return;
      state = { ...state, paused };
      emit();
    },
    advance(seconds: number, epoch = state.epoch) {
      if (!active(epoch) || !Number.isFinite(seconds) || seconds <= 0 || !state.node) return;
      updateElapsed(state.elapsed + seconds);
    },
    /** A decoded media position may move backward after seeking; no wall time is inferred. */
    syncMediaTime(seconds: number, epoch = state.epoch) {
      const media = manifest.media[state.node?.mediaId || ''];
      if (
        !active(epoch) ||
        !state.node ||
        !media ||
        !['video', 'audio'].includes(media.type) ||
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        seconds === state.elapsed
      )
        return;
      updateElapsed(seconds);
    },
    choose(choiceId: string, epoch = state.epoch) {
      if (
        !active(epoch) ||
        state.node?.kind !== 'choice' ||
        !state.interactionOpen ||
        !state.node.choices?.some((choice) => choice.id === choiceId)
      )
        return false;
      follow(choiceId);
      return true;
    },
    hit(x: number, y: number, epoch = state.epoch) {
      if (!active(epoch) || state.node?.kind !== 'hotspot' || !state.interactionOpen) return false;
      const region = state.node.region;
      if (
        !region ||
        x < region.x ||
        x > region.x + region.width ||
        y < region.y ||
        y > region.y + region.height
      )
        return false;
      follow('success');
      return true;
    },
    qte(epoch = state.epoch) {
      if (!active(epoch) || state.node?.kind !== 'qte' || !state.interactionOpen) return false;
      follow('success');
      return true;
    },
    completeMedia(epoch = state.epoch) {
      if (!active(epoch) || state.node?.kind !== 'play') return false;
      follow('next');
      return true;
    },
    failMedia(message: string, epoch = state.epoch) {
      if (epoch !== state.epoch || state.phase === 'error') return;
      fail(message || '媒体播放失败');
      emit();
    },
  };
}
export type FilmRuntime = ReturnType<typeof createFilmRuntime>;
