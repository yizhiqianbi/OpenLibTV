import { describe, expect, it } from 'vitest';
import {
  reconcileScriptMediaHistoryRows,
  scriptPromptFailureInfo,
  setActiveScriptMediaVersion,
} from './script-media-history-model.js';
import { storyboardRowHashes } from './prompt-state.js';

const version = (versionId, isActive, extra = {}) => ({
  versionId,
  nodeId: `node-${versionId}`,
  createdAt: 123,
  isActive,
  ...extra,
});
const canonical = (row, index) => {
  const value = {
    shotNumber: index + 1,
    imagePromptState: row.imageGenerationPrompt ? 'synced' : 'none',
    videoPromptState: row.videoMotionPrompt ? 'synced' : 'none',
    ...row,
  };
  return { ...value, ...storyboardRowHashes(value) };
};

describe('ScriptV2 media active version', () => {
  it.each(['image', 'video'])(
    'switches %s history flags and preserves canonical rows, order and prompt data',
    (kind) => {
      const field = `${kind}Versions`;
      const promptRefs = [{ kind: 'character', id: 'c1', mentionText: '@角色' }];
      const rows = [
        { id: 'other', [field]: [version('other', true)] },
        {
          id: 'shot',
          hiddenUuid: 'hidden',
          imageGenerationPrompt: '@角色 原稿',
          finalImagePromptEntityRefs: promptRefs,
          imagePromptState: 'stale',
          videoPromptState: 'generating',
          currentImageNodeId: 'legacy-image',
          currentVideoNodeId: 'legacy-video',
          [field]: [version('v2', false, { sourceImageVersionId: 'source' }), version('v1', true)],
          metadata: { untouched: true },
        },
      ].map(canonical);
      const next = setActiveScriptMediaVersion(rows, 'shot', kind, 'v2');
      expect(next).not.toBe(rows);
      expect(next[0]).toBe(rows[0]);
      expect(next[1]).toEqual({
        ...rows[1],
        [field]: [
          { ...rows[1][field][0], isActive: true },
          { ...rows[1][field][1], isActive: false },
        ],
      });
      expect(next[1].finalImagePromptEntityRefs).toBe(promptRefs);
      expect(next[1].metadata).toBe(rows[1].metadata);
      expect(rows[1][field].map((item) => item.isActive)).toEqual([false, true]);
    },
  );

  it('repairs multiple active versions even when the chosen version is already active', () => {
    const inactive = version('v3', false);
    const rows = [
      { id: 'shot', imageVersions: [version('v1', true), version('v2', true), inactive] },
    ].map(canonical);
    const next = setActiveScriptMediaVersion(rows, 'shot', 'image', 'v2');
    expect(next[0].imageVersions.map((item) => item.isActive)).toEqual([false, true, false]);
    expect(next[0].imageVersions[1]).toBe(rows[0].imageVersions[1]);
    expect(next[0].imageVersions[2]).toBe(inactive);
  });

  it('returns the same rows for already sole active, missing rows/versions and unsupported kind', () => {
    const rows = [{ id: 'shot', imageVersions: [version('v1', true), version('v2', false)] }];
    expect(setActiveScriptMediaVersion(rows, 'shot', 'image', 'v1')).toBe(rows);
    expect(setActiveScriptMediaVersion(rows, 'absent', 'image', 'v2')).toBe(rows);
    expect(setActiveScriptMediaVersion(rows, 'shot', 'image', 'absent')).toBe(rows);
    expect(setActiveScriptMediaVersion(rows, 'shot', 'audio', 'v2')).toBe(rows);
    expect(setActiveScriptMediaVersion(rows, 'shot', 'video', 'v2')).toBe(rows);
    expect(setActiveScriptMediaVersion(rows, 'shot', 'image', null)).toBe(rows);
    const empty = [{ id: 'shot', imageVersions: [] }];
    expect(setActiveScriptMediaVersion(empty, 'shot', 'image', 'v2')).toBe(empty);
  });

  it('targets stable row id after reorder and retains the source duplicate-version-id behavior', () => {
    const rows = [
      { id: 'second', imageVersions: [version('other', true)] },
      {
        id: 'first',
        imageVersions: [version('same', false), version('same', false), version('old', true)],
      },
    ].map(canonical);
    const next = setActiveScriptMediaVersion(rows, 'first', 'image', 'same');
    expect(next[0]).toBe(rows[0]);
    expect(next[1].imageVersions.map((item) => item.isActive)).toEqual([true, true, false]);
    expect(setActiveScriptMediaVersion(next, 'first', 'image', 'same')).toBe(next);
  });
});

