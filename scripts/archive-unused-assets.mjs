import { readFile, readdir, mkdir, rename, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// This is deliberately a dry run by default. It never removes files: --apply
// moves unused captures to an ignored research archive and records every move.
const root = process.cwd();
const publicDir = path.join(root, 'public');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const archive = path.join(root, 'research/captured/unused-runtime', runId);
const apply = process.argv.includes('--apply');
const mapping = JSON.parse(await readFile(path.join(publicDir, 'data/asset-map.json'), 'utf8'));
const originalMapping = JSON.stringify(mapping, null, 2);
const used = new Set();
const candidateAssets = new Set(
  Object.values(mapping).filter((value) => value.startsWith('/assets/')),
);
const pending = [];

function inspect(value) {
  if (typeof value === 'string') {
    const mapped = mapping[value];
    if (mapped) used.add(mapped);
    // Long Markdown/JSX/CSS strings can contain several embedded media URLs.
    // Individual JSON fields use the O(1) mapping lookup above.
    else if (value.length > 200 && value.includes('https://')) {
      for (const [source, target] of Object.entries(mapping)) {
        if (value.includes(source)) used.add(target);
      }
    }
    const locals = value.match(/\/(?:assets|data)\/[A-Za-z0-9_./-]+/g) || [];
    for (const local of locals) {
      used.add(local);
      if (local.startsWith('/data/canvas-snapshots/')) pending.push(local);
    }
  } else if (Array.isArray(value)) value.forEach(inspect);
  else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
}

async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesIn(filename)));
    else result.push(filename);
  }
  return result;
}

const dataFiles = await filesIn(path.join(publicDir, 'data'));
for (const filename of dataFiles) {
  if (filename.includes('/canvas-snapshots/') || filename.endsWith('/asset-map.json')) continue;
  if (!filename.endsWith('.json')) continue;
  inspect(JSON.parse(await readFile(filename, 'utf8')));
}
for (const filename of await filesIn(path.join(root, 'src'))) {
  if (!/\.(?:jsx?|tsx?|css)$/.test(filename)) continue;
  inspect(await readFile(filename, 'utf8'));
}
// A small baseline fixture is intentionally retained for the shared canvas route.
inspect('/data/canvas-example.json');
for (const snapshot of new Set(pending)) {
  const filename = path.join(publicDir, snapshot.slice(1));
  try {
    const bytes = await readFile(filename);
    inspect(
      JSON.parse(
        snapshot.endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8'),
      ),
    );
  } catch {
    // Missing captured snapshots are reported by the page; this script must not
    // invent data or archive another snapshot in their place.
  }
}

const candidates = [
  ...dataFiles.filter((filename) => filename.includes('/canvas-snapshots/')),
  ...[...candidateAssets].map((local) => path.join(publicDir, local.slice(1))),
];
const moves = [];
for (const filename of new Set(candidates)) {
  const relative = '/' + path.relative(publicDir, filename).split(path.sep).join('/');
  if (used.has(relative)) continue;
  try {
    const info = await stat(filename);
    const destination = path.join(archive, relative.slice(1));
    moves.push({
      source: relative,
      destination: path.relative(root, destination),
      bytes: info.size,
    });
    if (apply) {
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(filename, destination);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const report = {
  runId,
  applied: apply,
  files: moves.length,
  bytes: moves.reduce((total, item) => total + item.bytes, 0),
  moves,
};
await mkdir(path.join(root, 'artifacts'), { recursive: true });
if (apply && moves.length) {
  // Keep the old map with the archive. New content must not resolve to moved files.
  await writeFile(path.join(archive, 'asset-map-before.json'), originalMapping);
  const movedAssets = new Set(moves.map((move) => move.source));
  for (const [source, target] of Object.entries(mapping)) {
    if (movedAssets.has(target)) delete mapping[source];
  }
  await writeFile(
    path.join(publicDir, 'data/asset-map.json'),
    JSON.stringify(mapping, null, 2) + '\n',
  );
}
const reportName = apply
  ? `unused-assets-archive-${runId}.json`
  : 'unused-assets-audit-report.json';
await writeFile(path.join(root, 'artifacts', reportName), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({
    applied: apply,
    files: report.files,
    megabytes: +(report.bytes / 1048576).toFixed(1),
  }),
);
