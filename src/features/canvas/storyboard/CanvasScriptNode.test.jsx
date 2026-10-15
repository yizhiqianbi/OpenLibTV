import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import imageSupport from '../../../../public/data/image-model-support.json';
import { createCanvasNode } from '../model.js';
import CanvasScriptNode from './CanvasScriptNode.jsx';
import { createCanvasScriptNode } from './script-model.js';

describe('actual script node entry', () => {
  it('composes through the actual single-shot entry, keeps cancelled prompts and restores their previous states on undo', async () => {
    let current;
    const original = {
      id: 'row',
      hiddenUuid: 'stable',
      shotNumber: 1,
      plotDescription: '晨光中的海岸',
      durationSeconds: 5,
      imageGenerationPrompt: '原图片提示词',
      videoMotionPrompt: '原视频提示词',
      imagePromptState: 'stale',
      videoPromptState: 'synced',
    };
    function Harness() {
      const [node, setNode] = useState(() => ({
        ...createCanvasScriptNode({ id: 'script' }),
        data: { ...createCanvasScriptNode().data, rows: [original] },
      }));
      current = node;
      return (
        <CanvasScriptNode
          node={node}
          nodes={[node]}
          documentKey="doc"
          getDocument={() => ({
            documentKey: 'doc',
            ready: true,
            readonly: false,
            nodes: [current],
          })}
          onChange={(patch, context) => {
            if (context.expectedNode !== current || context.nodeId !== 'script') return false;
            current = { ...current, data: { ...current.data, ...patch } };
            setNode(current);
            return true;
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    fireEvent.click(screen.getByRole('button', { name: '提示词 1' }));
    const prompt = screen.getByRole('dialog', { name: '镜头1最终提示词' });
    await act(async () => fireEvent.click(within(prompt).getByRole('radio', { name: '自动拼接' })));
    expect(current.data.singlePromptComposeMode).toBe('concat');
    await act(async () =>
      fireEvent.click(within(prompt).getByRole('button', { name: '重新合成提示词' })),
    );
    const confirmation = screen.getByRole('dialog', { name: '替换已有提示词内容？' });
    await act(async () =>
      fireEvent.click(within(confirmation).getByRole('button', { name: '取消' })),
    );
    expect(current.data.rows[0]).toEqual(original);
    expect(screen.getByRole('dialog', { name: '镜头1最终提示词' })).toBeTruthy();
    await act(async () =>
      fireEvent.click(within(prompt).getByRole('button', { name: '重新合成提示词' })),
    );
    await act(async () =>
      fireEvent.click(
        within(screen.getByRole('dialog', { name: '替换已有提示词内容？' })).getByRole('button', {
          name: '确认',
        }),
      ),
    );
    expect(current.data.rows[0]).toMatchObject({
      imagePromptState: 'synced',
      videoPromptState: 'synced',
      hiddenUuid: 'stable',
    });
    expect(current.data.rows[0].imageGenerationPrompt).toContain('晨光中的海岸');
    expect(current.data.rows[0].videoMotionPrompt).toContain('晨光中的海岸');
    await act(async () => fireEvent.click(within(prompt).getByRole('button', { name: '撤销' })));
    expect(current.data.rows[0]).toMatchObject(original);
  });
  it('opens batch composition with only missing prompts selected and saves through guarded patches without requiring login', async () => {
    let current;
    function Harness() {
      const [node, setNode] = useState(() => ({
        ...createCanvasScriptNode({ id: 'script' }),
        data: {
          ...createCanvasScriptNode().data,
          rows: [
            {
              id: 'complete',
              hiddenUuid: 'first',
              shotNumber: 1,
              plotDescription: '完整',
              imageGenerationPrompt: '保留图片',
              videoMotionPrompt: '保留视频',
            },
            { id: 'missing', hiddenUuid: 'second', shotNumber: 2, plotDescription: '山间晨雾' },
          ],
        },
      }));
      current = node;
      return (
        <CanvasScriptNode
          node={node}
          nodes={[node]}
          documentKey="doc"
          getDocument={() => ({
            documentKey: 'doc',
            ready: true,
            readonly: false,
            nodes: [current],
          })}
          onChange={(patch, context) => {
            if (context.expectedNode !== current || context.documentKey !== 'doc') return false;
            current = { ...current, data: { ...current.data, ...patch } };
            setNode(current);
            return true;
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: /合成提示词/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: '一键合成全部提示词' }));
    const batch = screen.getByRole('dialog', { name: '合成最终提示词' });
    expect(within(batch).getByRole('checkbox', { name: '选择镜头 1' }).checked).toBe(false);
    expect(within(batch).getByRole('checkbox', { name: '选择镜头 2' }).checked).toBe(true);
    await act(async () => fireEvent.click(within(batch).getByRole('radio', { name: '自动拼接' })));
    await act(async () => fireEvent.click(within(batch).getByRole('button', { name: '确认合成' })));
    expect(current.data).toMatchObject({
      batchPromptComposeMode: 'concat',
      singlePromptComposeMode: 'concat',
    });
    expect(current.data.rows[0]).toMatchObject({
      imageGenerationPrompt: '保留图片',
      videoMotionPrompt: '保留视频',
    });
    expect(current.data.rows[1].imageGenerationPrompt).toContain('山间晨雾');
    expect(current.data.rows[1].videoMotionPrompt).toContain('山间晨雾');
    expect(screen.queryByRole('dialog', { name: '合成最终提示词' })).toBeNull();
  });
  it('keeps stage navigation local and permits reviewing incomplete stages without changing asset recognition', async () => {
    const node = {
      ...createCanvasScriptNode({ id: 'script' }),
      data: {
        ...createCanvasScriptNode({ id: 'script' }).data,
        viewMode: 'asset',
        activeViewId: 'asset',
        rows: [{ id: 'row', hiddenUuid: 'stable', shotNumber: 1, plotDescription: '' }],
        views: [
          {
            id: 'asset',
            type: 'asset',
            tableConfig: { columnVisibility: { plotDescription: false } },
          },
          {
            id: 'table-custom',
            type: 'table',
            tableConfig: { columnVisibility: { audioEffects: false } },
          },
        ],
      },
    };
    const onChange = vi.fn();
    const props = { node, nodes: [node], documentKey: 'doc', onChange };
    const page = render(<CanvasScriptNode {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    const navigation = within(screen.getByRole('navigation'));
    expect(navigation.getByRole('button', { name: /确认镜头/ }).getAttribute('aria-current')).toBe(
      'step',
    );
    expect(screen.getByRole('columnheader', { name: '画面描述' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: '音效' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '→ 下一步：准备资产' }));
    expect(navigation.getByRole('button', { name: /准备资产/ }).getAttribute('aria-current')).toBe(
      'step',
    );
    fireEvent.click(navigation.getByRole('button', { name: /合成提示词/ }));
    expect(
      navigation.getByRole('button', { name: /合成提示词/ }).getAttribute('aria-current'),
    ).toBe('step');
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '关闭分镜脚本' })));
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    expect(
      within(screen.getByRole('navigation'))
        .getByRole('button', { name: /合成提示词/ })
        .getAttribute('aria-current'),
    ).toBe('step');
    page.rerender(<CanvasScriptNode {...props} documentKey="other" readonly />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: '打开脚本节点 →' })).toBeNull();
    fireEvent.doubleClick(screen.getByTestId('scriptv2-resource-card-surface'));
    expect(screen.queryByRole('dialog')).toBeNull();
    page.rerender(<CanvasScriptNode {...props} documentKey="other" />);
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    expect(
      within(screen.getByRole('navigation'))
        .getByRole('button', { name: /确认镜头/ })
        .getAttribute('aria-current'),
    ).toBe('step');
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: /准备资产/ }),
    );
    page.rerender(<CanvasScriptNode {...props} documentKey="other" readonly />);
    expect(screen.getByRole('button', { name: '新增角色' }).disabled).toBe(true);
  });
  it('creates a structured V2 node, writes a stable blank shot and opens its nine-column editor', async () => {
    let latest;
    function Harness() {
      const [node, setNode] = useState(() =>
        createCanvasNode({
          type: 'script-v2',
          nodes: [],
          label: '脚本',
          position: { x: 0, y: 0 },
          models,
          makeId: () => 'script',
        }),
      );
      latest = node;
      return (
        <CanvasScriptNode
          node={node}
          nodes={[node]}
          models={models}
          documentKey="doc"
          onChange={(patch) => {
            setNode((current) => ({ ...current, data: { ...current.data, ...patch } }));
            return true;
          }}
        />
      );
    }
    render(<Harness />);
    expect(latest).toMatchObject({
      type: 'script-v2',
      width: 350,
      height: 350,
      data: { action: 'script_generate', rows: [], views: [{ type: 'table' }, { type: 'asset' }] },
    });
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: '自己编写分镜脚本' })),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('columnheader')).toHaveLength(11);
    expect(latest.data.rows[0].hiddenUuid).toBeTruthy();
    const hidden = latest.data.rows[0].hiddenUuid;
    fireEvent.change(within(dialog).getByRole('textbox', { name: '画面描述 1' }), {
      target: { value: '镜头向海岸推进' },
    });
    await act(async () =>
      fireEvent.blur(within(dialog).getByRole('textbox', { name: '画面描述 1' })),
    );
    expect(latest.data.rows[0]).toMatchObject({
      plotDescription: '镜头向海岸推进',
      hiddenUuid: hidden,
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '对白 / 旁白 1' }));
    const dialogue = screen.getByRole('dialog', { name: '镜头 1 对白 / 旁白' });
    fireEvent.click(within(dialogue).getByRole('button', { name: '添加对白 / 旁白' }));
    fireEvent.change(within(dialogue).getByLabelText('内容 1'), { target: { value: '出发吧' } });
    await act(async () => fireEvent.click(within(dialogue).getByRole('button', { name: '保存' })));
    expect(latest.data.rows[0].dialogueLines[0].text).toBe('出发吧');
    fireEvent.click(within(dialog).getByRole('button', { name: '→ 下一步：准备资产' }));
    expect(within(dialog).getByRole('navigation', { name: '分镜脚本阶段' })).toBeTruthy();
    expect(within(dialog).queryByRole('table')).toBeNull();
    fireEvent.click(
      within(within(dialog).getByRole('navigation')).getByRole('button', { name: /合成提示词/ }),
    );
    expect(within(dialog).getByRole('columnheader', { name: '提示词' }).className).toContain(
      'cv-script-prompt-emphasis',
    );
    expect(within(dialog).getByRole('button', { name: '生成分镜图' }).disabled).toBe(true);
  });
  it('preserves a failed graph plan configuration and blocks old document submission', async () => {
    const row = {
      id: 'row',
      hiddenUuid: 'stable',
      shotNumber: 1,
      plotDescription: '海岸',
      durationSeconds: 5,
      imageGenerationPrompt: '海岸晨光',
      videoMotionPrompt: '镜头推进',
    };
    const node = {
      ...createCanvasScriptNode({ id: 'script' }),
      data: {
        ...createCanvasScriptNode().data,
        rows: [row],
        assets: {
          characters: [],
          scenes: [{ id: 'coast', name: '海岸', thumbnailUrl: '/coast.png' }],
          props: [],
        },
      },
    };
    const apply = vi.fn(() => false);
    let graph = {
      documentKey: 'doc',
      ready: true,
      readonly: false,
      nodes: [node],
      edges: [],
      models,
    };
    const imageConfiguration = {
      modelContent: { data: models },
      supportContent: { data: imageSupport },
      commitGraph: apply,
      flushGraph: vi.fn(() => true),
    };
    const getDocument = () => graph;
    const page = render(
      <CanvasScriptNode
        node={node}
        nodes={[node]}
        models={models}
        documentKey="doc"
        onChange={() => true}
        onApplyGraphPlan={apply}
        imageConfiguration={imageConfiguration}
        getDocument={getDocument}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开脚本节点 →' }));
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: /合成提示词/ }),
    );
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '生成分镜图' })));
    const configuration = screen.getByRole('dialog', { name: '分镜批量生图' });
    await act(async () =>
      fireEvent.click(
        within(configuration).getByRole('button', { name: '确认并创建生成器组 (1)' }),
      ),
    );
    expect(within(configuration).getByRole('alert').textContent).toBe(
      '画布已经变化，请重试创建分镜图组',
    );
    expect(apply.mock.calls[0][0]).toMatchObject({
      nodes: [
        { id: 'script' },
        { type: 'group' },
        { type: 'image', data: { scriptRowHiddenUuid: 'stable', url: [] } },
      ],
    });
    expect(imageConfiguration.flushGraph).not.toHaveBeenCalled();
    const busy = {
      ...node,
      data: {
        ...node.data,
        scriptV2TaskMode: 'generate-full',
        taskInfo: { loading: true, status: 1 },
      },
    };
    graph = { ...graph, nodes: [busy] };
    page.rerender(
      <CanvasScriptNode
        node={busy}
        nodes={[busy]}
        models={models}
        documentKey="doc"
        onChange={() => true}
        onApplyGraphPlan={apply}
        imageConfiguration={imageConfiguration}
        getDocument={getDocument}
      />,
    );
    expect(screen.queryByRole('dialog', { name: '分镜批量生图' })).toBeNull();
    expect(screen.getByRole('button', { name: '生成分镜图' }).disabled).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
