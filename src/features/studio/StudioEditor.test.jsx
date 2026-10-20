import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import StudioEditor from './StudioEditor.jsx';
import { createStudioObject, createStudioKeyframe } from './model.js';
import { persistStudioDocument, readStudioDocument } from './persistence.js';

const { capture, exportVideo } = vi.hoisted(() => ({
  capture: vi.fn(() => 'data:image/png;base64,c3R1ZGlv'),
  exportVideo: vi.fn(async () => ({ blob: new Blob(['webm'], { type: 'video/webm' }) })),
}));

vi.mock('./StudioViewport.jsx', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    default: forwardRef(function StudioViewport(
      { objects, frames, time, animationSelection, cameraPaths, cameraTimeline, viewMode },
      ref,
    ) {
      useImperativeHandle(ref, () => ({
        capture,
        exportVideo,
        cameraRigContext: () => ({ origin: [0, 2, 10], focus: [0, 1, 0] }),
        worldToCameraPath: (_id, position) => position,
      }));
      return (
        <>
          <output data-testid="studio-scene">{JSON.stringify({ objects, frames })}</output>
          <output data-testid="studio-playback">
            {JSON.stringify({ time, animationSelection })}
          </output>
          <output data-testid="studio-camera-state">
            {JSON.stringify({ cameraPaths, cameraTimeline, viewMode })}
          </output>
        </>
      );
    }),
  };
});

it('connects real clip rows to playback, pause, dragging, whole-clip toggle and local paused restoration', async () => {
  const user = userEvent.setup();
  const object = {
    id: 'animated',
    type: 'glb',
    name: '仅测试动画.glb',
    dataUrl: 'fixture',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    clips: [
      { index: 0, name: 'Slide', duration: 2 },
      { index: 1, name: 'Grow', duration: 4 },
    ],
  };
  const scene = {
    id: 'quota-scene',
    title: '仅测试动画场景',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
    time: 1,
    animationSelection: { objectId: object.id, index: 1 },
  };
  persistStudioDocument(scene);
  let frame;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const { container, unmount } = render(
    <StudioEditor path="/animation-preview" user={{ id: 'local-test-user' }} />,
  );
  const playback = () => JSON.parse(screen.getByTestId('studio-playback').textContent);
  expect(playback()).toEqual({ time: 1, animationSelection: scene.animationSelection });
  const timeline = screen.getByRole('region', { name: '动画时间轴' });
  expect(within(timeline).queryByRole('button', { name: '播放片段 Slide' })).toBeNull();
  expect(within(timeline).getByRole('button', { name: '播放' })).toBeTruthy();
  const speed = within(timeline).getByRole('combobox', { name: '播放速度' });
  expect(Array.from(speed.options, (option) => Number(option.value))).toEqual([
    0.25, 0.5, 0.75, 1, 1.25, 1.5, 2,
  ]);
  const zoom = within(timeline).getByRole('slider', { name: '时间轴缩放' });
  expect(zoom.value).toBe('1');
  fireEvent.change(zoom, { target: { value: '2' } });
  expect(zoom.value).toBe('2');
  expect(container.querySelector('.cv-studio-tracks').style.width).toBe('200%');
  const progress = within(timeline).getByRole('slider', { name: '时间轴进度' });
  progress.focus();
  await user.keyboard('{Home}');
  expect(playback().time).toBe(0);
  await user.keyboard('{ArrowRight}');
  expect(playback().time).toBe(0.1);
  await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
  expect(playback().time).toBe(1.1);
  await user.keyboard(' ');
  expect(within(timeline).getByRole('button', { name: '暂停' })).toBeTruthy();
  await user.keyboard(' ');
  expect(within(timeline).getByRole('button', { name: '播放' })).toBeTruthy();
  await user.selectOptions(speed, '0.75');
  expect(speed.value).toBe('0.75');
  await user.click(within(timeline).getByRole('button', { name: '播放片段 Grow' }));
  expect(playback()).toEqual({ time: 0, animationSelection: null });
  expect(within(timeline).getByRole('button', { name: '暂停' })).toBeTruthy();
  act(() => frame(1000));
  expect(playback().time).toBe(0.75);
  await user.click(within(timeline).getByRole('button', { name: '暂停' }));
  expect(within(timeline).getByRole('button', { name: '播放' })).toBeTruthy();
  await user.selectOptions(speed, '1');
  await user.click(within(timeline).getByRole('button', { name: '播放片段 Slide' }));
  expect(playback()).toEqual({ time: 0, animationSelection: { objectId: object.id, index: 0 } });
  const track = container.querySelector('.cv-studio-tracks');
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 });
  track.setPointerCapture = vi.fn();
  track.hasPointerCapture = vi.fn(() => true);
  fireEvent.pointerDown(track, { clientX: 75, pointerId: 1 });
  expect(playback().time).toBe(1.5);
  fireEvent.pointerMove(track, { clientX: 25, pointerId: 1 });
  expect(playback().time).toBe(0.5);
  expect(within(timeline).getByRole('button', { name: '播放' })).toBeTruthy();
  unmount();
  expect(readStudioDocument(scene.id)).toMatchObject({
    time: 0.5,
    animationSelection: { objectId: object.id, index: 0 },
  });
  render(<StudioEditor path="/animation-preview" user={{ id: 'local-test-user' }} />);
  expect(playback()).toEqual({ time: 0.5, animationSelection: { objectId: object.id, index: 0 } });
  expect(
    screen.getByRole('region', { name: '动画时间轴' }).querySelector('button.play').title,
  ).toBe('播放');
  screen.getByRole('button', { name: '播放片段 Slide' }).focus();
  await user.keyboard(' ');
  expect(playback().animationSelection).toBeNull();
  expect(
    within(screen.getByRole('region', { name: '动画时间轴' })).getByRole('button', {
      name: '暂停',
    }),
  ).toBeTruthy();
});

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/animation-preview?projectId=quota-scene');
});

