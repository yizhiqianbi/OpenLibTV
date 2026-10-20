import { api, serverConnected } from './api-client.ts';

/**
 * A single injection point for pages that want the operator API. The local
 * repositories remain the fallback; callers should only construct this when
 * serverConnected is true and keep their local draft until a write succeeds.
 */
export function createLibTvBackend({ client = api } = {}) {
  if (!serverConnected && client === api) return null;
  return {
    content: client.content,
    projects: client.projects,
    folders: client.folders,
    assets: client.assets,
    skills: client.skills,
    canvas: client.canvas,
    generation: client.generation,
    sessions: client.agent.sessions,
    agent: client.agent,
    upload: client.upload,
    social: client.social,
  };
}

export function isRemoteRevisionConflict(error) {
  return error?.status === 409 || error?.status === 412 || error?.code === 'REVISION_CONFLICT';
}

export function remoteCanvasSave(backend, projectId, snapshot, { revision, signal } = {}) {
  if (!backend?.canvas) throw new Error('LibTV 后端未配置');
  return backend.canvas.save(projectId, snapshot, { ifMatch: revision, signal });
}
