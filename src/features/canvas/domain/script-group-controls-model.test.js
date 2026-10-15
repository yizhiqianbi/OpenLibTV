import { describe, expect, it } from 'vitest';
import {
  canvasGroupVideoAvailability,
  canvasScriptGroupRunConfirmation,
} from './script-group-controls-model.js';

const group = (data = {}) => ({
  id: 'g',
  type: 'group',
  position: { x: 0, y: 0 },
  data: { sourceScriptNodeId: 's', storyboardGroupType: 'image', ...data },
});
const script = (data = {}) => ({
  id: 's',
  type: 'script',
  position: { x: 0, y: 0 },
  data: { rows: [{ hiddenUuid: 'row' }], linkedImageGroupId: 'g', ...data },
});
const child = (data = {}, type = 'image') => ({
  id: 'a',
  type,
  parentId: 'g',
  position: { x: 0, y: 0 },
  data: { scriptRowHiddenUuid: 'row', url: ['/real.webp'], ...data },
});

describe('source script group caller', () => {
  it.each([undefined, 'v1'])(
    'keeps the actual %s image confirmation even with output',
    (version) => {
      expect(
        canvasScriptGroupRunConfirmation(
          [group({ sourceScriptVersion: version }), child(), script()],
          'g',
        ),
      ).toMatchObject({
        kind: 'simple',
        title: '生成分镜图',
        message: '将对组内所有分镜图开始生成，是否继续？',
      });
    },
  );

  it.each(['image', 'video'])('uses power confirmation for v2 %s including standalone', (kind) => {
    expect(
      canvasScriptGroupRunConfirmation(
        [
          group({
            sourceScriptVersion: 'v2',
            storyboardGroupType: kind,
            standaloneStoryboardImageGrid: true,
          }),
        ],
        'g',
      ),
    ).toMatchObject({ kind: 'power', title: '整组执行', confirmText: '开始执行' });
  });

  it('counts empty and confirmed failed videos, without treating in-flight failures as final', () => {
    const rows = [
      child({ url: [] }, 'video'),
      { ...child({ taskInfo: { status: '4', loading: false } }, 'video'), id: 'b' },
      { ...child({ taskInfo: { status: 3, loading: true } }, 'video'), id: 'c' },
      { ...child({}, 'image'), id: 'image' },
    ];
    expect(
      canvasScriptGroupRunConfirmation([group({ storyboardGroupType: 'video' }), ...rows], 'g'),
    ).toMatchObject({ title: '重新生成视频', message: '将对 2 个未完成视频重新生成，是否继续？' });
    expect(
      canvasScriptGroupRunConfirmation([group({ storyboardGroupType: 'video' }), rows[2]], 'g')
        .message,
    ).toBe('所有视频重新生成，是否继续？');
  });

  it('does not reinterpret ordinary groups or missing targets as linked generation', () => {
    expect(
      canvasScriptGroupRunConfirmation([group({ sourceScriptNodeId: undefined })], 'g'),
    ).toBeNull();
    expect(canvasScriptGroupRunConfirmation([], 'g')).toBeNull();
  });
});

describe('source v1 batch-video availability', () => {
  it('counts matched script rows using actual array URLs; a display image alone is insufficient', () => {
    expect(canvasGroupVideoAvailability([group(), script(), child()], 'g')).toMatchObject({
      visible: true,
      enabled: true,
      readyCount: 1,
    });
    expect(
      canvasGroupVideoAvailability([group(), script(), child({ url: '/real.webp' })], 'g'),
    ).toMatchObject({ visible: true, enabled: false, readyCount: 0 });
    expect(
      canvasGroupVideoAvailability(
        [group(), script(), child({ scriptRowHiddenUuid: 'unknown' })],
        'g',
      ),
    ).toMatchObject({ enabled: false, readyCount: 0 });
  });

  it('keeps stale groups visible but disabled, and never guesses missing script rows', () => {
    expect(
      canvasGroupVideoAvailability([group(), script({ linkedImageGroupId: 'new' }), child()], 'g')
        .reason,
    ).toContain('被新组取代');
    expect(canvasGroupVideoAvailability([group(), child()], 'g')).toMatchObject({
      visible: true,
      enabled: false,
    });
  });

  it.each([
    { sourceScriptVersion: 'v2' },
    { storyboardGroupType: 'video' },
    { sourceScriptNodeId: undefined },
  ])('hides unavailable source branches %j', (data) => {
    expect(canvasGroupVideoAvailability([group(data), script(), child()], 'g').visible).toBe(false);
  });
});
