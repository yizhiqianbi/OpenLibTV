import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';
import { readSkillHandoff, skillHandoffText } from '../../../services/agent-handoff.js';
import SkillCard from '../components/SkillCard.jsx';
import { useSkillMine } from './useSkillMine.js';
import SkillMineDialogs, { SkillMineDeleted } from './SkillMineDialogs.jsx';

const skill = {
  skillUuid: 'mine',
  name: '我的技能',
  markdownContent: '# 原始正文',
  resultType: 2,
  coverUrl: '/cover.png',
  skillKey: 'film',
  namespace: 'local',
  localDemo: true,
  auditStatus: -1,
};
const categories = [
  { id: 4000, tagLabel: '专业影视', tagStatus: 1 },
  { id: 4008, tagLabel: '推荐' },
];
const properties = () => ({
  user: { id: 'me', name: '本地演示' },
  login: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
});
function Harness({ onDetail = vi.fn(), onAdd = vi.fn(), ...props }) {
  const mine = useSkillMine(props);
  return (
    <>
      {mine.error && <p role="alert">数据读取失败</p>}
      {mine.skills.map((item) => (
        <SkillCard
          key={item.skillUuid}
          item={item}
          favs={[]}
          onOpen={onDetail}
          mineActions={mine.cardActions(item, { onDetail, onAdd })}
        />
      ))}
      <SkillMineDeleted controller={mine} />
      <SkillMineDialogs controller={mine} categories={categories} />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  writeStoredValue('libtv-created-skills', [skill]);
});
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: '更多操作' }));

