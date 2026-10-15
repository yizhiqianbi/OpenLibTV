import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillCreateMenu from './SkillCreateMenu.jsx';

describe('Skill creation menu pointer and keyboard triggers', () => {
  it.each([false, true])(
    'keeps the %s primary menu open when a click follows hover',
    async (primary) => {
      const user = userEvent.setup();
      const onCreate = vi.fn();
      const parentClick = vi.fn();
      render(
        <div onClick={parentClick}>
          <SkillCreateMenu primary={primary} onCreate={onCreate} />
        </div>,
      );
      const trigger = screen.getByRole('button', { name: primary ? '创建Skill' : '创建' });
      await user.hover(trigger);
      expect(screen.getByRole('menu', { name: '创建 Skill' })).toBeTruthy();
      await user.click(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByRole('menu', { name: '创建 Skill' })).toBeTruthy();
      expect(parentClick).not.toHaveBeenCalled();
      await user.click(screen.getByRole('menuitem', { name: /导入已有Skill/ }));
      expect(onCreate).toHaveBeenCalledExactlyOnceWith('custom');
      expect(screen.queryByRole('menu')).toBeNull();
    },
  );

  it('opens with a keyboard click and still closes with Escape or an outside pointer', async () => {
    const user = userEvent.setup();
    render(
      <>
        <SkillCreateMenu onCreate={vi.fn()} />
        <button>外部</button>
      </>,
    );
    const trigger = screen.getByRole('button', { name: '创建' });
    await user.tab();
    expect(document.activeElement).toBe(trigger);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '外部' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
