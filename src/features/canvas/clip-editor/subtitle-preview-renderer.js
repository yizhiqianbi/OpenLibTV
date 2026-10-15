import { describeSubtitleOverlay, subtitleOutputRect } from './domain/subtitle-layout-model.js';

export function createSubtitlePreviewRenderer(host) {
  const layer = document.createElement('div');
  layer.className = 'cv-clip-preview-subtitles';
  layer.setAttribute('aria-label', '字幕预览');
  let signature;
  return {
    render(timeline, time, description, output, stackIndex = 0) {
      if (!output) return;
      if (layer.parentElement !== host) host.appendChild(layer);
      layer.style.zIndex = String(110 - stackIndex);
      const width = host.getBoundingClientRect().width;
      const cues = describeSubtitleOverlay(
        timeline.subtitles,
        time,
        output,
        subtitleOutputRect(description, timeline, output),
        width > 0 ? width / output.width : 1,
      );
      const next = JSON.stringify(cues);
      if (next === signature) return;
      signature = next;
      layer.replaceChildren(
        ...cues.map((cue) => {
          const element = document.createElement('div');
          element.dataset.subtitleCueId = cue.id;
          element.textContent = cue.text;
          Object.assign(element.style, cue.style);
          return element;
        }),
      );
    },
    dispose() {
      layer.remove();
    },
  };
}
