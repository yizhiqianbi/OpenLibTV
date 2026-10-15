import { useCallback, useEffect, useRef, useState } from 'react';
import { skillAttachmentType } from '../../../services/agent-handoff.js';
import { createLocalId } from '../../editor/model.js';
import { appendAgentReferences } from '../../../services/agent-content.js';

function readFile(reader, file) {
  return new Promise((resolve, reject) => {
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:'))
        resolve(reader.result);
      else reject(new Error('未能读取参考素材'));
    };
    reader.onerror = () => reject(new Error('读取失败，请重新选择文件'));
    reader.onabort = () => reject(new Error('文件读取已取消'));
    reader.readAsDataURL(file);
  });
}

/** Reserve inline positions while reading; stale tasks never replace a removed tag. */
export function useCanvasAgentAttachments({
  documentKey,
  enabled,
  prompt,
  setAgentDraft,
  input,
  parts,
}) {
  const latest = useRef({ documentKey, enabled, prompt, setAgentDraft, input });
  latest.current = { documentKey, enabled, prompt, setAgentDraft, input };
  const active = useRef(false);
  const reads = useRef(new Map());
  const [state, setState] = useState({ documentKey, pending: [], errors: [] });

  useEffect(() => {
    const currentReads = reads.current;
    active.current = true;
    setState({ documentKey, pending: [], errors: [] });
    return () => {
      active.current = false;
      for (const task of currentReads.values()) {
        task.cancelled = true;
        if (task.reader.readyState === 1) task.reader.abort();
      }
      currentReads.clear();
    };
  }, [documentKey]);
  useEffect(() => {
    if (!input) return;
    queueMicrotask(() => {
      if (!active.current) return;
      const current = input.current?.getParts() || [];
      const ids = new Set(current.map((part) => part.id));
      for (const reference of current) {
        if (reference.status === 'uploading' && !reads.current.has(reference.id))
          input.current?.upsertReference(reference.id, {
            status: 'error',
            error: '素材读取已中断，请重新选择文件',
          });
      }
      for (const [id, task] of reads.current) {
        if (ids.has(id)) continue;
        task.cancelled = true;
        if (task.reader.readyState === 1) task.reader.abort();
        reads.current.delete(id);
        setState((previous) => ({
          ...previous,
          pending: previous.pending.filter((item) => item.id !== id),
        }));
      }
    });
  }, [parts, input]);

  const addFiles = useCallback((files) => {
    const target = latest.current;
    if (!active.current || !target.enabled) return;
    const selected = Array.from(files || []);
    const failed =
      target.input?.current?.getParts().filter((part) => part.status === 'error') || [];
    const reused = new Set();
    const tasks = selected.map((file) => {
      const previous = failed.find(
        (part) =>
          !reused.has(part.id) &&
          part.name === file.name &&
          part.type === skillAttachmentType(file),
      );
      if (previous) reused.add(previous.id);
      return {
        id: previous?.id || createLocalId(),
        replace: !!previous,
        file,
        type: skillAttachmentType(file),
        documentKey: target.documentKey,
        cancelled: false,
      };
    });
    const accepted = tasks.filter((task) => task.type);
    const unsupported = tasks.filter((task) => !task.type);
    setState((previous) => ({
      documentKey: target.documentKey,
      pending: [
        ...(previous.documentKey === target.documentKey ? previous.pending : []),
        ...accepted.map(({ id, file }) => ({ id, name: file.name })),
      ],
      errors: [
        ...(target.input && previous.documentKey === target.documentKey
          ? previous.errors.filter((item) => !accepted.some((task) => task.id === item.id))
          : []),
        ...unsupported.map(({ id, file }) => ({
          id,
          name: file.name,
          message: '不支持此类型，请选择图片、视频、音频或 PDF、TXT、Markdown、Word 文档',
        })),
      ],
    }));

    if (target.input?.current) {
      accepted
        .filter((task) => task.replace)
        .forEach((task) =>
          target.input.current.upsertReference(task.id, { status: 'uploading', error: null }),
        );
      const references = accepted
        .filter((task) => !task.replace)
        .map((task) => ({
          type: task.type,
          id: task.id,
          name: task.file.name,
          status: 'uploading',
        }));
      if (references.length) target.input.current.insertReferences(references);
    }

    for (const task of accepted) {
      task.reader = new FileReader();
      reads.current.set(task.id, task);
      const isCurrent = () =>
        active.current &&
        !task.cancelled &&
        latest.current.enabled &&
        latest.current.documentKey === task.documentKey &&
        (!latest.current.input || latest.current.input.current?.hasReference(task.id));
      readFile(task.reader, task.file)
        .then((value) => {
          if (!isCurrent()) return;
          const reference = {
            type: task.type,
            id: task.id,
            name: task.file.name,
            status: 'ready',
            source: { type: 'data', value, mimeType: task.file.type },
          };
          if (latest.current.input)
            latest.current.input.current?.upsertReference(task.id, reference);
          else
            latest.current.setAgentDraft((draft) =>
              isCurrent()
                ? appendAgentReferences(draft, latest.current.prompt, [reference])
                : draft,
            );
        })
        .catch((error) => {
          if (!isCurrent()) return;
          latest.current.input?.current?.upsertReference(task.id, {
            status: 'error',
            error: error.message,
          });
          setState((previous) =>
            previous.documentKey === task.documentKey
              ? {
                  ...previous,
                  errors: [
                    ...previous.errors,
                    { id: task.id, name: task.file.name, message: error.message },
                  ],
                }
              : previous,
          );
        })
        .finally(() => {
          reads.current.delete(task.id);
          if (!isCurrent()) return;
          setState((previous) =>
            previous.documentKey === task.documentKey
              ? {
                  ...previous,
                  pending: previous.pending.filter((item) => item.id !== task.id),
                }
              : previous,
          );
        });
    }
  }, []);

  const current = state.documentKey === documentKey ? state : { pending: [], errors: [] };
  return {
    addFiles,
    pending: current.pending,
    errors: current.errors,
    busy: !!current.pending.length,
  };
}
