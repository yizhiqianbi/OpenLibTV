import { describe, expect, it } from 'vitest';
import {
  cleanSkillCreatorHref,
  createSkillCreatorIntent,
  skillCreatorOptions,
  skillCreatorRequest,
} from './skill-creator.js';

describe('Skill creator intake protocol', () => {
  it('only offers actions supported by the current conversation, canvas and owned Skills', () => {
    expect(skillCreatorOptions().map((item) => item.key)).toEqual(['create_from_scratch']);
    expect(
      skillCreatorOptions({ hasConversation: true, hasCanvas: true, hasSkill: true }).map(
        (item) => item.key,
      ),
    ).toEqual([
      'create_from_scratch',
      'create_from_conversation',
      'create_from_canvas',
      'update',
      'test',
    ]);
    expect(skillCreatorOptions({ hasCanvas: true }).map((item) => item.key)).toEqual([
      'create_from_scratch',
      'create_from_canvas',
    ]);
  });

  it('auto-selects the single action and preserves a blocked request without inventing a Skill', () => {
    const intent = createSkillCreatorIntent(
      { projectId: 'project', projectName: '创作项目', workspaceId: 'workspace' },
      42,
    );
    expect(intent).toMatchObject({
      version: 1,
      status: 'blocked',
      action: 'create_from_scratch',
      createdAt: 42,
      attempts: 1,
      request: {
        parts: [{ type: 'text', text: '从零聊出一个 Skill' }],
        context: {
          currentProjectId: 'project',
          currentProjectName: '创作项目',
          currentWorkspaceId: 'workspace',
        },
      },
    });
    const choice = createSkillCreatorIntent({ projectId: 'project', hasCanvas: true }, 43);
    expect(choice.status).toBe('choosing');
    expect(choice.request).toBeUndefined();
    expect(choice.action).toBeNull();
  });

  it('adds the canvas summary context only to the canvas action and removes only the one-time intake parameter', () => {
    const context = { currentProjectId: 'p', currentProjectName: '标题' };
    expect(skillCreatorRequest('create_from_canvas', context).context).toEqual({
      ...context,
      skillAssistant: { summarizeFromCanvas: true },
    });
    expect(skillCreatorRequest('test', context).context).toEqual(context);
    expect(skillCreatorRequest('unknown', context)).toBeNull();
    expect(
      cleanSkillCreatorHref(
        '/canvas?projectId=p&guideSource=skill&skillCreatorIntake=1&forceAgent=1#node',
      ),
    ).toBe('/canvas?projectId=p&guideSource=skill&forceAgent=1#node');
  });
});
