import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Build an independent, bounded public sample. Never edit or delete public/ or dist/.
const root = process.cwd();
const publicDir = path.join(root, 'public');
const outputDir = path.join(root, '.vercel/output');
const builtStaticDir = path.join(outputDir, 'static');
const targetBytes = 90_000_000;
const maximumBytes = 95_000_000;
const reportPath = path.join(root, 'artifacts/vercel-package-report.json');
const json = async (name) =>
  JSON.parse(await readFile(path.join(publicDir, 'data', `${name}.json`), 'utf8'));
const original = Object.fromEntries(
  await Promise.all(
    [
      'home',
      'shell-config',
      'models',
      'storyboard-video-support',
      'video-model-support',
      'image-model-support',
      'script-presets',
      'script-text-support',
      'video-compose-agent-config',
      'member',
      'member-model-cards',
      'member-packages',
      'locale-zh',
      'player-config',
      'remote-configs',
      'academy-courses',
      'canvas-example',
      'gallery',
      'gallery-all',
      'gallery-categories',
      'gallery-details',
      'profiles',
      'skills',
      'skills-recommended',
      'skill-details',
      'academy',
      'academy-details',
      'activities',
      'versions',
      'features',
      'chat-shares',
      'secondary',
      'ui-assets',
      'asset-map',
    ].map(async (name) => [name, await json(name)]),
  ),
);
const mappingVariants = new Map();
for (const sourceMap of [original['asset-map'], original['ui-assets'], original.secondary.uiAssets])
  for (const [source, target] of Object.entries(sourceMap)) {
    if (!mappingVariants.has(source)) mappingVariants.set(source, new Set());
    mappingVariants.get(source).add(target);
  }
const inverse = new Map();
for (const [source, targets] of mappingVariants)
  for (const target of targets)
    if (target.startsWith('/assets/') && !inverse.has(target)) inverse.set(target, source);
// Existing capture provenance is read only; some localized Skill videos have no
// entry in the current runtime map. Never guess their original public URL.
const chatAssetOrigins = JSON.parse(
  await readFile(path.join(root, 'research/chat-share-asset-map.json'), 'utf8'),
);
for (const [source, target] of Object.entries(chatAssetOrigins))
  if (!inverse.has(target)) inverse.set(target, source);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? filesIn(filename) : [filename];
    }),
  );
  return nested.flat();
}

const publicFiles = new Map(
  await Promise.all(
    (await filesIn(publicDir)).map(async (filename) => [
      '/' + path.relative(publicDir, filename).split(path.sep).join('/'),
      { filename, bytes: (await stat(filename)).size },
    ]),
  ),
);
// Vercel must compile the real Functions and routing before only its static sample is bounded.
// Do not reconstruct config.json: that would silently discard API routes and platform metadata.
const configBuffer = await readFile(path.join(outputDir, 'config.json'));
const buildConfig = JSON.parse(configBuffer.toString('utf8'));
if (buildConfig.version !== 3) throw new Error('Run vercel build before preparing the deployment.');
const functionEntries = [];
for (const endpoint of ['start', 'upload', 'complete', 'release']) {
  const functionDir = path.join(outputDir, 'functions', 'api', 'film', `${endpoint}.func`);
  const functionConfig = JSON.parse(
    await readFile(path.join(functionDir, '.vc-config.json'), 'utf8'),
  );
  const handler = path.join(functionDir, functionConfig.handler);
  await stat(handler);
  functionEntries.push(handler);
}
// Check emitted modules with Node itself. A TypeScript test runner can resolve a source
// extension that the deployed JavaScript cannot, so source checks alone miss this failure.
await promisify(execFile)(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    `import { pathToFileURL } from 'node:url';
for (const entry of process.argv.slice(1)) {
  const module = await import(pathToFileURL(entry).href);
  if (typeof module.default !== 'function') throw new Error('Invalid function handler: ' + entry);
}`,
    ...functionEntries,
  ],
  { cwd: outputDir, timeout: 30_000, maxBuffer: 64 * 1024 },
);
const platformFiles = (await filesIn(outputDir)).filter(
  (filename) => !filename.startsWith(builtStaticDir + path.sep),
);
const platformBytes = (
  await Promise.all(platformFiles.map(async (filename) => (await stat(filename)).size))
).reduce((sum, bytes) => sum + bytes, 0);
const compiledFiles = [];
for (const filename of await filesIn(builtStaticDir)) {
  const local = '/' + path.relative(builtStaticDir, filename).split(path.sep).join('/');
  if (!publicFiles.has(local))
    compiledFiles.push({ filename, local, bytes: (await stat(filename)).size });
}
if (!compiledFiles.some((file) => file.local === '/index.html'))
  throw new Error('Missing production index.html. Run npm run build first.');
