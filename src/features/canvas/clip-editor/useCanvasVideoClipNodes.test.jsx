import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasVideoClipNodes } from './useCanvasVideoClipNodes.js';

const graph = (sourceUrl, sourceData = {}) => {
  const nodes = [
    {
      id: 'clip',
      type: 'video-clip',
      position: { x: 0, y: 0 },
      data: { type: 'video-clip', url: [] },
    },
    {
      id: 'source',
      type: 'video',
      position: { x: 500, y: 0 },
      data: { type: 'video', url: [sourceUrl], ...sourceData },
    },
  ];
  return {
    nodes,
    edges: [{ id: 'edge', source: 'source', target: 'clip' }],
    document: {
      documentKey: 'clip-node-preview',
      ready: true,
      readonly: false,
      nodes,
      edges: [{ id: 'edge', source: 'source', target: 'clip' }],
    },
  };
};

function render(sourceUrl, sourceData) {
  const value = graph(sourceUrl, sourceData);
  const currentDocument = { current: value.document };
  const setNodes = vi.fn();
  const hook = renderHook(() => ({
    entries: useCanvasVideoClipNodes({
      documentKey: 'clip-node-preview',
      ready: true,
      readonly: false,
      nodes: value.nodes,
      edges: value.edges,
      currentDocument,
      setNodes,
    }),
  }));
  return { result: hook.result, setNodes };
}

describe('VIDEO_CLIP incoming preview projection', () => {
  it('derives the source OSS snapshot after a poster fails without replacing the poster', () => {
    const { result } = render('https://cdn.example.test/source.mp4?token=abc', {
      poster: '/source-poster.jpg',
    });
    const entry = result.current.entries.get('clip');
    expect(entry.sourcePoster).toBe('/source-poster.jpg');
    expect(entry.sourceSnapshot).toBe(
      'https://cdn.example.test/source.mp4?token=abc&x-oss-process=video/snapshot,t_0,f_jpg,w_400,m_fast,ar_auto',
    );
  });

  it('does not invent a remote snapshot for local, data, blob, webm or already processed URLs', () => {
    for (const url of [
      '/source.mp4',
      'blob:http://localhost/source',
      'data:video/mp4;base64,AAAA',
      'https://cdn.example.test/source.webm',
      'https://cdn.example.test/source.mp4?x-oss-process=video/snapshot',
    ]) {
      const { result } = render(url);
      expect(result.current.entries.get('clip').sourceSnapshot).toBeUndefined();
    }
  });
});
