import { useEffect, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import { readCanvasUploadNode } from '../domain/uploads.js';
import { planStoryboardSlotInsert } from '../domain/storyboard-slot-model.js';

/** Local slot writes share the current document and existing single history transaction. */
export function useStoryboardSlots(props) {
  const latest = useRef(props),
    active = useRef(false),
    pending = useRef(null),
    request = useRef(null);
  latest.current = props;
  const [target, setTarget] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current = null;
      pending.current?.abort();
    };
  }, []);
  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    request.current = null;
    setBusy(false);
    setTarget(null);
  }, [props.documentKey, props.ready, props.readonly]);
  useEffect(() => {
    const owner = request.current;
    if (!owner) return;
    const graph = latest.current.getDocument();
    if (
      graph?.nodes.some(
        (node) =>
          node.id === owner.groupId &&
          node.type === 'group' &&
          node.data?.standaloneStoryboardImageGrid === true &&
          node.data?.storyboardGroupType === 'image',
      )
    )
      return;
    pending.current?.abort();
    pending.current = null;
    request.current = null;
    setBusy(false);
    setTarget(null);
  }, [props.nodes]);
  const current = (owner, checkRequest = true) => {
    const state = latest.current;
    const graph = state.getDocument();
    return active.current &&
      (!checkRequest || request.current === owner) &&
      state.ready &&
      !state.readonly &&
      graph?.ready &&
      !graph.readonly &&
      graph.documentKey === owner.documentKey &&
      graph.nodes.some(
        (node) =>
          node.id === owner.groupId &&
          node.type === 'group' &&
          node.data?.standaloneStoryboardImageGrid === true &&
          node.data?.storyboardGroupType === 'image',
      )
      ? { state, graph }
      : null;
  };
  const insert = (node, owner) => {
    const document = current(owner);
    if (!document) return false;
    const plan = planStoryboardSlotInsert({
      nodes: document.graph.nodes,
      groupId: owner.groupId,
      slotIndex: owner.slotIndex,
      imageNode: node,
    });
    if (!plan.valid) {
      document.state.notify(
        plan.reason === 'full' ? '分镜宫格已满，无法继续添加' : '该空位已发生变化，请重新选择',
      );
      return false;
    }
    try {
      if (document.state.change(plan.nodes) === false) return false;
    } catch (error) {
      document.state.notify(error.message || '添加图片失败，请重试');
      return false;
    }
    document.state.setSelected([owner.groupId]);
    document.state.onInserted?.(owner.groupId);
    return true;
  };
  return {
    target: target?.documentKey === props.documentKey && current(target) ? target : null,
    busy,
    open: (groupId, slotIndex) => {
      const owner = { documentKey: latest.current.documentKey, groupId, slotIndex };
      if (!current(owner, false)) return false;
      pending.current?.abort();
      pending.current = null;
      setBusy(false);
      request.current = owner;
      setTarget(owner);
      return true;
    },
    isCurrent: (owner) => request.current === owner,
    close: (owner = request.current) => {
      if (request.current !== owner) return;
      pending.current?.abort();
      pending.current = null;
      request.current = null;
      setBusy(false);
      setTarget(null);
    },
    pick: (item) => {
      const owner = target;
      if (!owner || !current(owner)) return false;
      const url = item.thumbnailUrl || item.coverUrl || item.imageUrl || item.url;
      if (typeof url !== 'string' || !url) {
        latest.current.notify('图片地址不可用，请选择其他图片');
        return false;
      }
      return insert(
        {
          id: createLocalId(),
          type: 'image',
          position: { x: 0, y: 0 },
          data: { action: 'image_resource', type: 'image', url: [url], params: {} },
        },
        owner,
      );
    },
    upload: async (file, owner = target) => {
      if (!owner || !current(owner) || pending.current) return false;
      if (!file?.type.startsWith('image/')) {
        latest.current.notify('分镜组支持图像内容');
        return false;
      }
      const controller = new AbortController();
      pending.current = controller;
      setBusy(true);
      try {
        const node = await readCanvasUploadNode(file, { signal: controller.signal });
        if (controller.signal.aborted || !current(owner)) return false;
        return insert(node, owner);
      } catch (error) {
        if (!controller.signal.aborted && current(owner))
          latest.current.notify(error.message || '文件读取失败，请重试');
        return false;
      } finally {
        if (pending.current === controller) {
          pending.current = null;
          if (active.current) setBusy(false);
        }
      }
    },
  };
}
