import { describe, expect, it } from 'vitest';
import {
  crossedMarker,
  formatPlayerTime,
  normalizePreferences,
  normalizeQualities,
  playerShortcutAllowed,
  resumePosition,
  selectQuality,
} from './player-model.js';

describe('academy playback domain', () => {
  it('selects a saved quality by height with a safe default if it disappeared', () => {
    const qualities = normalizeQualities([
      { url: 'hi.mp4', label: '1080p' },
      { url: 'low.mp4', height: 480 },
    ]);
    expect(selectQuality(qualities, 480, 'hi.mp4').url).toBe('low.mp4');
    expect(selectQuality(qualities, 720, 'hi.mp4').url).toBe('hi.mp4');
    expect(normalizePreferences({ rate: 16, qualityHeight: -1 })).toEqual({
      rate: 1,
      qualityHeight: null,
    });
  });
  it('does not offer resume at the end and formats hour-long lessons without losing hours', () => {
    expect(resumePosition(99, 100)).toBe(0);
    expect(resumePosition(37, 100)).toBe(37);
    expect(formatPlayerTime(3661)).toBe('1:01:01');
  });
  it('triggers a zero-second practice mark at one second but never on a seek jump or twice', () => {
    const marks = [{ timeSec: 0 }, { timeSec: 8 }];
    expect(crossedMarker(marks, 0, 1, new Set())).toBe(0);
    expect(crossedMarker(marks, 1, 9, new Set())).toBe(-1);
    expect(crossedMarker(marks, 7, 8, new Set([1]))).toBe(-1);
  });
  it('never steals native buttons, range input or dialog keyboard actions', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<button><span>play</span></button><input type="range"><div role="dialog"><div class="dialog-content"></div></div>';
    expect(playerShortcutAllowed(container)).toBe(true);
    expect(playerShortcutAllowed(container.querySelector('span'))).toBe(false);
    expect(playerShortcutAllowed(container.querySelector('input'))).toBe(false);
    expect(playerShortcutAllowed(container.querySelector('.dialog-content'))).toBe(false);
  });
});
