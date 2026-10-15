import { describe, expect, it, vi } from 'vitest';
import { createClipTextTools } from './controls.js';
import { createTextOverlayHtml, readTextOverlayHtml } from './html-document.js';
import { readTextStyle } from './document-model.js';
import { readTextMotion } from './motion-document.js';
function harness(cues) {
  let session = {
    ready: true,
    textStatus: 'idle',
    timeline: {
      clips: [],
      currentTime: 0,
      totalDuration: 10,
      overlayHtmlInline: createTextOverlayHtml({
        compositionId: 'text',
        width: 1920,
        height: 1080,
        duration: 10,
        cues,
      }),
    },
    draftSession: {},
    selectedTextCueId: 'one',
  };
  const acceptEdit = vi.fn(({ timeline }) => {
      session = { ...session, timeline };
      return true;
    }),
    notify = vi.fn();
  const tools = createClipTextTools({
    getSession: () => session,
    current: (value) => value === session,
    publish: (value) => {
      session = value;
    },
    acceptEdit,
    pause: vi.fn(),
    seek: vi.fn(),
    makeId: () => 'local',
    notify,
  });
  const load = () =>
    tools.controls.onTextLoaded(
      `inline:${session.timeline.overlayHtmlInline}`,
      session.timeline.overlayHtmlInline,
    );
  return { tools, get: () => session, acceptEdit, notify, load };
}
const cue = { cueId: 'one', text: '原文', start: 0, duration: 3, trackIndex: 0 };
describe('ordinary text tools preflight and catalogue adaptation', () => {
  it('applies all ordinary text styles/appearance/layout/motion once while preserving every body, clock and track', () => {
    const { tools, get, acceptEdit, load } = harness([
      cue,
      { ...cue, cueId: 'other', text: '其他正文', start: 5, duration: 2, trackIndex: 1 },
    ]);
    load();
    tools.controls.onEditText({
      preset: {
        id: 'green',
        fields: {
          color: '#00FF00',
          backgroundColor: '#0000FF',
          backgroundOpacityPct: 75,
          cornerRadiusPx: 12.125,
          backgroundBlurPx: 4.125,
          fontStyle: 'italic',
          textAlign: 'left',
          xPct: 20.125,
          animationType: 'spring-up',
        },
      },
    });
    acceptEdit.mockClear();
    expect(tools.controls.onApplyTextToAll()).toBe(true);
    expect(acceptEdit).toHaveBeenCalledTimes(1);
    const model = readTextOverlayHtml(get().timeline.overlayHtmlInline),
      other = model.cues.find((entry) => entry.cueId === 'other');
    expect(other).toMatchObject({ text: '其他正文', start: 5, duration: 2, trackIndex: 1 });
    expect(readTextStyle(model, 'other')).toMatchObject({
      color: '#00FF00',
      backgroundColor: 'rgba(0, 0, 255, 0.75)',
      cornerRadiusPx: 12.13,
      backgroundBlurPx: 4.13,
      fontStyle: 'italic',
      textAlign: 'left',
      xPct: 20.125,
    });
    expect(other.element.getAttribute('data-libtv-text-preset-id')).toBe('green');
    expect(readTextMotion(other.element)).toMatchObject({ type: 'spring-up', durationMs: 550 });
    expect(
      other.element
        .querySelector('[data-libtv-motion-target]')
        .style.getPropertyValue('--libtv-text-motion-start'),
    ).toBe('5s');
  });
  it('does not mutate raw HTML while loading/failed, rejects stale keys and accepts only valid matching documents', () => {
    const { tools, get, acceptEdit, load } = harness([cue]),
      original = get().timeline;
    expect(tools.controls.onTextChange('one', 'late')).toBe(false);
    expect(tools.controls.onTextLoaded('url:old', 'invalid')).toBe(false);
    expect(tools.controls.onTextLoadStatus(`inline:${original.overlayHtmlInline}`, 'offline')).toBe(
      true,
    );
    expect(get().textStatus).toBe('error');
    expect(get().timeline).toBe(original);
    expect(load()).toBe(true);
    expect(get().textStatus).toBe('ready');
    expect(acceptEdit).not.toHaveBeenCalled();
  });
  it('applies a provided preset as one edit, clears its marker on manual style edits and preserves body/timing', () => {
    const { tools, get, acceptEdit, load } = harness([cue]);
    load();
    expect(
      tools.controls.onEditText({
        preset: { id: 'gold', fields: { color: '#FFD000', fontSizePx: 45.125 } },
      }),
    ).toBe(true);
    let model = readTextOverlayHtml(get().timeline.overlayHtmlInline);
    expect(model.cues[0].element.getAttribute('data-libtv-text-preset-id')).toBe('gold');
    expect(readTextStyle(model, 'one')).toMatchObject({ color: '#FFD000', fontSizePx: 45.13 });
    expect(acceptEdit).toHaveBeenCalledTimes(1);
    tools.controls.onEditText({ fields: { xPct: 20.125 } });
    model = readTextOverlayHtml(get().timeline.overlayHtmlInline);
    expect(model.cues[0].element.hasAttribute('data-libtv-text-preset-id')).toBe(false);
    expect(model.cues[0]).toMatchObject(cue);
    expect(readTextStyle(model, 'one').xPct).toBe(20.125);
  });
  it('asks for an actual track when multiple ordinary text rows are ambiguous', async () => {
    const { tools, get, acceptEdit, load } = harness([
      cue,
      { ...cue, cueId: 'other', trackIndex: 1 },
    ]);
    load();
    expect(await tools.controls.onAddText()).toBe(false);
    expect(get().textTrackChoice).toEqual([0, 1]);
    expect(acceptEdit).not.toHaveBeenCalled();
  });
});
