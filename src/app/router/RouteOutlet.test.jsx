import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteOutlet from './RouteOutlet.jsx';
import { useRouter } from './useRouter.ts';
import { resolveRoute } from './routes.ts';

vi.mock('../../data.js', async (original) => ({
  ...(await original()),
  useContent: (_name, fallback) => ({
    data: fallback,
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}));
const login = vi.fn();
// The assertion concerns query consumption and component identity. Warm the
// genuine lazy module before timing DOM updates, so npm package transforms in
// a parallel suite are not confused with a missing rendered reference.
beforeAll(async () => {
  await import('../../features/skills/SkillPage.jsx');
});
function Harness() {
  const router = useRouter();
  return (
    <>
      <button
        onClick={() =>
          router.navigate(
            '/skill?useSkillKey=second&useSkillNs=studio&useSkillName=第二引用&tab=mine#keep',
          )
        }
      >
        插入分享
      </button>
      <RouteOutlet
        route={resolveRoute(router.pathname)}
        locationKey={router.locationKey}
        path={router.pathname}
        search={router.search}
        navigate={router.navigate}
        user={{ name: '测试' }}
        login={login}
      />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(
    {},
    '',
    '/skill?useSkillKey=first&useSkillNs=studio&useSkillName=首个引用',
  );
});

describe('query-driven Skill composition', () => {
  it('consumes share parameters without remounting the editor or losing subsequent text and references', async () => {
    render(<Harness />);
    await screen.findByText('首个引用');
    expect(location.search).toBe('');
    const input = screen.getByRole('textbox', {
      name: '请输入你的创作灵感，或从下方挑选一个 Skill 开始',
    });
    await waitFor(() => expect(input.editor).toBeTruthy());
    await act(async () =>
      input.editor.chain().setTextSelection(1).insertContent('保留正文 ').run(),
    );
    const editor = input.editor;
    act(() => screen.getByRole('button', { name: '插入分享' }).click());
    await screen.findByText('第二引用');
    expect(screen.getByRole('textbox', { name: input.getAttribute('aria-label') })).toBe(input);
    expect(input.editor).toBe(editor);
    expect(input.textContent).toContain('保留正文');
    expect(input.textContent).toContain('首个引用');
    expect(location.search).toBe('?tab=mine');
    expect(location.hash).toBe('#keep');
    act(() => screen.getByRole('button', { name: '插入分享' }).click());
    await waitFor(() => expect(screen.getAllByText('第二引用')).toHaveLength(2));
    expect(login).not.toHaveBeenCalled();
  });
});
