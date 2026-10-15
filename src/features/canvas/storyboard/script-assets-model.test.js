import { describe, expect, it } from 'vitest';
import { initializeStoryboardPromptState } from './prompt-state.js';
import {
  planScriptAssetMutation,
  scriptAssetCandidates,
  scriptAssetDeleteInfo,
  scriptAssetFingerprint,
  scriptAssetRenamePreview,
} from './script-assets-model.js';

const asset = (id = 'asset', extra = {}) => ({
  id,
  name: 'Alice',
  role: 'character',
  description: 'Alice wears blue',
  status: 'ready',
  linkedNodeId: 'image',
  thumbnailUrl: '/old.png',
  ...extra,
});
const image = (id = 'image', url = '/old.png', extra = {}) => ({
  id,
  type: 'image',
  data: { type: 'image', name: id, url: [url], ...extra },
});
const script = (assets = [asset()], rows = []) => ({
  id: 'script',
  type: 'script-v2',
  data: {
    type: 'script-v2',
    assets: { characters: assets, scenes: [], props: [], opaque: true },
    rows,
    opaque: true,
  },
});
const run = (nodes, edges, command) =>
  planScriptAssetMutation({
    nodes,
    edges,
    scriptId: 'script',
    command,
    now: 123,
    makeId: () => 'new-id',
  });
const data = (plan) => plan.nodes.find((node) => node.id === 'script').data;