describe('ScriptV2 source tk history commit pipeline', () => {
  it('normalizes all row numbers, cleans empty refs and clears legacy spoken text only after real flags change', () => {
    const rows = [
      {
        id: 'other',
        shotNumber: 9,
        dialogue: '旧对白',
        voiceover: '旧旁白',
        finalImagePromptEntityRefs: [],
        imagePromptState: 'synced',
        videoPromptState: 'generating',
      },
      {
        id: 'shot',
        shotNumber: 20,
        imageVersions: [version('v1', true), version('v2', false)],
        imageGenerationPrompt: '原图稿',
        videoMotionPrompt: '原视频稿',
        imagePromptState: 'none',
        videoPromptState: 'synced',
        dialogueLines: [],
        dialogue: '旧对白',
      },
    ].map((row) => ({ ...row, ...storyboardRowHashes(row) }));
    expect(setActiveScriptMediaVersion(rows, 'shot', 'image', 'v1')).toBe(rows);
    expect(setActiveScriptMediaVersion(rows, 'shot', 'image', 'absent')).toBe(rows);
    expect(rows[0].shotNumber).toBe(9);
    const next = setActiveScriptMediaVersion(rows, 'shot', 'image', 'v2');
    expect(next.map((row) => row.shotNumber)).toEqual([1, 2]);
    expect(next[0]).toMatchObject({
      dialogue: '',
      voiceover: '',
      finalImagePromptEntityRefs: undefined,
      imagePromptState: 'stale',
      videoPromptState: 'generating',
    });
    expect(next[1]).toMatchObject({
      dialogue: '',
      voiceover: '',
      imageGenerationPrompt: '原图稿',
      videoMotionPrompt: '原视频稿',
      imagePromptState: 'none',
      videoPromptState: 'stale',
    });
    for (const row of next) expect(row).toMatchObject(storyboardRowHashes(row));
    expect(rows[0].dialogue).toBe('旧对白');
  });

  it('derives dialogue/voiceover from structured lines without modifying them, strips only recognized ASCII-boundary markers', () => {
    const lines = [
      {
        kind: 'dialogue',
        text: '@海岸 大海中的＠阿明。',
        entityRefs: [{ text: '阿明', assetId: 'c' }],
      },
      { kind: 'dialogue', text: 'x@海岸、@海岸a、@未知、@海岸边、@ABC_。' },
      { kind: 'voiceover', text: '＠海岸，@阿明。' },
      { kind: 'dialogue', text: '' },
      { kind: 'unknown', text: '   ' },
    ];
    const assets = {
      characters: [{ id: 'c', name: ' 阿明 ' }],
      scenes: [{ id: 's', name: '海岸' }, { name: 'ABC' }],
    };
    const rows = [{ id: 'shot', dialogueLines: lines, imageVersions: [version('a', false)] }];
    const next = setActiveScriptMediaVersion(rows, 'shot', 'image', 'a', assets);
    expect(next[0].dialogue).toBe(
      '海岸 大海中的阿明。\nx@海岸、@海岸a、@未知、海岸边、ABC_。\n   ',
    );
    expect(next[0].voiceover).toBe('海岸，阿明。');
    expect(next[0].dialogueLines).toBe(lines);
    expect(lines[0].text).toBe('@海岸 大海中的＠阿明。');
  });

  it('uses longest spoken name, trims names and retains marker when any recognized name is followed by ASCII', () => {
    const assets = { props: [{ name: '  AB C  ' }, { name: '海岸' }, { name: '海岸站' }] };
    const rows = [
      {
        id: 'shot',
        imageVersions: [version('a', false)],
        dialogueLines: [{ text: '@海岸站! ＠AB C? @海岸1 @海岸ABC 中＠海岸。 @陌生' }],
      },
    ];
    const next = setActiveScriptMediaVersion(rows, 'shot', 'image', 'a', assets);
    expect(next[0].dialogue).toBe('海岸站! AB C? @海岸1 @海岸ABC 中海岸。 @陌生');
  });

  it('preserves existing refs identity for unchanged text and uses incoming prompt refs but old plot refs', () => {
    const oldPlot = [{ text: '海岸', assetId: 's' }];
    const oldImage = [{ text: '阿明', assetId: 'c' }];
    const incomingImage = [{ text: '阿明', assetId: 'new-c' }];
    const old = canonical(
      {
        id: 'shot',
        plotDescription: '海岸',
        plotDescriptionEntityRefs: oldPlot,
        imageGenerationPrompt: '阿明',
        finalImagePromptEntityRefs: oldImage,
      },
      0,
    );
    const next = reconcileScriptMediaHistoryRows(
      [old],
      [
        {
          ...old,
          plotDescriptionEntityRefs: [{ text: '海岸', assetId: 'other' }],
          finalImagePromptEntityRefs: incomingImage,
        },
      ],
    );
    expect(next[0].plotDescriptionEntityRefs).toBe(oldPlot);
    expect(next[0].finalImagePromptEntityRefs).toBe(incomingImage);
  });

  it('shares text-edit reconciliation: preserves substring refs, adds explicit mentions and does not create bare-name refs', () => {
    const old = canonical(
      {
        id: 'shot',
        plotDescription: '旧景',
        plotDescriptionEntityRefs: [{ text: '旧景', assetId: 'old' }],
        imageGenerationPrompt: '阿明',
        finalImagePromptEntityRefs: [{ text: '阿明', assetId: 'c' }],
      },
      0,
    );
    const next = reconcileScriptMediaHistoryRows(
      [old],
      [
        {
          ...old,
          plotDescription: '@海岸 新景',
          imageGenerationPrompt: '阿明站在@海岸边',
          videoMotionPrompt: '海岸',
        },
      ],
      { scenes: [{ id: 's', name: '海岸' }] },
    );
    expect(next[0].plotDescriptionEntityRefs).toEqual([{ text: '海岸', assetId: 's' }]);
    expect(next[0].finalImagePromptEntityRefs).toEqual([
      { text: '阿明', assetId: 'c' },
      { text: '海岸', assetId: 's' },
    ]);
    expect(next[0].finalVideoPromptEntityRefs).toBeUndefined();
  });

  it.each(['image', 'video'])(
    'preserves both incoming prompt states when %s state was explicitly changed',
    (track) => {
      const old = canonical(
        {
          id: 'shot',
          plotDescription: '原剧情',
          imageGenerationPrompt: '图片稿',
          videoMotionPrompt: '视频稿',
        },
        0,
      );
      const row = { ...old, plotDescription: '新剧情', [`${track}PromptState`]: 'generating' };
      const [next] = reconcileScriptMediaHistoryRows([old], [row]);
      expect(next.imagePromptState).toBe(row.imagePromptState);
      expect(next.videoPromptState).toBe(row.videoPromptState);
      expect(next).toMatchObject(storyboardRowHashes(next));
    },
  );

  it('preserves canonical row identities, fills missing states, and only stales synced/stale states with known changed hashes', () => {
    const original = canonical({ id: 'canonical', imageGenerationPrompt: '原稿' }, 0);
    const missing = {
      id: 'missing',
      shotNumber: 2,
      imageGenerationPrompt: '稿',
      videoMotionPrompt: '',
    };
    const none = canonical(
      { id: 'none', imagePromptState: 'none', videoPromptState: 'generating', dialogue: '旧' },
      2,
    );
    const unknown = canonical(
      {
        id: 'unknown',
        imagePromptState: 'old-private-state',
        videoPromptState: 'stale',
        dialogue: '旧',
      },
      3,
    );
    const rows = [original, missing, none, unknown];
    const next = reconcileScriptMediaHistoryRows(rows, rows);
    expect(next[0]).toBe(original);
    expect(next[1]).toMatchObject({ imagePromptState: 'synced', videoPromptState: 'none' });
    expect(next[2]).toMatchObject({ imagePromptState: 'none', videoPromptState: 'generating' });
    expect(next[3]).toMatchObject({
      imagePromptState: 'old-private-state',
      videoPromptState: 'stale',
    });
    const empty = [];
    expect(reconcileScriptMediaHistoryRows([], empty)).toBe(empty);
  });

  it('initializes newly added rows with exact legacy migration and preserves already normalized new rows', () => {
    const rows = [
      { id: 'legacy', promptState: 'stale', imageGenerationPrompt: '稿' },
      { id: 'legacy-generating', promptState: 'generating', imageGenerationPrompt: '稿' },
      {
        id: 'explicit',
        promptState: 'stale',
        imagePromptState: 'generating',
        videoMotionPrompt: '稿',
      },
      {
        id: 'unsupported',
        imagePromptState: 'user_edited',
        videoPromptState: 'invalid',
        imageGenerationPrompt: '稿',
      },
      canonical({ id: 'valid' }, 4),
    ];
    const next = reconcileScriptMediaHistoryRows([], rows);
    expect(next[0]).toMatchObject({ imagePromptState: 'stale', videoPromptState: 'stale' });
    expect(next[1]).toMatchObject({ imagePromptState: 'synced', videoPromptState: 'none' });
    expect(next[2]).toMatchObject({ imagePromptState: 'generating', videoPromptState: 'synced' });
    expect(next[3]).toMatchObject({ imagePromptState: 'synced', videoPromptState: 'none' });
    expect(next.every((row) => !('promptState' in row))).toBe(true);
    expect(next[4]).toBe(rows[4]);
  });
});

describe('ScriptV2 failed task metadata', () => {
  it.each([3, 4, '3', ' 4 ', '3.0', '0x3'])(
    'recognizes source normalized failure status %s',
    (status) => {
      expect(
        scriptPromptFailureInfo({
          status,
          taskId: 'task-1',
          failedReason: '服务错误',
          other: true,
        }),
      ).toEqual({
        taskId: 'task-1',
        failedReason: '服务错误',
      });
    },
  );
  it.each([0, 1, 2, 5, -1, '', ' ', 'failed', NaN, Infinity, null, undefined, false, {}, []])(
    'hides metadata for non-failure or invalid status %s',
    (status) => {
      expect(
        scriptPromptFailureInfo({ status, taskId: 'stale-task', failedReason: '旧错误' }),
      ).toBeNull();
    },
  );
  it('hides failed metadata while either prompt is generating and does not fabricate absent fields', () => {
    expect(scriptPromptFailureInfo({ status: 3, taskId: 'task' }, true)).toBeNull();
    expect(scriptPromptFailureInfo({ status: 4 })).toEqual({
      taskId: undefined,
      failedReason: undefined,
    });
    expect(scriptPromptFailureInfo()).toBeNull();
  });
});