const compiledBytes = compiledFiles.reduce((sum, file) => sum + file.bytes, 0);
const allSourceFiles = await filesIn(path.join(root, 'src'));
const sourceFiles = allSourceFiles.filter(
  (file) => /\.(?:jsx?|tsx?|css|json)$/.test(file) && !/\.test\./.test(file),
);
const licenseBuffers = new Map(
  await Promise.all(
    allSourceFiles
      .filter(
        (file) => file.includes('/licenses/') || /^LICENSE.*\.txt$/i.test(path.basename(file)),
      )
      .map(async (file) => [
        '/licenses/' + path.relative(path.join(root, 'src'), file).split(path.sep).join('/'),
        await readFile(file),
      ]),
  ),
);
const sourceText = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join(
  '\n',
);
const directAssets = new Set();
const filmDemoVideo = '/assets/c56742d90c78dd32.mp4';
if (!publicFiles.has(filmDemoVideo)) throw new Error('The interactive film demo video is missing.');
directAssets.add(filmDemoVideo);
for (const local of publicFiles.keys()) {
  if (
    local.startsWith('/assets/icons/') ||
    local.startsWith('/film-runtime/') ||
    local.startsWith('/licenses/') ||
    /\.(?:woff2?|ttf|otf)$/.test(local)
  )
    directAssets.add(local);
}
for (const local of sourceText.match(/\/assets\/[A-Za-z0-9_./-]+/g) || []) {
  if (publicFiles.has(local)) directAssets.add(local);
}
// Concatenated STATIC + pluginIcons[name] URLs are source-backed, too.
for (const [source, targets] of mappingVariants) {
  const basename = source.split('/').at(-1)?.split('?')[0];
  if (sourceText.includes(source) || (basename?.length > 12 && sourceText.includes(basename)))
    for (const target of targets) if (publicFiles.has(target)) directAssets.add(target);
}

const externalTargets = new Set();
const externalMedia = [];
// The single 16-minute public class otherwise occupies 36 MB of the 100 MB upload.
// Preserve its exact public source, never substitute another video or a placeholder.
for (const item of Object.values(original['academy-details'].masterclasses)) {
  const local = item.videoUrl;
  const file = publicFiles.get(local);
  if (file?.bytes > 30_000_000 && inverse.has(local)) {
    externalTargets.add(local);
    externalMedia.push({ local, source: inverse.get(local), bytes: file.bytes });
  }
}
// These two original CLI showcase videos are public source URLs in code, rather
// than fixed local paths. Keep those sources without spending 35 MB on copies.
for (const local of directAssets) {
  const source = inverse.get(local);
  if (
    source &&
    /\/showcase-[^/]+\.mp4$/.test(source) &&
    publicFiles.get(local)?.bytes > 10_000_000 &&
    !sourceText.includes(local)
  ) {
    externalTargets.add(local);
    externalMedia.push({ local, source, bytes: publicFiles.get(local).bytes });
  }
}
for (const local of ['/assets/8c8f05d90c062d0a.webp', '/assets/d56bdee7bcce5551.mp4']) {
  const source = inverse.get(local);
  if (!source || !publicFiles.has(local))
    throw new Error(`Missing provenance for bounded public media sample: ${local}`);
  externalTargets.add(local);
  externalMedia.push({ local, source, bytes: publicFiles.get(local).bytes });
}
// These captured public media are referenced by representative secondary data but
// can stay as their exact original CDN URLs to keep the Hobby package bounded.
for (const local of [
  '/assets/97549fdcbab9f7b9.webm',
  '/assets/8e19a70a725ce27d.webm',
  '/assets/c5d4db0f08f96957.mp4',
]) {
  const source = inverse.get(local);
  if (!source || !publicFiles.has(local))
    throw new Error(`Missing provenance for bounded public media sample: ${local}`);
  externalTargets.add(local);
  externalMedia.push({ local, source, bytes: publicFiles.get(local).bytes });
}
for (const local of externalTargets) directAssets.delete(local);

