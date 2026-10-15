import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SkillCaseMedia from './SkillCaseMedia.jsx';
import SkillDetailModal from './SkillDetailModal.jsx';

afterEach(() => vi.unstubAllGlobals());

describe('Skill example media and public files', () => {
  it('renders image zoom and audio playback instead of treating every case as video', () => {
    const onZoom = vi.fn();
    const view = render(
      <SkillCaseMedia
        item={{ productionCaseUrl: '/image.webp?size=2' }}
        title="图片案例"
        onZoom={onZoom}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '查看原图' }));
    expect(onZoom).toHaveBeenCalledOnce();
    expect(document.querySelector('video')).toBeNull();
    view.rerender(<SkillCaseMedia item={{ productionCaseUrl: '/sound.mp3' }} title="音频案例" />);
    expect(screen.getByLabelText('音频案例').tagName).toBe('AUDIO');
  });
  it('shows a recoverable document error and aborts the previous read on retry', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, text: async () => '# 案例文档' });
    vi.stubGlobal('fetch', fetcher);
    render(<SkillCaseMedia item={{ productionCaseUrl: '/script.md' }} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('内容加载失败'));
    const signal = fetcher.mock.calls[0][1].signal;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await screen.findByRole('heading', { name: '案例文档' });
    expect(signal.aborted).toBe(true);
  });
  it('restores file content from public snapshots and does not expose a fake local share link', () => {
    const detail = {
      name: '本地草稿',
      localDemo: true,
      snapshotData: JSON.stringify({
        primarySkillFilePath: 'SKILL.md',
        skillFiles: [
          { path: 'SKILL.md', content: '# 主文件' },
          { path: 'references/notes.md', content: '# 附件笔记' },
        ],
      }),
    };
    render(<SkillDetailModal detail={detail} onClose={vi.fn()} onUse={vi.fn()} />);
    expect(screen.getByRole('heading', { name: '主文件' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '分享 Skill' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '选择 Skill 文件' }));
    fireEvent.click(screen.getByRole('button', { name: 'references/notes.md' }));
    expect(screen.getByRole('heading', { name: '附件笔记' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '源码' }));
    expect(document.querySelector('pre').textContent).toBe('# 附件笔记');
  });
});
