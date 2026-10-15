export const SKILL_TREE_DRAG_TYPE = 'application/x-libtv-skill-file';
export const parentPath = (path) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const pathContains = (root, path) => path === root || path.startsWith(root + '/');
export function skillDirectories(files, dirs = []) {
  const result = new Set();
  for (const path of [...dirs, ...files.map((file) => parentPath(file.path))]) {
    let current = path;
    while (current) {
      result.add(current);
      current = parentPath(current);
    }
  }
  return [...result].sort();
}
export function relocateSkillEntry(files, dirs, from, target, messages = {}) {
  const directories = skillDirectories(files, dirs);
  if (from === 'SKILL.md') throw new Error(messages.locked || '主文件不能移动或重命名');
  if (!files.some((file) => file.path === from) && !directories.includes(from))
    throw new Error('文件或文件夹已不存在，请重新选择');
  if (target === from) return { files, dirs, mapPath: (path) => path };
  if (pathContains(from, target)) throw new Error('不能移动到自身或子文件夹');
  if (files.some((file) => file.path === target) || directories.includes(target))
    throw new Error(messages.conflict || '目标位置已有同名文件或文件夹');
  const parent = parentPath(target);
  if (parent && !directories.includes(parent)) throw new Error('目标文件夹已不存在');
  const mapPath = (path) => (pathContains(from, path) ? target + path.slice(from.length) : path);
  return {
    files: files.map((file) => ({ ...file, path: mapPath(file.path) })),
    dirs: [...new Set(dirs.map(mapPath))],
    mapPath,
  };
}