function preservePublicSource(value) {
  if (typeof value === 'string') {
    let result = value;
    for (const local of externalTargets) result = result.split(local).join(inverse.get(local));
    return result;
  }
  if (Array.isArray(value)) return value.map(preservePublicSource);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, preservePublicSource(item)]),
    );
  return value;
}

function references(value, assets, snapshots) {
  if (typeof value === 'string') {
    for (const mapped of mappingVariants.get(value) || [])
      if (!externalTargets.has(mapped)) assets.add(mapped);
    for (const source of value.match(/https?:[^\s"'<>\\)]+/g) || []) {
      for (const local of mappingVariants.get(source) || [])
        if (!externalTargets.has(local)) assets.add(local);
    }
    for (const local of value.match(/\/(?:assets|data)\/[A-Za-z0-9_./-]+/g) || []) {
      if (local.startsWith('/data/canvas-snapshots/')) snapshots.add(local);
      else if (local.startsWith('/assets/') && !externalTargets.has(local)) assets.add(local);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) references(item, assets, snapshots);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) references(item, assets, snapshots);
  }
}

const snapshotCache = new Map();
async function snapshot(local) {
  if (!snapshotCache.has(local)) {
    const file = publicFiles.get(local);
    if (!file) throw new Error(`Selected real canvas snapshot is missing: ${local}`);
    const buffer = await readFile(file.filename);
    const document = JSON.parse(
      (local.endsWith('.gz') ? gunzipSync(buffer) : buffer).toString('utf8'),
    );
    snapshotCache.set(local, document);
  }
  return snapshotCache.get(local);
}

const galleryId = (item) => item.templateUuid || item.id;
const skillId = (item) => item.templateUuid || item.skillUuid;
const allGallery = new Map();
for (const item of [
  ...original['gallery-all'].allItems,
  ...original['gallery-all'].items,
  ...original.gallery.items,
  ...original['gallery-categories'].flatMap((category) => category.items || []),
]) {
  if (!allGallery.has(galleryId(item))) allGallery.set(galleryId(item), item);
}
const allSkills = new Map();
for (const item of [
  ...original.skills.items,
  ...original['skills-recommended'].list,
  ...Object.values(original['skill-details']).map((record) => record.skill),
]) {
  if (!allSkills.has(skillId(item))) allSkills.set(skillId(item), item);
}
const commonSource = sourceText.match(/COMMON_SKILL_TEMPLATE_IDS = \[([\s\S]*?)\]/)?.[1] || '';
const commonIds = commonSource.match(/[a-f\d]{32}/g) || [];
const sourceFallbackIds = [
  '00357d85c34c445eac9f0c8735017807',
  '4a2899016c374656ab016803f6a20087',
  '0e61a57cebde4bc7ac962cf743c1ef00',
];
const selected = {
  gallery: new Set(['e0098a0a61f347a59aca05670f70318e']),
  skills: new Set(commonIds.filter((id) => allSkills.has(id))),
  tutorials: new Set(),
  articles: new Set(),
  masterclasses: new Set(Object.keys(original['academy-details'].masterclasses)),
  activities: new Set([61, 62]),
  features: new Set(),
  chatShares: new Set(['6mhEdMgP4x']),
};
for (const id of sourceFallbackIds) if (allSkills.has(id)) selected.skills.add(id);

function mediaCost(value) {
  const assets = new Set();
  references(value, assets, new Set());
  return [...assets].reduce((sum, local) => sum + (publicFiles.get(local)?.bytes || 0), 0);
}

function caseShareId(value) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://www.liblib.tv');
    return url.pathname.endsWith('/canvas/chat-share') ? url.searchParams.get('shareId') : null;
  } catch {
    return null;
  }
}

