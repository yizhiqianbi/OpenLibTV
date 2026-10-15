import { readStoredState } from '../../../services/storage.ts';

const skillFields = [
  ['name', 'createSkillFieldName', 'createSkillNamePlaceholder', 24],
  ['description', 'createSkillFieldDescription', 'createSkillDescriptionPlaceholder', 30],
  ['useScenario', 'createSkillFieldUseScenario', 'createSkillUseScenarioPlaceholder', 200],
  ['inputType', 'createSkillFieldHowToUse', 'createSkillHowToUsePlaceholder', 200],
  ['outputContent', 'createSkillFieldOutput', 'createSkillOutputPlaceholder', 200],
];

const skillInitial = {
  name: '',
  description: '',
  useScenario: '',
  inputType: '',
  outputContent: '',
  resultType: 2,
  coverUrl: '',
};

function readLocalSkills() {
  const { value, error } = readStoredState('libtv-created-skills', []);
  if (error && !['WRITE_FAILED', 'REMOVE_FAILED'].includes(error.code)) throw error;
  if (value === null) return []; // Earlier local drafts used null to represent an empty library.
  if (!Array.isArray(value)) throw new Error('本地 Skill 草稿数据格式错误');
  for (const draft of value) {
    if (
      !draft ||
      typeof draft !== 'object' ||
      typeof draft.skillUuid !== 'string' ||
      skillFields.some(([name]) => draft[name] != null && typeof draft[name] !== 'string') ||
      (draft.markdownContent != null && typeof draft.markdownContent !== 'string') ||
      (draft.skillFiles != null &&
        (!Array.isArray(draft.skillFiles) ||
          draft.skillFiles.some(
            (file) =>
              !file ||
              typeof file.path !== 'string' ||
              !file.path ||
              typeof file.content !== 'string',
          ))) ||
      (draft.skillDirectories != null &&
        (!Array.isArray(draft.skillDirectories) ||
          draft.skillDirectories.some((path) => typeof path !== 'string')))
    )
      throw new Error('本地 Skill 草稿数据格式错误');
  }
  return value;
}

const MAX_SKILL_FILES = 50;
const MAX_SKILL_FILE_BYTES = 1048576;

function mergeSkillFiles(files, incoming) {
  const merged = new Map(files.map((file) => [file.path, file]));
  incoming.forEach((file) => merged.set(file.path, file));
  return [...merged.values()];
}

function skillFileLimit(files) {
  if (files.length > MAX_SKILL_FILES) return 'count';
  if (new Blob(files.map((file) => file.content)).size > MAX_SKILL_FILE_BYTES) return 'size';
  return null;
}

export {
  skillFields,
  skillInitial,
  readLocalSkills,
  MAX_SKILL_FILES,
  MAX_SKILL_FILE_BYTES,
  mergeSkillFiles,
  skillFileLimit,
};
