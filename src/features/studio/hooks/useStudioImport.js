import { useEffect, useLayoutEffect, useRef } from 'react';

/** Imports are owned by the current project, including the pre-commit parse. */
export function useStudioImport(projectId, actions) {
  const latest = useRef(actions),
    lifecycle = useRef();
  useLayoutEffect(() => {
    latest.current = actions;
  }, [actions]);
  useEffect(() => {
    const session = { active: true, requests: new Set() };
    lifecycle.current = session;
    latest.current.setBusy(false);
    return () => {
      session.active = false;
      for (const request of session.requests) request.abort();
      session.requests.clear();
    };
  }, [projectId]);
  return async (file) => {
    if (!file || !lifecycle.current?.active) return;
    const session = lifecycle.current,
      request = new AbortController();
    let committed = false;
    session.requests.add(request);
    latest.current.setBusy(true);
    try {
      const object = await latest.current.viewport.current.importGLB(file, {
        signal: request.signal,
      });
      if (!session.active || request.signal.aborted) return;
      const actions = latest.current;
      actions.record();
      actions.setObjects((objects) => [...objects, object]);
      actions.setSelected(object.id);
      actions.onImported?.(object);
      committed = true;
    } catch (error) {
      if (session.active && error.name !== 'AbortError')
        latest.current.notify('导入失败：' + (error.message || '请选择有效的 GLB 2 文件'));
    } finally {
      if (!committed) request.abort();
      session.requests.delete(request);
      if (session.active) latest.current.setBusy(session.requests.size > 0);
    }
  };
}
