export {
  pickerCatalogue,
  COMMON_SKILL_TEMPLATE_IDS,
  filterPickerSkills,
  displaySkillKey,
} from '../../../services/skill-presentation.js';

export function skillCreateCanvasHref(id) {
  return (
    '/canvas?' +
    new URLSearchParams({
      newProject: 'true',
      projectId: id,
      guideSource: 'skill',
      skillCreatorIntake: '1',
      forceAgent: '1',
    }).toString()
  );
}
