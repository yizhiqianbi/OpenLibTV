import { skillReferenceId } from '../../../../services/agent-handoff.js';

export const VIDEO_COMPOSE_AGENT_CONFIG_ID = '280';
export const VIDEO_COMPOSE_DEFAULT_MODE_KEY = 'default';
export const VIDEO_COMPOSE_NODE_REFERENCE_LIMIT = 50;

const listForNodeType = {
  video: 'videoList',
  image: 'imageList',
  audio: 'audioList',
  text: 'textList',
};

/** Original resolver validates the envelope/parameter defaults, not every mode body. */
export function isValidVideoComposeAgentConfig(config) {
  const ratios = config?.params?.aspectRatios;
  const resolutions = config?.params?.resolutions;
  const range = config?.params?.durationRange;
  const defaults = config?.params?.defaults;
  return Boolean(
    config &&
    Array.isArray(config.modes) &&
    Array.isArray(config.defaultMode?.materialSlots) &&
    Array.isArray(ratios) &&
    Array.isArray(resolutions) &&
    typeof range?.min === 'number' &&
    Number.isFinite(range.min) &&
    typeof range.max === 'number' &&
    Number.isFinite(range.max) &&
    range.min <= range.max &&
    typeof range.default === 'number' &&
    Number.isFinite(range.default) &&
    range.default >= range.min &&
    range.default <= range.max &&
    typeof defaults?.aspectRatio === 'string' &&
    ratios.includes(defaults.aspectRatio) &&
    typeof defaults.duration === 'number' &&
    Number.isFinite(defaults.duration) &&
    defaults.duration >= range.min &&
    defaults.duration <= range.max &&
    typeof defaults.resolution === 'string' &&
    resolutions.includes(defaults.resolution),
  );
}

/** Caller loads the archived fallback with useContent; no remote store or request lives here. */
export function resolveVideoComposeAgentConfig(remoteConfig, fallbackConfig) {
  if (isValidVideoComposeAgentConfig(remoteConfig)) return remoteConfig;
  return isValidVideoComposeAgentConfig(fallbackConfig) ? fallbackConfig : null;
}

export function getVideoComposeMode(modeKey, config) {
  if (!config) return null;
  return modeKey && modeKey !== VIDEO_COMPOSE_DEFAULT_MODE_KEY
    ? (config.modes.find((mode) => mode.modeKey === modeKey) ?? config.defaultMode)
    : config.defaultMode;
}

export function getVideoComposeModeName(modeKey, config) {
  return getVideoComposeMode(modeKey, config)?.name || modeKey || VIDEO_COMPOSE_DEFAULT_MODE_KEY;
}

export function getVideoComposeParamsForModeApply(mode, config, previousParams, withPreset) {
  if (!withPreset) return previousParams ?? config.params.defaults;
  const params = mode.params;
  const defaults = config.params.defaults;
  const range = config.params.durationRange;
  return {
    aspectRatio:
      typeof params?.aspectRatio === 'string' &&
      config.params.aspectRatios.includes(params.aspectRatio)
        ? params.aspectRatio
        : defaults.aspectRatio,
    duration:
      typeof params?.duration === 'number' &&
      Number.isFinite(params.duration) &&
      Number.isInteger(params.duration) &&
      params.duration >= range.min &&
      params.duration <= range.max
        ? params.duration
        : defaults.duration,
    resolution:
      typeof params?.resolution === 'string' &&
      config.params.resolutions.includes(params.resolution)
        ? params.resolution
        : defaults.resolution,
  };
}

export function readVideoComposeComposer(composer, config) {
  return {
    modeKey: composer?.modeKey ?? VIDEO_COMPOSE_DEFAULT_MODE_KEY,
    prompt: composer?.prompt ?? '',
    params: composer?.params ?? config.params.defaults,
  };
}

export function patchVideoComposeComposer(composer, patch, config) {
  return { ...readVideoComposeComposer(composer, config), ...patch };
}

export function applyVideoComposeComposerMode(composer, modeKey, config, options = {}) {
  const mode = getVideoComposeMode(modeKey, config);
  const withPreset = options.withPreset === true;
  const presetPrompt = withPreset
    ? [mode.preset?.urlValue, mode.preset?.prompt].filter(Boolean).join(' ')
    : '';
  return {
    modeKey,
    prompt: composer?.prompt?.trim() ? composer.prompt : presetPrompt || composer?.prompt,
    params: getVideoComposeParamsForModeApply(mode, config, composer?.params, withPreset),
  };
}

/** Schema belongs to the compose Agent, independently of ordinary generation models. */
export function getVideoComposeParameterSchema(config) {
  return {
    properties: {
      ratio: {
        displayName: '比例',
        displayNameI18nKey: 'canvas:videoComposeAspectRatio',
        enum: config.params.aspectRatios,
        component: 'singleButton',
        default: config.params.defaults.aspectRatio,
      },
      duration: {
        displayName: '时长',
        displayNameI18nKey: 'canvas:videoComposeDuration',
        component: 'slider',
        min: config.params.durationRange.min,
        max: config.params.durationRange.max,
        step: 1,
        default: config.params.durationRange.default,
      },
      resolution: {
        displayName: '清晰度',
        displayNameI18nKey: 'canvas:videoComposeResolution',
        enum: config.params.resolutions,
        component: 'singleButton',
        default: config.params.defaults.resolution,
      },
    },
    config: { settings: ['ratio', 'duration', 'resolution'] },
  };
}

export function patchVideoComposeParameterSettings(params, settings) {
  if (!settings) return params;
  return {
    aspectRatio: settings.ratio ?? params.aspectRatio,
    duration: typeof settings.duration === 'number' ? settings.duration : params.duration,
    resolution: settings.resolution ?? params.resolution,
  };
}

