import { describe, expect, it, vi } from 'vitest';
import {
  SCRIPT_WORKFLOW_STEPS,
  hasScriptAssetMedia,
  normalizeScriptStep,
  scriptAssetProgress,
  scriptPromptSelection,
  scriptWorkflowState,
} from './workflow-model.js';

const shot = (patch = {}) => ({
  id: 'shot-1',
  plotDescription: '街道上的两人',
  imageGenerationPrompt: '街道静帧',
  videoMotionPrompt: '向前跟拍',
  ...patch,
});
const asset = (patch = {}) => ({
  id: 'asset-1',
  name: '街道',
  thumbnailUrl: '/street.jpg',
  ...patch,
});
const data = (rowPatch = {}) => ({ rows: [shot(rowPatch)], assets: { scenes: [asset()] } });

describe('ScriptV2 workflow source projection', () => {
  it('allows all three steps and defaults unknown values without enforcing readiness', () => {
    expect(SCRIPT_WORKFLOW_STEPS.map((step) => step.id)).toEqual([
      'confirm-shots',
      'prepare-assets',
      'compose-prompts',
    ]);
    expect(normalizeScriptStep('compose-prompts')).toBe('compose-prompts');
    expect(normalizeScriptStep('asset')).toBe('confirm-shots');
    expect(normalizeScriptStep(null, 'prepare-assets')).toBe('prepare-assets');
  });

  it('keeps an empty script idle and prevents generation or download readiness', () => {
    const result = scriptWorkflowState({ rows: [], assets: {} });
    expect([result.shots.status, result.assets.status, result.prompts.status]).toEqual([
      'idle',
      'idle',
      'idle',
    ]);
    expect([result.shots.hint, result.assets.hint, result.prompts.hint]).toEqual([
      '暂无镜头',
      '暂无资产',
      '暂无提示词',
    ]);
    expect(result).toMatchObject({
      readyCount: 0,
      totalCount: 3,
      allReady: false,
      promptsUsableForGeneration: false,
      outputGenerationReady: false,
    });
  });

  it('counts rendered asset identities and actual media, with source string/object URL resolution', () => {
    const getNodeUrl = vi.fn((id) =>
      id === 'linked' ? { url: ' /actual.png ' } : ['not-a-source-result'],
    );
    const result = scriptWorkflowState(
      {
        rows: [shot(), shot({ id: 'shot-2', plotDescription: ' ', videoMotionPrompt: '' })],
        assets: {
          characters: [asset(), null, { name: '无身份', thumbnailUrl: '/bad.png' }, { id: ' ' }],
          scenes: [asset({ id: 'scene', thumbnailUrl: '', linkedNodeId: ' linked ' })],
          props: [asset({ id: 'prop', thumbnailUrl: ' ', linkedNodeId: 'missing' })],
        },
      },
      { getNodeUrl },
    );
    expect(result.shots).toMatchObject({
      total: 2,
      ready: 1,
      status: 'partial',
      hint: '2个镜头待核对',
    });
    expect(result.assets).toMatchObject({
      total: 3,
      ready: 2,
      status: 'partial',
      hint: '2/3 已生成、还差 1 个',
    });
    expect(result.assets.segments).toEqual([
      { status: 'ready' },
      { status: 'ready' },
      { status: 'default' },
    ]);
    expect(result.prompts).toMatchObject({
      total: 2,
      ready: 1,
      status: 'partial',
      hint: '1/2 已合成',
    });
    expect(getNodeUrl).toHaveBeenCalledWith('linked');
    expect(hasScriptAssetMedia({ linkedNodeId: 'node' }, () => ' /node.png ')).toBe(true);
    expect(hasScriptAssetMedia({ linkedNodeId: 'node' }, () => ({ url: ' ' }))).toBe(false);
  });

  it('distinguishes usable stale prompts from the allReady download requirement', () => {
    const result = scriptWorkflowState(
      data({ imagePromptState: 'stale', videoPromptState: 'synced' }),
    );
    expect(result.prompts).toMatchObject({ ready: 0, status: 'idle' });
    expect(result).toMatchObject({
      readyCount: 2,
      allReady: false,
      promptsUsableForGeneration: true,
      outputGenerationReady: true,
    });
  });

  it('uses explicit paired synced states for stage readiness but still requires nonempty generation text', () => {
    const result = scriptWorkflowState(
      data({
        imageGenerationPrompt: '',
        videoMotionPrompt: '',
        imagePromptState: 'synced',
        videoPromptState: 'synced',
      }),
    );
    expect(result).toMatchObject({ readyCount: 3, allReady: true, outputGenerationReady: false });
    expect(result.prompts.segments).toEqual([{ status: 'ready' }]);
  });

  it('requires both states when either exists and marks prompt generation busy', () => {
    const partial = scriptWorkflowState(data({ imagePromptState: 'synced' }));
    expect(partial.prompts.ready).toBe(0);
    const running = scriptWorkflowState(data({ videoPromptState: 'generating' }));
    expect(running.prompts).toMatchObject({ isBusy: true, segments: [{ status: 'loading' }] });
    expect(running.outputGenerationReady).toBe(false);
  });

  it('shows only matching linked nodes loading and keeps busy assets pending even with old media', () => {
    const snapshot = Object.freeze({
      rows: Object.freeze([Object.freeze(shot())]),
      assets: Object.freeze({
        scenes: Object.freeze([Object.freeze(asset({ linkedNodeId: 'linked' }))]),
      }),
    });
    const result = scriptWorkflowState(snapshot, {
      assetProgress: { inProgress: true, generatingCount: 9, generatingLinkedNodeIds: ['linked'] },
    });
    expect(result.assets).toMatchObject({
      ready: 1,
      total: 1,
      status: 'partial',
      isBusy: true,
      segments: [{ status: 'loading' }],
    });
    expect(result.allReady).toBe(false);
    expect(result.outputGenerationReady).toBe(false);
    const explicitEmpty = scriptWorkflowState(snapshot, {
      assetProgress: { inProgress: true, generatingCount: 1, generatingLinkedNodeIds: [] },
    });
    expect(explicitEmpty.assets.segments).toEqual([{ status: 'ready' }]);
  });

  it('allocates fallback loading slots only to missing assets when linked IDs are absent', () => {
    const result = scriptWorkflowState(
      {
        assets: {
          scenes: [
            asset(),
            asset({ id: '2', thumbnailUrl: '' }),
            asset({ id: '3', thumbnailUrl: '' }),
          ],
        },
      },
      { assetProgress: { inProgress: true, generatingCount: 1 } },
    );
    expect(result.assets.segments).toEqual([
      { status: 'ready' },
      { status: 'loading' },
      { status: 'default' },
    ]);
  });

  it('derives asset generation only from linked actual task loading, averaging known percentages', () => {
    const snapshot = {
      assets: {
        scenes: [
          asset({ id: '1', linkedNodeId: 'running' }),
          asset({ id: '2', linkedNodeId: 'running' }),
          asset({ id: '3', linkedNodeId: 'no-percent' }),
          asset({ id: '4', linkedNodeId: 'done' }),
          asset({ id: '5', linkedNodeId: 'another' }),
          asset({ id: '6', linkedNodeId: 'absent' }),
        ],
      },
    };
    const nodes = [
      { id: 'running', data: { taskInfo: { loading: true, progressPercent: 41.9 } } },
      { id: 'no-percent', data: { taskInfo: { loading: true, progressPercent: '90' } } },
      { id: 'done', data: { taskInfo: { loading: false, status: 1, progressPercent: 100 } } },
      { id: 'another', data: { taskInfo: { loading: true, progressPercent: 10 } } },
    ];
    const progress = scriptAssetProgress(snapshot, nodes);
    expect(progress).toEqual({
      inProgress: true,
      generatingCount: 4,
      generatingLinkedNodeIds: ['running', 'running', 'no-percent', 'another'],
      progressPercent: 31,
    });
    expect(
      scriptWorkflowState({ ...data(), assets: snapshot.assets }, { assetProgress: progress })
        .allReady,
    ).toBe(false);
  });

  it('returns the idle progress shape when missing, unlinked or status-only tasks exist', () => {
    const snapshot = { assets: { scenes: [asset({ linkedNodeId: 'status-only' })] } };
    expect(
      scriptAssetProgress(snapshot, [{ id: 'status-only', data: { taskInfo: { status: 1 } } }]),
    ).toEqual({ inProgress: false, generatingCount: 0, progressPercent: undefined });
    expect(scriptAssetProgress(null)).toEqual({
      inProgress: false,
      generatingCount: 0,
      progressPercent: undefined,
    });
  });

  it('defaults batch selection to missing prompt pairs and reconciles explicit row IDs', () => {
    const rows = [
      shot(),
      shot({ id: 'missing', videoMotionPrompt: ' ' }),
      shot({ id: 'stale', imagePromptState: 'stale' }),
    ];
    expect([...scriptPromptSelection(rows)]).toEqual(['missing']);
    expect([...scriptPromptSelection(rows, ['stale', 'deleted', 'shot-1', 'stale'])]).toEqual([
      'stale',
      'shot-1',
    ]);
    expect([...scriptPromptSelection(rows, [])]).toEqual([]);
  });
});