describe('My Skill local menu and dialogs', () => {
  it('opens via hover then click and routes edits without opening the card detail', async () => {
    const user = userEvent.setup(),
      props = properties(),
      onDetail = vi.fn();
    render(<Harness {...props} onDetail={onDetail} />);
    const trigger = screen.getByRole('button', { name: '更多操作' });
    await user.hover(trigger);
    await screen.findByRole('menu');
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: '编辑', exact: true }));
    expect(props.navigate).toHaveBeenCalledWith('/skill/create?skillUuid=mine');
    expect(onDetail).not.toHaveBeenCalled();
  });
  it('makes deletion explicit, reversible and persistent without altering audit metadata', () => {
    const view = render(<Harness {...properties()} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    const dialog = screen.getByRole('dialog', { name: '删除 Skill' });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(readStoredValue('libtv-created-skills', [])[0].localDeletedAt).toBeUndefined();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除' }));
    expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull();
    view.unmount();
    render(<Harness {...properties()} />);
    fireEvent.click(screen.getByText('已删除的 Skill (1)'));
    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    expect(readStoredValue('libtv-created-skills', [])[0]).toEqual(skill);
    expect(screen.getByRole('button', { name: '更多操作' })).toBeTruthy();
  });
  it('keeps one Add action and restores menu focus with keyboard navigation', () => {
    const onDetail = vi.fn(),
      onAdd = vi.fn();
    render(<Harness {...properties()} onDetail={onDetail} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '编辑', exact: true })).toBeNull();
    const trigger = screen.getByRole('button', { name: '更多操作' });
    trigger.focus();
    openMenu();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '删除' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('disables publication while a case is reading and persists its real data URL across remount', async () => {
    const readers = [];
    class Reader {
      constructor() {
        readers.push(this);
      }
      readAsDataURL() {}
      abort() {}
    }
    vi.stubGlobal('FileReader', Reader);
    try {
      const view = render(<Harness {...properties()} />);
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: '发布' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('上传 Skill 案例'), {
        target: { files: [new File(['png'], 'mycase.png', { type: 'image/png' })] },
      });
      const publish = within(dialog).getByRole('button', { name: '发布', exact: true });
      expect(publish.disabled).toBe(true);
      expect(within(dialog).getByRole('status').textContent).toContain('案例读取中');
      act(() => {
        readers[0].result = 'data:image/png;base64,bXljYXNl';
        readers[0].onload();
      });
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '4000' } });
      expect(publish.disabled).toBe(false);
      fireEvent.click(publish);
      await waitFor(() =>
        expect(
          readStoredValue('libtv-created-skills', [])[0].localPublishRequest?.payload.caseItems[0]
            .productionCaseUrl,
        ).toBe('data:image/png;base64,bXljYXNl'),
      );
      view.unmount();
      render(<Harness {...properties()} />);
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: '发布' }));
      expect(within(screen.getByRole('dialog')).getByRole('img').getAttribute('src')).toBe(
        'data:image/png;base64,bXljYXNl',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('shows source permission reasons and leaves owned pending deletion available', () => {
    writeStoredValue('libtv-created-skills', [{ ...skill, ownerId: 'other' }]);
    const props = properties();
    const view = render(<Harness {...props} isTeamUser />);
    openMenu();
    expect(screen.getByRole('menuitem', { name: '编辑', exact: true }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: '删除' }).title).toBe(
      '非本人创建Skill，无权限删除',
    );
    view.unmount();
    writeStoredValue('libtv-created-skills', [{ ...skill, auditStatus: 0 }]);
    render(<Harness {...props} />);
    openMenu();
    expect(screen.getByRole('menuitem', { name: '发布' }).disabled).toBe(true);
    expect(screen.getByRole('menuitem', { name: '删除' }).disabled).toBe(false);
  });
  it('stores a structured edit-in-chat handoff and preserves the Skill if storage fails', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({});
    const props = properties();
    render(<Harness {...props} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '在对话中编辑' }));
    const url = new URL(open.mock.calls[0][0], location.origin);
    const payload = readSkillHandoff(url.searchParams.get('draftPromptId'));
    expect(skillHandoffText(payload)).toBe('更新我的 Skill');
    expect(payload.parts[1]).toMatchObject({ type: 'skill', id: 'local/film', name: '我的技能' });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '在对话中编辑' }));
    expect(open).toHaveBeenCalledOnce();
    expect(props.toast).toHaveBeenCalled();
    set.mockRestore();
    expect(readStoredValue('libtv-created-skills', [])).toEqual([skill]);
  });
  it('validates a real publication form, restores the local blocked request and cancels it without changing audit state', async () => {
    const item = {
      ...skill,
      auditStatus: 2,
      rejectReason: '原审核不通过理由',
      productionCaseUrls: ['/case.png'],
    };
    writeStoredValue('libtv-created-skills', [item]);
    const view = render(<Harness {...properties()} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '发布' }));
    let dialog = screen.getByRole('dialog', { name: '发布 Skill' });
    fireEvent.click(within(dialog).getByRole('button', { name: '发布', exact: true }));
    expect(within(dialog).getByText('请选择 Skill 分类后再发布')).toBeTruthy();
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Skill 分类' }), {
      target: { value: '4000' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: '案例作品链接 1' }), {
      target: { value: 'https://sample.local/canvas' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '发布', exact: true }));
    expect(within(dialog).getByRole('status').textContent).toContain('未提交审核');
    const saved = readStoredValue('libtv-created-skills', [])[0];
    expect(saved.auditStatus).toBe(2);
    expect(saved.localPublishRequest).toMatchObject({
      status: 'blocked',
      linkValidation: 'service-required',
      payload: {
        caseItems: [
          { productionCaseUrl: '/case.png', canvasCaseUrl: 'https://sample.local/canvas' },
        ],
        tagIds: [4000],
      },
    });
    view.unmount();
    render(<Harness {...properties()} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '发布' }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: '案例作品链接 1' }).value).toBe(
      'https://sample.local/canvas',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: '取消待提交请求' }));
    await waitFor(() =>
      expect(readStoredValue('libtv-created-skills', [])[0].localPublishRequest).toBeUndefined(),
    );
    expect(readStoredValue('libtv-created-skills', [])[0].auditStatus).toBe(2);
  });
  it('keeps the form and original Skill on write failure and blocks corrupt data from being overwritten', () => {
    writeStoredValue('libtv-created-skills', [
      { ...skill, productionCaseUrls: ['/case.png'], categoryTagIds: [4000] },
    ]);
    const view = render(<Harness {...properties()} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '发布' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: '案例作品链接 1' }), {
      target: { value: 'https://sample.local/kept' },
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '发布', exact: true }));
    expect(within(dialog).getByText(/当前表单和案例仍保留/)).toBeTruthy();
    expect(within(dialog).getByRole('textbox', { name: '案例作品链接 1' }).value).toBe(
      'https://sample.local/kept',
    );
    set.mockRestore();
    view.unmount();
    act(() => localStorage.setItem('libtv-created-skills', '{corrupt'));
    render(<Harness {...properties()} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(localStorage.getItem('libtv-created-skills')).toBe('{corrupt');
  });
});
