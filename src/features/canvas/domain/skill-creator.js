export const SKILL_CREATOR_ACTIONS = [
  { key: 'create_from_scratch', label: '从零聊出一个 Skill' },
  { key: 'create_from_conversation', label: '基于当前对话创建 Skill' },
  { key: 'create_from_canvas', label: '基于当前画布创建 Skill' },
  { key: 'update', label: '更新我的 Skill' },
  { key: 'test', label: '自测我的 Skill' },
];

export function skillCreatorOptions({
  hasConversation = false,
  hasCanvas = false,
  hasSkill = false,
} = {}) {
  return SKILL_CREATOR_ACTIONS.filter(
    ({ key }) =>
      key === 'create_from_scratch' ||
      (key === 'create_from_conversation' && hasConversation) ||
      (key === 'create_from_canvas' && hasCanvas) ||
      (['update', 'test'].includes(key) && hasSkill),
  );
}

export function createSkillCreatorIntent(context, now = Date.now()) {
  const options = skillCreatorOptions(context);
  const single = options.length === 1;
  return {
    version: 1,
    entrySource: 'skill_page',
    status: single ? 'blocked' : 'choosing',
    options,
    action: single ? options[0].key : null,
    context: {
      currentProjectId: context.projectId,
      currentProjectName: context.projectName,
      ...(context.workspaceId ? { currentWorkspaceId: context.workspaceId } : {}),
    },
    createdAt: now,
    ...(single ? { request: skillCreatorRequest(options[0].key, context), attempts: 1 } : {}),
  };
}

export function skillCreatorRequest(action, context) {
  const option = SKILL_CREATOR_ACTIONS.find((item) => item.key === action);
  if (!option) return null;
  const existing = context.currentProjectId
    ? context
    : {
        currentProjectId: context.projectId,
        currentProjectName: context.projectName,
        ...(context.workspaceId ? { currentWorkspaceId: context.workspaceId } : {}),
      };
  return {
    parts: [{ type: 'text', text: option.label }],
    context: {
      ...existing,
      ...(action === 'create_from_canvas' ? { skillAssistant: { summarizeFromCanvas: true } } : {}),
    },
  };
}

export function cleanSkillCreatorHref(path) {
  const url = new URL(path, 'https://local.invalid');
  url.searchParams.delete('skillCreatorIntake');
  return url.pathname + url.search + url.hash;
}
