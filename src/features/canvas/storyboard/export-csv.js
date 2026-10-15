import { STORYBOARD_FIELDS } from './rows.js';

export const SCRIPT_CSV_TYPE = 'text/csv;charset=utf-8;';

export function escapeScriptCsvCell(value) {
  const text = value == null ? '' : String(value);
  return /[,"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 664115 formatDownloadFileName; the source appends the extension to the whole label. */
export function scriptCsvFileName(name) {
  const printable = Array.from(String(name), (character) =>
    character.charCodeAt(0) < 32 ? '_' : character,
  ).join('');
  const label = printable.replace(/[<>:"/\\|?*]/g, '_').trim() || 'file';
  return `${label}.csv`;
}

const csvLine = (cells) => cells.map(escapeScriptCsvCell).join(',');
const fieldLabel = (field, shotColumns) => {
  const custom = shotColumns?.find((column) => column.field === field.apiKey);
  return custom ? custom.label : field.label;
};
const fieldValue = (row, field) => {
  if (field.key === 'videoReference') return row.videoReference?.referenceFrameImage ?? '';
  const value = row[field.key];
  return typeof value === 'string' || typeof value === 'number' ? value : '';
};

/**
 * 272776 ScriptV2 eV. Returns a download descriptor without browser or storage writes.
 * The caller applies the toolbar's generating/allReady gate; eV itself only checks rows.
 */
export function buildScriptV2Csv(data, { name } = {}) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (!rows.length) return null;
  const fields = STORYBOARD_FIELDS.filter((field) => !['emotion', 'propTags'].includes(field.key));
  const split = fields.findIndex((field) => field.key === 'plotDescription') + 1;
  const before = fields.slice(0, split);
  const after = fields.slice(split);
  const characterCount = Math.max(...rows.map((row) => row.characters?.length ?? 0));
  const characterHeaders = Array.from({ length: characterCount }, (_, index) => [
    `角色${index + 1}`,
    `角色描述${index + 1}`,
    `角色图${index + 1}`,
  ]).flat();
  const header = [
    ...before.map((field) => fieldLabel(field, data.shotColumns)),
    ...characterHeaders,
    ...after.map((field) => fieldLabel(field, data.shotColumns)),
  ];
  const shots = rows.map((row) =>
    csvLine([
      ...before.map((field) => fieldValue(row, field)),
      ...Array.from({ length: characterCount }, (_, index) => {
        const character = row.characters?.[index];
        return [
          character?.characterName ?? '',
          character?.characterDescription ?? '',
          character?.characterImageUrl ?? '',
        ];
      }).flat(),
      ...after.map((field) => fieldValue(row, field)),
    ]),
  );
  const assets = [csvLine(['类型', '名称', '图片', '描述提示词'])];
  for (const [key, role] of [
    ['characters', '角色'],
    ['scenes', '场景'],
    ['props', '道具'],
  ]) {
    for (const item of Array.isArray(data.assets?.[key]) ? data.assets[key] : []) {
      if (item?.name)
        assets.push(csvLine([role, item.name, item.thumbnailUrl ?? '', item.description ?? '']));
    }
  }
  return {
    name: scriptCsvFileName(name || data.title || data.name || data.label || '脚本'),
    content: `\uFEFF${[csvLine(header), ...shots, '', ...assets].join('\n')}`,
    type: SCRIPT_CSV_TYPE,
  };
}
