import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CourseCatalog from './CourseCatalog.jsx';

function course(courseId, { defaultExpandedIds = [], current = 'current', extra = 'extra' } = {}) {
  return {
    courseId,
    defaultExpandedIds,
    units: [
      {
        id: `${courseId}-unit`,
        title: '单元',
        order: 1,
        implicit: false,
        groups: [
          {
            id: `${courseId}-current-group`,
            title: '当前分组',
            order: 1,
            implicit: false,
            leaves: [{ sectionId: current, title: `${courseId} 当前章节`, available: true }],
          },
          {
            id: `${courseId}-extra-group`,
            title: '其他分组',
            order: 2,
            implicit: false,
            leaves: [{ sectionId: extra, title: `${courseId} 其他章节`, available: true }],
          },
        ],
      },
    ],
  };
}

function CatalogHarness() {
  const [active, setActive] = useState('one');
  const selected = active === 'one' ? 'current' : 'current-two';
  return (
    <>
      <button type="button" onClick={() => setActive('two')}>
        切换课程
      </button>
      <CourseCatalog
        course={
          active === 'one'
            ? course('one')
            : course('two', { current: 'current-two', extra: 'extra-two' })
        }
        selected={selected}
        onSelect={vi.fn()}
        onPractice={vi.fn()}
      />
    </>
  );
}

describe('CourseCatalog source expansion contract', () => {
  it('keeps the current chapter group visible even after its toggle is pressed', () => {
    render(<CourseCatalog course={course('one')} selected="current" onSelect={vi.fn()} />);

    const toggle = screen.getByRole('button', { name: /2 其他分组/ });
    expect(screen.getByRole('button', { name: 'one 当前章节' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'one 其他章节' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /1 当前分组/ }));
    expect(screen.getByRole('button', { name: 'one 当前章节' })).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'one 其他章节' })).toBeTruthy();
  });

  it('resets manual expansion when a new course detail is loaded', () => {
    render(<CatalogHarness />);

    fireEvent.click(screen.getByRole('button', { name: /2 其他分组/ }));
    expect(screen.getByRole('button', { name: 'one 其他章节' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '切换课程' }));
    expect(screen.getByRole('button', { name: 'two 当前章节' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'two 其他章节' })).toBeNull();
  });
});