function sampleSkill(item) {
  if (!item) return item;
  const result = structuredClone(item);
  let stored;
  try {
    stored = JSON.parse(result.snapshotData || '{}');
  } catch {
    // Retain the source's invalid legacy string; do not manufacture Skill content.
  }
  const cases =
    result.caseItems ||
    stored?.caseItems ||
    (stored?.productionCaseUrls || result.productionCaseUrls || []).map((url, index) => ({
      productionCaseUrl: url,
      canvasCaseUrl: index === 0 ? stored?.canvasCaseUrl || result.canvasCaseUrl : undefined,
    }));
  if (cases?.length) {
    const available = cases.filter((item) => {
      const shareId = caseShareId(item.canvasCaseUrl);
      return !shareId || original['chat-shares'][shareId];
    });
    const cost = (item) => {
      const shareId = caseShareId(item.canvasCaseUrl);
      return mediaCost([
        item,
        shareId && !selected.chatShares.has(shareId) ? original['chat-shares'][shareId] : null,
      ]);
    };
    const smallest = available.sort((a, b) => cost(a) - cost(b))[0];
    result.caseItems = smallest ? [smallest] : [];
    if (result.productionCaseUrls)
      result.productionCaseUrls = smallest ? [smallest.productionCaseUrl] : [];
    if (result.canvasCasePowers)
      result.canvasCasePowers = smallest ? [smallest.canvasCasePower] : [];
    if ('canvasCaseUrl' in result) result.canvasCaseUrl = smallest?.canvasCaseUrl || '';
    if (stored) {
      if (stored.caseItems) stored.caseItems = result.caseItems;
      if (stored.productionCaseUrls)
        stored.productionCaseUrls = smallest ? [smallest.productionCaseUrl] : [];
      if (stored.canvasCasePowers)
        stored.canvasCasePowers = smallest ? [smallest.canvasCasePower] : [];
      if ('canvasCaseUrl' in stored) stored.canvasCaseUrl = smallest?.canvasCaseUrl || '';
    }
  }
  if (stored && result.snapshotData) result.snapshotData = JSON.stringify(stored);
  return result;
}

const cheapestTutorials = Object.entries(original['academy-details'].tutorials).sort(
  (a, b) => mediaCost(a[1]) - mediaCost(b[1]),
);
if (cheapestTutorials.length) selected.tutorials.add(cheapestTutorials[0][0]);
const cheapestArticles = Object.entries(original['academy-details'].articles).sort(
  (a, b) => mediaCost(a[1]) - mediaCost(b[1]),
);
for (const [id] of cheapestArticles.slice(0, 4)) selected.articles.add(id);
for (const version of original.versions.list) {
  const cheapest = [...version.features].sort((a, b) => mediaCost(a) - mediaCost(b))[0];
  if (cheapest) selected.features.add(cheapest.id);
}

function filterWorks(value) {
  if (Array.isArray(value)) {
    const works = value.filter(
      (item) => !item?.templateUuid || !item?.projectUuid || selected.gallery.has(galleryId(item)),
    );
    return works.map(filterWorks);
  }
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, filterWorks(item)]),
    );
    if (Array.isArray(result.list) && ('hasMore' in result || 'total' in result)) {
      result.hasMore = false;
      result.total = result.list.length;
    }
    return result;
  }
  return value;
}

