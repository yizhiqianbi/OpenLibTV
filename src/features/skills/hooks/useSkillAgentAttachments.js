import { useEffect, useRef, useState } from 'react';
import { api, serverConnected } from '../../../services/api-client.ts';
import { isAgentReference } from '../../../services/agent-content.js';
import { skillAttachmentType } from '../../../services/agent-handoff.js';

/** Read/upload tasks belong to the mounted composer, never to a removed chip. */
export function useSkillAgentAttachments({ parts, input, user, login, toast }) {
  const [attached, setAttached] = useState([]);
  const tasks = useRef(new Map());
  const active = useRef(false);
  const latest = useRef(parts);
  const currentUser = useRef(user);
  currentUser.current = user;
  latest.current = parts;
  useEffect(() => {
    const running = tasks.current;
    active.current = true;
    return () => {
      active.current = false;
      for (const task of running.values()) task.cancel();
      running.clear();
    };
  }, []);
  useEffect(() => {
    if (user) return;
    queueMicrotask(() => {
      if (!active.current || currentUser.current) return;
      for (const [id, task] of tasks.current) {
        task.cancel();
        input.current?.upsertReference(id, { status: 'error', error: '请登录后重试上传' });
      }
      tasks.current.clear();
      setAttached((items) =>
        items.map((item) =>
          item.status === 'uploading'
            ? { ...item, status: 'error', error: '请登录后重试上传' }
            : item,
        ),
      );
    });
  }, [user, input]);
  useEffect(() => {
    queueMicrotask(() => {
      if (!active.current) return;
      const current = input.current?.getParts() || latest.current;
      const ids = new Set(current.filter(isAgentReference).map((part) => part.id));
      for (const reference of current.filter(isAgentReference)) {
        if (reference.status === 'uploading' && !tasks.current.has(reference.id))
          input.current?.upsertReference(reference.id, {
            status: 'error',
            error: '素材读取已中断，请重新选择文件',
          });
      }
      for (const [id, task] of tasks.current) {
        if (ids.has(id)) continue;
        task.cancel();
        tasks.current.delete(id);
      }
      // Run after the batch of editor transactions so subsequent insertions in the
      // same selection do not remove each other's pending rows.
      setAttached((previous) =>
        previous.every((item) => ids.has(item.id))
          ? previous
          : previous.filter((item) => ids.has(item.id)),
      );
    });
  }, [parts, input]);
  const uploadAttachment = async (item) => {
    if (!currentUser.current) {
      login?.();
      return;
    }
    if (!input.current?.hasReference(item.id)) return;
    tasks.current.get(item.id)?.cancel();
    const controller = new AbortController();
    let reader,
      cancelled = false;
    const task = {
      cancel: () => {
        cancelled = true;
        controller.abort();
        if (reader?.readyState === 1) reader.abort();
      },
    };
    tasks.current.set(item.id, task);
    const current = () => active.current && !cancelled && input.current?.hasReference(item.id);
    const update = (changes) => {
      if (!current()) return;
      input.current.upsertReference(item.id, changes);
      setAttached((items) =>
        items.map((value) => (value.id === item.id ? { ...value, ...changes } : value)),
      );
    };
    update({ status: 'uploading', error: null });
    try {
      let source;
      if (serverConnected) {
        const [uploaded] = await api.upload([item.file], { signal: controller.signal });
        if (!uploaded?.url) throw new Error('上传未返回文件地址');
        source = {
          type: 'url',
          value: uploaded.url,
          mimeType: uploaded.mimeType || item.file.type,
        };
      } else {
        const value = await new Promise((resolve, reject) => {
          reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string' && reader.result.startsWith('data:')
              ? resolve(reader.result)
              : reject(new Error('文件读取失败'));
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.onabort = () => reject(new DOMException('文件读取已取消', 'AbortError'));
          reader.readAsDataURL(item.file);
        });
        source = { type: 'data', value, mimeType: item.file.type };
      }
      update({ source, status: 'ready' });
    } catch (error) {
      if (error.name !== 'AbortError')
        update({ status: 'error', error: error.message || '上传失败' });
    } finally {
      if (tasks.current.get(item.id) === task) tasks.current.delete(item.id);
    }
  };
  const addAttachments = (items, enforceLimit = true) => {
    if (!input.current?.getEditor()) return false;
    const counts = { image: 0, video: 0, audio: 0 };
    for (const item of [...parts.filter(isAgentReference), ...items])
      if (item.type in counts) counts[item.type] += 1;
    if (enforceLimit && Object.values(counts).some((count) => count > 20)) {
      toast?.('图片、视频、音频每类最多选择 20 个');
      return false;
    }
    setAttached((previous) => [...previous, ...items]);
    input.current.insertReferences(
      items.map(({ type, id, name, status, source, metadata }) => ({
        type,
        id,
        name,
        status,
        ...(source ? { source } : {}),
        ...(metadata ? { metadata } : {}),
      })),
    );
    return true;
  };
  const uploadFiles = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!user) return login();
    const items = files
      .filter((value) => {
        if (skillAttachmentType(value)) return true;
        toast?.('请上传图片、视频、音频或 PDF、TXT、Markdown、Word 文档');
        return false;
      })
      .map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: skillAttachmentType(file),
        file,
        status: 'uploading',
      }));
    if (addAttachments(items, false)) items.forEach(uploadAttachment);
  };
  return {
    attached,
    uploadAttachment,
    uploadFiles,
    addAttachments,
    removeAttachment: (id) => input.current?.removeReference(id),
  };
}