it('creates source-shaped light types directly from the add menu', async () => {
  const user = userEvent.setup();
  const scene = {
    id: 'light-menu-scene',
    title: '灯光菜单场景',
    objects: [],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  render(
    <StudioEditor
      path="/animation-preview?projectId=light-menu-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  await user.click(screen.getByTitle('添加元素'));
  const menu = screen.getByRole('menu', { name: '添加元素' });
  expect(within(menu).getByRole('button', { name: /平行光/ })).toBeTruthy();
  expect(within(menu).getByRole('button', { name: /点光/ })).toBeTruthy();
  expect(within(menu).getByRole('button', { name: /聚光/ })).toBeTruthy();
  await user.click(within(menu).getByRole('button', { name: /聚光/ }));
  const state = JSON.parse(screen.getByTestId('studio-scene').textContent);
  expect(state.objects).toHaveLength(1);
  expect(state.objects[0]).toMatchObject({ type: 'light', lightType: 'spot' });
});

it('keeps the scene and export dialog when transferring to Canvas exceeds storage quota, then allows retry', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  const toast = vi.fn();
  const object = createStudioObject('cube', '立方体', []);
  const frame = createStudioKeyframe(object, 2, { position: [3, 1, 0] });
  const scene = {
    id: 'quota-scene',
    title: '保留中的场景',
    objects: [object],
    frames: [frame],
    duration: 10,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  render(
    <StudioEditor
      path="/animation-preview"
      user={{ id: 'local-test-user' }}
      navigate={navigate}
      toast={toast}
    />,
  );
  const sceneState = JSON.stringify({ objects: scene.objects, frames: scene.frames });
  expect(screen.getByTestId('studio-scene').textContent).toBe(sceneState);
  await user.click(screen.getByRole('button', { name: '导出', exact: true }));
  const dialog = screen.getByRole('dialog', { name: '导出' });
  const setItem = Storage.prototype.setItem;
  const failedWrite = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(function (key, value) {
      if (key.startsWith('libtv.canvas.')) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return setItem.call(this, key, value);
    });

  await user.click(within(dialog).getByRole('button', { name: '去画布生成' }));

  expect(capture).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith('保存画布失败，请检查浏览器存储空间后重试。');
  expect(screen.getByRole('dialog', { name: '导出' })).toBe(dialog);
  expect(screen.getByTestId('studio-scene').textContent).toBe(sceneState);
  expect(readStudioDocument(scene.id)).toMatchObject(scene);
  expect(Object.keys(localStorage).some((key) => key.startsWith('libtv.canvas.'))).toBe(false);

  failedWrite.mockRestore();
  await user.click(within(dialog).getByRole('button', { name: '去画布生成' }));

  expect(navigate).toHaveBeenCalledOnce();
  const destination = navigate.mock.calls[0][0];
  expect(destination).toMatch(/^\/canvas\?projectId=/);
  const projectId = new URL(destination, window.location.origin).searchParams.get('projectId');
  const savedCanvas = JSON.parse(localStorage.getItem(`libtv.canvas.${projectId}`));
  expect(savedCanvas).toMatchObject({ title: scene.title, edges: [] });
  expect(savedCanvas.nodes[0].data.url).toEqual(['data:image/png;base64,c3R1ZGlv']);
  expect(screen.getByTestId('studio-scene').textContent).toBe(sceneState);
});

it('enables animated WebM export and reports completion from the viewport command', async () => {
  const user = userEvent.setup();
  const object = createStudioObject('cube', '动画方块', []);
  const frame = createStudioKeyframe(object, 1, { position: [1, 0, 0] });
  persistStudioDocument({
    id: 'video-export-scene',
    title: '视频导出场景',
    objects: [object],
    frames: [frame],
    duration: 2,
    ratio: '16:9',
  });
  render(
    <StudioEditor
      path="/animation-preview?projectId=video-export-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  await user.click(screen.getByRole('button', { name: '导出', exact: true }));
  const dialog = screen.getByRole('dialog', { name: '导出' });
  await user.click(within(dialog).getByRole('button', { name: '视频' }));
  expect(within(dialog).getByText('将按当前画幅和时间轴导出 WebM 视频。')).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: '下载' }));
  await waitFor(() => expect(exportVideo).toHaveBeenCalledOnce());
});