function dataSample() {
  const gallery = [...selected.gallery].map((id) => allGallery.get(id));
  const galleryDetails = Object.fromEntries(
    [...selected.gallery].map((id) => {
      const record = original['gallery-details'][id];
      if (!record?.detail) throw new Error(`Selected work has no real detail: ${id}`);
      return [
        id,
        {
          ...record,
          recommendList: (record.recommendList || []).filter((item) =>
            selected.gallery.has(galleryId(item)),
          ),
        },
      ];
    }),
  );
  const authorIds = new Set(gallery.map((item) => item.ownerUuid).filter(Boolean));
  const profiles = Object.fromEntries(
    Object.entries(original.profiles)
      .filter(([id]) => authorIds.has(id))
      .map(([id, value]) => [id, filterWorks(value)]),
  );
  const skills = [...selected.skills].map((id) => sampleSkill(allSkills.get(id)));
  const skillDetails = Object.fromEntries(
    [...selected.skills]
      .filter((id) => original['skill-details'][id])
      .map((id) => [
        id,
        {
          ...original['skill-details'][id],
          skill: sampleSkill(original['skill-details'][id].skill),
        },
      ]),
  );
  const academyDetails = Object.fromEntries(
    ['tutorials', 'articles', 'masterclasses'].map((kind) => [
      kind,
      Object.fromEntries(
        Object.entries(original['academy-details'][kind]).filter(([id]) => selected[kind].has(id)),
      ),
    ]),
  );
  const academy = {
    ...original.academy,
    ...Object.fromEntries(
      ['tutorials', 'articles', 'masterclasses'].map((kind) => [
        kind,
        original.academy[kind].filter((item) =>
          selected[kind].has(item.tutorialUuid || item.articleUuid || item.masterclassUuid),
        ),
      ]),
    ),
  };
  const activities = original.activities.items
    .filter((item) => selected.activities.has(item.activityId))
    .map((item) => ({
      ...item,
      awardWorks: (item.awardWorks || []).filter((work) => selected.gallery.has(galleryId(work))),
      awardUuids: (item.awardUuids || '')
        .split(',')
        .filter((id) => selected.gallery.has(id))
        .join(','),
    }));
  const versions = original.versions.list.map((version) => ({
    ...version,
    features: version.features.filter((feature) => selected.features.has(feature.id)),
  }));
  const data = new Map();
  for (const name of [
    'home',
    'shell-config',
    'models',
    'storyboard-video-support',
    'video-model-support',
    'image-model-support',
    'script-presets',
    'script-text-support',
    'video-compose-agent-config',
    'member',
    'member-model-cards',
    'member-packages',
    'locale-zh',
    'player-config',
    'academy-courses',
    'canvas-example',
  ])
    data.set(name, original[name]);
  data.set('remote-configs', { 292: original['remote-configs']['292'] });
  data.set('gallery', { items: gallery, total: gallery.length, hasMore: false });
  data.set('gallery-all', { items: gallery, allItems: gallery, hasMore: false });
  data.set(
    'gallery-categories',
    original['gallery-categories'].map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => selected.gallery.has(galleryId(item))),
    })),
  );
  data.set('gallery-details', galleryDetails);
  for (const [id, detail] of Object.entries(galleryDetails))
    data.set(`gallery-details/${id}`, detail);
  data.set('profiles', profiles);
  data.set('skills', { ...original.skills, items: skills });
  const recommended = original['skills-recommended'].list
    .filter((item) => selected.skills.has(skillId(item)))
    .map(sampleSkill);
  data.set('skills-recommended', { list: recommended, total: recommended.length, hasMore: false });
  data.set('skill-details', skillDetails);
  data.set('academy', academy);
  data.set('academy-details', academyDetails);
  data.set('activities', { items: activities });
  data.set('versions', { list: versions, total: versions.length, hasMore: false });
  const features = versions.flatMap((version) => version.features);
  data.set('features', { list: features, total: features.length, hasMore: false });
  const chatIds = new Set(selected.chatShares);
  for (const item of [...skills, ...Object.values(skillDetails).map((detail) => detail.skill)])
    for (const sample of item.caseItems || []) {
      const shareId = caseShareId(sample.canvasCaseUrl);
      if (shareId) chatIds.add(shareId);
    }
  data.set(
    'chat-shares',
    Object.fromEntries(Object.entries(original['chat-shares']).filter(([id]) => chatIds.has(id))),
  );
  data.set('secondary', {
    ...original.secondary,
    ...academy,
    activities,
    versions,
    details: academyDetails,
    uiAssets: {},
  });
  return new Map([...data].map(([name, value]) => [name, preservePublicSource(value)]));
}