export function validateVideoComposeComposer({
  config,
  composer,
  incomingData = {},
  readonly = false,
  collabReadonly = false,
  pending = false,
  agentEditingActive = false,
}) {
  const disabled = Boolean(readonly || collabReadonly || pending || agentEditingActive);
  if (!config)
    return { mode: null, errors: [{ key: 'config-unavailable' }], disabled, canSend: false };
  const state = readVideoComposeComposer(composer, config);
  const mode = getVideoComposeMode(state.modeKey, config);
  const errors = [];
  for (const slot of mode.materialSlots) {
    const count = slot.nodeTypes.reduce((total, type) => {
      const key = listForNodeType[type];
      return total + (key ? (incomingData[key]?.length ?? 0) : 0);
    }, 0);
    if (slot.required && count < slot.min)
      errors.push({ key: 'canvas:videoComposeMissingSlot', slotKey: slot.slotKey, min: slot.min });
    else if (count > slot.max)
      errors.push({ key: 'canvas:videoComposeTooManySlot', slotKey: slot.slotKey, max: slot.max });
  }
  if (mode.urlInput?.required && !/https?:\/\/\S+/i.test(state.prompt))
    errors.push({ key: 'canvas:videoComposeMissingUrl' });
  // The source always requires a prompt, even if a remote mode sets promptRequired=false.
  if (!state.prompt.trim()) errors.push({ key: 'canvas:videoComposePromptRequired' });
  return { mode, errors, disabled, canSend: !disabled && errors.length === 0 };
}

function trackingReferences(parts) {
  const output = [];
  const seen = new Set();
  for (const part of parts) {
    if (output.length >= VIDEO_COMPOSE_NODE_REFERENCE_LIMIT) break;
    if (part.type !== 'node' || !part.id || !part.nodeType || seen.has(part.id)) continue;
    seen.add(part.id);
    output.push({
      node_uuid: part.id,
      node_type: part.nodeType === 'director-studio' ? 'director_studio' : part.nodeType,
    });
  }
  return output.length > 0 ? output : undefined;
}

/** Original ey payload only; caller owns send, skill metadata registration and accepted-state UI. */
export function buildVideoComposeAgentSubmit(input, options = {}) {
  const validation = validateVideoComposeComposer(input);
  if (!validation.canSend)
    return { status: 'blocked', validation, payload: null, skillUseMeta: [] };
  const { nodeId, projectId, config, composer, incomingData = {}, nodes = [] } = input;
  const state = readVideoComposeComposer(composer, config);
  const mode = validation.mode;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keys = [
    ...new Set(
      mode.materialSlots.flatMap((slot) => slot.nodeTypes.map((type) => listForNodeType[type])),
    ),
  ];
  const materialItems = keys.flatMap((key) => (key ? (incomingData[key] ?? []) : []));
  const references = [];
  const seen = new Set();
  function nodeTag(item) {
    const node = byId.get(item.nodeId);
    if (!node) return '';
    if (!seen.has(item.nodeId)) {
      seen.add(item.nodeId);
      const data = node.data ?? {};
      const type = node.type ?? 'node';
      references.push({
        type: 'node',
        id: item.nodeId,
        nodeKey: item.nodeId,
        projectId: projectId || undefined,
        name: data.name || data.label || type,
        nodeType: type,
        url: item.url || undefined,
        mediaType: type === 'image' ? 'image' : type === 'video' ? 'video' : undefined,
      });
    }
    return `{{ node:${item.nodeId} }}`;
  }
  const mentionLists = {
    Image: incomingData.imageList,
    Video: incomingData.videoList,
    Audio: incomingData.audioList,
  };
  let useAt = false;
  const prompt = state.prompt
    .trim()
    .replace(
      /\{\{(Image|Portrait|Video|Audio|Mixed|Element|CameraPreset)\s+(\d+)\}\}/g,
      (_match, type, ordinal) => {
        const item = mentionLists[type]?.[Number(ordinal) - 1];
        const tag = item ? nodeTag(item) : '';
        if (tag) useAt = true;
        return tag;
      },
    );
  let prefix = '';
  const skillUseMeta = [];
  if (mode.skill) {
    const id = skillReferenceId({ skillKey: mode.skill.skillKey });
    prefix += `{{ skill:${id} }} `;
    references.push({ type: 'skill', id, name: mode.skill.name });
    skillUseMeta.push({
      id,
      metadata: {
        skillKey: mode.skill.skillKey,
        templateUuid: mode.skill.templateUuid,
        name: mode.skill.name,
        version: mode.skill.version,
      },
    });
  }
  for (const item of materialItems) {
    if (seen.has(item.nodeId)) continue;
    const tag = nodeTag(item);
    if (tag) prefix += `${tag} `;
  }
  const paramsText = `${state.params.aspectRatio} · ${state.params.duration}s · ${state.params.resolution}`;
  const suffix = options.formatParamsSuffix
    ? options.formatParamsSuffix(paramsText)
    : `，参数是 ${paramsText}`;
  const parts = [{ type: 'text', text: prefix + prompt + suffix }, ...references];
  return {
    status: 'ready',
    validation,
    payload: {
      type: 'agent-prompt',
      parts,
      extra: {
        currentNodeKey: nodeId,
        entryItemKey: 'video_compose',
        ...(projectId
          ? {
              videoComposeSubmitTracking: {
                nodeUuid: nodeId,
                projectUuid: projectId,
                functionKey: mode.modeKey,
                useAt,
                nodeReferenceList: trackingReferences(parts),
              },
            }
          : {}),
      },
    },
    skillUseMeta,
  };
}
