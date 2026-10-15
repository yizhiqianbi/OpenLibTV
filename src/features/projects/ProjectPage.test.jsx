import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectPage from './ProjectPage.jsx';

beforeEach(() => localStorage.clear());
const readProjects = () => JSON.parse(localStorage.getItem('libtv-projects'));
function mountProjects() {
  const navigate = vi.fn(),
    login = vi.fn(),
    toast = vi.fn();
  const view = render(
    <ProjectPage navigate={navigate} login={login} toast={toast} user={{ name: '本地演示' }} />,
  );
  return { ...view, navigate, login, toast };
}

describe('local project management', () => {
  it('creates a local project and opens its canvas without invoking login', () => {
    const { navigate, login } = mountProjects();
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }));
    const [project] = readProjects();
    expect(project).toMatchObject({ name: '未命名项目', type: 'project', folder: null });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/canvas?projectId=' + project.id);
    expect(login).not.toHaveBeenCalled();
  });

  it('renames, trashes and restores a saved project across the list and storage', () => {
    localStorage.setItem(
      'libtv-projects',
      JSON.stringify([{ id: 'project', name: '旧名称', type: 'project', folder: null }]),
    );
    const { toast } = mountProjects();
    fireEvent.click(screen.getByRole('button', { name: '项目菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '重命名' }));
    const dialog = screen.getByRole('dialog', { name: '重命名' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '新名称' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(readProjects()[0].name).toBe('新名称');
    fireEvent.click(screen.getByRole('button', { name: '项目菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '移至回收站' }));
    expect(screen.queryByText('新名称')).toBeNull();
    expect(readProjects()[0].deleted).toBe(true);
    expect(toast).toHaveBeenCalledWith('已移入回收站');
    fireEvent.click(screen.getByRole('button', { name: '回收站' }));
    expect(screen.getByText('新名称')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '项目菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    expect(readProjects()[0].deleted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '全部项目' }));
    expect(screen.getByText('新名称')).toBeTruthy();
  });

  it('creates inside a folder and keeps the folder relation after returning', () => {
    const { navigate } = mountProjects();
    fireEvent.click(screen.getByRole('button', { name: '新建文件夹' }));
    const dialog = screen.getByRole('dialog', { name: '新建文件夹' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '我的文件夹' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));
    const folder = readProjects()[0];
    fireEvent.click(
      screen.getByText('我的文件夹').closest('article').querySelector('.project-thumb'),
    );
    fireEvent.click(screen.getByRole('button', { name: '开始创作' }));
    expect(readProjects().find((project) => project.type === 'project').folder).toBe(folder.id);
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/canvas\?projectId=/));
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(screen.getByText('我的文件夹')).toBeTruthy();
    expect(screen.queryByText('未命名项目')).toBeNull();
  });

  it('moves a local project to another folder through the project menu', () => {
    localStorage.setItem(
      'libtv-projects',
      JSON.stringify([
        { id: 'project', name: '待整理', type: 'project', folder: null, date: 1 },
        { id: 'folder', name: '成片项目', type: 'folder', folder: null, date: 2 },
      ]),
    );
    mountProjects();
    fireEvent.click(screen.getAllByRole('button', { name: '项目菜单' }).at(-1));
    fireEvent.click(screen.getByRole('button', { name: '移动到文件夹' }));
    const dialog = screen.getByRole('dialog', { name: '移动到文件夹' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: '目标文件夹' }), {
      target: { value: 'folder' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '确定' }));
    expect(readProjects().find((item) => item.id === 'project').folder).toBe('folder');
  });

  it('sorts projects by name while preserving the local project records', () => {
    localStorage.setItem(
      'libtv-projects',
      JSON.stringify([
        { id: 'z', name: '乙项目', type: 'project', folder: null, date: 20 },
        { id: 'a', name: '甲项目', type: 'project', folder: null, date: 10 },
      ]),
    );
    mountProjects();
    fireEvent.change(screen.getByRole('combobox', { name: '排序项目' }), {
      target: { value: 'name' },
    });
    const cards = screen.getAllByText(/项目$/).filter((node) => node.tagName === 'SPAN');
    expect(cards.map((node) => node.textContent)).toEqual(['甲项目', '乙项目']);
  });

  it('does not offer a folder as its own or descendant move target', () => {
    localStorage.setItem(
      'libtv-projects',
      JSON.stringify([
        { id: 'root', name: '根目录', type: 'folder', folder: null, date: 3 },
        { id: 'child', name: '子目录', type: 'folder', folder: 'root', date: 2 },
        { id: 'other', name: '其它目录', type: 'folder', folder: null, date: 1 },
      ]),
    );
    mountProjects();
    const rootCard = screen.getByText('根目录').closest('article');
    fireEvent.click(within(rootCard).getByRole('button', { name: '项目菜单' }));
    fireEvent.click(screen.getByRole('button', { name: '移动到文件夹' }));
    const target = within(screen.getByRole('dialog', { name: '移动到文件夹' })).getByRole(
      'combobox',
      { name: '目标文件夹' },
    );
    expect(Array.from(target.options).map((option) => option.value)).toEqual(['', 'other']);
  });
});