async function prepare() {
  const data = dataSample();
  const assets = new Set(directAssets);
  const snapshots = new Set();
  for (const value of data.values()) references(value, assets, snapshots);
  const processed = new Set();
  while (processed.size < snapshots.size) {
    for (const local of snapshots) {
      if (processed.has(local)) continue;
      processed.add(local);
      references(await snapshot(local), assets, snapshots);
    }
  }
  const missing = [...assets].filter(
    (local) => !publicFiles.has(local) && /\.[a-z\d]{2,5}$/i.test(local),
  );
  if (missing.length) throw new Error(`Selected local assets are missing: ${missing.join(', ')}`);
  const filteredMap = Object.fromEntries(
    Object.entries(original['asset-map']).filter(
      ([, local]) => assets.has(local) && !externalTargets.has(local),
    ),
  );
  data.set('asset-map', filteredMap);
  const secondary = data.get('secondary');
  secondary.uiAssets = Object.fromEntries(
    Object.entries(original.secondary.uiAssets).filter(([, local]) => assets.has(local)),
  );
  data.set(
    'ui-assets',
    Object.fromEntries(
      Object.entries(original['ui-assets']).filter(([, local]) => assets.has(local)),
    ),
  );
  const buffers = new Map(
    [...data].map(([name, value]) => [
      `/data/${name}.json`,
      Buffer.from(JSON.stringify(value) + '\n'),
    ]),
  );
  for (const [local, buffer] of licenseBuffers) buffers.set(local, buffer);
  const publicCopies = new Set([...assets, ...snapshots].filter((local) => publicFiles.has(local)));
  const bytes =
    platformBytes +
    compiledBytes +
    [...buffers.values()].reduce((sum, buffer) => sum + buffer.byteLength, 0) +
    [...publicCopies].reduce((sum, local) => sum + publicFiles.get(local).bytes, 0);
  return { data, buffers, publicCopies, bytes };
}

let prepared = await prepare();
console.log(`Required route and media sample: ${(prepared.bytes / 1_000_000).toFixed(2)} MB`);
if (prepared.bytes > maximumBytes)
  throw new Error(
    `Required sample exceeds ${maximumBytes} bytes: ${prepared.bytes}; largest assets: ` +
      JSON.stringify(
        [...prepared.publicCopies]
          .map((local) => ({ local, bytes: publicFiles.get(local).bytes }))
          .sort((a, b) => b.bytes - a.bytes)
          .slice(0, 20),
      ),
  );

const candidates = [];
// Cover every original gallery tab before filling the scroll/search sample.
for (const category of original['gallery-categories']) {
  const available = (category.items || []).filter((item) => {
    const id = galleryId(item);
    return (
      original['gallery-details'][id]?.detail &&
      publicFiles.has(`/data/canvas-snapshots/${id}.json.gz`)
    );
  });
  available.sort((a, b) => mediaCost(a) - mediaCost(b));
  if (available.length) candidates.push(['gallery', galleryId(available[0])]);
}
const galleryCandidates = [...allGallery.values()]
  .filter((item) => {
    const id = galleryId(item);
    return (
      original['gallery-details'][id]?.detail &&
      publicFiles.has(`/data/canvas-snapshots/${id}.json.gz`)
    );
  })
  .sort((a, b) => mediaCost(a) - mediaCost(b));
