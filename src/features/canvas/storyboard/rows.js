import { initializeStoryboardPromptState, reconcileStoryboardPromptState } from './prompt-state.js';

// Public 182004 SCRIPT_FIELD_META; custom column labels use the API field name.
export const STORYBOARD_FIELDS = [
  ['shotNumber', 'shot_number', '镜号', 'number'],
  ['durationSeconds', 'duration_seconds', '时长', 'number'],
  ['plotDescription', 'plot_description', '画面描述', 'text'],
  ['videoReference', 'video_reference', '视频参考图', 'image'],
  ['shotSize', 'shot_size', '景别', 'text'],
  ['emotion', 'emotion', '表情', 'text'],
  ['propTags', 'prop_tags', '道具', 'text'],
  ['lightingAndAtmosphere', 'lighting_and_atmosphere', '光影氛围', 'text'],
  ['audioEffects', 'audio_effects', '音效', 'text'],
  ['dialogue', 'dialogue', '对白', 'text'],
  ['imageGenerationPrompt', 'image_generation_prompt', '分镜提示词', 'text'],
  ['videoMotionPrompt', 'video_motion_prompt', '视频提示词', 'text'],
].map(([key, apiKey, label, type]) => ({ key, apiKey, label, type }));
export const STORYBOARD_V2_FIELDS = [
  ...STORYBOARD_FIELDS.filter((field) =>
    [
      'shotNumber',
      'durationSeconds',
      'plotDescription',
      'shotSize',
      'lightingAndAtmosphere',
    ].includes(field.key),
  ),
  { key: 'dialogueLines', apiKey: 'dialogue_lines', label: '对白 / 旁白', type: 'dialogue' },
  STORYBOARD_FIELDS.find((field) => field.key === 'audioEffects'),
  { key: 'cameraMovement', apiKey: 'camera_movement', label: '运镜', type: 'text' },
  { key: 'promptEntry', apiKey: 'prompt_entry', label: '提示词', type: 'prompt' },
];
export const storyboardFields = (data) =>
  data?.type === 'script-v2' ? STORYBOARD_V2_FIELDS : STORYBOARD_FIELDS;
export const storyboardCellValue = (row, key) =>
  key === 'cameraMovement' ? (row.cinematics?.cameraMovement ?? '') : row[key];
export const STORYBOARD_FILTER_OPERATORS = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等于' },
  { value: 'gt', label: '大于' },
  { value: 'lt', label: '小于' },
];
export const storyboardRows = (data) => (Array.isArray(data?.rows) ? data.rows : []);
export const storyboardRowKey = (row, index) => row.id || row.hiddenUuid || String(index);
export function storyboardFieldLabel(field, shotColumns) {
  return shotColumns?.find((column) => column.field === field.apiKey)?.label || field.label;
}
export function storyboardViews(data) {
  return Array.isArray(data?.views) && data.views.length
    ? data.views
    : [
        { id: 'default', type: 'table', name: '脚本视图' },
        data?.type === 'script-v2'
          ? { id: 'asset', type: 'asset', name: '资产视图' }
          : { id: 'creative', type: 'creative', name: '创意视图' },
      ];
}
export function storyboardActiveView(data) {
  const views = storyboardViews(data);
  return views.find((view) => view.id === (data?.activeViewId || 'default')) || views[0];
}
export function storyboardViewPatch(data, type) {
  const view = storyboardViews(data).find((item) => item.type === type);
  return { viewMode: type, ...(view ? { activeViewId: view.id } : {}) };
}
export function storyboardTableConfigPatch(data, tableConfig) {
  const active = storyboardActiveView(data);
  return {
    views: storyboardViews(data).map((view) =>
      view.id === active.id ? { ...view, tableConfig } : view,
    ),
  };
}
const text = (value) =>
  value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