describe('ScriptV2 asset graph plans', () => {
  it('adds a pending item immediately without a name limit or uniqueness rule', () => {
    const plan = run([script()], [], { type: 'add', role: 'scene' });
    expect(plan).toMatchObject({ ok: true, changed: true, assetId: 'new-id' });
    expect(data(plan).assets.scenes[0]).toEqual({
      id: 'new-id',
      role: 'scene',
      name: '',
      description: '',
      status: 'pending',
      createdAt: 123,
      updatedAt: 123,
    });
    expect(data(plan).assets.opaque).toBe(true);
  });

  it('reuses images and keeps ordinary edges until the last bound asset leaves', () => {
    const nodes = [script([asset(), asset('second')]), image(), image('next', '/next.png')];
    const edges = [
      { id: 'ordinary', source: 'image', target: 'script' },
      { id: 'portrait', source: 'image', target: 'script', data: { portraitVirtual: true } },
    ];
    const replaced = run(nodes, edges, { type: 'replace', assetId: 'asset', nodeId: 'next' });
    expect(replaced.edges.map((edge) => edge.id)).toEqual(['ordinary', 'portrait', 'new-id']);
    const cleared = run(replaced.nodes, replaced.edges, { type: 'clear', assetId: 'second' });
    expect(cleared.edges.map((edge) => edge.id)).toEqual(['portrait', 'new-id']);
    expect(cleared.nodes.find((node) => node.id === 'image')).toBe(nodes[1]);
    expect(data(cleared).assets.characters[1]).toMatchObject({
      status: 'ready',
      linkedNodeId: undefined,
      thumbnailUrl: undefined,
    });
  });

  it('clears structured refs while preserving spoken text, prompts and characterRef', () => {
    const row = {
      id: 'row',
      hiddenUuid: 'hidden',
      characters: [{ characterAssetId: 'asset', characterName: 'Alice' }],
      plotDescription: 'Alice walks',
      imageGenerationPrompt: '@Alice',
      finalImagePromptEntityRefs: [{ assetId: 'asset', text: 'Alice' }],
      dialogueLines: [
        {
          characterRef: 'asset',
          text: 'Hello Alice',
          entityRefs: [{ assetId: 'asset', text: 'Alice' }],
        },
      ],
    };
    const plan = run([script([asset()], [row]), image()], [], {
      type: 'delete',
      assetId: 'asset',
      policy: 'clear_chars',
    });
    expect(plan.referencesCleared).toBe(true);
    expect(data(plan).rows[0]).toMatchObject({
      characters: [],
      plotDescription: 'Alice walks',
      imageGenerationPrompt: '@Alice',
      finalImagePromptEntityRefs: [],
      dialogueLines: [{ characterRef: 'asset', text: 'Hello Alice', entityRefs: [] }],
    });
    expect(data(plan).assets.characters).toEqual([]);
    expect(plan.nodes.length).toBe(2);
  });

  it('retains the source single-character role-removal guard and leaves keep_text rows alone', () => {
    const row = {
      id: 'row',
      sceneAssetIds: ['asset'],
      finalImagePromptEntityRefs: [{ assetId: 'asset', text: 'A' }],
    };
    const node = script([], [row]);
    node.data.assets.scenes = [asset('asset', { role: 'scene', name: 'A' })];
    const keep = run([node], [], { type: 'delete', assetId: 'asset', policy: 'keep_text' });
    expect(data(keep).rows[0]).toBe(row);
    const clear = run([node], [], { type: 'delete', assetId: 'asset', policy: 'clear_chars' });
    expect(data(clear).rows[0].sceneAssetIds).toEqual(['asset']);
    expect(data(clear).rows[0].finalImagePromptEntityRefs).toEqual([]);
  });

  it('renames the exact source fields and deliberately omits prompts from the preview', () => {
    const row = {
      id: 'row',
      plotDescription: 'Alice meets Alice',
      imageGenerationPrompt: '@Alice',
      finalImagePromptEntityRefs: [{ assetId: 'asset', text: 'Alice' }],
      dialogueLines: [{ text: 'Alice speaks', entityRefs: [{ assetId: 'asset', text: 'Alice' }] }],
      characters: [{ characterName: 'Alice', characterDescription: 'Alice wears blue' }],
      imagePromptState: 'synced',
    };
    const node = script([asset()], [row]);
    const preview = scriptAssetRenamePreview({ data: node.data, assetId: 'asset', name: 'Bob' });
    expect(preview.map((entry) => entry.field)).not.toContain('imageGenerationPrompt');
    const plan = run([node], [], {
      type: 'rename',
      assetId: 'asset',
      name: ' Bob ',
      syncRows: true,
    });
    expect(data(plan).rows[0]).toMatchObject({
      plotDescription: 'Bob meets Bob',
      imageGenerationPrompt: '@Bob',
      finalImagePromptEntityRefs: [{ assetId: 'asset', text: 'Bob' }],
      dialogueLines: [{ text: 'Bob speaks', entityRefs: [{ assetId: 'asset', text: 'Alice' }] }],
      imagePromptState: 'synced',
    });
  });

  it('rejects a stale text-edit fingerprint without changing the graph', () => {
    const nodes = [script()];
    const old = scriptAssetFingerprint(asset('asset', { description: 'old' }));
    const plan = run(nodes, [], {
      type: 'update',
      assetId: 'asset',
      patch: { description: 'draft' },
      expectedAssetFingerprint: old,
    });
    expect(plan).toMatchObject({
      ok: false,
      changed: false,
      reason: '资产已被更新，请重新打开编辑面板',
    });
    expect(plan.nodes).toBe(nodes);
  });

  it('uses source first-output candidates and its per-role reference-count fallback', () => {
    expect(
      scriptAssetCandidates({
        scriptId: 'script',
        nodes: [
          image('empty', ''),
          image('image'),
          image('video-poster', '/v.png', { assetVideoAssetId: 'v' }),
          { id: 'original', type: 'image', data: { originalUrl: '/original.png' } },
        ],
      }).map((item) => item.id),
    ).toEqual(['image', 'original']);
    const node = script(
      [asset()],
      [
        { id: 'linked', characters: [{ characterAssetId: 'asset', characterName: 'Other' }] },
        { id: 'named', dialogue: 'Alice speaks' },
      ],
    );
    expect(scriptAssetDeleteInfo({ data: node.data, assetId: 'asset' }).rowIds).toEqual(['linked']);
  });

  it('replays the source thumbnail effect only when a prompt state actually changes', () => {
    const row = initializeStoryboardPromptState({
      id: 'row',
      plotDescription: 'old',
      imageGenerationPrompt: 'prompt',
    });
    const staleRow = { ...row, plotDescription: 'changed' };
    const node = script([asset()], [staleRow]);
    const plan = run([node, image(), image('next', '/next.png')], [], {
      type: 'replace',
      assetId: 'asset',
      nodeId: 'next',
    });
    expect(data(plan).rows[0].imagePromptState).toBe('stale');
    const current = run([script([asset()], [row]), image(), image('next', '/next.png')], [], {
      type: 'replace',
      assetId: 'asset',
      nodeId: 'next',
    });
    expect(data(current).rows[0]).toBe(row);
  });
});