candidates.push(...galleryCandidates.slice(0, 70).map((item) => ['gallery', galleryId(item)]));
const skillCandidates = [...allSkills.values()].sort(
  (a, b) => mediaCost(sampleSkill(a)) - mediaCost(sampleSkill(b)),
);
// Real source categories and public details, including a Markdown/file-tree example.
const tagIds = new Set();
for (const item of skillCandidates) {
  const tag = item.tags?.[0]?.id;
  if (!tagIds.has(tag)) {
    tagIds.add(tag);
    candidates.push(['skills', skillId(item)]);
  }
}
candidates.push(
  ...skillCandidates
    .filter((item) => original['skill-details'][skillId(item)])
    .map((item) => ['skills', skillId(item)]),
  ...skillCandidates.slice(0, 35).map((item) => ['skills', skillId(item)]),
  ...cheapestArticles.map(([id]) => ['articles', id]),
  ...original.versions.list.flatMap((version) =>
    [...version.features]
      .sort((a, b) => mediaCost(a) - mediaCost(b))
      .map((item) => ['features', item.id]),
  ),
  ...cheapestTutorials.slice(1).map(([id]) => ['tutorials', id]),
);
const rejected = [];
for (const [kind, id] of candidates) {
  if (selected[kind].has(id)) continue;
  if (kind === 'gallery' && selected.gallery.size >= 24) continue;
  if (kind === 'skills' && selected.skills.size >= 30) continue;
  if (kind === 'articles' && selected.articles.size >= 7) continue;
  if (kind === 'tutorials' && selected.tutorials.size >= 3) continue;
  selected[kind].add(id);
  const candidate = await prepare();
  if (candidate.bytes <= targetBytes) prepared = candidate;
  else {
    selected[kind].delete(id);
    rejected.push({ kind, id, wouldUseBytes: candidate.bytes });
  }
}

const totalBytes = prepared.bytes;
if (totalBytes > maximumBytes)
  throw new Error(`Vercel sample exceeds ${maximumBytes} bytes: ${totalBytes}`);

// Stage the replacement before deleting any compiled static files that we are copying.
const stagedStaticDir = path.join(root, 'artifacts/vercel-static-sample');
await rm(stagedStaticDir, { recursive: true, force: true });
await mkdir(stagedStaticDir, { recursive: true });
for (const file of compiledFiles) {
  const destination = path.join(stagedStaticDir, file.local.slice(1));
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(file.filename, destination);
}
for (const local of prepared.publicCopies) {
  const destination = path.join(stagedStaticDir, local.slice(1));
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(publicFiles.get(local).filename, destination);
}
for (const [local, buffer] of prepared.buffers) {
  const destination = path.join(stagedStaticDir, local.slice(1));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, buffer);
}
await rm(builtStaticDir, { recursive: true, force: true });
await cp(stagedStaticDir, builtStaticDir, { recursive: true });
await rm(stagedStaticDir, { recursive: true, force: true });