it('edits an existing local transform keyframe only at its timeline time', async () => {
  const user = userEvent.setup();
  const object = createStudioObject('cube', '关键帧方块', []);
  object.id = 'keyframe-object';
  const frame = createStudioKeyframe(object, 2, { position: [1, 2, 3] }, () => 'frame-one');
  const scene = {
    id: 'keyframe-edit-scene',
    title: '关键帧编辑场景',
    objects: [object],
    frames: [frame],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  render(
    <StudioEditor
      path="/animation-preview?projectId=keyframe-edit-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  const row = screen
    .getAllByRole('treeitem')
    .find((element) => element.dataset.outlinerId === object.id);
  await user.click(row);
  const timeline = screen.getByRole('region', { name: '动画时间轴' });
  await user.click(within(timeline).getByTitle('关键帧 2 秒（右键删除）'));
  const position = screen.getByRole('spinbutton', { name: '位置 X' });
  expect(position.disabled).toBe(false);
  fireEvent.change(position, { target: { value: '5' } });
  expect(JSON.parse(screen.getByTestId('studio-scene').textContent).frames[0].position).toEqual([
    5, 2, 3,
  ]);
  const progress = within(timeline).getByRole('slider', { name: '时间轴进度' });
  progress.focus();
  await user.keyboard('{Home}');
  expect(screen.getByRole('spinbutton', { name: '位置 X' }).disabled).toBe(true);
});

it('connects real subtree selection to static properties, history and paused reload while retaining quota-failed edits', async () => {
  const user = userEvent.setup(),
    toast = vi.fn();
  const object = {
    id: 'nested-model',
    name: 'NestedModel',
    type: 'glb',
    dataUrl: 'fixture',
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    subtree: [
      {
        path: [0],
        name: 'Branch',
        type: 'group',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
      {
        path: [0, 0],
        name: 'Leaf',
        type: 'mesh',
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
      {
        path: [1],
        name: 'Animated',
        type: 'mesh',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
        animatedProperties: ['position'],
      },
    ],
  };
  const scene = {
    id: 'tree-scene',
    title: '子树测试夹具',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  const path = '/animation-preview?projectId=tree-scene';
  // Fail writes before editing: real userEvent work may outlast the 500ms autosave.
  const setItem = Storage.prototype.setItem;
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === 'libtv.studio.tree-scene') throw new DOMException('quota', 'QuotaExceededError');
    return setItem.call(this, key, value);
  });
  const props = { path, user: { id: 'local-test-user' }, toast };
  const page = render(<StudioEditor {...props} />);
  const row = (id) =>
    screen.getAllByRole('treeitem').find((element) => element.dataset.outlinerId === id);
  await user.click(row('nested-model:node:0.0'));
  const name = screen.getByRole('textbox', { name: '名称' });
  await user.clear(name);
  await user.type(name, 'Edited Leaf');
  const position = screen.getByRole('spinbutton', { name: '位置 X' });
  await user.click(position);
  fireEvent.change(position, { target: { value: '7' } });
  await user.click(screen.getByRole('button', { name: '隐藏 Edited Leaf' }));
  const state = () => JSON.parse(screen.getByTestId('studio-scene').textContent).objects[0];
  expect(state().nodeEdits).toEqual({
    '0.0': { name: 'Edited Leaf', position: [7, 0, 0], visible: false },
  });
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(state().nodeEdits['0.0'].visible).toBeUndefined();
  await user.click(screen.getByRole('button', { name: '重做 ⇧⌘Z' }));
  expect(state().nodeEdits['0.0'].visible).toBe(false);
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(toast).toHaveBeenCalledWith('保存失败，请检查浏览器存储空间，或导出 GLB 备份。');
  expect(readStudioDocument(scene.id).objects[0].nodeEdits).toBeUndefined();
  expect(state().nodeEdits['0.0'].position).toEqual([7, 0, 0]);
  await user.click(row('nested-model:node:1'));
  expect(screen.getByRole('spinbutton', { name: '位置 X' }).disabled).toBe(true);
  expect(screen.getByRole('spinbutton', { name: '旋转 X' }).disabled).toBe(false);
  failure.mockRestore();
  act(() => window.dispatchEvent(new Event('pagehide')));
  page.unmount();
  render(<StudioEditor {...props} />);
  await user.click(row('nested-model:node:0.0'));
  expect(screen.getByRole('textbox', { name: '名称' }).value).toBe('Edited Leaf');
  expect(screen.getByRole('spinbutton', { name: '位置 X' }).value).toBe('7');
  expect(row('nested-model:node:0.0').dataset.hidden).toBe('true');
  expect(screen.getByRole('button', { name: '播放' })).toBeTruthy();
});

it('duplicates an imported subtree through the inspector and restores it with undo', async () => {
  const user = userEvent.setup();
  const object = {
    id: 'copy-model',
    name: 'CopyModel',
    type: 'glb',
    dataUrl: 'fixture',
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    subtree: [
      {
        path: [0],
        name: 'Branch',
        type: 'group',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
      {
        path: [0, 0],
        name: 'Leaf',
        type: 'mesh',
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
    ],
  };
  const scene = {
    id: 'copy-subtree-scene',
    title: '子树副本场景',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  render(
    <StudioEditor
      path="/animation-preview?projectId=copy-subtree-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  const branch = screen
    .getAllByRole('treeitem')
    .find((element) => element.dataset.outlinerId === 'copy-model:node:0');
  await user.click(branch);
  await user.click(screen.getByRole('button', { name: '创建副本 Branch' }));
  const state = () => JSON.parse(screen.getByTestId('studio-scene').textContent).objects[0];
  expect(state().nodeCopies).toHaveLength(1);
  expect(screen.getByRole('treeitem', { name: /Branch 副本/ })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(state().nodeCopies || []).toHaveLength(0);
});

it('deletes an imported subtree with one reversible tombstone and restores it after reload', async () => {
  const user = userEvent.setup();
  const object = {
    id: 'delete-model',
    name: 'DeleteModel',
    type: 'glb',
    dataUrl: 'fixture',
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    subtree: [
      {
        path: [0],
        name: 'Branch',
        type: 'group',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
      {
        path: [0, 0],
        name: 'Leaf',
        type: 'mesh',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
      {
        path: [1],
        name: 'Other',
        type: 'mesh',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
    ],
  };
  const scene = {
    id: 'delete-scene',
    title: '删除子树场景',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  const props = {
    path: '/animation-preview?projectId=delete-scene',
    user: { id: 'local-test-user' },
  };
  const row = (id) =>
    screen.getAllByRole('treeitem').find((element) => element.dataset.outlinerId === id);
  const page = render(<StudioEditor {...props} />);
  await user.click(row('delete-model:node:0'));
  await user.click(screen.getByTitle('删除子节点'));
  const state = () => JSON.parse(screen.getByTestId('studio-scene').textContent).objects[0];
  expect(state().nodeEdits).toEqual({ 0: { deleted: true } });
  expect(row('delete-model:node:0')).toBeUndefined();
  expect(row('delete-model:node:0.0')).toBeUndefined();
  expect(row('delete-model:node:1')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(row('delete-model:node:0.0')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '重做 ⇧⌘Z' }));
  expect(row('delete-model:node:0')).toBeUndefined();
  expect(state().nodeEdits).toEqual({ 0: { deleted: true } });
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(readStudioDocument(scene.id).objects[0].nodeEdits).toEqual({ 0: { deleted: true } });
  page.unmount();
  render(<StudioEditor {...props} />);
  expect(row('delete-model:node:0')).toBeUndefined();
  expect(row('delete-model:node:1')).toBeTruthy();
});

it('edits an imported mesh material color with one undo boundary and local restoration', async () => {
  const user = userEvent.setup();
  const object = {
    id: 'material-model',
    name: 'MaterialModel',
    type: 'glb',
    dataUrl: 'fixture',
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    subtree: [
      {
        path: [0],
        name: 'MaterialMesh',
        type: 'mesh',
        color: '#123456',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        visible: true,
      },
    ],
  };
  const scene = {
    id: 'material-scene',
    title: '材质颜色场景',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  const page = render(
    <StudioEditor
      path="/animation-preview?projectId=material-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  const row = screen
    .getAllByRole('treeitem')
    .find((element) => element.dataset.outlinerId === 'material-model:node:0');
  await user.click(row);
  const color = screen.getByLabelText('颜色');
  expect(color.value).toBe('#123456');
  fireEvent.change(color, { target: { value: '#22cc55' } });
  fireEvent.change(screen.getByRole('slider', { name: '金属度' }), {
    target: { value: '0.8', valueAsNumber: 0.8 },
  });
  fireEvent.change(screen.getByRole('slider', { name: '粗糙度' }), {
    target: { value: '0.2', valueAsNumber: 0.2 },
  });
  fireEvent.change(screen.getByRole('slider', { name: '不透明度' }), {
    target: { value: '0.4', valueAsNumber: 0.4 },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: '透明材质' }));
  const state = () => JSON.parse(screen.getByTestId('studio-scene').textContent).objects[0];
  expect(state().nodeEdits).toEqual({
    0: { color: '#22cc55', metallic: 0.8, roughness: 0.2, opacity: 0.4, transparent: true },
  });
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(state().nodeEdits).toBeUndefined();
  await user.click(screen.getByRole('button', { name: '重做 ⇧⌘Z' }));
  expect(state().nodeEdits).toEqual({
    0: { color: '#22cc55', metallic: 0.8, roughness: 0.2, opacity: 0.4, transparent: true },
  });
  page.unmount();
  render(
    <StudioEditor
      path="/animation-preview?projectId=material-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  const reloadedRow = screen
    .getAllByRole('treeitem')
    .find((element) => element.dataset.outlinerId === 'material-model:node:0');
  await user.click(reloadedRow);
  expect(screen.getByLabelText('颜色').value).toBe('#22cc55');
  expect(screen.getByRole('slider', { name: '金属度' }).value).toBe('0.8');
  expect(screen.getByRole('slider', { name: '粗糙度' }).value).toBe('0.2');
  expect(screen.getByRole('slider', { name: '不透明度' }).value).toBe('0.4');
  expect(screen.getByRole('checkbox', { name: '透明材质' }).checked).toBe(true);
});

it('opens the source-shaped color popover, edits RGB, and restores focus on Escape', async () => {
  const user = userEvent.setup();
  const object = {
    ...createStudioObject('cube', '颜色方块', []),
    id: 'color-popover-object',
    color: '#123456',
  };
  const scene = {
    id: 'color-popover-scene',
    title: '颜色选择器场景',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  const page = render(
    <StudioEditor
      path="/animation-preview?projectId=color-popover-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  const row = screen.getByRole('treeitem', { name: /颜色方块 1/ });
  await user.click(row);
  const trigger = screen.getByRole('button', { name: /颜色：#123456/ });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: '颜色选择器' });
  expect(dialog).toBeTruthy();
  await user.click(within(dialog).getByRole('tab', { name: 'RGB' }));
  const red = within(dialog).getByRole('spinbutton', { name: 'R' });
  await user.clear(red);
  await user.type(red, '34');
  expect(screen.getByTestId('studio-scene').textContent).toContain('#223456');
  fireEvent.keyDown(red, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: '颜色选择器' })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  page.unmount();
});

it('copies and pastes a top-level object with source-style keyboard shortcuts and local undo', async () => {
  const user = userEvent.setup();
  const object = { ...createStudioObject('cube', '立方体', []), id: 'copy-source' };
  const scene = {
    id: 'copy-paste-scene',
    title: '复制粘贴场景',
    objects: [object],
    frames: [],
    duration: 4,
    ratio: '16:9',
  };
  persistStudioDocument(scene);
  const page = render(
    <StudioEditor
      path="/animation-preview?projectId=copy-paste-scene"
      user={{ id: 'local-test-user' }}
    />,
  );
  await user.click(screen.getByRole('treeitem', { name: /立方体 1/ }));
  fireEvent.keyDown(window, { key: 'c', code: 'KeyC', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'v', code: 'KeyV', ctrlKey: true });
  const state = () => JSON.parse(screen.getByTestId('studio-scene').textContent);
  expect(state().objects).toHaveLength(2);
  expect(state().objects[1]).toMatchObject({
    name: '立方体 1 副本',
    position: [1, 0.5, 0],
  });
  fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true });
  expect(state().objects).toHaveLength(1);
  page.unmount();
});

it('edits real camera path state through presets, easing, waypoint seek/insert/remove, fixed rotation, history and quota-safe paused reload', async () => {
  const user = userEvent.setup(),
    toast = vi.fn();
  const camera = {
    ...createStudioObject('camera', '机位', []),
    id: 'camera',
    position: [0, 2, 10],
    fov: 45,
  };
  const cube = { ...createStudioObject('cube', '模型', []), id: 'cube' };
  const document = {
    id: 'quota-scene',
    title: '本地相机回归',
    objects: [camera, cube],
    frames: [],
    duration: 10,
    ratio: '16:9',
  };
  persistStudioDocument(document);
  const props = { path: '/animation-preview', user: { id: 'local-test-user' }, toast };
  const page = render(<StudioEditor {...props} />);
  const state = () => JSON.parse(screen.getByTestId('studio-camera-state').textContent);
  const treeRow = (id) =>
    screen.getAllByRole('treeitem').find((row) => row.dataset.outlinerId === id);
  await user.click(treeRow('camera'));
  await user.click(screen.getByRole('button', { name: '动画设置' }));
  expect(state().cameraPaths[0].waypoints).toHaveLength(2);
  expect(screen.getByRole('spinbutton', { name: '运镜旋转 X' }).disabled).toBe(false);
  fireEvent.change(screen.getByRole('spinbutton', { name: '运镜旋转 Y' }), {
    target: { value: '30' },
  });
  expect(state().cameraPaths[0].fixedRotation[1]).toBeCloseTo(Math.sin(Math.PI / 12));
  await user.click(screen.getByRole('button', { name: '运镜预设 推近' }));
  expect(state().cameraPaths[0].settings).toMatchObject({
    presetId: 'dolly-in',
    duration: 6,
    aim: 'target',
  });
  expect(state().cameraPaths[0].waypoints).toHaveLength(3);
  expect(screen.getByRole('spinbutton', { name: '运镜旋转 X' }).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: '运镜缓动 缓入' }));
  expect(state().cameraPaths[0].settings.easing).toBe('in');
  fireEvent.change(screen.getByRole('spinbutton', { name: '运镜片段时长' }), {
    target: { value: '8' },
  });
  expect(state().cameraTimeline.duration).toBe(8);
  fireEvent.change(screen.getByRole('slider', { name: '相机视野' }), { target: { value: '60' } });
  expect(JSON.parse(screen.getByTestId('studio-scene').textContent).objects[0].fov).toBe(60);
  await user.click(screen.getByRole('button', { name: '状态 2 4.0s' }));
  expect(JSON.parse(screen.getByTestId('studio-playback').textContent).time).toBe(4);
  fireEvent.change(screen.getByRole('spinbutton', { name: '运镜位置 X' }), {
    target: { value: '7' },
  });
  expect(state().cameraPaths[0].waypoints[1].transform.position[0]).toBe(7);
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(state().cameraPaths[0].waypoints[1].transform.position[0]).toBe(0);
  await user.click(screen.getByRole('button', { name: '重做 ⇧⌘Z' }));
  expect(state().cameraPaths[0].waypoints[1].transform.position[0]).toBe(7);
  await user.click(screen.getByRole('button', { name: '编辑运镜过渡' }));
  await user.click(screen.getByRole('button', { name: '运镜缓动 缓出' }));
  await user.click(screen.getByRole('button', { name: '编辑运镜过渡' }));
  window.document.body.focus();
  fireEvent.keyDown(window, { key: 'i', code: 'KeyI' });
  expect(state().cameraPaths[0].waypoints).toHaveLength(4);
  await user.click(screen.getByRole('button', { name: '删除运镜关键帧' }));
  expect(state().cameraPaths[0].waypoints).toHaveLength(3);
  await user.click(screen.getByRole('button', { name: '状态 2 4.0s' }));
  await user.click(screen.getByRole('button', { name: '删除运镜关键帧' }));
  await user.click(screen.getByRole('button', { name: '状态 1 0.0s' }));
  expect(screen.getByRole('button', { name: '删除运镜关键帧' }).disabled).toBe(true);
  expect(state().cameraPaths[0].waypoints).toHaveLength(2);
  await user.click(treeRow('cube'));
  expect(screen.queryByRole('region', { name: '动画设置' })).toBeNull();
  await user.click(treeRow('camera'));
  await user.click(screen.getByRole('button', { name: '关闭动画设置' }));
  expect(screen.getByRole('button', { name: '动画设置' })).toBe(window.document.activeElement);
  await user.click(screen.getByRole('button', { name: '镜头 1 机位 1' }));
  expect(state().viewMode).toBe('film');
  const before = readStudioDocument(document.id);
  const setItem = Storage.prototype.setItem;
  const failed = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (key === 'libtv.studio.quota-scene') throw new DOMException('Quota', 'QuotaExceededError');
    return setItem.call(this, key, value);
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: '运镜片段时长' }), {
    target: { value: '9' },
  });
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(toast).toHaveBeenCalledWith('保存失败，请检查浏览器存储空间，或导出 GLB 备份。');
  expect(readStudioDocument(document.id)).toEqual(before);
  expect(state().cameraPaths[0].settings.duration).toBe(9);
  failed.mockRestore();
  page.unmount();
  expect(readStudioDocument(document.id)).toMatchObject({
    duration: 9,
    viewMode: 'film',
    cameraPaths: [{ settings: { duration: 9, easing: 'out' } }],
  });
  render(<StudioEditor {...props} />);
  expect(state().cameraPaths[0].settings.duration).toBe(9);
  expect(state().viewMode).toBe('film');
  expect(screen.getByRole('button', { name: '播放', exact: true })).toBeTruthy();
}, 10_000);

it('keeps monitor selection distinct from entering a camera in both workspaces', () => {
  const camera = {
    ...createStudioObject('camera', '机位', []),
    id: 'monitor-camera',
    name: 'Monitor QA',
  };
  persistStudioDocument({
    id: 'quota-scene',
    objects: [camera],
    frames: [],
    duration: 6,
    ratio: '16:9',
  });
  render(<StudioEditor path="/animation-preview" user={{ id: 'local-test-user' }} />);
  const state = () => JSON.parse(screen.getByTestId('studio-camera-state').textContent);
  const monitor = screen.getByRole('complementary', { name: '监视器' });
  fireEvent.click(screen.getByRole('button', { name: '成片预演' }));
  fireEvent.click(within(monitor).getByTitle('Monitor QA'));
  expect(state().viewMode).toBe('orbit');
  expect(screen.getByRole('textbox', { name: '名称' }).value).toBe('Monitor QA');
  fireEvent.doubleClick(within(monitor).getByTitle('Monitor QA'));
  expect(state().viewMode).toBe(camera.id);
  fireEvent.click(within(monitor).getByRole('button', { name: '退出机位' }));
  expect(state().viewMode).toBe('top');
  fireEvent.click(screen.getByRole('button', { name: '场景调度' }));
  fireEvent.click(within(monitor).getByTitle('Monitor QA'));
  expect(state().viewMode).toBe('orbit');
});

it('selects and trims contiguous shots through keyboard and pointer with one undo boundary and persists the complete cut table', async () => {
  const user = userEvent.setup();
  const cameras = ['a', 'b'].map((id, index) => ({
    ...createStudioObject('camera', '机位', []),
    id,
    name: `QA_${index}`,
    position: [0, 2, 10],
  }));
  const timeline = {
    version: 1,
    duration: 6,
    shots: [
      { cameraId: 'a', start: 0, end: 3 },
      { cameraId: 'b', start: 3, end: 6 },
    ],
  };
  persistStudioDocument({
    id: 'quota-scene',
    objects: cameras,
    frames: [],
    duration: 6,
    ratio: '16:9',
    cameraTimeline: timeline,
  });
  const page = render(<StudioEditor path="/animation-preview" user={{ id: 'local-test-user' }} />);
  const state = () => JSON.parse(screen.getByTestId('studio-camera-state').textContent);
  await user.click(screen.getByRole('button', { name: '镜头 2 QA_1' }));
  expect(state().viewMode).toBe('film');
  expect(JSON.parse(screen.getByTestId('studio-playback').textContent).time).toBe(3);
  const handle = screen.getByRole('button', { name: '调整镜头 1 终点' });
  handle.focus();
  await user.keyboard('{ArrowRight}');
  expect(state().cameraTimeline.shots.map((shot) => [shot.start, shot.end])).toEqual([
    [0, 3.1],
    [3.1, 6],
  ]);
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(state().cameraTimeline.shots).toEqual(timeline.shots);
  const track = handle.closest('.cv-studio-camera-shots');
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 600 });
  handle.setPointerCapture = vi.fn();
  handle.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 300 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 350 });
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
  fireEvent.pointerUp(handle, { pointerId: 1, clientX: 400 });
  expect(state().cameraTimeline.shots.map((shot) => [shot.start, shot.end])).toEqual([
    [0, 4],
    [4, 6],
  ]);
  await user.click(screen.getByRole('button', { name: '撤销 ⌘Z' }));
  expect(state().cameraTimeline.shots).toEqual(timeline.shots);
  await user.click(screen.getByRole('button', { name: '重做 ⇧⌘Z' }));
  page.unmount();
  expect(readStudioDocument('quota-scene').cameraTimeline.shots).toEqual([
    { cameraId: 'a', start: 0, end: 4 },
    { cameraId: 'b', start: 4, end: 6 },
  ]);
});
