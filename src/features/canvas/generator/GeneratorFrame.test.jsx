import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRef, useState } from 'react';
import models from '../../../../public/data/models.json';
import CanvasNodeInlineGenerator from './CanvasNodeInlineGenerator.jsx';
import { generatorExpandedSize, resizeExpandedGenerator } from './expanded-geometry.js';
import GeneratorFrame from './GeneratorFrame.jsx';

function inputPrompt(value) {
  const editor = screen.getByRole('textbox', { name: '提示词' });
  editor.focus();
  editor.textContent = value;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  fireEvent.input(editor, { inputType: 'insertText' });
}
afterEach(() => vi.useRealTimers());
describe('expanded generator lifecycle', () => {
  it('keeps the mounted input intact when its owner rejects the transition save', () => {
    const reject = vi.fn(() => false);
    render(
      <GeneratorFrame label="待保存" ready onBeforeTransition={reject}>
        {() => <input aria-label="待保存输入" defaultValue="未提交剧情" />}
      </GeneratorFrame>,
    );
    const input = screen.getByRole('textbox', { name: '待保存输入' });
    fireEvent.change(input, { target: { value: '最后的失败草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '展开生成器' }));
    expect(reject).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('textbox', { name: '待保存输入' })).toBe(input);
    expect(input.value).toBe('最后的失败草稿');
  });
  it('returns to the remounted expand trigger after Escape without stealing an external focus', () => {
    const props = {
      label: '测试',
      ready: true,
      readonly: false,
      children: () => <button>内部按钮</button>,
    };
    render(
      <>
        <button>外部按钮</button>
        <GeneratorFrame {...props} />
      </>,
    );
    screen.getByRole('button', { name: '展开生成器' }).focus();
    fireEvent.click(screen.getByRole('button', { name: '展开生成器' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '展开生成器' }));
    fireEvent.click(screen.getByRole('button', { name: '展开生成器' }));
    fireEvent.click(screen.getByRole('button', { name: '收起生成器' }));
    const external = screen.getByRole('button', { name: '外部按钮' });
    external.focus();
    expect(document.activeElement).toBe(external);
  });
  it('uses centre resize on all directions, source limits and valid persisted dimensions', () => {
    expect(generatorExpandedSize({ width: NaN, height: -1 })).toEqual({ width: 800, height: 600 });
    const start = { x: 100, y: 100, width: 800, height: 600, maxWidth: 1152, maxHeight: 648 };
    expect(resizeExpandedGenerator({ ...start, direction: 'nw' }, { x: 120, y: 110 })).toEqual({
      width: 760,
      height: 580,
    });
    expect(resizeExpandedGenerator({ ...start, direction: 'se' }, { x: 1000, y: 1000 })).toEqual({
      width: 1152,
      height: 648,
    });
    expect(
      resizeExpandedGenerator({ ...start, direction: 'w', maxWidth: 351 }, { x: 200, y: 100 }),
    ).toEqual({ width: 351, height: 600 });
  });
  it('persists only the matching pointer completion and cancels writes after losing readiness', () => {
    const save = vi.fn();
    const props = {
      label: '生成器',
      ready: true,
      readonly: false,
      onExpandedSizeChange: save,
      children: () => <button>内容</button>,
    };
    const page = render(<GeneratorFrame {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '展开生成器' }));
    const handle = page.baseElement.querySelector('[data-resize-direction="se"]');
    const pointer = (type, x, y, id = 1) => {
      const event = createEvent[type](handle);
      Object.defineProperties(event, {
        clientX: { value: x },
        clientY: { value: y },
        pointerId: { value: id },
      });
      fireEvent(handle, event);
    };
    pointer('pointerDown', 100, 100);
    pointer('pointerMove', 120, 110);
    pointer('pointerUp', 120, 110, 2);
    expect(save).not.toHaveBeenCalled();
    pointer('pointerUp', 120, 110);
    expect(save).toHaveBeenCalledExactlyOnceWith({ width: 840, height: 620 });
    pointer('pointerDown', 100, 100);
    pointer('pointerMove', 140, 130);
    page.rerender(<GeneratorFrame {...props} ready={false} />);
    pointer('pointerUp', 140, 130);
    expect(save).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('flushes a real controlled pending prompt through portal remounts, retains the model menu inside the dialog, and closes with Escape', () => {
    vi.useFakeTimers();
    let latest;
    function Harness() {
      const [node, setNode] = useState({
        id: 'target',
        type: 'image',
        position: { x: 0, y: 0 },
        data: { name: '图片', params: { model: models.default.image, prompt: '' } },
      });
      const graph = useRef(null);
      graph.current = { nodes: [node], documentKey: 'doc', ready: true };
      latest = graph.current;
      return (
        <CanvasNodeInlineGenerator
          node={node}
          nodes={graph.current.nodes}
          edges={[]}
          models={models}
          ready
          readonly={false}
          update={(id, patch) =>
            setNode((current) => ({ ...current, data: { ...current.data, ...patch } }))
          }
          position={node.position}
          zoom={1}
          documentKey="doc"
          getDocument={() => graph.current}
        />
      );
    }
    render(<Harness />);
    inputPrompt('150ms 最后输入');
    fireEvent.click(screen.getByRole('button', { name: '展开生成器' }));
    expect(screen.getByRole('textbox', { name: '提示词' }).textContent).toBe('150ms 最后输入');
    expect(latest.nodes[0].data.params.prompt).toBe('150ms 最后输入');
    const dialog = screen.getByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /模型/ }));
    expect(dialog.contains(screen.getByRole('listbox'))).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    inputPrompt('展开后输入');
    fireEvent.click(screen.getByRole('button', { name: '收起生成器' }));
    expect(screen.getByRole('textbox', { name: '提示词' }).textContent).toBe('展开后输入');
    act(() => vi.advanceTimersByTime(200));
    expect(latest.nodes[0].data.params.prompt).toBe('展开后输入');
  });
});