const samplePaths = [
  '/',
  '/show',
  ...[...selected.gallery]
    .slice(0, 3)
    .flatMap((id) => [`/detail/${id}`, `/canvas/share?templateUuid=${id}`]),
  '/skill',
  ...Object.keys(prepared.data.get('skill-details'))
    .slice(0, 3)
    .map((id) => `/skill/share?uuid=${id}`),
  '/skill/create',
  '/canvas',
  '/canvas/chat-share?shareId=6mhEdMgP4x',
  '/project',
  '/assets',
  '/academy',
  ...[...selected.tutorials].map((id) => `/academy/tutorial/${id}`),
  ...[...selected.articles].slice(0, 2).map((id) => `/academy/article/${id}`),
  ...[...selected.masterclasses].map((id) => `/academy/masterclass/${id}`),
  ...Object.keys(original['academy-courses'].courses).map((id) => `/academy/course/${id}`),
  ...[...selected.activities].map((id) => `/activity/${id}`),
  '/feature-updates',
  '/plugin',
  '/blender',
  '/3d-box',
  '/animation-preview',
  '/interactive-film',
];
const report = {
  version: 1,
  createdAt: new Date().toISOString(),
  output: path.relative(root, outputDir),
  targetBytes,
  maximumBytes,
  bytes: totalBytes,
  decimalMegabytes: +(totalBytes / 1_000_000).toFixed(2),
  files:
    compiledFiles.length +
    prepared.publicCopies.size +
    prepared.buffers.size +
    platformFiles.length,
  functionsAndPlatform: { files: platformFiles.length, bytes: platformBytes },
  compiledFiles: compiledFiles.length,
  compiledBytes,
  localPublicAssets: {
    count: [...prepared.publicCopies].filter((local) => local.startsWith('/assets/')).length,
    bytes: [...prepared.publicCopies]
      .filter((local) => local.startsWith('/assets/'))
      .reduce((sum, local) => sum + publicFiles.get(local).bytes, 0),
  },
  realCanvasSnapshots: {
    count: [...prepared.publicCopies].filter((local) => local.startsWith('/data/')).length,
    bytes: [...prepared.publicCopies]
      .filter((local) => local.startsWith('/data/'))
      .reduce((sum, local) => sum + publicFiles.get(local).bytes, 0),
  },
  samples: Object.fromEntries(
    Object.entries(selected).map(([kind, ids]) => [kind, { count: ids.size, ids: [...ids] }]),
  ),
  filteredData: [
    'gallery',
    'gallery-all',
    'gallery-categories',
    'gallery-details',
    'gallery-details/*',
    'profiles',
    'skills',
    'skills-recommended',
    'skill-details (one actual case per selected Skill)',
    'academy',
    'academy-details',
    'activities',
    'versions',
    'features',
    'chat-shares',
    'secondary',
    'remote-configs (only runtime-consumed 292)',
    'ui-assets',
    'asset-map',
    'canvas-snapshots/*',
  ],
  excludedCaptureData: ['sitemap-content', 'skills-recommended-full-remote'],
  retainedCommonSkillIds: [...selected.skills].filter((id) => commonIds.includes(id)),
  sourceFallbackSkillIds: sourceFallbackIds,
  existingMissingFallbackDetails: sourceFallbackIds.filter((id) => !original['skill-details'][id]),
  publicSourcesPreservedWithoutLocalCopy: externalMedia,
  rejected,
  samplePaths,
  limitations: [
    'Representative static contents are bounded; compiled Functions and original Vercel routing are retained. Original public/ and dist/ remain unchanged.',
    'All compiled routes, editor chunks, decoder assets, fonts and icon variants are retained.',
    'Selected works keep their own real detail and canvas snapshot; recommendations and profile works use the same selected set.',
    'Large public masterclass/CLI/Skill media and one public banner use exact captured original URLs. Packaging does not establish remote availability.',
    'Existing unmapped public media URLs remain as in the original snapshot; packaging does not download remote content.',
    'Original-site authentication, generation and payment writes remain unconnected. Film publishing uses only the configured operator-owned Blob store; authoring remains local.',
  ],
};
const packagedChatIds = Object.keys(prepared.data.get('chat-shares'));
report.samples.chatShares = { count: packagedChatIds.length, ids: packagedChatIds };
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    bytes: totalBytes,
    megabytes: report.decimalMegabytes,
    files: report.files,
    samples: Object.fromEntries(Object.entries(selected).map(([kind, ids]) => [kind, ids.size])),
    report: path.relative(root, reportPath),
  }),
);
