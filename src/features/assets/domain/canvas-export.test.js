import { beforeEach, expect, it } from 'vitest';
import { readStoredValue } from '../../../services/storage.ts';
import { assetCanvasSnapshot, createCanvasFromAssets } from './canvas-export.js';

beforeEach(() => localStorage.clear());
it('creates a refreshable project with actual media references and separated node positions', () => {
  const entries = ['image', 'audio'].map((type) => ({
    id: type,
    name: type,
    type,
    mimeType: `${type}/png`,
    url: `data:${type}/png;base64,AA==`,
  }));
  const href = createCanvasFromAssets(entries);
  const id = new URL(href, 'http://localhost').searchParams.get('projectId');
  const saved = readStoredValue(`libtv.canvas.${id}`, null);
  expect(saved.nodes.map((node) => node.data.url[0])).toEqual(entries.map((item) => item.url));
  expect(saved.nodes[0].position).not.toEqual(saved.nodes[1].position);
  expect(saved.view).toEqual({ x: 40, y: 40, z: 0.8 });
  expect(readStoredValue('libtv-projects', [])[0]).toMatchObject({
    id,
    nodeCount: 2,
    name: '资产创作项目',
  });
});
it('rejects empty media instead of opening a blank project', () => {
  expect(() => assetCanvasSnapshot([{ id: 'missing', url: '' }])).toThrow('暂无');
  expect(localStorage.length).toBe(0);
});
