import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { readLocalFile } from '../../../services/browser-file-read.ts';
import { createLocalId } from '../../editor/model.js';
import { projectScriptV2Card } from './script-card-model.js';
import {
  planScriptV2ReferenceImport,
  validateScriptV2ReferenceFile,
  resolveScriptV2ImageAsset,
} from './script-reference-import-model.js';
import { synchronizeScriptV2References } from './script-reference-graph.js';

/** Canvas-owned reads survive an inline selector change, but never a document change. */
export function useScriptV2ReferenceImport(props) {
  const owner = useMemo(() => ({ documentKey: props.documentKey }), [props.documentKey]);
  const latest = useRef(null),
    alive = useRef(false),
    queue = useRef(null),
    pickerOwner = useRef(null),
    uploadOwner = useRef(null),
    fileInput = useRef(null);
  latest.current = { ...props, owner };
  const [state, setState] = useState({ owner, reading: false, errors: [] }),
    [picker, setPicker] = useState(null);
  const current = useCallback((captured, targetId) => {
    const value = latest.current,
      graph = value.getDocument?.();
    if (
      !alive.current ||
      value.owner !== captured ||
      !value.ready ||
      value.readonly ||
      graph?.documentKey !== captured.documentKey ||
      !graph.ready ||
      graph.readonly
    )
      return null;
    const node = graph.nodes.find((item) => item.id === targetId);
    const card = node && projectScriptV2Card({ node, nodes: graph.nodes, edges: graph.edges });
    return node?.type === 'script-v2' && card?.valid && !card.fullGenerationBusy
      ? { value, graph, node }
      : null;
  }, []);
  const cancel = useCallback(() => {
    queue.current?.abort.abort();
    queue.current = null;
  }, []);
  useLayoutEffect(() => {
    alive.current = true;
    setState({ owner, reading: false, errors: [] });
    setPicker(null);
    pickerOwner.current = uploadOwner.current = null;
    return () => {
      alive.current = false;
      cancel();
    };
  }, [owner, cancel]);
  useLayoutEffect(() => {
    const job = queue.current;
    if (job && !current(job.owner, job.targetId)) {
      cancel();
      setState({ owner, reading: false, errors: [] });
    }
    const request = pickerOwner.current;
    if (request && !current(request.owner, request.targetId)) {
      pickerOwner.current = null;
      setPicker(null);
    }
    const uploadRequest = uploadOwner.current;
    if (uploadRequest && !current(uploadRequest.owner, uploadRequest.targetId))
      uploadOwner.current = null;
  }, [owner, props.nodes, props.edges, props.ready, props.readonly, current, cancel]);
  const commitItems = (captured, targetId, items) => {
    const context = current(captured, targetId);
    if (!context) return null;
    const { value, graph } = context;
    let projected;
    try {
      projected = value.projectGraph?.(graph) || graph;
    } catch {
      value.notify?.('当前画布草稿无法保存，请重试');
      return null;
    }
    const plan = planScriptV2ReferenceImport({
      nodes: projected.nodes,
      edges: projected.edges,
      targetId,
      items,
      makeId: createLocalId,
    });
    if (!plan.valid || !plan.added) return plan;
    const localItems = new Map(
      plan.results
        .filter((result) => result.status === 'added')
        .map((result) => [result.nodeId, items[result.index]]),
    );
    const addedNodes = plan.addedNodes.map((node) => {
      const item = localItems.get(node.id);
      if (item?.kind !== 'local') return node;
      return {
        ...node,
        data: {
          ...node.data,
          localMediaReady: true,
          resourceMeta: {
            url: item.url,
            name: item.file.name,
            size: item.file.size,
            mimeType: item.file.type,
          },
        },
      };
    });
    const next = synchronizeScriptV2References(
      {
        ...graph,
        nodes: [...addedNodes, ...projected.nodes],
        edges: [...projected.edges, ...plan.addedEdges],
      },
      targetId,
      value.supportContent?.data?.items,
    );
    if (!current(captured, targetId) || value.commitGraph(next, { expectedGraph: graph }) !== true)
      return null;
    const published = value.getDocument();
    // A quota failure keeps the accepted graph. Retrying persistence must not add duplicates.
    const saved = value.flushGraph?.(published) === true;
    if (!saved) value.notify?.('参考图已保留，本机保存失败，请从顶部重试保存画布');
    return { ...plan, saved };
  };
  const publishQueue = (job) => {
    if (queue.current !== job || !current(job.owner, job.targetId)) return;
    setState({
      owner: job.owner,
      reading: job.reading,
      errors: job.entries.filter((item) => item.status === 'failed'),
    });
  };
  const run = async (job) => {
    if (job.reading || !current(job.owner, job.targetId)) return false;
    job.reading = true;
    publishQueue(job);
    for (const entry of job.entries) {
      if (entry.status === 'added' || entry.status === 'skipped') continue;
      if (queue.current !== job || job.abort.signal.aborted || !current(job.owner, job.targetId))
        return false;
      const validation = validateScriptV2ReferenceFile(entry.file);
      if (!validation.valid) {
        entry.status = 'failed';
        entry.error = validation.message || '请选择不超过 30MB 的 PNG、JPEG、WebP 或 GIF 图片';
        continue;
      }
      try {
        entry.url ||= await (latest.current.readFile || readLocalFile)(entry.file, {
          signal: job.abort.signal,
        });
        if (!entry.url.startsWith('data:')) throw new Error('图片读取结果不可用');
        entry.status = 'ready';
      } catch (error) {
        if (job.abort.signal.aborted || queue.current !== job) return false;
        entry.status = 'failed';
        entry.error = error instanceof Error ? error.message : '读取失败，请重试';
      }
    }
    if (queue.current !== job || !current(job.owner, job.targetId)) return false;
    const readyEntries = job.entries.filter((entry) => entry.status === 'ready');
    if (readyEntries.length) {
      const plan = commitItems(
        job.owner,
        job.targetId,
        readyEntries.map((entry) => ({ kind: 'local', file: entry.file, url: entry.url })),
      );
      readyEntries.forEach((entry, index) => {
        const result = plan?.results?.[index];
        entry.status = result?.status === 'added' ? 'added' : 'failed';
        entry.error = entry.status === 'failed' ? '画布已经变化，参考图未添加，请重试' : '';
      });
    }
    job.reading = false;
    publishQueue(job);
    return true;
  };
  const addFiles = (files) => {
    const request = uploadOwner.current;
    uploadOwner.current = null;
    if (!request || !current(request.owner, request.targetId)) return false;
    const incoming = Array.from(files || []);
    if (!incoming.length) return false;
    const previous = queue.current;
    if (previous && previous.owner === request.owner && previous.targetId === request.targetId) {
      previous.entries.push(
        ...incoming.map((file) => ({ id: createLocalId(), file, status: 'pending', url: '' })),
      );
      void run(previous);
      publishQueue(previous);
      return true;
    }
    if (previous?.reading || previous?.entries.some((entry) => entry.status === 'failed')) {
      latest.current.notify?.('请先完成或取消当前参考图读取，再为其他脚本添加图片');
      return false;
    }
    cancel();
    const job = {
      ...request,
      abort: new AbortController(),
      reading: false,
      entries: incoming.map((file) => ({ id: createLocalId(), file, status: 'pending', url: '' })),
    };
    queue.current = job;
    void run(job);
    return true;
  };
  const open = (targetId, kind, { onComplete } = {}) => {
    if (!current(owner, targetId)) return false;
    const request = { owner, targetId, onComplete, importedIds: new Set() };
    if (kind === 'canvas') return props.enterPickMode?.(targetId) === true;
    if (kind === 'upload') {
      uploadOwner.current = request;
      fileInput.current?.click();
      return true;
    }
    if (kind === 'assets') {
      pickerOwner.current = request;
      setPicker(request);
      return true;
    }
    return false;
  };
  const closePicker = () => {
    pickerOwner.current = null;
    setPicker(null);
  };
  const pickAssets = async (items) => {
    const request = pickerOwner.current;
    if (!request || !current(request.owner, request.targetId)) throw new Error('当前画布已切换');
    const pendingItems = items.filter((item) => !request.importedIds.has(item.id));
    if (!pendingItems.length) {
      closePicker();
      queueMicrotask(() => {
        if (current(request.owner, request.targetId)) request.onComplete?.();
      });
      return { added: 0 };
    }
    const plan = commitItems(
      request.owner,
      request.targetId,
      pendingItems.map((item) => ({
        kind: 'asset',
        data: localAssetData(item),
        name: item.name,
      })),
    );
    if (!plan?.valid || !plan.added) throw new Error('未找到可添加的图片资产');
    for (const result of plan.results) {
      if (result.status === 'added') request.importedIds.add(pendingItems[result.index].id);
    }
    if (plan.failed || plan.skipped) throw new Error('部分资产无法添加，请重新选择失败的图片');
    closePicker();
    queueMicrotask(() => {
      if (current(request.owner, request.targetId)) request.onComplete?.();
    });
    return plan;
  };
  return {
    open,
    fileInput,
    addFiles,
    cancelChooser: () => {
      uploadOwner.current = null;
    },
    picker: picker?.owner === owner ? picker : null,
    closePicker,
    pickAssets,
    isAssetDisabled: (item) =>
      resolveScriptV2ImageAsset({ data: localAssetData(item), name: item.name }).valid
        ? false
        : '脚本参考仅支持含有图片的资产',
    state: state.owner === owner ? state : { reading: false, errors: [] },
    retry: () => queue.current && run(queue.current),
    dismiss: () => {
      cancel();
      setState({ owner, reading: false, errors: [] });
    },
  };
}

/** Canonical local files can predate serialized assetData; this is an explicit local adapter. */
function localAssetData(item) {
  if (typeof item.assetData === 'string') return item.assetData;
  if (typeof item.data === 'string') return item.data;
  return item.mediaType === 'image' && typeof item.url === 'string' && item.url.trim()
    ? JSON.stringify({ items: [{ data: { type: 'image', name: item.name, url: [item.url] } }] })
    : '';
}
