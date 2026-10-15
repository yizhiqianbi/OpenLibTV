// @vitest-environment node
import { describe, expect, it } from 'vitest';
import models from '../../../../public/data/models.json';
import { buildStoryboardImageGraphPlan, buildStoryboardVideoGraphPlan } from './graph-plans.js';
import { createCanvasScriptNode } from './script-model.js';
import { createStoryboardRow } from './rows.js';
import { patchStoryboardCell } from './rows.js';

function fixture() {
  let id = 0;
  const makeId = () => `node-${++id}`;
  const script = createCanvasScriptNode({ id: 'script', position: { x: 10, y: 20 } });
  script.data.rows = [createStoryboardRow(1, makeId), createStoryboardRow(2, makeId)];
  script.data.rows[0].imageGenerationPrompt = '海岸';
  script.data.rows[1].imageGenerationPrompt = '城市';
  return {
    script,
    makeId,
    config: { model: models.default.image, modeType: 'text2image', settings: { ratio: '16:9' } },
  };
}
describe('script group graph plans', () => {
  it('creates real empty image generators with stable shot identity and atomic source/group/child links', () => {
    const f = fixture();
    const plan = buildStoryboardImageGraphPlan({ ...f, nodes: [f.script] });
    expect(plan.ok).toBe(true);
    expect(plan.submitted).toBe(false);
    const [group, first, second] = plan.addedNodes;
    expect(group.data.sourceScriptVersion).toBe('v2');
    expect(group.data.childNodeIds).toEqual([first.id, second.id]);
    expect(first.data).toMatchObject({
      scriptRowHiddenUuid: f.script.data.rows[0].hiddenUuid,
      url: [],
      action: 'image_generate',
      params: { prompt: '海岸', model: models.default.image },
    });
    expect(second.position.y).toBeGreaterThan(first.position.y);
    expect(plan.nodePatches[0].data.linkedImageGroupId).toBe(group.id);
    expect(plan.addedEdges.at(-1)).toMatchObject({ source: f.script.id, target: group.id });
  });
  it('filters selected hidden UUIDs and refuses ambiguous row identity or unresolved asset links', () => {
    const f = fixture();
    const selectedHiddenUuids = new Set([f.script.data.rows[1].hiddenUuid]);
    const plan = buildStoryboardImageGraphPlan({ ...f, selectedHiddenUuids });
    expect(plan.addedNodes).toHaveLength(2);
    expect(plan.addedNodes[0].data.storyboardSourceRowHiddenUuids).toEqual([
      ...selectedHiddenUuids,
    ]);
    f.script.data.rows[1].hiddenUuid = f.script.data.rows[0].hiddenUuid;
    expect(buildStoryboardImageGraphPlan(f).ok).toBe(false);
    f.script.data.rows = [f.script.data.rows[0]];
    f.script.data.rows[0].sceneAssetIds = ['missing'];
    expect(buildStoryboardImageGraphPlan(f).ok).toBe(false);
  });
  it('matches completed images by UUID after row reordering and excludes unfinished shots for video plans', () => {
    const f = fixture(),
      images = buildStoryboardImageGraphPlan(f);
    f.script.data.linkedImageGroupId = images.groupId;
    f.script.data.rows[0].videoMotionPrompt = '推进';
    f.script.data.rows[1].videoMotionPrompt = '平移';
    f.script.data.rows.reverse();
    images.addedNodes[1].data.url = ['/finished.png'];
    const schema = models.videoModels['star-video2'];
    const request = {
      script: f.script,
      nodes: [f.script, ...images.addedNodes],
      config: { model: 'star-video2', settings: { duration: 5 } },
      schema,
      makeId: f.makeId,
    };
    expect(buildStoryboardVideoGraphPlan(request).ok).toBe(false);
    images.addedNodes[1].data.portraitCompliantExempt = true;
    const plan = buildStoryboardVideoGraphPlan({
      script: f.script,
      nodes: [f.script, ...images.addedNodes],
      config: { model: 'star-video2', settings: { duration: 5 } },
      schema,
      makeId: f.makeId,
    });
    expect(plan.ok).toBe(true);
    expect(plan.addedNodes).toHaveLength(2);
    expect(plan.addedNodes[1].data).toMatchObject({
      scriptRowHiddenUuid: images.addedNodes[1].data.scriptRowHiddenUuid,
      params: { prompt: '推进', image: '/finished.png' },
    });
    expect(plan.addedEdges[0].source).toBe(images.addedNodes[1].id);
  });
  it('keeps V2 cinematics/dialogue data and marks both synced prompt tracks stale on payload editing', () => {
    const f = fixture();
    let rows = patchStoryboardCell(
      f.script.data.rows,
      f.script.data.rows[0].id,
      'cameraMovement',
      '推进',
      true,
    );
    expect(rows[0].cinematics.cameraMovement).toBe('推进');
    rows[0].imagePromptState = rows[0].videoPromptState = 'synced';
    rows = patchStoryboardCell(
      rows,
      rows[0].id,
      'dialogueLines',
      [
        { kind: 'speech', text: '出发' },
        { kind: 'voiceover', text: '清晨' },
      ],
      true,
    );
    expect(rows[0]).toMatchObject({
      dialogue: '出发',
      voiceover: '清晨',
      imagePromptState: 'stale',
      videoPromptState: 'stale',
    });
  });
});
