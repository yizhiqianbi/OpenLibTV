import { readStoredState } from '../storage.ts';
import { asset } from '../assets.ts';
export interface CanvasFilmSource {
  id: string;
  title: string;
  project: string;
  type: string;
  url: string;
}
/** Read-only adapter. It never modifies an existing Canvas snapshot. */
export function listCanvasFilmSources(): CanvasFilmSource[] {
  const projects = readStoredState<{ id: string; name: string }[]>('libtv-projects', [], {
    strict: true,
  }).value;
  if (!Array.isArray(projects)) throw new Error('画布项目目录格式异常，原数据已保留');
  const result: CanvasFilmSource[] = [];
  for (const project of projects) {
    const state = readStoredState<{
      nodes?: { id: string; type: string; data?: { name?: string; url?: string | string[] } }[];
    } | null>(`libtv.canvas.${project.id}`, null, { strict: true });
    if (!state.value) continue;
    if (!Array.isArray(state.value.nodes)) throw new Error(`${project.name} 的画布格式异常`);
    for (const node of state.value.nodes) {
      const url = Array.isArray(node.data?.url) ? node.data?.url[0] : node.data?.url;
      if (['image', 'video', 'audio'].includes(node.type) && url && !url.startsWith('blob:'))
        result.push({
          id: `${project.id}:${node.id}`,
          title: node.data?.name || node.type,
          project: project.name,
          type: node.type,
          url: asset(url),
        });
    }
  }
  return result;
}