/** Source scriptImage batch filtering and table operatorFilterFn use AND semantics. */
export function filterStoryboardRows(rows, filters = []) {
  return rows.filter((row) =>
    filters.every((filter) => {
      const actual = storyboardCellValue(row, filter.id) ?? '';
      const clause = filter.value;
      const operator = clause && typeof clause === 'object' ? clause.operator : 'contains';
      const value = clause && typeof clause === 'object' ? clause.value : clause;
      if (!text(value)) return true;
      const left = text(actual).toLowerCase();
      const right = text(value).toLowerCase();
      if (operator === 'contains') return left.includes(right);
      if (operator === 'equals') return left === right;
      if (operator === 'gt') return Number(actual) > Number(value);
      if (operator === 'lt') return Number(actual) < Number(value);
      return true;
    }),
  );
}
export function selectedStoryboardRows(rows, ids) {
  return rows.filter((row) => row.hiddenUuid && ids.has(row.hiddenUuid));
}
export function reconcileStoryboardSelection(rows, ids) {
  const valid = new Set(rows.map((row) => row.hiddenUuid).filter(Boolean));
  return new Set([...ids].filter((id) => valid.has(id)));
}
export const renumberStoryboardRows = (rows) =>
  rows.map((row, index) =>
    row.shotNumber === index + 1 ? row : { ...row, shotNumber: index + 1 },
  );
export function patchStoryboardRow(rows, key, patch) {
  return rows.map((row, index) =>
    storyboardRowKey(row, index) === key ? { ...row, ...patch } : row,
  );
}
export function patchStoryboardCell(rows, key, field, value, v2) {
  const updated = rows.map((row, index) => {
    if (storyboardRowKey(row, index) !== key) return row;
    if (field === 'cameraMovement')
      return { ...row, cinematics: { ...row.cinematics, cameraMovement: value } };
    if (field === 'dialogueLines')
      return {
        ...row,
        dialogueLines: value,
        dialogue: value
          .filter((line) => line.kind !== 'voiceover')
          .map((line) => line.text)
          .join('\n'),
        voiceover: value
          .filter((line) => line.kind === 'voiceover')
          .map((line) => line.text)
          .join('\n'),
      };
    return { ...row, [field]: value };
  });
  return v2 ? reconcileStoryboardPromptState(rows, updated) : updated;
}
export function moveStoryboardRow(rows, fromKey, targetKey) {
  const from = rows.findIndex((row, index) => storyboardRowKey(row, index) === fromKey);
  const target = rows.findIndex((row, index) => storyboardRowKey(row, index) === targetKey);
  if (from < 0 || target < 0 || from === target) return rows;
  const result = [...rows];
  const [row] = result.splice(from, 1);
  result.splice(target, 0, row);
  return renumberStoryboardRows(result);
}
export function createStoryboardRow(shotNumber, makeId = () => crypto.randomUUID()) {
  return initializeStoryboardPromptState({
    id: makeId(),
    hiddenUuid: makeId(),
    shotNumber,
    durationSeconds: 5,
    plotDescription: '',
    characters: [],
    shotSize: '',
    emotion: '',
    sceneAssetIds: [],
    propTags: '',
    propAssetIds: [],
    lightingAndAtmosphere: '',
    audioEffects: '',
    dialogue: '',
    imageGenerationPrompt: '',
    videoMotionPrompt: '',
    imageToVideoMotionPrompt: '',
  });
}
export function insertStoryboardRowAfter(rows, key, makeId) {
  const index = rows.findIndex((row, position) => storyboardRowKey(row, position) === key);
  if (key !== null && index < 0) return rows;
  const position = key === null ? rows.length : index + 1;
  return renumberStoryboardRows([
    ...rows.slice(0, position),
    createStoryboardRow(position + 1, makeId),
    ...rows.slice(position),
  ]);
}
export function deleteStoryboardRow(rows, key) {
  return renumberStoryboardRows(rows.filter((row, index) => storyboardRowKey(row, index) !== key));
}
