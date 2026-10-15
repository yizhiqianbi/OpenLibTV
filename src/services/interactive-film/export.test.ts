// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { build } from 'vite';
import { createRequire } from 'node:module';
import { createFilmArchive, exportFilmDocument, FILM_RUNTIME_URL } from './export.ts';
import type { FilmDocument } from './types.ts';
interface TestBrowserWindow {
  document: Document;
  fetch: typeof fetch;
  close(): void;
}
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (
    html: string,
    options: {
      url: string;
      runScripts: 'dangerously';
      pretendToBeVisual: boolean;
      beforeParse(window: TestBrowserWindow): void;
    },
  ) => { window: TestBrowserWindow };
};
const { readBlob } = vi.hoisted(() => ({ readBlob: vi.fn() }));
vi.mock('./media.ts', () => ({ getFilmMediaBlob: readBlob }));
const story = (): FilmDocument => ({
  schemaVersion: 1,
  id: 'film-test',
  title: '</title><script>坏文本</script>',
  revision: 1,
  savedAt: 0,
  nodes: [
    { id: 'start', kind: 'start', title: '开始', position: { x: 0, y: 0 } },
    {
      id: 'one',
      kind: 'play',
      title: '第一段',
      position: { x: 0, y: 0 },
      mediaId: 'v',
      trimIn: 0,
      trimOut: 1,
    },
    {
      id: 'two',
      kind: 'play',
      title: '第二段',
      position: { x: 0, y: 0 },
      mediaId: 'v',
      trimIn: 1,
      trimOut: 2,
    },
    {
      id: 'end',
      kind: 'ending',
      title: '结局',
      endingText: '</script>不是代码',
      position: { x: 0, y: 0 },
    },
  ],
  edges: [
    { id: 'a', source: 'start', sourcePort: 'next', target: 'one' },
    { id: 'b', source: 'one', sourcePort: 'next', target: 'two' },
    { id: 'c', source: 'two', sourcePort: 'next', target: 'end' },
  ],
  variables: [],
  media: [
    {
      id: 'v',
      name: '完整成片.mp4',
      type: 'video',
      mimeType: 'video/mp4',
      duration: 2,
      width: 1600,
      height: 900,
      bytes: 4,
    },
  ],
  view: { x: 0, y: 0, z: 1 },
});

it('creates a real directory ZIP with one complete shared media and an embedded safe offline manifest', async () => {
  readBlob.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'video/mp4' }));
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('var PenFilmPlayer={mount:function(){}};'));
  const progress = vi.fn();
  const document = story();
  const zip = await exportFilmDocument(document, { onProgress: progress });
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  expect(Object.keys(files).sort()).toEqual(['README.txt', 'index.html', 'media/asset-1.mp4']);
  expect(Array.from(files['media/asset-1.mp4'])).toEqual([1, 2, 3, 4]);
  expect(readBlob).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    FILM_RUNTIME_URL,
    expect.objectContaining({ credentials: 'omit' }),
  );
  const html = strFromU8(files['index.html']);
  expect(html).not.toContain('type="module"');
  expect(html).not.toContain('fetch(');
  expect(html).toContain('&lt;/title&gt;');
  const manifest = JSON.parse(
    html.match(/<script id="film-manifest" type="application\/json">([\s\S]*?)<\/script>/)![1],
  );
  expect(manifest.media.v.url).toBe('media/asset-1.mp4');
  expect(manifest.nodes[3].endingText).toBe('</script>不是代码');
  expect(document.media[0].name).toBe('完整成片.mp4');
  expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({ completed: 3, total: 3 });
});
it('rejects unsafe archive paths while preserving real safe directory paths', async () => {
  for (const path of ['../escape', '/absolute', 'C:/drive', 'media/../../escape', 'media\\escape'])
    await expect(createFilmArchive([{ path, content: 'x' }])).rejects.toThrow('路径');
  const zip = await createFilmArchive([{ path: 'media/中文.txt', content: '真实文本' }]);
  expect(strFromU8(unzipSync(new Uint8Array(await zip.arrayBuffer()))['media/中文.txt'])).toBe(
    '真实文本',
  );
});
it('rejects oversized Blobs before allocating their bytes', async () => {
  const content = new Blob(['small']);
  Object.defineProperty(content, 'size', { value: 513 * 1024 * 1024 });
  const read = vi.spyOn(content, 'arrayBuffer');
  await expect(createFilmArchive([{ path: 'media/large.mp4', content }])).rejects.toThrow('512');
  expect(read).not.toHaveBeenCalled();
});
it('runs the real self-contained classic bundle from an embedded file-protocol page with no fetch or storage', async () => {
  const result = await build({
    configFile: false,
    publicDir: false,
    logLevel: 'silent',
    build: {
      write: false,
      target: 'es2020',
      lib: {
        entry: new URL('./player-entry.ts', import.meta.url).pathname,
        name: 'PenFilmPlayer',
        formats: ['iife'],
        fileName: () => 'player.iife.js',
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!('output' in output)) throw new Error('Missing player build');
  const chunk = output.output.find((item) => item.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Missing classic bundle');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(chunk.code));
  const document = story();
  document.nodes = [
    document.nodes[0],
    {
      id: 'choice',
      kind: 'choice',
      title: '选择',
      position: { x: 0, y: 0 },
      choices: [{ id: 'a', text: '<img src=bad>继续' }],
      prompt: '选择下一段',
    },
    document.nodes[3],
  ];
  document.edges = [
    { id: 'a', source: 'start', sourcePort: 'next', target: 'choice' },
    { id: 'b', source: 'choice', sourcePort: 'a', target: 'end' },
  ];
  document.media = [];
  const zip = await exportFilmDocument(document);
  const html = strFromU8(unzipSync(new Uint8Array(await zip.arrayBuffer()))['index.html']);
  const network = vi.fn(() => {
    throw new Error('Offline page attempted a network read');
  });
  const dom = new JSDOM(html, {
    url: 'file:///offline/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = network;
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('Storage unavailable');
        },
      });
    },
  });
  try {
    const start = dom.window.document.querySelector<HTMLButtonElement>('.pf-start')!;
    start.click();
    const choice = dom.window.document.querySelector<HTMLButtonElement>('.pf-choice')!;
    expect(choice.textContent).toBe('<img src=bad>继续');
    expect(choice.querySelector('img')).toBeNull();
    choice.click();
    expect(dom.window.document.querySelector('.pf-ending h2')?.textContent).toBe('结局');
    expect(dom.window.document.querySelector('.pf-ending p')?.textContent).toBe(
      '</script>不是代码',
    );
    expect(dom.window.document.querySelector('.pf-ending script')).toBeNull();
    expect(network).not.toHaveBeenCalled();
  } finally {
    dom.window.close();
  }
});
it('blocks missing or mismatched bytes, validates before reading and never releases a canceled archive', async () => {
  readBlob.mockResolvedValue(new Blob(['wrong-size']));
  await expect(exportFilmDocument(story())).rejects.toThrow('文件大小');
  readBlob.mockClear();
  const invalid = story();
  invalid.edges = [];
  await expect(exportFilmDocument(invalid)).rejects.toThrow();
  expect(readBlob).not.toHaveBeenCalled();
  const controller = new AbortController();
  let resolve!: (blob: Blob) => void;
  readBlob.mockImplementation(
    () =>
      new Promise<Blob>((done) => {
        resolve = done;
      }),
  );
  const job = exportFilmDocument(story(), { signal: controller.signal });
  controller.abort();
  resolve(new Blob([new Uint8Array([1, 2, 3, 4])]));
  await expect(job).rejects.toMatchObject({ name: 'AbortError' });
});
