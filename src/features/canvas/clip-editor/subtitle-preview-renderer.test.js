import { describe, expect, it } from 'vitest';
import { createSubtitlePreviewRenderer } from './subtitle-preview-renderer.js';
describe('subtitle preview ownership', () => {
  it('renders literal cue text above the picture, keeps stable DOM and clears at the exact end', () => {
    const host = document.createElement('div');
    const renderer = createSubtitlePreviewRenderer(host);
    const timeline = {
      clips: [],
      subtitles: {
        visible: true,
        defaultStyle: { color: '#FFFF00' },
        cues: [
          { id: 'cue', startTime: 0, endTime: 2, text: '<script>unsafe</script>\nsecond line' },
        ],
      },
    };
    const description = { activeVideos: [], transition: null },
      output = { width: 1920, height: 1080 };
    renderer.render(timeline, 0, description, output);
    const cue = host.querySelector('[data-subtitle-cue-id="cue"]');
    expect(cue.textContent).toBe('<script>unsafe</script>\nsecond line');
    expect(host.querySelector('script')).toBeNull();
    renderer.render(timeline, 1, description, output);
    expect(host.querySelector('[data-subtitle-cue-id="cue"]')).toBe(cue);
    renderer.render(timeline, 2, description, output);
    expect(host.querySelector('[data-subtitle-cue-id]')).toBeNull();
    renderer.dispose();
    expect(host.children).toHaveLength(0);
  });
});
