import { readStoredValue, writeStoredValue, removeStoredValue } from '../../services/storage.ts';

export const readStudioDocument = (id) => readStoredValue(`libtv.studio.${id}`, null);

export function persistStudioDocument(document, now = Date.now()) {
  const { id, title } = document;
  writeStoredValue(`libtv.studio.${id}`, { ...document, date: now });
  const projects = readStoredValue('libtv-studio-projects', []);
  const index = projects.findIndex((project) => project.id === id);
  const entry = { id, name: title, date: now };
  if (index < 0) projects.unshift(entry);
  else projects[index] = entry;
  writeStoredValue('libtv-studio-projects', projects);
}

export function deleteStudioDocument(id) {
  removeStoredValue(`libtv.studio.${id}`);
  const projects = readStoredValue('libtv-studio-projects', []);
  writeStoredValue(
    'libtv-studio-projects',
    projects.filter((project) => project.id !== id),
  );
}
