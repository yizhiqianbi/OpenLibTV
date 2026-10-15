import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { CanvasNode } from './CanvasNode.jsx';
import { NodeSettingsPanel } from './NodeSettingsPanel.jsx';
import { download } from '../../editor/browser.js';
vi.mock('../../editor/browser.js', () => ({ download: vi.fn() }));

function Host() {
  const [node, setNode] = useState({
    id: 'text',
    type: 'text',
    position: { x: 0, y: 0 },
    data: { text: '初始正文', params: { model: models.default.text, prompt: '初始正文' } },
  });
  const update = (_id, data) =>
    setNode((current) => ({ ...current, data: { ...current.data, ...data } }));
  return (
    <>
      <CanvasNode
        n={node}
        Icon={() => null}
        info={{ label: '文本' }}
        selected={[]}
        update={update}
        drag={vi.fn()}
        setSelected={vi.fn()}
        setPanel={vi.fn()}
      />
      <NodeSettingsPanel
        activeNode={node}
        nodes={[node]}
        edges={[]}
        models={models}
        update={update}
        setPanel={vi.fn()}
      />
    </>
  );
}
describe('inline text and generator prompt synchronization', () => {
  it('exports a complete V2 script through its source toolbar and blocks stale or busy downloads', async () => {
    const node = {
      id: 'script',
      type: 'script-v2',
      position: { x: 0, y: 0 },
      data: {
        type: 'script-v2',
        name: '画布卡片名字',
        title: '我的分镜',
        rows: [
          {
            id: 'shot',
            hiddenUuid: 'shot',
            shotNumber: 1,
            plotDescription: '晨光',
            imageGenerationPrompt: '海岸晨光',
            videoMotionPrompt: '推进',
            imagePromptState: 'synced',
            videoPromptState: 'synced',
          },
        ],
        assets: {
          characters: [],
          scenes: [{ id: 'coast', name: '海岸', thumbnailUrl: '/coast.png' }],
          props: [],
        },
      },
    };
    const props = {
      n: node,
      Icon: () => null,
      info: { label: '脚本' },
      selected: ['script'],
      update: vi.fn(),
      drag: vi.fn(),
      setSelected: vi.fn(),
      setPanel: vi.fn(),
      script: {
        nodes: [node],
        documentKey: 'doc',
        toolbar: {
          selectionEligible: true,
          anchor: { x: 400, y: 300 },
          portal: document.body,
        },
      },
    };
    const view = render(<CanvasNode {...props} />);
    expect(view.container.querySelector('.cv-node-actions')).toBeNull();
    await act(async () => vi.dynamicImportSettled());
    fireEvent.click(await screen.findByRole('button', { name: '下载' }));
    await waitFor(() =>
      expect(download).toHaveBeenLastCalledWith(
        '我的分镜.csv',
        expect.stringContaining('\uFEFF镜号,时长,画面描述'),
        'text/csv;charset=utf-8;',
      ),
    );
    expect(download.mock.calls.at(-1)[1]).toContain('/coast.png');
    view.rerender(
      <CanvasNode
        {...props}
        n={{
          ...node,
          data: { ...node.data, rows: [{ ...node.data.rows[0], imagePromptState: 'stale' }] },
        }}
      />,
    );
    expect(screen.getByRole('button', { name: '下载' }).disabled).toBe(true);
    for (const [status, mode, disabled] of [
      [1, 'generate-full', true],
      ['3', 'generate-full', false],
      [1, 'recompute-batch-shots', false],
    ]) {
      view.rerender(
        <CanvasNode
          {...props}
          n={{
            ...node,
            data: { ...node.data, taskInfo: { loading: true, status, scriptV2TaskMode: mode } },
          }}
        />,
      );
      // Source hides the full-generation toolbar; terminal and recompute tasks
      // retain the download entry. Preserve the old busy gate at its new owner.
      if (disabled) expect(screen.queryByRole('button', { name: '下载' })).toBeNull();
      else expect(screen.getByRole('button', { name: '下载' }).disabled).toBe(false);
    }
  });
  it('edits the same text through either view and clears it without reviving a stale fallback', () => {
    render(<Host />);
    const inline = screen.getByPlaceholderText('双击输入文本内容');
    const prompt = screen.getByRole('textbox', { name: '提示词' });
    fireEvent.change(inline, { target: { value: '新正文' } });
    expect(prompt.value).toBe('新正文');
    fireEvent.change(prompt, { target: { value: '' } });
    expect(inline.value).toBe('');
    expect(prompt.value).toBe('');
  });
});
