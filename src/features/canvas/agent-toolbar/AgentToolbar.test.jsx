import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import RichAgentInput from '../../../components/agent/RichAgentInput.jsx';
import { chatModelPickReference } from '../../../services/agent-toolbar-models.js';
import CanvasModelPicker from './CanvasModelPicker.jsx';
import CanvasAgentModePicker from './CanvasAgentModePicker.jsx';

describe('actual source toolbar components', () => {
  it('inserts models at the actual TipTap caret and keeps session mode separate from prompt parts', async () => {
    const inputRef = createRef();
    function Harness() {
      const [parts, setParts] = useState([{ type: 'text', text: '前后' }]);
      const [dryRun, setDryRun] = useState(true);
      return (
        <>
          <RichAgentInput ref={inputRef} parts={parts} onChange={setParts} />
          <CanvasModelPicker
            onSelect={(pick) => inputRef.current.insertReference(chatModelPickReference(pick))}
          />
          <CanvasAgentModePicker dryRun={dryRun} onSelect={setDryRun} />
        </>
      );
    }
    render(<Harness />);
    await waitFor(() => expect(inputRef.current?.getEditor()).toBeTruthy());
    act(() => inputRef.current.getEditor().commands.setTextSelection(2));
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }));
    fireEvent.click(screen.getByRole('button', { name: '添加模型 Lib Image' }));
    await act(async () => {});
    const beforeMode = inputRef.current.getParts();
    fireEvent.click(screen.getByRole('button', { name: '手动生成' }));
    fireEvent.click(screen.getByRole('button', { name: /自动生成.*Agent/ }));
    expect(inputRef.current.getParts()).toEqual(beforeMode);
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }));
    fireEvent.click(screen.getByRole('button', { name: '添加模型 Seedance 2.0 VIP' }));
    await act(async () => {});
    const inserted = inputRef.current.getParts();
    expect(inserted[0].text).toBe('前{{ model:lib-image-2 }} {{ model:star-video2 }} 后');
    expect(inserted.slice(1).map((part) => part.id)).toEqual(['lib-image-2', 'star-video2']);
    fireEvent.click(screen.getAllByRole('button', { name: '移除 模型' })[0]);
    expect(
      inputRef.current
        .getParts()
        .slice(1)
        .map((part) => part.id),
    ).toEqual(['star-video2']);
    act(() => inputRef.current.getEditor().commands.undo());
    expect(
      inputRef.current
        .getParts()
        .slice(1)
        .map((part) => part.id),
    ).toEqual(['lib-image-2', 'star-video2']);
  });
  it('renders the complete original model catalogue, with tabs scrolling rather than filtering', async () => {
    const select = vi.fn();
    const refresh = vi.fn();
    render(<CanvasModelPicker onSelect={select} onRefreshBenefits={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    const menu = screen.getByRole('dialog', { name: '选择模型' });
    expect(menu.style.width).toBe('370px');
    expect(within(menu).getAllByRole('button', { name: /^添加模型/ })).toHaveLength(17);
    const scroll = menu.querySelector('.cv-agent-model-scroll');
    scroll.scrollTo = vi.fn();
    fireEvent.click(within(menu).getByRole('button', { name: '视频', exact: true }));
    await act(async () => {});
    expect(scroll.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    expect(within(menu).getByRole('button', { name: '添加模型 Lib Image' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('button', { name: '添加模型 Seedance 2.0 VIP' }));
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        modelKey: 'star-video2',
        label: 'Seedance 2.0 VIP',
        modality: 'video',
      }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }));
    fireEvent.click(screen.getByRole('button', { name: '添加模型 Lib Image' }));
    expect(select).toHaveBeenCalledTimes(2);
  });
  it('shows actual disabled reasons and benefit tooltips without inferring VIP access', () => {
    const select = vi.fn();
    render(
      <CanvasModelPicker
        models={{
          image: [{ modelKey: 'locked', modelName: '暂不可用', disable: { zh: '维护中' } }],
          video: [{ modelKey: 'vip', modelName: '会员模型', vip: true }],
        }}
        benefits={[
          {
            targetKey: 'vip',
            benefitType: 'powerZero',
            showContent: '{"libtv":{"badgeTooltip":"原始权益规则"}}',
          },
        ]}
        onSelect={select}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }));
    const disabled = screen.getByRole('button', { name: '添加模型 暂不可用' });
    expect(disabled.disabled).toBe(true);
    fireEvent.click(disabled);
    expect(select).not.toHaveBeenCalled();
    fireEvent.mouseEnter(disabled.parentElement);
    expect(screen.getByRole('tooltip').textContent).toBe('维护中');
    fireEvent.mouseLeave(disabled.parentElement);
    const benefit = screen.getByText('免积分');
    fireEvent.mouseEnter(benefit.parentElement);
    expect(screen.getByRole('tooltip').textContent).toBe('原始权益规则');
    expect(screen.getByRole('button', { name: '添加模型 会员模型' }).disabled).toBe(false);
  });
  it('switches a controlled session mode independently of model insertions', () => {
    const selected = vi.fn();
    function Harness() {
      const [dryRun, setDryRun] = useState(true);
      return (
        <CanvasAgentModePicker
          dryRun={dryRun}
          agentName="TV Director"
          onSelect={(value) => {
            selected(value);
            setDryRun(value);
          }}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '手动生成' }));
    expect(screen.getByText('TV Director 每次生成前询问')).toBeTruthy();
    expect(screen.getByText('TV Director 可直接消耗积分')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /自动生成.*TV Director/ }));
    expect(selected).toHaveBeenCalledWith(false);
    const trigger = screen.getByRole('button', { name: '自动生成' });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(
      screen.getByRole('button', { name: /自动生成.*TV Director/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
  it('guards a pending user-default write and supports an empty allowlist state', () => {
    const selected = vi.fn();
    const { unmount } = render(
      <CanvasAgentModePicker scope="userDefault" saving onSelect={selected} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '手动生成' }));
    const auto = screen.getByRole('button', { name: /自动生成.*Agent/ });
    expect(auto.disabled).toBe(true);
    fireEvent.click(auto);
    expect(selected).not.toHaveBeenCalled();
    unmount();
    render(<CanvasModelPicker allowlist={[]} />);
    fireEvent.click(screen.getByRole('button', { name: '选择模型' }));
    expect(screen.getByText('暂无模型')).toBeTruthy();
  });
});
