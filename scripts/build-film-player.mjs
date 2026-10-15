import { build } from 'vite';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  configFile: false,
  root,
  publicDir: false,
  logLevel: 'warn',
  build: {
    outDir: path.join(root, 'dist-film'),
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.join(root, 'src/services/interactive-film/player-entry.ts'),
      name: 'PenFilmPlayer',
      formats: ['iife'],
      fileName: () => 'player.iife.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const bundle = await readFile(path.join(root, 'dist-film/player.iife.js'), 'utf8');
if (/\bimport\s*\(|\bimport\s+[^:]/.test(bundle))
  throw new Error('The offline film player must be a self-contained classic script.');
const destination = path.join(root, 'public/film-runtime/v1');
await mkdir(destination, { recursive: true });
await copyFile(
  path.join(root, 'dist-film/player.iife.js'),
  path.join(destination, 'player.iife.js'),
);
console.log(`Film player v1 built: ${Buffer.byteLength(bundle)} bytes`);
